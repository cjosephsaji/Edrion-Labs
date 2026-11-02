import { chromium } from 'playwright-core';
import { browserExecutable } from './browser-executable';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const browser = await chromium.launch({
  executablePath: browserExecutable(),
  headless: true,
});
const out = new URL('../evidence/world-rebuild/after/', import.meta.url);
await mkdir(out, { recursive: true });
const results: any[] = [];
const errors: string[] = [];
try {
  for (const [width, height] of [
    [1440, 900],
    [390, 844],
  ]) {
    const context = await browser.newContext({
        viewport: { width, height },
        deviceScaleFactor: 2,
      }),
      page = await context.newPage();
    page.setDefaultTimeout(45000);
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('response', (r) => {
      if (r.status() >= 400 && !r.url().includes('/api/'))
        errors.push(`${r.status()} ${r.url()}`);
    });
    await page.goto('http://127.0.0.1:3022/prototype');
    await page
      .getByRole('button', { name: 'Explore the islands', exact: true })
      .waitFor();
    await page.waitForFunction(
      () => document.querySelector('canvas')?.dataset.travelling === 'false',
    );
    const initial = await page.locator('canvas').evaluate((c) => ({
      css: [c.clientWidth, c.clientHeight],
      pixels: [c.width, c.height],
      dpr: c.width / c.clientWidth,
      data: { ...c.dataset },
    }));
    assert.deepEqual(initial.css, [width, height]);
    assert.equal(initial.dpr, 2);
    assert.equal(initial.data.character, 'rigged-glb');
    assert.ok(Number(initial.data.drawCalls) < 200);
    assert.ok(Number(initial.data.triangles) < 1e6);
    await page.screenshot({
      path: fileURLToPath(new URL(`opening-${width}-dpr2.png`, out)),
      fullPage: true,
    });
    await page
      .getByRole('button', { name: 'Explore the islands', exact: true })
      .click();
    for (const [i, label] of [
      'Neural learning',
      'Rocket landing',
      'Attention',
      'Traffic waves',
      'Time dilation',
    ].entries()) {
      await page
        .locator('nav[aria-label="Interactive topics"]')
        .getByRole('button', { name: new RegExp(label) })
        .click();
      await page.waitForFunction((id) => {
        const c = document.querySelector('canvas');
        return (
          c?.dataset.destination === id && c.dataset.travelling === 'false'
        );
      }, ['neural', 'rocket', 'attention', 'traffic', 'relativity'][i]);
      await page
        .getByRole('button', {
          name: 'Start learning with captions',
          exact: true,
        })
        .click();
      await page
        .getByRole('button', { name: 'Continue with Petros →', exact: true })
        .click();
      await page.waitForTimeout(700);
      const data = await page
        .locator('canvas')
        .evaluate((c) => ({ ...c.dataset }));
      assert.equal(data.character, 'rigged-glb');
      assert.ok(Number(data.drawCalls) < 200);
      assert.ok(Number(data.triangles) < 1e6);
      assert.equal(await page.locator('canvas').count(), 1);
      await page.screenshot({
        path: fileURLToPath(
          new URL(
            `${['neural', 'rocket', 'attention', 'traffic', 'relativity'][i]}-${width}-dpr2.png`,
            out,
          ),
        ),
        fullPage: true,
      });
      results.push({ viewport: [width, height], topic: label, canvas: data });
      console.log('CAPTURED', width, label);
    }
    await page
      .getByRole('button', {
        name: 'World settings and information',
        exact: true,
      })
      .click();
    for (const quality of ['high', 'balanced', 'low']) {
      await page
        .getByLabel('World quality', { exact: true })
        .selectOption(quality);
      await page.waitForFunction(
        (q) => document.querySelector('canvas')?.dataset.quality === q,
        quality,
      );
      const dpr = await page
        .locator('canvas')
        .evaluate((c) => c.width / c.clientWidth);
      assert.ok(dpr >= 1.5);
      results.push({ viewport: [width, height], quality, dpr });
    }
    await page
      .getByRole('button', { name: 'Reset World', exact: true })
      .click();
    const stored = JSON.parse(
      (await page.locator('#petros-observations').textContent())!,
    );
    assert.equal(stored.topic, 'neural');
    assert.equal(stored.params.weight, 0.5);
    await page.waitForFunction(
      () => document.querySelector('canvas')?.dataset.destination === 'hub',
    );
    await context.close();
  }
  assert.deepEqual(errors, []);
  await writeFile(
    new URL('../smoke-results.json', out),
    JSON.stringify({ results, errors }, null, 2),
  );
} catch (e) {
  await writeFile(
    new URL('../smoke-failure.json', out),
    JSON.stringify({ error: String(e), results, errors }, null, 2),
  );
  throw e;
} finally {
  await browser.close();
}
