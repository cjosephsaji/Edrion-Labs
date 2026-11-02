import { chromium } from 'playwright-core';
import { browserExecutable } from './browser-executable';
import { writeFile, mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
const browser = await chromium.launch({
  executablePath: browserExecutable(),
  headless: true,
  args: ['--autoplay-policy=no-user-gesture-required'],
});
const out = new URL('../evidence/corrective/', import.meta.url);
await mkdir(out, { recursive: true });
const topics = ['neural', 'rocket', 'attention', 'traffic', 'relativity'],
  labels = [
    'Neural learning',
    'Rocket landing',
    'Attention',
    'Traffic waves',
    'Time dilation',
  ];
const stations = [
    'Neural Learning Lab',
    'Rocket Launch Bay',
    'Language Studio',
    'Traffic Control Table',
    'Relativity Observatory',
  ],
  correct = [0, 1, 1, 0, 0],
  results: any[] = [],
  errors: string[] = [];
const data = async (page: any) =>
  JSON.parse(await page.locator('#petros-observations').textContent());
try {
  for (const mode of ['classic', 'world']) {
    const context = await browser.newContext({
        viewport: { width: 1440, height: 900 },
      }),
      page = await context.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    page.setDefaultTimeout(30000);
    await page.goto('http://127.0.0.1:3022/prototype');
    await page.locator('#petros-observations').waitFor({ state: 'attached' });
    if (mode === 'world') {
      await page
        .getByRole('button', { name: 'Explore World ↗', exact: true })
        .click();
      await page.locator('canvas').waitFor();
    }
    for (let i = 0; i < topics.length; i++) {
      const id = topics[i];
      await page
        .getByRole('button', {
          name:
            mode === 'world' ? `Visit ${stations[i]}` : new RegExp(labels[i]),
          exact: mode === 'world',
        })
        .click();
      await page
        .getByRole('button', {
          name: 'Start learning with captions',
          exact: true,
        })
        .click();
      for (let j = 0; j < 3; j++)
        await page
          .getByRole('button', { name: 'Continue with Petros →', exact: true })
          .click();
      let d = await data(page);
      assert.equal(d.topic, id);
      assert.equal(d.guide.phase, 'PREDICT');
      assert.ok(d.scene.focus);
      assert.ok(d.scene.marks.length);
      await page
        .locator('[aria-label="Your prediction"] button')
        .nth(1 - correct[i])
        .click();
      d = await data(page);
      assert.equal(d.evidence.at(-1).assessment, 'wrong');
      assert.equal(d.guide.representation, 'compare');
      assert.ok(d.scene.objects.length >= 2);
      await page.screenshot({
        path: fileURLToPath(new URL(`${id}-${mode}-correction.png`, out)),
        fullPage: true,
      });
      await page
        .getByRole('button', { name: 'Try a fresh example →', exact: true })
        .click();
      assert.equal((await data(page)).guide.phase, 'TRANSFER_CHECK');
      await page
        .locator('[aria-label="Your prediction"] button')
        .nth(0)
        .click();
      assert.equal((await data(page)).guide.phase, 'EXPLORE');
      await page
        .getByRole('button', { name: 'Restart lesson', exact: true })
        .click();
      for (let j = 0; j < 3; j++)
        await page
          .getByRole('button', { name: 'Continue with Petros →', exact: true })
          .click();
      await page
        .locator('[aria-label="Your prediction"] button')
        .nth(correct[i])
        .click();
      assert.equal((await data(page)).evidence.at(-1).assessment, 'correct');
      assert.equal((await data(page)).guide.phase, 'RETEACH_OR_EXTEND');
      await page
        .getByRole('button', { name: 'Try a fresh example →', exact: true })
        .click();
      const before = await data(page);
      await page
        .getByRole('button', {
          name: mode === 'world' ? 'Focus' : 'Explore World ↗',
          exact: true,
        })
        .click();
      const switched = await data(page);
      for (const key of ['params', 'activeQuestion', 'history', 'sim'])
        assert.deepEqual(switched[key], before[key]);
      await page
        .getByRole('button', {
          name: mode === 'world' ? 'Explore World ↗' : 'Focus',
          exact: true,
        })
        .click();
      await page.waitForTimeout(250);
      await page.reload();
      await page.locator('#petros-observations').waitFor({ state: 'attached' });
      const restored = await data(page);
      assert.equal(restored.topic, id);
      assert.deepEqual(restored.params, before.params);
      assert.equal(restored.guide.phase, 'TRANSFER_CHECK');
      if (mode === 'world') {
        await page
          .getByRole('button', { name: `Visit ${stations[i]}`, exact: true })
          .click();
        await page.waitForFunction(
          () =>
            document.querySelector('canvas')?.dataset.travelling === 'false',
        );
      }
      for (const [width, height] of [
        [1440, 900],
        [1366, 768],
        [390, 844],
      ]) {
        await page.setViewportSize({ width, height });
        await page.waitForTimeout(250);
        assert.ok(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth + 1,
          ),
          'horizontal overflow',
        );
        const sizes = await page
          .locator('[aria-label="Your prediction"] button')
          .evaluateAll((els: any[]) =>
            els.map((e) => ({
              width: e.getBoundingClientRect().width,
              height: e.getBoundingClientRect().height,
              scroll: e.scrollWidth,
              client: e.clientWidth,
            })),
          );
        assert.ok(
          sizes.every(
            (b: any) =>
              b.width > 60 && b.height > 30 && b.scroll <= b.client + 1,
          ),
        );
        await page.screenshot({
          path: fileURLToPath(new URL(`${id}-${mode}-${width}.png`, out)),
          fullPage: true,
        });
      }
      await page.setViewportSize({ width: 1440, height: 900 });
      results.push({
        topic: id,
        mode,
        opening: true,
        wrong: true,
        correct: true,
        transfer: true,
        modePreservation: true,
        reload: true,
        responsive: [1440, 1366, 390],
      });
      console.log('PASS', id, mode);
    }
    await context.close();
  }
  assert.deepEqual(errors, []);
  await writeFile(
    new URL('browser-results.json', out),
    JSON.stringify({ results, errors }, null, 2),
  );
} catch (e) {
  await writeFile(
    new URL('browser-failure.json', out),
    JSON.stringify({ error: String(e), results, errors }, null, 2),
  );
  throw e;
} finally {
  await browser.close();
}
