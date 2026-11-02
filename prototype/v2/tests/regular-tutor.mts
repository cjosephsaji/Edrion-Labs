import { chromium } from 'playwright-core';
import { browserExecutable } from './browser-executable';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const out = new URL('../evidence/regular-tutor/', import.meta.url);
await mkdir(out, { recursive: true });
const browser = await chromium.launch({
    executablePath: browserExecutable(),
    headless: true,
  }),
  errors: string[] = [];
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  });
  page.on('pageerror', (e) => errors.push(e.message));
  const models: string[] = [];
  page.on('request', (r) => {
    if (r.url().endsWith('.glb')) models.push(r.url());
  });
  await page.goto('http://127.0.0.1:3022/prototype?view=2d');
  await page.locator('#petros-observations').waitFor({ state: 'attached' });
  const read = async () =>
    JSON.parse((await page.locator('#petros-observations').textContent())!);
  const results = [];
  for (const label of [
    'Neural learning',
    'Rocket landing',
    'Attention',
    'Traffic waves',
    'Time dilation',
  ]) {
    await page
      .locator('nav[aria-label="Interactive topics"]')
      .getByRole('button', { name: new RegExp(label) })
      .click();
    await page
      .getByTestId('regular-learning-model')
      .locator('svg')
      .waitFor({ state: 'visible' });
    assert.equal(await page.locator('canvas').count(), 0);
    await page
      .getByRole('button', {
        name: 'Start learning with captions',
        exact: true,
      })
      .click();
    await page
      .getByRole('button', { name: 'Continue with Petros →', exact: true })
      .click();
    assert.equal((await read()).guide.phase, 'EXPLAIN');
    results.push(label);
  }
  assert.deepEqual(models, [], '2D tutor must not load the 3D world assets');
  const saved = await read();
  await page.screenshot({
    path: fileURLToPath(new URL('desktop-dpr2.png', out)),
    fullPage: true,
  });
  await page.getByRole('link', { name: '3D world ↗', exact: true }).click();
  await page
    .getByRole('button', { name: 'Explore the islands', exact: true })
    .waitFor();
  assert.deepEqual((await read()).params, saved.params);
  assert.equal((await read()).guide.phase, 'EXPLAIN');
  await page
    .getByRole('button', {
      name: 'World settings and information',
      exact: true,
    })
    .click();
  await page
    .getByRole('link', { name: 'Open regular tutor (2D) ↗', exact: true })
    .click();
  await page
    .getByTestId('regular-learning-model')
    .waitFor({ state: 'visible' });
  await page.locator('#petros-observations').waitFor({ state: 'attached' });
  assert.equal((await read()).topic, saved.topic);
  assert.deepEqual((await read()).params, saved.params);
  assert.equal((await read()).guide.phase, 'EXPLAIN');
  assert.equal(await page.locator('canvas').count(), 0);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  );
  await page.screenshot({
    path: fileURLToPath(new URL('mobile-dpr2.png', out)),
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  await writeFile(
    new URL('results.json', out),
    JSON.stringify(
      {
        passed: true,
        topics: results,
        no3DCanvas: true,
        no3DAssetsInRegularView: true,
        roundTripPreservesLesson: true,
        errors,
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
