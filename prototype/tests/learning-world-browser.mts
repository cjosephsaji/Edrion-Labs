import { chromium } from 'playwright-core';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { lessons } from '../lessons';
import { currentQuestion } from '../teaching/checkpoint';
import { lessonForState } from '../teaching/tree-variant';
import { SESSION_KEY } from '../teaching/persistence';
import type { ShowcaseState } from '../teaching/types';
import { browserExecutable } from './browser-executable';
const dir = 'evidence/learning-redesign';
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
const p = await context.newPage();
p.setDefaultNavigationTimeout(120000);
const results: any = {
  lessons: [],
  layouts: [],
  errors: [],
  productionMutations: [],
};
p.on('pageerror', (e) => results.errors.push(e.message));
p.on('request', (r) => {
  if (
    ['POST', 'PUT', 'PATCH', 'DELETE'].includes(r.method()) &&
    !r.url().includes('/prototype/api/')
  )
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
async function click(name: RegExp) {
  await cycle().getByRole('button', { name }).focus();
  await p.keyboard.press('Enter');
}
async function answer(value?: string) {
  const s = await state(),
    l = lessonForState(
      lessons.find((l) => l.id === s.lessonId),
      s,
    )!,
    q = currentQuestion(s, l);
  value ??= q.correct.join('|');
  if (q.type === 'number')
    await p.getByRole('textbox', { name: 'Practice value' }).fill(value);
  else if (q.type === 'text')
    await p
      .getByRole('textbox', { name: 'Your explanation' })
      .fill(value || 'A supported conclusion needs its premise.');
  else
    for (const item of value.split('|')) {
      await cycle().getByRole('button', { name: item, exact: true }).focus();
      await p.keyboard.press('Enter');
    }
  await click(/Check my answer|Record explanation/);
}
async function enter() {
  await p
    .getByRole('button', { name: 'Enter Petros World', exact: true })
    .click();
  await p.waitForFunction(
    (key) => JSON.parse(sessionStorage.getItem(key)!).state.mode === 'world',
    SESSION_KEY,
    { timeout: 90000 },
  );
  await p.waitForFunction(
    () =>
      document.querySelector(
        '[data-world-phase="teaching"][data-camera-moving="false"]',
      ),
    undefined,
    { timeout: 60000 },
  );
  await cycle().waitFor();
  if ((await state()).learning?.activity === 'diagnostic')
    await cycle()
      .getByRole('button', { name: /Skip diagnostic/ })
      .click();
  await p.waitForTimeout(1200);
}
try {
  for (const l of lessons) {
    console.log('World lesson', l.id);
    await p.goto(
      `${process.env.SHOWCASE_TEST_URL ?? 'http://127.0.0.1:3022'}/prototype`,
      { waitUntil: 'networkidle' },
    );
    if (
      await p
        .getByRole('button', { name: 'Exit Petros World', exact: true })
        .isVisible()
    )
      await p
        .getByRole('button', { name: 'Exit Petros World', exact: true })
        .click();
    const shelf = p.getByRole('button', {
      name: 'Learning shelf',
      exact: true,
    });
    if (await shelf.isVisible()) await shelf.click();
    await p
      .getByRole('button', {
        name: l.filename ? `Learn ${l.filename}` : l.title,
        exact: true,
      })
      .click();
    await enter();
    for (let i = 0; i < 5; i++) {
      console.log('Task', l.id, i + 1);
      await click(/Show me/);
      await click(/Your turn/);
      if (i === 0) {
        const s = await state(),
          q = currentQuestion(s, lessonForState(l, s)!);
        const wrong = q.options.find((o) => !q.correct.includes(o));
        assert.ok(wrong);
        await answer(wrong);
        assert.equal((await state()).questionId, s.questionId);
        assert.equal((await state()).teaching.status, 'RETEACHING');
        await click(/Try a new example|Compare and try again/);
      }
      if (i === 1) {
        await click(/Need help/);
        await click(/Explain it more simply/);
        await click(/Resume this step/);
      }
      await answer();
      const fresh = cycle().getByRole('button', {
        name: /Try a fresh example/,
      });
      if (await fresh.isVisible()) {
        await fresh.click();
        await answer();
      }
      assert.equal((await state()).teaching.status, 'READY_TO_CONTINUE');
      if (i === 4) {
        await p.waitForTimeout(500);
        await p.screenshot({
          path: `${dir}/${l.id}-world.png`,
          fullPage: true,
        });
      }
      await click(/Continue/);
    }
    const s = await state();
    assert.ok(Object.values(s.observations).some((o) => o.retries > 0));
    assert.ok(
      Object.values(s.observations).some((o) =>
        o.assistance.includes('simpler'),
      ),
    );
    results.lessons.push({
      id: l.id,
      mode: s.mode,
      completedTasks: 5,
      incorrectToFreshCheck: true,
      helpRecorded: true,
      visual: s.visualState.kind,
    });
    await p
      .getByRole('button', { name: 'Exit Petros World', exact: true })
      .click();
    await p
      .getByRole('button', { name: 'Enter Petros World', exact: true })
      .waitFor();
    assert.deepEqual((await state()).observations, s.observations);
  }
  // The same World task dock must remain inside each required viewport.
  await p.getByRole('button', { name: 'Learning shelf', exact: true }).click();
  await p
    .getByRole('button', { name: 'Learn AI_Module_3.pdf', exact: true })
    .click();
  await enter();
  for (const [width, height] of [
    [1366, 768],
    [1440, 900],
    [390, 844],
    [360, 800],
  ]) {
    await p.setViewportSize({ width, height });
    await p.waitForTimeout(1500);
    const bounds = await cycle().boundingBox();
    assert.ok(
      bounds &&
        bounds.x >= 0 &&
        bounds.x + bounds.width <= width &&
        bounds.y >= 0 &&
        bounds.y + bounds.height <= height,
    );
    await p.screenshot({
      path: `${dir}/world-${width}x${height}.png`,
      fullPage: true,
    });
    results.layouts.push({ width, height, taskDockInBounds: true });
  }
  assert.deepEqual(results.errors, []);
  assert.deepEqual(results.productionMutations, []);
} catch (e) {
  results.failure = String(e);
  await writeFile(
    `${dir}/world-results.json`,
    JSON.stringify(results, null, 2),
  );
  await p
    .screenshot({
      path: `${dir}/world-failure.png`,
      fullPage: true,
      timeout: 5000,
    })
    .catch(() => {});
  throw e;
} finally {
  await writeFile(
    `${dir}/world-results.json`,
    JSON.stringify(results, null, 2),
  );
  await context.close();
  await browser.close();
}
console.log(JSON.stringify(results, null, 2));
