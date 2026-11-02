import { chromium } from 'playwright-core';
import { browserExecutable } from './browser-executable';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const out = new URL('../evidence/prepared-tutor/', import.meta.url);
await mkdir(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: browserExecutable(),
  headless: true,
});
const errors: string[] = [],
  providerRequests: string[] = [],
  assets3D: string[] = [],
  results: object[] = [];
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('request', (r) => {
    if (
      /\/api\/(teacher|speech|voice)(?:$|\?)/.test(r.url()) ||
      r.url().includes('api.openai.com')
    )
      providerRequests.push(r.url());
    if (r.url().endsWith('.glb')) assets3D.push(r.url());
  });
  await page.goto('http://127.0.0.1:3022/prototype');
  await page.locator('#petros-observations').waitFor({ state: 'attached' });
  const read = async () =>
    JSON.parse((await page.locator('#petros-observations').textContent())!);
  const questions = () =>
    page
      .getByRole('region', { name: 'Prepared questions' })
      .getByRole('button');
  const answer = page.getByRole('region', {
    name: 'Petros answer',
    exact: true,
  });
  const checkVisible = async () => {
    const height = page.viewportSize()!.height;
    for (const locator of [
      page.getByRole('region', { name: 'Prepared questions' }),
      page.getByRole('textbox', { name: 'Ask Petros' }),
      answer,
    ]) {
      const box = (await locator.boundingBox())!;
      assert.ok(
        box && box.y >= 0 && box.y + box.height <= height + 1,
        `Tutor content should stay in the viewport: ${JSON.stringify(box)}`,
      );
    }
    assert.ok(
      (await answer.boundingBox())!.height >= 160,
      'The answer needs usable reading space',
    );
    assert.equal(
      await page.evaluate(() => window.scrollY),
      0,
      'A new answer must not require page scrolling',
    );
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollHeight <= innerHeight + 1,
      ),
    );
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    );
  };
  assert.equal((await read()).presentation, '2d');
  assert.equal(await page.locator('canvas').count(), 0);
  assert.equal(
    await page.getByRole('navigation', { name: 'Learning view' }).count(),
    0,
  );
  assert.equal(
    await page
      .getByRole('button', { name: /retry live ai|connect voice|microphone/i })
      .count(),
    0,
  );
  for (const label of [
    'Neural learning',
    'Rocket landing',
    'Attention',
    'Traffic waves',
    'Time dilation',
  ]) {
    await page
      .getByRole('navigation', { name: 'Interactive topics' })
      .getByRole('button', { name: new RegExp(label) })
      .click();
    assert.equal(await questions().count(), 4);
    const evidenceBefore = (await read()).evidence.length;
    for (let i = 0; i < 4; i++) {
      await questions().nth(i).click();
      const data = await read();
      assert.equal(data.captionSource, 'prepared');
      assert.equal(data.guide.phase, 'EXPLORE');
      assert.equal(data.evidence.length, evidenceBefore);
      assert.ok(data.caption.length > 60);
      assert.ok(data.scene.focus);
      await checkVisible();
    }
    const model = (await page
      .getByTestId('regular-learning-model')
      .boundingBox())!;
    const controls = (await page
      .getByRole('complementary', { name: 'Experiment panel' })
      .boundingBox())!;
    const tutor = (await page.getByTestId('tutor-panel').boundingBox())!;
    assert.ok(
      controls.x + controls.width < model.x,
      'Controls must sit to the left of the model',
    );
    assert.ok(
      tutor.x > model.x + model.width,
      'Questions and answers must stay to the right of the model',
    );
    await page.mouse.move(5, 5);
    await page.screenshot({
      path: fileURLToPath(
        new URL(`${(await read()).topic}-desktop-dpr2.png`, out),
      ),
    });
    results.push({
      topic: label,
      questions: 4,
      validPreparedAnswers: true,
      noPageScrollForAnswers: true,
    });
  }
  // Both canonical questions and supported aliases can be typed, with no provider call.
  await page
    .getByRole('navigation', { name: 'Interactive topics' })
    .getByRole('button', { name: /Neural learning/ })
    .click();
  await answer.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  const trainBefore = await read();
  await page
    .getByRole('textbox', { name: 'Ask Petros' })
    .fill('Train one step');
  await page
    .getByRole('button', { name: 'Send question', exact: true })
    .click();
  let data = await read();
  assert.ok(data.observations.steps > trainBefore.observations.steps);
  assert.equal(data.activeQuestion, 'Train one step');
  await page.waitForFunction(
    () =>
      document.querySelector('[aria-label="Petros answer"]')!.scrollTop === 0,
  );
  await checkVisible();
  const beforeUnknown = data.sim;
  await page
    .getByRole('textbox', { name: 'Ask Petros' })
    .fill('Explain quantum biology');
  await page.getByRole('textbox', { name: 'Ask Petros' }).press('Enter');
  data = await read();
  assert.deepEqual(data.sim, beforeUnknown);
  assert.match(data.caption, /don’t have a prepared answer/);
  await checkVisible();
  await page
    .getByRole('navigation', { name: 'Interactive topics' })
    .getByRole('button', { name: /Rocket landing/ })
    .click();
  const beforeFlight = await read();
  await page.getByRole('button', { name: /Advance the flight/ }).click();
  await page.waitForFunction(
    (time) =>
      JSON.parse(document.querySelector('#petros-observations')!.textContent!)
        .sim.time > time,
    beforeFlight.sim.time,
  );
  await page
    .getByRole('slider', { name: 'Thrust · %', exact: true })
    .press('End');
  await page.waitForFunction(
    () =>
      JSON.parse(document.querySelector('#petros-observations')!.textContent!)
        .params.throttle === 1,
  );
  await page
    .getByRole('button', { name: 'Point to velocity', exact: true })
    .click();
  assert.equal((await read()).scene.focus, 'velocity');
  await questions().nth(1).click();
  assert.ok(
    await page
      .getByTestId('tutor-explanation')
      .getByText(/Currently velocity is/)
      .isVisible(),
  );
  for (const size of [
    { width: 1440, height: 900 },
    { width: 1366, height: 768 },
    { width: 1280, height: 800 },
  ]) {
    await page.setViewportSize(size);
    await checkVisible();
    await page.screenshot({
      path: fileURLToPath(
        new URL(`rocket-${size.width}x${size.height}-dpr2.png`, out),
      ),
    });
  }
  await page
    .getByRole('button', { name: 'Restart lesson', exact: true })
    .click();
  for (let i = 0; i < 3; i++)
    await page
      .getByRole('button', { name: 'Continue with Petros →', exact: true })
      .click();
  assert.equal((await read()).guide.phase, 'PREDICT');
  await page.getByLabel('Your prediction').getByRole('button').first().click();
  assert.equal((await read()).guide.phase, 'RETEACH_OR_EXTEND');
  await page
    .getByRole('button', { name: 'Try a fresh example →', exact: true })
    .click();
  assert.equal((await read()).guide.phase, 'TRANSFER_CHECK');
  await page.goto('http://127.0.0.1:3022/prototype?view=world');
  await page.locator('#petros-observations').waitFor({ state: 'attached' });
  assert.equal((await read()).presentation, '2d');
  assert.equal((await read()).guide.phase, 'TRANSFER_CHECK');
  assert.equal(await page.locator('canvas').count(), 0);
  // Small screens use a dedicated tutor pane, never a tutor placed below the model.
  await page.setViewportSize({ width: 390, height: 844 });
  await questions().first().click();
  await checkVisible();
  await page.screenshot({
    path: fileURLToPath(new URL('rocket-mobile-dpr2.png', out)),
  });
  await page.getByRole('button', { name: 'Controls', exact: true }).click();
  assert.ok(
    await page
      .getByRole('slider', { name: 'Thrust · %', exact: true })
      .isVisible(),
  );
  await page
    .getByRole('button', { name: 'Close controls ×', exact: true })
    .click();
  assert.ok(
    await page
      .getByRole('button', { name: 'Controls', exact: true })
      .evaluate((e) => e === document.activeElement),
  );
  await page.getByRole('button', { name: 'Live model', exact: true }).click();
  assert.ok(await page.getByTestId('regular-learning-model').isVisible());
  await page.getByRole('button', { name: 'Ask & learn', exact: true }).click();
  await checkVisible();
  // Tablet keeps the tutor alongside the model and uses a side drawer for controls.
  await page.setViewportSize({ width: 1024, height: 768 });
  await checkVisible();
  await page
    .getByRole('button', { name: 'Experiment controls ↗', exact: true })
    .click();
  assert.ok(
    await page
      .getByRole('slider', { name: 'Thrust · %', exact: true })
      .isVisible(),
  );
  await page.keyboard.press('Escape');
  assert.ok(
    !(await page
      .getByRole('slider', { name: 'Thrust · %', exact: true })
      .isVisible()),
  );
  assert.ok(
    await page
      .getByRole('button', { name: 'Experiment controls ↗', exact: true })
      .evaluate((e) => e === document.activeElement),
  );
  assert.deepEqual(providerRequests, []);
  assert.deepEqual(assets3D, []);
  assert.deepEqual(errors, []);
  await writeFile(
    new URL('results.json', out),
    JSON.stringify(
      {
        passed: true,
        topics: results,
        aiRequests: providerRequests,
        assets3D,
        noWorldOption: true,
        default2D: true,
        typedQuestions: true,
        unknownQuestionHelp: true,
        controlsOnLeft: true,
        answersStayVisible: true,
        laptopSizes: ['1440x900', '1366x768', '1280x800'],
        mobileTutorPane: true,
        tabletSideDrawer: true,
        guidedLessonPreserved: true,
        errors,
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
