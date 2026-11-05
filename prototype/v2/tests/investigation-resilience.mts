import assert from 'node:assert/strict';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { browserExecutable } from './browser-executable';
import {
  advanceInvestigation,
  buildInvestigation,
  freshProgress,
  INVESTIGATION_STORAGE,
  type InvestigationSession,
} from '../core/investigation';
import { TOPICS } from '../simulations/runtime';
const browser = await chromium.launch({
  executablePath: browserExecutable(),
  headless: true,
});
const origin = process.env.SHOWCASE_TEST_URL || 'http://127.0.0.1:3022';
const out = new URL('../evidence/investigations/', import.meta.url);
await mkdir(out, { recursive: true });
const results: object[] = [],
  errors: string[] = [];
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (
      m.type() === 'error' &&
      /React|update|hydration|ResizeObserver/.test(m.text())
    )
      errors.push(m.text());
  });
  await page.goto(`${origin}/prototype?view=2d`);
  await page.locator('[data-ready=true]').waitFor();
  await page
    .getByRole('group', { name: 'Your prediction' })
    .getByRole('radio')
    .first()
    .check();
  await page.getByRole('button', { name: 'Test my prediction' }).dblclick();
  await page
    .getByRole('navigation', { name: 'Experiment checkpoints' })
    .getByRole('button')
    .nth(1)
    .click();
  assert.equal(await page.getByRole('slider').inputValue(), '12');
  assert.equal(
    await page
      .locator('[data-measure-id=prediction] [data-value=changed]')
      .innerText(),
    '1.6',
  );
  assert.match(await page.getByTestId('frame-insight').innerText(), /1.6/);
  await page.waitForTimeout(400);
  assert.equal(
    await page.getByRole('slider').inputValue(),
    '12',
    'Checkpoint must pause the replay',
  );
  await page.getByRole('button', { name: 'Replay speed' }).click();
  assert.equal(
    await page.getByRole('button', { name: 'Replay speed' }).innerText(),
    '0.5×',
  );
  results.push({ checkpointsAndLiveEvidence: true });

  // Switch from a long timeline to a discrete two-frame lesson while playing.
  await page
    .getByRole('button', { name: 'Replay experiment', exact: true })
    .click();
  const nav = page
    .getByRole('navigation', { name: 'Investigations' })
    .getByRole('button');
  for (const index of [2, 4, 1, 3, 2]) await nav.nth(index).click();
  assert.equal(await page.getByRole('slider').inputValue(), '0');
  await page.waitForTimeout(500);
  assert.equal(await page.getByRole('slider').inputValue(), '0');
  assert.ok(
    !/NaN|snapshot 25 \/ 2/.test(await page.locator('body').innerText()),
  );
  await nav.first().click();
  assert.equal(
    await page.getByTestId('learning-studio').getAttribute('data-stage'),
    'observe',
  );
  assert.equal(await page.getByRole('slider').inputValue(), '24');
  results.push({ rapidTopicSwitchAndTimerIsolation: true });

  await page.getByRole('button', { name: 'Explain what changed' }).click();
  await page
    .getByRole('group', { name: 'Your explanation' })
    .getByRole('radio')
    .nth(1)
    .check();
  await page.getByRole('button', { name: 'Check my explanation' }).dblclick();
  await page
    .getByLabel('Where would this rule stop working?')
    .fill('A negative input reverses the direction.');
  await page.getByRole('button', { name: 'Show me the cause' }).click();
  assert.equal(await page.getByRole('slider').inputValue(), '0');
  await page.waitForTimeout(180);
  await page.reload();
  await page.locator('[data-ready=true]').waitFor();
  assert.equal(
    await page.getByLabel('Where would this rule stop working?').inputValue(),
    'A negative input reverses the direction.',
  );
  await page.getByRole('button', { name: 'Case 1', exact: false }).click();
  assert.equal(await page.getByRole('slider').inputValue(), '0');
  assert.equal(
    await page.getByTestId('learning-studio').getAttribute('data-stage'),
    'predict',
  );
  await page
    .getByRole('group', { name: 'Your prediction' })
    .getByRole('radio')
    .first()
    .check();
  await page.getByRole('button', { name: 'Test my prediction' }).click();
  await page.getByRole('button', { name: 'Explain what changed' }).click();
  await page
    .getByRole('group', { name: 'Your explanation' })
    .getByRole('radio')
    .first()
    .check();
  await page.getByRole('button', { name: 'Check my explanation' }).click();
  await page.getByText('Practised after feedback').waitFor();
  assert.equal(await page.getByText('Practised after feedback').count(), 1);
  await page.waitForTimeout(180);
  const saved = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)!),
    INVESTIGATION_STORAGE,
  );
  assert.equal(saved.topics.neural.attempts.length, 2);
  assert.equal(saved.topics.neural.attempts[0].reasonCorrect, false);
  assert.equal(
    saved.topics.neural.attempts[0].reflection,
    'A negative input reverses the direction.',
  );
  assert.equal(saved.topics.neural.attempts[1].revisited, true);
  results.push({ remediationPracticeReflectionAndDoubleSubmit: true });

  await page.getByRole('button', { name: /Field notes/ }).click();
  assert.equal(
    await page
      .getByRole('region', { name: 'Learning field notes' })
      .locator('article')
      .count(),
    2,
  );
  await page.screenshot({
    path: new URL('flow-desktop.png', out).pathname.replace(
      /^\/([A-Z]:)/,
      '$1',
    ),
    fullPage: true,
  });
  await page.getByRole('button', { name: /Field notes/ }).click();
  for (const width of [320, 360, 390, 768, 1024, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(400);
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      `overflow at ${width}`,
    );
    const status = await page
      .locator('[data-visual-status]')
      .getAttribute('data-visual-status');
    if (status === 'fallback')
      assert.ok(await page.getByRole('table').first().isVisible());
    else assert.equal(status, 'checked');
    if (width === 390)
      await page.screenshot({
        path: new URL('flow-mobile.png', out).pathname.replace(
          /^\/([A-Z]:)/,
          '$1',
        ),
        fullPage: true,
      });
    results.push({ width, visual: status });
  }
  // If display checks reject a diagram, its fallback must follow the same snapshot.
  const enlargedLabels = await page.addStyleTag({ content: 'svg[role=img] text { font-size: 80px !important; }' });
  await page.getByRole('navigation', { name: 'Experiment checkpoints' }).getByRole('button').nth(1).click();
  await page.locator('[data-visual-status=fallback]').waitFor();
  const fallbackTable = page.getByRole('table', { name: 'Current snapshot measurements' });
  await fallbackTable.waitFor();
  assert.equal(await fallbackTable.locator('tbody tr').first().locator('td').nth(1).innerText(), '1.6');
  await page.getByRole('navigation', { name: 'Experiment checkpoints' }).getByRole('button').first().click();
  await page.waitForTimeout(150);
  assert.equal(await fallbackTable.locator('tbody tr').first().locator('td').nth(1).innerText(), '1');
  await enlargedLabels.evaluate((element) => element.remove());
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator('[data-visual-status=checked]').waitFor();
  results.push({ rejectedDiagramUsesLiveFallbackAndRecovers: true });

  // Denied storage must still permit a complete experiment without a runtime crash.
  const denied = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  await denied.addInitScript(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException('Unavailable', 'QuotaExceededError');
    };
  });
  const dp = await denied.newPage();
  dp.on('pageerror', (e) => errors.push(e.message));
  await dp.goto(`${origin}/prototype?view=2d`);
  await dp.locator('[data-ready=true]').waitFor();
  await dp
    .getByText('Progress cannot be saved in this browser.', { exact: false })
    .waitFor();
  await dp
    .getByRole('group', { name: 'Your prediction' })
    .getByRole('radio')
    .first()
    .check();
  await dp.getByRole('button', { name: 'Test my prediction' }).click();
  await dp.getByRole('button', { name: /I’ve compared the runs/ }).click();
  assert.equal(
    await dp.getByTestId('learning-studio').getAttribute('data-stage'),
    'explain',
  );
  results.push({ storageDeniedAndMobileFlow: true });

  const corrupt = await browser.newContext();
  await corrupt.addInitScript(
    (key) => localStorage.setItem(key, '{bad-json'),
    INVESTIGATION_STORAGE,
  );
  const cp = await corrupt.newPage();
  cp.on('pageerror', (e) => errors.push(e.message));
  await cp.goto(`${origin}/prototype?view=2d`);
  await cp.locator('[data-ready=true]').waitFor();
  assert.equal(
    await cp.getByTestId('learning-studio').getAttribute('data-stage'),
    'predict',
  );
  await cp
    .getByText('Saved progress could not be restored.', { exact: false })
    .waitFor();
  results.push({ corruptProgressRecovery: true });

  // A restored complete journey must have a useful, keyboard-accessible destination.
  const finished: InvestigationSession = { version: 1, active: 'relativity', topics: {} };
  for (const topic of TOPICS) {
    let progress = freshProgress();
    for (let index = 0; index < 3; index++) {
      const task = buildInvestigation(topic, index);
      progress = advanceInvestigation(progress, task, { type: 'predict', id: task.correctPrediction });
      progress = advanceInvestigation(progress, task, { type: 'inspect' });
      progress = advanceInvestigation(progress, task, { type: 'explain', id: task.correctReason });
      if (index < 2) progress = advanceInvestigation(progress, task, { type: 'next' });
    }
    finished.topics[topic] = progress;
  }
  const completed = await browser.newContext();
  await completed.addInitScript(({ key, value }) => localStorage.setItem(key, value), {
    key: INVESTIGATION_STORAGE, value: JSON.stringify(finished),
  });
  const fp = await completed.newPage();
  fp.on('pageerror', (e) => errors.push(e.message));
  await fp.goto(`${origin}/prototype?view=2d`);
  await fp.locator('[data-ready=true]').waitFor();
  await fp.getByRole('button', { name: 'Review my learning journey' }).focus();
  await fp.keyboard.press('Enter');
  const record = fp.getByRole('region', { name: 'Learning field notes' });
  await record.waitFor();
  assert.equal(await record.locator('article').count(), 15);
  await record.getByRole('button', { name: 'Practise this case' }).first().focus();
  await fp.keyboard.press('Enter');
  await fp.getByRole('group', { name: 'Your prediction' }).waitFor();
  await fp.getByRole('group', { name: 'Your prediction' }).getByRole('radio').first().focus();
  await fp.keyboard.press('Space');
  await fp.getByRole('button', { name: 'Test my prediction' }).focus();
  await fp.keyboard.press('Enter');
  assert.equal(await fp.getByTestId('learning-studio').getAttribute('data-stage'), 'observe');
  results.push({ completedJourneyAndKeyboardPractice: true });
  assert.deepEqual(errors, []);
  await writeFile(
    new URL('resilience.json', out),
    JSON.stringify({ passed: true, results, errors }, null, 2),
  );
  await rm(new URL('resilience-failure.json', out), { force: true });
  console.log(JSON.stringify({ passed: true, checks: results.length }));
} catch (e) {
  await writeFile(
    new URL('resilience-failure.json', out),
    JSON.stringify({ error: String(e), results, errors }, null, 2),
  );
  throw e;
} finally {
  await browser.close();
}
