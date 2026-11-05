import assert from 'node:assert/strict';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { browserExecutable } from './browser-executable';
import {
  buildInvestigation,
  INVESTIGATION_STORAGE,
} from '../core/investigation';
import { TOPICS } from '../simulations/runtime';

const out = new URL('../evidence/investigations/', import.meta.url);
await mkdir(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: browserExecutable(),
  headless: true,
});
const results: unknown[] = [],
  errors: string[] = [];
const origin = process.env.SHOWCASE_TEST_URL || 'http://127.0.0.1:3022';
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage();
  page.setDefaultNavigationTimeout(60000);
  const checkLayout = async () => {
    await page.evaluate(() => document.fonts.ready);
    // Allow ResizeObserver, React's compact layout and the subsequent text measurement to settle.
    await page.waitForTimeout(350);
    assert.equal(
      await page
        .locator('[data-visual-status]')
        .getAttribute('data-visual-status'),
      'checked',
      (await page
        .locator('[data-visual-status]')
        .getAttribute('data-visual-issues')) ?? 'Visual gate failed',
    );
  };
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`${origin}/prototype?view=2d`, { waitUntil: 'networkidle' });
  await page.getByTestId('learning-studio').waitFor();
  await page
    .locator('[data-testid="learning-studio"][data-ready="true"]')
    .waitFor();
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    path: new URL('neural-desktop.png', out).pathname.replace(
      /^\/([A-Z]:)/,
      '$1',
    ),
    fullPage: true,
  });
  for (const [topicIndex, topic] of TOPICS.entries()) {
    await page
      .getByRole('navigation', { name: 'Investigations' })
      .getByRole('button')
      .nth(topicIndex)
      .click();
    for (let caseIndex = 0; caseIndex < 3; caseIndex++) {
      const task = buildInvestigation(topic, caseIndex);
      const wrong = topic === 'neural' && caseIndex === 0;
      if (wrong)
        await page.getByRole('button', { name: 'Give me a foothold' }).click();
      const options = page
        .getByRole('group', { name: 'Your prediction' })
        .getByRole('radio');
      await options
        .nth(
          wrong
            ? task.prediction.findIndex((c) => c.id !== task.correctPrediction)
            : task.prediction.findIndex((c) => c.id === task.correctPrediction),
        )
        .check();
      await page.getByRole('button', { name: 'Test my prediction' }).click();
      await page.getByRole('button', { name: 'Final frame' }).click();
      await checkLayout();
      await page.getByRole('button', { name: 'Explain what changed' }).click();
      await page
        .getByRole('group', { name: 'Your explanation' })
        .getByRole('radio')
        .nth(
          wrong
            ? task.reasons.findIndex((c) => c.id !== task.correctReason)
            : task.reasons.findIndex((c) => c.id === task.correctReason),
        )
        .check();
      await page.getByRole('button', { name: 'Check my explanation' }).click();
      assert.equal(
        await page.getByTestId('learning-studio').getAttribute('data-stage'),
        'reflect',
      );
      if (caseIndex === 0) {
        await page.screenshot({
          path: new URL(`${topic}-result.png`, out).pathname.replace(
            /^\/([A-Z]:)/,
            '$1',
          ),
          fullPage: true,
        });
        for (const width of [390, 768]) {
          await page.setViewportSize({
            width,
            height: width === 390 ? 844 : 1024,
          });
          await checkLayout();
          assert.ok(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth + 1,
            ),
            `${topic} overflows at ${width}`,
          );
          await page.screenshot({
            path: new URL(`${topic}-${width}.png`, out).pathname.replace(
              /^\/([A-Z]:)/,
              '$1',
            ),
            fullPage: true,
          });
        }
        await page.setViewportSize({ width: 1440, height: 1000 });
      }
      if (caseIndex > 0) {
        for (const width of [390, 768]) {
          await page.setViewportSize({ width, height: 1000 });
          await checkLayout();
          assert.ok(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth + 1,
            ),
          );
        }
        await page.setViewportSize({ width: 1440, height: 1000 });
      }
      results.push({ topic, caseIndex, wrongPath: wrong, layout: 'checked' });
      if (caseIndex < 2)
        await page
          .getByRole('button', {
            name: wrong
              ? 'Test that idea in a new case'
              : 'Try a different case',
          })
          .click();
    }
  }
  await page.waitForTimeout(180);
  const saved = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)!),
    INVESTIGATION_STORAGE,
  );
  assert.equal(
    Object.values(saved.topics).reduce(
      (sum: number, p: any) => sum + p.attempts.length,
      0,
    ),
    15,
  );
  assert.equal(saved.topics.neural.attempts[0].hint, true);
  assert.equal(saved.topics.neural.attempts[0].reasonCorrect, false);
  await page.reload({ waitUntil: 'networkidle' });
  await page
    .locator('[data-testid="learning-studio"][data-ready="true"]')
    .waitFor();
  assert.equal(
    await page.getByTestId('learning-studio').getAttribute('data-stage'),
    'reflect',
  );
  await page.getByRole('button', { name: /Field notes/ }).click();
  assert.equal(
    await page
      .getByRole('region', { name: 'Learning field notes' })
      .locator('article')
      .count(),
    15,
  );
  results.push({ recovery: true, evidenceCount: 15 });
  // A fresh reduced-motion user commits an answer but never auto-plays.
  const reduced = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: 'reduce',
  });
  const reducedPage = await reduced.newPage();
  await reducedPage.goto(`${origin}/prototype?view=2d`, {
    waitUntil: 'networkidle',
  });
  await reducedPage
    .getByRole('group', { name: 'Your prediction' })
    .getByRole('radio')
    .first()
    .check();
  await reducedPage.getByRole('button', { name: 'Test my prediction' }).click();
  assert.equal(
    await reducedPage
      .getByRole('slider', { name: 'Experiment replay position' })
      .inputValue(),
    '24',
  );
  await reducedPage
    .getByRole('button', { name: 'Toggle reference and final snapshot' })
    .click();
  assert.equal(
    await reducedPage
      .getByRole('slider', { name: 'Experiment replay position' })
      .inputValue(),
    '0',
  );
  // A fresh predict phase must not move itself forward just because time passes.
  await reducedPage.reload({ waitUntil: 'networkidle' });
  await reducedPage
    .locator('[data-testid="learning-studio"][data-ready="true"]')
    .waitFor();
  assert.equal(
    await reducedPage.getByTestId('learning-studio').getAttribute('data-stage'),
    'observe',
  );
  results.push({ reducedMotion: true });
  await page.goto(`${origin}/prototype?view=2d&mode=explore`, {
    waitUntil: 'domcontentloaded',
  });
  await page.getByTestId('petros-v2').waitFor();
  await page.getByRole('link', { name: 'Guided investigations' }).click();
  await page.getByTestId('learning-studio').waitFor();
  results.push({ freeLabPreserved: true });
  assert.deepEqual(errors, []);
  await writeFile(
    new URL('results.json', out),
    JSON.stringify({ passed: true, results, errors }, null, 2),
  );
  await rm(new URL('failure.json', out), { force: true });
  console.log(JSON.stringify({ passed: true, checks: results.length }));
} catch (error) {
  await writeFile(
    new URL('failure.json', out),
    JSON.stringify({ message: String(error), results, errors }, null, 2),
  );
  throw error;
} finally {
  await browser.close();
}
