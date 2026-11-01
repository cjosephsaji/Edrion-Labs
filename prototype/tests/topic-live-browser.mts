/** Explicitly opt in: this script makes one billable topic-generation request. */
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { browserExecutable } from './browser-executable';
import { validTopicLesson } from '../teaching/topic-content';
import { SESSION_KEY } from '../teaching/persistence';
import type { ShowcaseState } from '../teaching/types';
if (process.env.PETROS_LIVE_TOPIC_TEST !== '1') {
  throw new Error(
    'Set PETROS_LIVE_TOPIC_TEST=1 to explicitly enable one live generation request.',
  );
}
const dir = 'evidence/learning-experience';
await mkdir(dir, { recursive: true });
const browser = await chromium.launch({
  executablePath: browserExecutable(),
  headless: true,
  args: ['--enable-unsafe-swiftshader'],
});
const context = await browser.newContext({
  viewport: { width: 1366, height: 900 },
  reducedMotion: 'reduce',
});
await context.addInitScript('window.__name=(fn)=>fn;');
const p = await context.newPage();
p.setDefaultNavigationTimeout(120000);
p.setDefaultTimeout(25000);
const base = process.env.SHOWCASE_TEST_URL ?? 'http://localhost:3022';
const result: Record<string, unknown> = {
  liveProviderRequest: true,
  productionMutations: [],
  errors: [],
};
p.on('pageerror', (error) => (result.errors as string[]).push(error.message));
p.on('request', (request) => {
  if (
    ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method()) &&
    !request.url().includes('/prototype/api/')
  )
    (result.productionMutations as string[]).push(request.url());
});
const state = () =>
  p.evaluate(
    (key): ShowcaseState => JSON.parse(sessionStorage.getItem(key)!).state,
    SESSION_KEY,
  );
try {
  await p.goto(base + '/prototype', { waitUntil: 'networkidle' });
  const capabilities = await (
    await p.request.get(base + '/prototype/api/capabilities')
  ).json();
  assert.equal(
    capabilities.topicModel,
    true,
    'The server must detect the saved key before a live test.',
  );
  const responsePromise = p.waitForResponse(
    (response) =>
      response.url().endsWith('/prototype/api/topic') &&
      response.request().method() === 'POST',
    { timeout: 110000 },
  );
  await p
    .getByRole('textbox', { name: 'Explore any topic' })
    .fill('How does photosynthesis work?');
  const started = Date.now();
  await p.getByRole('button', { name: /Let.s explore/ }).click();
  const response = await responsePromise;
  const body = await response.json();
  result.httpStatus = response.status();
  result.elapsedMs = Date.now() - started;
  if (!response.ok()) {
    result.code = body.code ?? 'REQUEST_FAILED';
    result.message = body.error ?? 'The live request failed.';
    await p.locator('#topics').getByRole('alert').waitFor();
    await p.screenshot({
      path: dir + '/live-topic-result.png',
      fullPage: true,
    });
    throw new Error(
      'Live topic request returned ' +
        response.status() +
        ' (' +
        String(result.code) +
        ').',
    );
  }
  assert.equal(validTopicLesson(body.lesson), true);
  const cycle = p.getByRole('region', {
    name: 'Student-paced teaching',
    exact: true,
  });
  await cycle.waitFor();
  await p.waitForTimeout(200);
  const initial = await state();
  assert.equal(initial.topicLesson?.origin, 'generated');
  assert.equal(initial.topicLesson?.id, body.lesson.id);
  await cycle.getByRole('button', { name: /Skip diagnostic/ }).click();
  await p.getByText('Learning path, prerequisites and lesson details', { exact: true }).click();
  result.title = body.lesson.title;
  result.concepts = body.lesson.questions.length;
  result.learningGoals = body.lesson.learningGoals;
  await p.screenshot({ path: dir + '/live-topic-result.png', fullPage: true });
  await cycle.getByRole('button', { name: /Show me/ }).click();
  await cycle.getByRole('button', { name: /Your turn/ }).click();
  // A declared-key comparison must remain explicitly unverified, even when it matches.
  await cycle
    .getByRole('button', {
      name: body.lesson.questions[0].correct[0],
      exact: true,
    })
    .click();
  await cycle.getByRole('button', { name: /Check my answer/ }).click();
  await cycle.getByText(/not an independently validated answer/).waitFor();
  await p.waitForTimeout(200);
  const answered = await state();
  assert.equal(answered.evidence?.attempts.at(-1)?.validation, 'unverified');
  await p.reload({ waitUntil: 'networkidle' });
  await cycle.waitFor();
  assert.deepEqual((await state()).evidence, answered.evidence);
  result.checks = [
    'Real live structured lesson rendered',
    'Learning goals and ordered concepts present',
    'Model-declared answer remains unverified',
    'Refresh preserves generated blueprint and evidence',
  ];
  result.success = true;
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.productionMutations, []);
} catch (error) {
  result.success = false;
  result.failure = error instanceof Error ? error.message : String(error);
  throw error;
} finally {
  await writeFile(
    dir + '/live-topic-result.json',
    JSON.stringify(result, null, 2),
  );
  await context.close();
  await browser.close();
}
console.log(JSON.stringify(result, null, 2));
