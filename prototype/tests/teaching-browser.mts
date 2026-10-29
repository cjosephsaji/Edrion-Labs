import { chromium, type Page, type BrowserContext } from 'playwright-core';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { lessons } from '../lessons';
process.chdir(fileURLToPath(new URL('../', import.meta.url)));
const dir = 'evidence/teaching-correction';
await mkdir(`${dir}/recordings`, { recursive: true });
const browser = await chromium.launch({
  executablePath:
    '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
  headless: true,
  args: ['--use-angle=metal'],
});
const results: any = {
  started: new Date().toISOString(),
  paths: [],
  lessons: [],
  layouts: [],
  errors: [],
  productionMutations: [],
};
const base = process.env.SHOWCASE_TEST_URL ?? 'http://127.0.0.1:3021';
const cycle = (p: Page) =>
  p.getByRole('region', { name: 'Student-paced teaching', exact: true });
const btn = (p: Page, name: string) =>
  p.getByRole('button', { name, exact: true });
let recording = false;
async function pause(p: Page, ms = 1000) {
  if (recording) await p.waitForTimeout(ms);
}
async function state(p: Page) {
  return cycle(p).getAttribute('data-teaching-state');
}
async function expectState(p: Page, value: string) {
  await p.waitForFunction(
    (s) =>
      document
        .querySelector('[aria-label="Student-paced teaching"]')
        ?.getAttribute('data-teaching-state') === s,
    value,
  );
}
async function context(video?: string) {
  const c = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    reducedMotion: 'reduce',
    ...(video
      ? {
          recordVideo: {
            dir: `${dir}/recordings`,
            size: { width: 1440, height: 900 },
          },
        }
      : {}),
  });
  const p = await c.newPage();
  p.on('pageerror', (e) => results.errors.push(e.message));
  p.on('request', (r) => {
    if (
      ['POST', 'PATCH', 'PUT', 'DELETE'].includes(r.method()) &&
      !r.url().includes('/prototype/api/')
    )
      results.productionMutations.push(r.url());
  });
  await c.tracing.start({ screenshots: true, snapshots: true, sources: true });
  return { c, p };
}
async function close(c: BrowserContext, p: Page, video?: string) {
  await c.tracing.stop({ path: `${dir}/${video ?? 'showcase'}-trace.zip` });
  const v = p.video();
  await c.close();
  if (video && v)
    await rename(await v.path(), `${dir}/recordings/${video}.webm`);
}
async function openLesson(p: Page, id: string, world = false) {
  const lesson = lessons.find((l) => l.id === id)!;
  await p.goto(`${base}/prototype`);
  await btn(
    p,
    lesson.filename ? `Learn ${lesson.filename}` : lesson.title,
  ).click();
  if (world) {
    await btn(p, 'Enter Petros World').click();
    await p
      .getByRole('dialog', { name: 'Entering Petros World' })
      .waitFor({ state: 'detached', timeout: 60000 });
    await btn(p, 'Find my module').click();
    await p.getByRole('button', { name: /Retrieve this book/ }).click();
    await btn(p, 'Let me show you').click({ timeout: 30000 });
  } else await btn(p, 'Start lesson').click();
  await expectState(p, 'INTRODUCING');
}
async function awaitResponse(p: Page) {
  const s = await state(p);
  if (s === 'INTRODUCING') {
    await pause(p, 1100);
    await btn(p, 'Show me').click();
  }
  if ((await state(p)) === 'DEMONSTRATING') {
    await pause(p, 1400);
    await btn(p, 'Let me try').click();
  }
  if ((await state(p)) === 'RETEACHING') {
    await pause(p, 2400);
    await btn(p, 'Try a follow-up').click();
  }
  if ((await state(p)) === 'CHECKING_UNDERSTANDING') {
    await pause(p, 600);
    await btn(p, 'I’m ready to answer').click();
  }
  await expectState(p, 'AWAITING_RESPONSE');
}
async function answer(p: Page, q: any, value?: string | string[]) {
  if (q.type === 'text')
    await p
      .getByRole('textbox', { name: 'Your explanation', exact: true })
      .fill(
        (value as string) ??
          'I connect the stated rule with the visible example and its assumptions.',
      );
  else if (q.type === 'number')
    await p
      .getByRole('textbox', { name: 'Practice value', exact: true })
      .fill((value as string) ?? q.correct[0]);
  else
    for (const choice of value
      ? Array.isArray(value)
        ? value
        : [value]
      : q.correct)
      await cycle(p)
        .getByRole('group', { name: 'Practice choices', exact: true })
        .getByRole('button', { name: choice, exact: true })
        .click();
  await pause(p, 750);
  await btn(
    p,
    q.type === 'text' ? 'Record explanation' : 'Check practice answer',
  ).click();
}
async function next(p: Page, text = false) {
  await pause(p, 1600);
  await cycle(p)
    .getByRole('button', {
      name: text ? 'I understand, continue' : 'Continue',
      exact: true,
    })
    .click();
}
try {
  // Path A records real explanations, predictions and confirmed continuations.
  recording = true;
  {
    const { c, p } = await context('path-a-understands');
    try {
      await openLesson(p, 'ai3', true);
      const lesson = lessons[0]!;
      for (const q of lesson.questions) {
        const id = await cycle(p).getAttribute('data-question');
        assert.equal(id, q.id);
        if (q.id === 'AI3-Q02') {
          await pause(p);
          await btn(p, 'Show me').click();
          await p.screenshot({ path: `${dir}/max-demonstration.png` });
        }
        await awaitResponse(p);
        if (q.id === 'AI3-Q03') {
          const before = {
            id: await cycle(p).getAttribute('data-question'),
            responses: await cycle(p).getAttribute('data-response-count'),
          };
          await p.waitForTimeout(31000);
          assert.equal(await cycle(p).getAttribute('data-question'), before.id);
          assert.equal(
            await cycle(p).getAttribute('data-response-count'),
            before.responses,
          );
          assert.equal(await state(p), 'AWAITING_RESPONSE');
          results.noResponseWorld = { seconds: 31, ...before, unchanged: true };
          await p.screenshot({ path: `${dir}/no-response-31s.png` });
        }
        await answer(p, q);
        assert.equal(await cycle(p).getAttribute('data-question'), q.id);
        assert.equal(
          await cycle(p).getAttribute('data-last-validation'),
          q.type === 'text' ? 'unverified' : 'correct',
        );
        if (q.id === 'AI3-Q06')
          await p.screenshot({ path: `${dir}/full-tree-feedback.png` });
        if (q.id === 'AI3-Q11') {
          const board = await p.evaluate(
            () => (window as any).__PETROS_BOARD__,
          );
          assert.ok(
            board.layout.text.some(
              (t: string) =>
                t.includes('4 examined') && t.includes('2 skipped'),
            ),
          );
          results.pruning = board.layout.text.filter((t: string) =>
            t.includes('examined'),
          );
          await p.screenshot({ path: `${dir}/pruning-feedback.png` });
        }
        await next(p, q.type === 'text');
      }
      await p
        .getByRole('heading', { name: 'Ideas to take with you.', exact: true })
        .waitFor();
      await pause(p, 1800);
      results.paths.push({ name: 'A', checkpoints: 12, passed: true });
      console.log('Path A passed');
    } finally {
      await close(c, p, 'path-a-understands');
    }
  }
  // Path B shows the supported misconception, different example/check, interruption and mode continuity.
  {
    const { c, p } = await context('path-b-struggles');
    try {
      await openLesson(p, 'ai3', true);
      for (const q of lessons[0]!.questions.slice(0, 2)) {
        await awaitResponse(p);
        await answer(p, q);
        await next(p);
      }
      await awaitResponse(p);
      await answer(p, lessons[0]!.questions[2]!, '5');
      await expectState(p, 'RETEACHING');
      assert.equal(await cycle(p).getAttribute('data-question'), 'AI3-Q03');
      assert.equal(
        await cycle(p).getAttribute('data-last-validation'),
        'incorrect',
      );
      assert.ok(
        (await cycle(p).innerText()).includes('You chose the larger score'),
      );
      await p.waitForTimeout(2200);
      await p.screenshot({ path: `${dir}/min-misconception.png` });
      await awaitResponse(p);
      assert.ok((await cycle(p).innerText()).includes('MIN can choose 1 or 7'));
      await answer(p, { type: 'choice', correct: ['1'] });
      await expectState(p, 'READY_TO_CONTINUE');
      assert.ok((await cycle(p).innerText()).includes('min(1,7)=1'));
      assert.equal(await cycle(p).getAttribute('data-question'), 'AI3-Q03');
      assert.equal(await cycle(p).getAttribute('data-response-count'), '2');
      await p.screenshot({ path: `${dir}/min-followup-correct.png` });
      await next(p);
      assert.equal(await cycle(p).getAttribute('data-question'), 'AI3-Q04');
      await btn(p, 'Show me').click();
      await p.waitForTimeout(1100);
      const before = await p.evaluate(() => ({
        camera: (window as any).__PETROS_WORLD_METRICS__.camera,
        board: (window as any).__PETROS_BOARD__.layout.hits.filter(
          (h: any) => h.id === 'branch-1',
        ),
      }));
      await btn(p, 'Ask Petros anything').click();
      await p
        .getByRole('textbox', { name: 'Ask Petros anything', exact: true })
        .fill('Why did you choose that number?');
      await btn(p, 'Ask Petros').click();
      const talk = p.getByRole('region', {
        name: 'World conversation',
        exact: true,
      });
      await talk.getByText(/min\(2, 9\) = 2/).waitFor();
      const during = await p.evaluate(
        () => (window as any).__PETROS_WORLD_METRICS__.camera,
      );
      assert.deepEqual(during, before.camera);
      assert.equal(
        await p.locator('[data-world-phase]').getAttribute('data-question-id'),
        'AI3-Q04',
      );
      await p.screenshot({ path: `${dir}/contextual-interruption.png` });
      await pause(p, 2200);
      await talk
        .getByRole('button', { name: 'Explain more simply', exact: true })
        .click();
      await talk.getByText(/Think of MIN B as your opponent/).waitFor();
      await pause(p, 1800);
      await talk
        .getByRole('button', {
          name: 'Continue lesson · same checkpoint',
          exact: true,
        })
        .click();
      await expectState(p, 'RETEACHING');
      assert.equal(await cycle(p).getAttribute('data-question'), 'AI3-Q04');
      await p.screenshot({ path: `${dir}/resumed-simpler-example.png` });
      await awaitResponse(p);
      await answer(p, { type: 'choice', correct: ['4'] });
      await next(p);
      await awaitResponse(p);
      await answer(p, lessons[0]!.questions[4]!);
      await next(p);
      await awaitResponse(p);
      await p
        .getByRole('textbox', { name: 'Practice value', exact: true })
        .fill('3');
      await btn(p, 'Exit Petros World').click();
      await btn(p, 'Classic').waitFor();
      await p.waitForTimeout(500);
      assert.equal(await cycle(p).getAttribute('data-question'), 'AI3-Q06');
      assert.equal(
        await p
          .getByRole('textbox', { name: 'Practice value', exact: true })
          .inputValue(),
        '3',
      );
      await btn(p, 'Check practice answer').click();
      assert.equal(
        await cycle(p).getAttribute('data-last-validation'),
        'correct',
      );
      await pause(p, 1200);
      await btn(p, 'Enter Petros World').click();
      await p
        .getByRole('dialog', { name: 'Entering Petros World' })
        .waitFor({ state: 'detached', timeout: 60000 });
      await expectState(p, 'READY_TO_CONTINUE');
      assert.equal(await cycle(p).getAttribute('data-question'), 'AI3-Q06');
      await p.screenshot({ path: `${dir}/mode-preserved-feedback.png` });
      await next(p);
      await expectState(p, 'INTRODUCING');
      results.paths.push({
        name: 'B',
        misconception: 'MIN-maximizes-MAX-score',
        incorrectThenFollowupCorrect: true,
        interruption: { actualValues: [2, 9], cameraPreserved: true },
        modeSwitch: { draft: '3', feedbackPreserved: true },
        passed: true,
      });
      console.log('Path B passed');
    } finally {
      await close(c, p, 'path-b-struggles');
    }
  }
  recording = false;
  // Every primary checkpoint in each mode, with an honest unverified outcome for prose.
  for (const world of [false, true]) {
    const { c, p } = await context();
    try {
      for (const lesson of lessons) {
        await openLesson(p, lesson.id, world);
        for (const q of lesson.questions) {
          await awaitResponse(p);
          await answer(p, q);
          assert.equal(
            await cycle(p).getAttribute('data-last-validation'),
            q.type === 'text' ? 'unverified' : 'correct',
          );
          await next(p, q.type === 'text');
        }
        await p
          .getByRole('heading', {
            name: world
              ? 'Ideas to take with you.'
              : 'Here’s what you explored.',
            exact: true,
          })
          .waitFor();
        results.lessons.push({
          mode: world ? 'world' : 'classic',
          id: lesson.id,
          count: lesson.questions.length,
          passed: true,
        });
        console.log(world ? 'World' : 'Classic', lesson.id, 'passed');
      }
      if (!world) {
        await openLesson(p, 'ai3');
        await awaitResponse(p);
        await p.waitForTimeout(31000);
        assert.equal(await cycle(p).getAttribute('data-question'), 'AI3-Q01');
        assert.equal(await cycle(p).getAttribute('data-response-count'), '0');
        assert.equal(await state(p), 'AWAITING_RESPONSE');
        results.noResponseClassic = { seconds: 31, unchanged: true };
      }
    } finally {
      await close(c, p, world ? 'all-world' : 'all-classic');
    }
  }
  // Partial, unclear and skip paths operate on actual response controls.
  {
    const { c, p } = await context();
    try {
      await openLesson(p, 'ehs5');
      for (let i = 0; i < 10; i++) await btn(p, 'Skip this concept').click();
      await awaitResponse(p);
      await answer(p, { type: 'multi', correct: ['Treat wastewater'] });
      assert.equal(
        await cycle(p).getAttribute('data-last-validation'),
        'partial',
      );
      assert.equal(await state(p), 'AWAITING_RESPONSE');
      for (const choice of [
        'Reduce farm runoff',
        'Collect solid waste',
        'Keep oil / grease out of drains',
      ])
        await cycle(p)
          .getByRole('button', { name: choice, exact: true })
          .click();
      await btn(p, 'Check practice answer').click();
      assert.equal(
        await cycle(p).getAttribute('data-last-validation'),
        'correct',
      );
      await p.screenshot({
        path: `${dir}/partial-to-correct.png`,
        fullPage: true,
      });
      results.partial = { supportedRetained: true, thenCorrect: true };
      await openLesson(p, 'open-ai');
      for (let i = 0; i < 3; i++) await btn(p, 'Skip this concept').click();
      await awaitResponse(p);
      await answer(p, { type: 'number', correct: ['maybe'] });
      assert.equal(
        await cycle(p).getAttribute('data-last-validation'),
        'unclear',
      );
      assert.equal(await state(p), 'AWAITING_RESPONSE');
      results.unclear = { clarification: true, notCompleted: true };
    } finally {
      await close(c, p, 'response-edges');
    }
  }
  for (const [width, height] of [
    [1366, 768],
    [390, 844],
    [360, 800],
  ]) {
    const c = await browser.newContext({
        viewport: { width, height },
        reducedMotion: 'reduce',
      }),
      p = await c.newPage();
    try {
      await openLesson(p, 'ai3');
      await btn(p, 'I understand, continue').click();
      await btn(p, 'Show me').click();
      assert.equal(
        await p.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
      );
      await p.screenshot({
        path: `${dir}/classic-${width}.png`,
        fullPage: true,
      });
      await btn(p, 'Enter Petros World').click();
      await p
        .getByRole('dialog', { name: 'Entering Petros World' })
        .waitFor({ state: 'detached', timeout: 60000 });
      await awaitResponse(p);
      await p.waitForTimeout(600);
      const layout = await p.evaluate(() => {
        const stage = document
            .querySelector('[data-world-scene]')!
            .getBoundingClientRect(),
          dock = document
            .querySelector('[aria-label="World guided checkpoint"]')!
            .getBoundingClientRect();
        return {
          overflow: document.documentElement.scrollWidth > innerWidth,
          stage: stage.toJSON(),
          dock: dock.toJSON(),
          errors: (window as any).__PETROS_BOARD__?.layout.errors,
        };
      });
      assert.equal(layout.overflow, false);
      assert.ok(layout.stage.bottom <= layout.dock.top + 2);
      assert.ok(layout.stage.height > 160);
      assert.deepEqual(layout.errors, []);
      await p.screenshot({ path: `${dir}/world-${width}.png` });
      results.layouts.push({ width, height, ...layout, passed: true });
      console.log('Layout passed', width);
    } finally {
      await c.close();
    }
  }
  assert.deepEqual(results.errors, []);
  assert.deepEqual(results.productionMutations, []);
  results.passed = true;
} catch (error) {
  results.failure = String(error);
  console.error(error);
  for (const c of browser.contexts())
    for (const p of c.pages())
      await p.screenshot({ path: `${dir}/failure.png` }).catch(() => {});
  process.exitCode = 1;
} finally {
  results.finished = new Date().toISOString();
  await writeFile(
    `${dir}/browser-results.json`,
    JSON.stringify(results, null, 2),
  );
  await browser.close();
}
