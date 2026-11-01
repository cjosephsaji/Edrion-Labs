import { chromium } from 'playwright-core';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { browserExecutable } from './browser-executable';
import { ai4 } from '../lessons/ai4';
import { currentQuestion } from '../teaching/checkpoint';
import { progressSummary } from '../teaching/learning-evidence';
import { SESSION_KEY } from '../teaching/persistence';
import type { ShowcaseState } from '../teaching/types';
const dir = 'evidence/learning-experience';
await mkdir(dir, { recursive: true });
const browser = await chromium.launch({
  executablePath: browserExecutable(),
  headless: true,
  args: ['--enable-unsafe-swiftshader'],
});
const context = await browser.newContext({
  viewport: { width: 800, height: 900 },
  reducedMotion: 'reduce',
});
await context.addInitScript('window.__name=(fn)=>fn;');
const p = await context.newPage();
p.setDefaultTimeout(25000);
p.setDefaultNavigationTimeout(120000);
const results: {
  tests: string[];
  errors: string[];
  productionMutations: string[];
  layouts: unknown[];
  liveModelCalls: boolean;
  failure?: string;
  summary?: unknown;
} = {
  tests: [],
  errors: [],
  productionMutations: [],
  layouts: [],
  liveModelCalls: false,
};
p.on('pageerror', (e) => results.errors.push(e.message));
p.on('request', (r) => {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(r.method()))
    results.productionMutations.push(r.url());
});
const cycle = () =>
  p.getByRole('region', { name: 'Student-paced teaching', exact: true });
