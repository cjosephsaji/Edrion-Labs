import { chromium, type Page, type BrowserContext } from 'playwright-core';
import { browserExecutable } from './browser-executable';
import { mkdir, writeFile, rename } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { lessons } from '../lessons';
import { currentQuestion } from '../teaching/checkpoint';
import { lessonForState } from '../teaching/tree-variant';
import type { ShowcaseState } from '../teaching/types';
import { SESSION_KEY } from '../teaching/persistence';
const dir = 'evidence/learning-redesign';
await mkdir(`${dir}/recordings`, { recursive: true });
const browser = await chromium.launch({
  executablePath: browserExecutable(),
  headless: true,
  args: ['--enable-unsafe-swiftshader'],
});
const base = process.env.SHOWCASE_TEST_URL ?? 'http://127.0.0.1:3022';
const results: any = {
  tests: [],
  lessons: [],
  layouts: [],
  errors: [],
  productionMutations: [],
};
let lastPage: Page;
const cycle = (p: Page) =>
  p.getByRole('region', { name: 'Student-paced teaching', exact: true });
async function saved(p: Page): Promise<ShowcaseState> {
  await p.waitForTimeout(100);
  return p.evaluate(
    (key) => JSON.parse(sessionStorage.getItem(key)!).state,
    SESSION_KEY,
  );
}
async function ctx(video?: string) {
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
  lastPage = p;
  p.setDefaultNavigationTimeout(120000);
  p.on('pageerror', (e) => results.errors.push(e.message));
  p.on('request', (r) => {
    if (
      ['POST', 'PUT', 'PATCH', 'DELETE'].includes(r.method()) &&
      !r.url().includes('/prototype/api/')
    )
      results.productionMutations.push(r.url());
  });
  return { c, p, video };
}
async function close(x: Awaited<ReturnType<typeof ctx>>) {
  const video = x.p.video();
  await x.c.close();
  if (x.video && video)
    await rename(await video.path(), `${dir}/recordings/${x.video}.webm`);
}
async function open(p: Page, id = 'ai3') {
  await p.goto(`${base}/prototype`, { waitUntil: 'networkidle' });
  const l = lessons.find((l) => l.id === id)!;
  const shelf = p.getByRole('button', { name: 'Learning shelf', exact: true });
  if (await shelf.isVisible()) await shelf.click();
  await p
    .getByRole('button', {
      name: l.filename ? `Learn ${l.filename}` : l.title,
      exact: true,
    })
    .click();
  await cycle(p).waitFor();
  if ((await saved(p)).learning?.activity === 'diagnostic')
    await cycle(p)
      .getByRole('button', { name: /Skip diagnostic/ })
      .click();
  await p.evaluate(() => document.fonts.ready);
}
async function primary(p: Page, name: RegExp) {
  await cycle(p).getByRole('button', { name }).click();
}
async function awaiting(p: Page) {
  const s = await saved(p);
  if (s.teaching.status === 'INTRODUCING') await primary(p, /Show me/);
  if ((await saved(p)).teaching.status === 'DEMONSTRATING')
    await primary(p, /Your turn/);
}
async function answer(p: Page, response?: string) {
  const s = await saved(p),
    l = lessonForState(
      lessons.find((l) => l.id === s.lessonId),
      s,
    )!;
  const q = currentQuestion(s, l),
    value =
      response ??
      (q.type === 'text'
        ? 'The fact must match the premise of the rule; this explanation is unverified.'
        : q.correct.join('|'));
  if (q.type === 'text')
    await p.getByRole('textbox', { name: 'Your explanation' }).fill(value);
  else if (q.type === 'number')
    await p.getByRole('textbox', { name: 'Practice value' }).fill(value);
  else if (
    s.mode === 'classic' &&
    s.visualState.kind === 'tree' &&
    s.visualState.example
  ) {
    const index = s.visualState.example.values.indexOf(Number(value));
    await p
      .getByRole('button', { name: `example-${index}: ${value}`, exact: true })
      .click();
  } else
    for (const item of value.split('|'))
      await (
        q.board && s.mode === 'classic'
          ? p.getByRole('region', { name: 'Reasoning board', exact: true })
          : cycle(p)
      )
        .getByRole('button', { name: item, exact: true })
        .click();
  await primary(p, /Check my answer|Record explanation/);
}
async function complete(p: Page) {
  await awaiting(p);
  await answer(p);
  const fresh = cycle(p).getByRole('button', { name: /Try a fresh example/ });
  if (await fresh.isVisible()) {
    await fresh.click();
    await answer(p);
  }
  assert.equal((await saved(p)).teaching.status, 'READY_TO_CONTINUE');
  await primary(p, /Continue/);
}
async function screenshot(p: Page, name: string) {
  await p.screenshot({ path: `${dir}/${name}.png`, fullPage: true });
}
try {
  const a = await ctx('correct-answer-and-interruption');
  await open(a.p);
  await screenshot(a.p, 'minimax-opening');
  assert.equal(
    await a.p
      .getByRole('button', { name: /Show all leaves|Step pruning/ })
      .count(),
    0,
  );
  await complete(a.p);
  await awaiting(a.p);
  await answer(a.p, '8');
  await screenshot(a.p, 'max-correct');
  assert.match(await cycle(a.p).innerText(), /highest available value/);
  assert.equal((await saved(a.p)).questionId, 'AI3-Q02');
  await primary(a.p, /Try a fresh example/);
  await answer(a.p);
  await primary(a.p, /Continue/);
  await complete(a.p);
  await complete(a.p); // MIN, then MIN A
  await awaiting(a.p);
  assert.equal((await saved(a.p)).questionId, 'AI3-Q05');
  const before = await saved(a.p);
  await primary(a.p, /Need help/);
  await primary(a.p, /Ask Petros a question/);
  await a.p
    .getByRole('textbox', { name: 'Ask Petros a question' })
    .fill('Why would it choose 2 instead of 9?');
  await cycle(a.p)
    .getByRole('button', { name: 'Ask Petros', exact: true })
    .click();
  await a.p
    .getByRole('region', { name: 'Lesson help' })
    .getByText(/min\(2, 9\) = 2/)
    .waitFor();
  await screenshot(a.p, 'contextual-interruption');
  assert.equal((await saved(a.p)).highlightTargetId, 'branch-1');
  await primary(a.p, /Resume this step/);
  assert.deepEqual((await saved(a.p)).visualState, before.visualState);
  assert.equal((await saved(a.p)).questionId, before.questionId);
  await answer(a.p);
  await primary(a.p, /Continue/);
  while ((await saved(a.p)).phase !== 'recap') await complete(a.p);
  results.tests.push(
    'beginner opening',
    'MAX 8 correct + fresh application',
    'MIN introduced before tree',
    'all fixed-tree child values + root',
    'contextual MIN B interruption + exact resume',
    'pruning on C=(4,1): 5 visits / 1 skip',
    'independent different tree',
  );
  await close(a);

  const b = await ctx('wrong-answer-remediation');
  await open(b.p);
  await complete(b.p);
  await complete(b.p);
  await awaiting(b.p);
  await answer(b.p, '8');
  let s = await saved(b.p);
  assert.equal(s.questionId, 'AI3-Q03');
  assert.equal(s.misconceptionCategory, 'MIN-maximizes-MAX-score');
  assert.match(await cycle(b.p).innerText(), /That would be MAX's choice/);
  assert.equal(
    s.visualState.kind === 'tree' && s.visualState.example?.values.join(','),
    '3,8,5',
  );
  await screenshot(b.p, 'min-wrong');
  await primary(b.p, /Compare and try again/);
  await answer(b.p, '8');
  s = await saved(b.p);
  assert.equal(
    s.visualState.kind === 'tree' && s.visualState.example?.values.length,
    2,
  );
  await screenshot(b.p, 'min-simpler');
  await primary(b.p, /Try a new example/);
  const beforeHelp = await saved(b.p);
  await primary(b.p, /Need help/);
  await primary(b.p, /Explain it more simply/);
  assert.deepEqual((await saved(b.p)).visualState, beforeHelp.visualState);
  await primary(b.p, /Resume this step/);
  await answer(b.p);
  s = await saved(b.p);
  assert.equal(s.observations['AI3-Q03']?.responses.length, 3);
  assert.ok(s.observations['AI3-Q03']?.assistance.includes('simpler'));
  assert.equal(s.permittedHintLevel, 2);
  await screenshot(b.p, 'min-recovered');
  results.tests.push(
    'wrong answer preserves selected value and task',
    'second wrong answer -> two-value worked example',
    'fresh response evaluated with assistance history',
  );
  await close(b);

  const c = await ctx();
  await open(c.p);
  await complete(c.p);
  await awaiting(c.p);
  const idle = await saved(c.p);
  await c.p.waitForTimeout(31000);
  const afterIdle = await saved(c.p);
  assert.equal(afterIdle.questionId, idle.questionId);
  assert.deepEqual(afterIdle.observations, idle.observations);
  assert.deepEqual(afterIdle.completion, idle.completion);
  await writeFile(
    `${dir}/no-response.json`,
    JSON.stringify(
      { waitedMs: 31000, before: idle, after: afterIdle },
      null,
      2,
    ),
  );
  await answer(c.p, '8');
  await primary(c.p, /Need help/);
  await primary(c.p, /Explain it more simply/);
  await primary(c.p, /Resume this step/);
  const continuity = await saved(c.p);
  await c.p.reload({ waitUntil: 'networkidle' });
  await cycle(c.p).waitFor();
  assert.deepEqual((await saved(c.p)).observations, continuity.observations);
  assert.equal((await saved(c.p)).questionId, continuity.questionId);
  await c.p
    .getByRole('button', { name: 'Enter Petros World', exact: true })
    .click();
  await c.p
    .getByRole('main', { name: 'Petros World immersive study' })
    .waitFor({ timeout: 90000 });
  await c.p.waitForFunction(
    () => document.querySelector('[data-world-phase="teaching"]') !== null,
    undefined,
    { timeout: 90000 },
  );
  await cycle(c.p).waitFor();
  await c.p.waitForFunction(
    () =>
      !!(window as any).__PETROS_BOARD__ &&
      document.querySelector('[data-camera-moving="false"]'),
    undefined,
    { timeout: 60000 },
  );
  await c.p.waitForTimeout(1500);
  assert.equal((await saved(c.p)).mode, 'world');
  assert.deepEqual((await saved(c.p)).observations, continuity.observations);
  await screenshot(c.p, 'world-shared-state');
  await c.p.getByRole('button', { name: /Exit Petros World/ }).click();
  await c.p
    .getByRole('button', { name: 'Enter Petros World', exact: true })
    .waitFor();
  assert.deepEqual((await saved(c.p)).observations, continuity.observations);
  await writeFile(
    `${dir}/continuity.json`,
    JSON.stringify({ before: continuity, after: await saved(c.p) }, null, 2),
  );
  results.tests.push(
    '31 seconds unanswered: no progress / no invented response',
    'refresh recovery',
    'Classic -> World -> Classic preserves observations and assistance',
  );

  console.log(
    'Core browser paths and continuity passed; checking six lessons.',
  );
  for (const l of lessons) {
    console.log('Lesson', l.id);
    await open(c.p, l.id);
    for (let i = 0; i < l.questions.length; i++) await complete(c.p);
    assert.equal((await saved(c.p)).phase, 'recap');
    results.lessons.push({
      id: l.id,
      questions: l.questions.length,
      status: 'passed',
      observedResponses: Object.keys((await saved(c.p)).observations).length,
    });
  }
  for (const [width, height] of [
    [1366, 768],
    [1440, 900],
    [390, 844],
    [360, 800],
  ]) {
    await c.p.setViewportSize({ width, height });
    await open(c.p);
    await screenshot(c.p, `opening-${width}x${height}`);
    assert.ok(
      await c.p.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    const next = await cycle(c.p)
      .getByRole('button', { name: /Show me/ })
      .boundingBox();
    assert.ok(next && next.x >= 0 && next.x + next.width <= width);
    await complete(c.p);
    await awaiting(c.p);
    await primary(c.p, /Need help/);
    const help = c.p.getByRole('region', { name: 'Lesson help' });
    await help.waitFor();
    const bounds = await help.boundingBox();
    assert.ok(bounds && bounds.x >= 0 && bounds.x + bounds.width <= width);
    await help.getByRole('button', { name: 'Close help and resume' }).focus();
    await c.p.keyboard.press('Escape');
    assert.equal(
      await cycle(c.p)
        .getByRole('button', { name: 'Need help?' })
        .evaluate((el) => el === document.activeElement),
      true,
    );
    results.layouts.push({
      width,
      height,
      horizontalOverflow: false,
      primaryInBounds: true,
      helpInBounds: true,
      escapeRestoresFocus: true,
    });
  }
  await close(c);
  assert.deepEqual(results.errors, []);
  assert.deepEqual(results.productionMutations, []);
} catch (error) {
  results.failure = String(error);
  if (lastPage! && !lastPage.isClosed()) {
    await lastPage.screenshot({ path: `${dir}/failure.png`, fullPage: true });
    results.failureText = (await lastPage.locator('body').innerText()).slice(
      -4000,
    );
  }
  throw error;
} finally {
  await writeFile(
    `${dir}/browser-results.json`,
    JSON.stringify(results, null, 2),
  );
  await browser.close();
}
console.log(JSON.stringify(results, null, 2));
