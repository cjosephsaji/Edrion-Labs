import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { browserExecutable } from './browser-executable';
import {
  buildInvestigation,
  INVESTIGATION_STORAGE,
} from '../core/investigation';
import { frameMeasurements } from '../core/investigation-playback';
import { TOPICS } from '../simulations/runtime';

const out = new URL('../evidence/learning-journey/', import.meta.url);
await mkdir(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: browserExecutable(),
  headless: true,
});
const origin = process.env.SHOWCASE_TEST_URL || 'http://127.0.0.1:3022';
const errors: string[] = [];
const results: object[] = [];
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  const ready = () =>
    page
      .locator('[data-testid="learning-studio"][data-ready="true"]')
      .waitFor();
  const screenshot = async (name: string) => {
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({
      path: fileURLToPath(new URL(name + '.png', out)),
      fullPage: true,
    });
  };
  const layout = async (name: string) => {
    await page.waitForTimeout(200);
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      `${name}: horizontal overflow`,
    );
  };
  for (const topic of TOPICS) {
    await page.goto(`${origin}/prototype?view=2d&lesson=${topic}`);
    await ready();
    for (const caseIndex of [0, 1, 2]) {
      const task = buildInvestigation(topic, caseIndex);
      const prediction = page
        .getByRole('group', { name: 'Your prediction' })
        .getByRole('radio');
      assert.equal(
        await page
          .getByRole('button', { name: 'Test my prediction' })
          .isEnabled(),
        false,
      );
      // The answer group precedes the model in DOM/keyboard order.
      assert.ok(
        await page.evaluate(
          () =>
            !!(
              document
                .querySelector('fieldset')!
                .compareDocumentPosition(
                  document.querySelector(
                    '[aria-label="Experiment workbench"]',
                  )!,
                ) & Node.DOCUMENT_POSITION_FOLLOWING
            ),
        ),
      );
      await prediction
        .nth(task.prediction.findIndex((c) => c.id === task.correctPrediction))
        .check();
      if (topic === 'rocket' && caseIndex === 0)
        await screenshot('rocket-2d-predict');
      await page.getByRole('button', { name: 'Test my prediction' }).click();
      assert.equal(
        await page.locator(':focus').innerText(),
        topic !== 'attention'
          ? 'Starting conditions'
          : 'Before the mask change',
      );
      assert.equal(await page.locator('input[type=range]').inputValue(), '0');
      await page.waitForTimeout(300);
      assert.equal(
        await page.locator('input[type=range]').inputValue(),
        '0',
        'The model must wait for the learner',
      );
      while (await page.getByRole('button', { name: /^Next: / }).count()) {
        await page.getByRole('button', { name: /^Next: / }).click();
        const frame = +(await page.locator('input[type=range]').inputValue());
        const measures = frameMeasurements(task, frame);
        for (const measure of measures)
          assert.equal(
            await page
              .locator(
                `[data-measure-id="${measure.id}"] [data-value="changed"]`,
              )
              .innerText(),
            String(Number(measure.changed.toFixed(2))),
          );
        await page
          .getByRole('button', { name: '2D diagram', exact: false })
          .click();
        assert.equal(
          +(await page.locator('input[type=range]').inputValue()),
          frame,
        );
        for (const measure of measures)
          assert.equal(
            await page
              .locator(
                `[data-measure-id="${measure.id}"] [data-value="changed"]`,
              )
              .innerText(),
            String(Number(measure.changed.toFixed(2))),
          );
      }
      if (caseIndex === 0) {
        await screenshot(`${topic}-2d-compare`);
        for (const width of [390, 768]) {
          await page.setViewportSize({ width, height: 900 });
          await layout(`${topic} 2d ${width}`);
          if (topic === 'rocket') await screenshot(`rocket-2d-${width}`);
        }
        await page.setViewportSize({ width: 1440, height: 1000 });
      }
      await page.getByRole('button', { name: 'Explain what changed' }).click();
      assert.equal(
        await page.locator(':focus').innerText(),
        'What caused that result?',
      );
      await page
        .getByRole('group', { name: 'Your explanation' })
        .getByRole('radio')
        .nth(task.reasons.findIndex((c) => c.id === task.correctReason))
        .check();
      await page.getByRole('button', { name: 'Check my explanation' }).click();
      assert.equal(
        await page.getByTestId('learning-studio').getAttribute('data-stage'),
        'reflect',
      );
      await page.waitForTimeout(180);
      await page.reload();
      await ready();
      assert.equal(
        await page
          .getByTestId('learning-studio')
          .getAttribute('data-presentation'),
        '2d',
      );
      assert.equal(
        await page.getByTestId('learning-studio').getAttribute('data-stage'),
        'reflect',
      );
      if (caseIndex === 0) {
        await page
          .getByRole('button', { name: '3D workshop', exact: false })
          .click();
        await page.getByTestId('maker-studio').waitFor();
        await page.goto(`${origin}/prototype?view=2d&lesson=${topic}`);
        await ready();
        assert.equal(
          await page.getByTestId('learning-studio').getAttribute('data-stage'),
          'reflect',
        );
      }
      if (caseIndex < 2)
        await page
          .getByRole('button', { name: 'Try a different case' })
          .click();
      results.push({
        topic,
        caseIndex,
        independentLabPreservesSaved2DProgress: true,
        guidedComparison: true,
        reload: true,
      });
    }
  }
  const saved = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)!),
    INVESTIGATION_STORAGE,
  );
  assert.equal(
    Object.values(saved.topics).reduce(
      (n: number, p: any) => n + p.attempts.length,
      0,
    ),
    15,
  );
  assert.deepEqual(errors, []);
  await writeFile(
    new URL('results.json', out),
    JSON.stringify({ results, errors }, null, 2),
  );
  console.log(JSON.stringify({ cases: results.length, errors }));
} finally {
  await browser.close();
}