async function state(): Promise<ShowcaseState> {
  await p.waitForTimeout(100);
  return p.evaluate(
    (key) => JSON.parse(sessionStorage.getItem(key)!).state,
    SESSION_KEY,
  );
}
async function click(name: string | RegExp, scope = cycle()) {
  const button = scope.getByRole('button', {
    name,
    exact: typeof name === 'string',
  });
  await button.focus();
  await p.keyboard.press('Enter');
}
async function answer(value?: string) {
  const s = await state(),
    q = currentQuestion(s, ai4);
  const response =
    value ??
    (q.type === 'text'
      ? 'TELL adds represented knowledge; ASK checks the supported consequences.'
      : q.correct[0]!);
  if (q.type === 'text')
    await cycle()
      .getByRole('textbox', { name: 'Your explanation' })
      .fill(response);
  else {
    const scope =
      q.board && s.mode === 'classic'
        ? p.getByRole('region', { name: 'Reasoning board', exact: true })
        : cycle();
    await click(response, scope);
  }
  await click(/Check my answer|Record explanation/);
}
async function apply() {
  const s = await state();
  if (s.teaching.status === 'INTRODUCING') await click(/Show me/);
  if ((await state()).teaching.status === 'DEMONSTRATING')
    await click(/Your turn/);
  await answer();
}
async function continueLesson() {
  await click('Continue');
}
async function worldReady() {
  await p.waitForFunction(
    () =>
      !!document.querySelector(
        '[data-world-phase="teaching"][data-camera-moving="false"]',
      ),
    undefined,
    { timeout: 90000 },
  );
  await cycle().waitFor();
}
try {
  await p.goto(
    (process.env.SHOWCASE_TEST_URL ?? 'http://localhost:3022') + '/prototype',
    { waitUntil: 'networkidle' },
  );
  await p
    .getByRole('button', { name: 'Enter Petros World', exact: true })
    .click();
  await p
    .getByRole('button', { name: 'Explore the library', exact: true })
    .click({ timeout: 90000 });
  await p
    .getByRole('button', { name: /How an AI Reasons with Knowledge/ })
    .click();
  await p
    .getByRole('button', { name: 'Retrieve this book', exact: true })
    .click();
  await p
    .getByRole('button', { name: /Continue this lesson|Let me show you/ })
    .click({ timeout: 90000 });
  await worldReady();
  assert.equal((await state()).learning?.activity, 'diagnostic');
  await answer('Bird(Lark)');
  await click('Next question');
  await answer('Yes, reverse the rule');
  await click('Begin my lesson');
  assert.equal((await state()).evidence?.startingPoint, 'rule-repair');
  assert.equal(progressSummary(await state(), ai4).verified, 0);
  assert.match(await cycle().innerText(), /Wings alone cannot prove/);
  results.tests.push(
    'World library selection opens a real two-question diagnostic; misconception responses choose relevant starting teaching without verification',
  );
  for (let i = 0; i < 4; i++) {
    await apply();
    await click('Test this concept');
    await answer();
    await continueLesson();
  }
  assert.equal((await state()).questionId, 'AI4-Q05');
  await click(/Show me/);
  await click(/Your turn/);
  for (const [width, height] of [
    [1366, 900],
    [390, 844],
  ]) {
    await p.setViewportSize({ width, height });
    await p.waitForTimeout(500);
    const dock = await p
      .getByRole('region', { name: 'World guided checkpoint' })
      .boundingBox();
    assert.ok(
      dock &&
        dock.x >= 0 &&
        dock.y >= 0 &&
        dock.x + dock.width <= width + 1 &&
        dock.y + dock.height <= height + 1,
    );
    assert.equal(
      await p.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
    const boardFit = await p.evaluate(() => {
      const board = (window as any).__PETROS_BOARD__?.rect;
      const canvas = document
        .querySelector('[data-world-scene] canvas')
        ?.getBoundingClientRect();
      return (
        !!board &&
        !!canvas &&
        board.x >= -1 &&
        board.y >= -1 &&
        board.x + board.w <= canvas.width + 1 &&
        board.y + board.h <= canvas.height + 1
      );
    });
    assert.equal(
      boardFit,
      true,
      'The complete 3D board must fit the resized canvas',
    );
    await p.screenshot({
      path: dir + '/world-' + width + '.png',
      fullPage: true,
    });
    results.layouts.push({
      width,
      height,
      taskDockInBounds: true,
      horizontalOverflow: false,
      wholeBoardInBounds: true,
    });
  }
  await p.setViewportSize({ width: 1366, height: 900 });
  await click('Focus board');
  const focus = p.getByRole('dialog', { name: 'Focused teaching board' });
  await focus.waitFor();
  await click(/response-\d: CanFly\(Tweety\)/, focus);
  assert.equal((await state()).studentResponse, 'CanFly(Tweety)');
  await click(/Check my answer/);
  assert.match((await state()).lastFeedback, /No supplied rule has CanFly/);
  assert.equal((await state()).highlightTargetId, 'unsupported');
  assert.equal(progressSummary(await state(), ai4).verified, 4);
  await p.screenshot({
    path: dir + '/unsupported-feedback.png',
    fullPage: true,
  });
  await click(/Try a new example|Compare and try again/);
  await answer();
  await click('Test this concept');
  const firstCheck = currentQuestion(await state(), ai4).id;
  await click('Need help?');
  await click('Show another example');
  await click(/Resume this step/);
  assert.equal(currentQuestion(await state(), ai4).id, firstCheck);
  assert.equal((await state()).learning?.stage, 'test');
  await click('Need help?');
  await click('Explain it more simply');
  await click(/Resume this step/);
  await answer();
  assert.equal((await state()).evidence?.attempts.at(-1)?.independent, false);
  await click('Try a different independent question');
  assert.notEqual(currentQuestion(await state(), ai4).id, firstCheck);
  await answer();
  assert.equal(progressSummary(await state(), ai4).verified, 5);
  results.tests.push(
    'Keyboard Focus Board selection submits an unsupported conclusion; targeted feedback changes the teaching path and board focus',
  );
  results.tests.push(
    'Help marks a Test attempt assisted; a different fact/rule context is required before independent verification',
  );
  const before = await state();
  await p
    .getByRole('button', { name: 'Exit Petros World', exact: true })
    .click();
  await p
    .getByRole('button', { name: 'Enter Petros World', exact: true })
    .waitFor();
  assert.deepEqual((await state()).evidence, before.evidence);
  await p.reload({ waitUntil: 'networkidle' });
  assert.deepEqual((await state()).evidence, before.evidence);
  assert.equal((await state()).learning?.taskId, before.learning?.taskId);
  await p.screenshot({ path: dir + '/classic-verified.png', fullPage: true });
  results.tests.push(
    'World → Classic and refresh preserve the exact independent/assisted evidence and active question',
  );
  await continueLesson();
  for (let i = 5; i < 12; i++) {
    await apply();
    await click('Test this concept');
    await answer();
    await continueLesson();
  }
  await p
    .getByRole('region', { name: 'Learning summary', exact: true })
    .waitFor();
  assert.equal(progressSummary(await state(), ai4).verified, 12);
  await p
    .getByRole('button', { name: 'Start knowledge check', exact: true })
    .click();
  await answer();
  await click('Next question');
  assert.equal(currentQuestion(await state(), ai4).board?.rules.length, 2);
  await answer('CanFly(Elm)');
  await click('Next question');
  await click('Need help?');
  await click('Repeat that explanation');
  await click(/Resume this step/);
  await answer();
  await click('Next question');
  await cycle().getByText('More', { exact: true }).click();
  await click('Skip this question · unverified');
  await answer();
  await click('See learning summary');
  const finalState = await state();
  const mixed = finalState.evidence!.attempts.filter((a) => a.kind === 'final');
  assert.equal(mixed.length, 5);
  assert.equal(
    mixed.filter((a) => a.independent && a.validation === 'correct').length,
    2,
  );
  assert.equal(mixed.filter((a) => a.assisted).length, 1);
  assert.equal(mixed.filter((a) => a.skipped).length, 1);
  assert.match(
    await p
      .getByRole('region', { name: 'Learning summary', exact: true })
      .innerText(),
    /2 of 5 questions answered correctly and independently/,
  );
  await p.screenshot({ path: dir + '/mixed-results.png', fullPage: true });
  results.summary = { progress: progressSummary(finalState, ai4), mixed };
  results.tests.push(
    'All twelve concepts can run Learn / Apply / Test; the five-question mixed check records actual correct, incorrect, assisted and skipped responses',
  );
  const evidenceBeforeReview = finalState.evidence;
  await p
    .getByRole('button', { name: 'Review weak area', exact: true })
    .click();
  assert.equal((await state()).questionId, 'AI4-Q05');
  assert.deepEqual((await state()).evidence, evidenceBeforeReview);
  results.tests.push(
    'A failed mixed-concept application produces a real weak-area review without erasing earlier evidence',
  );
  await p.setViewportSize({ width: 360, height: 800 });
  assert.equal(
    await p.evaluate(() => document.documentElement.scrollWidth > innerWidth),
    false,
  );
  await p.screenshot({ path: dir + '/classic-360.png', fullPage: true });
  assert.deepEqual(results.errors, []);
  assert.deepEqual(results.productionMutations, []);
} catch (error) {
  results.failure = String(error);
  await p
    .screenshot({ path: dir + '/failure.png', fullPage: true })
    .catch(() => {});
  console.error((await p.locator('body').innerText()).slice(-5000));
  throw error;
} finally {
  await writeFile(dir + '/results.json', JSON.stringify(results, null, 2));
  await context.close();
  await browser.close();
}
console.log(JSON.stringify({ ...results, summary: undefined }, null, 2));
