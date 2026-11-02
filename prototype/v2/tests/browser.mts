import { chromium } from 'playwright-core';
import { browserExecutable } from './browser-executable';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const base = process.env.PETROS_V2_URL ?? 'http://127.0.0.1:3022',
  evidence = new URL('../evidence/', import.meta.url);
await mkdir(evidence, { recursive: true });
const browser = await chromium.launch({
  executablePath: browserExecutable(),
  headless: true,
  args: [
    '--use-fake-ui-for-media-stream',
    '--use-fake-device-for-media-stream',
  ],
});
const errors: string[] = [],
  results: unknown[] = [];
try {
  if (process.env.PETROS_CAPTURE_BASELINE === '1') {
    const baseline = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
    });
    await baseline.goto('http://127.0.0.1:3011/prototype');
    await baseline.screenshot({
      path: fileURLToPath(new URL('baseline-desktop.png', evidence)),
      fullPage: true,
    });
    await baseline.close();
  }
  for (const size of [
    { name: 'desktop', width: 1440, height: 1000 },
    { name: 'mobile', width: 360, height: 800 },
  ]) {
    const context = await browser.newContext({
        viewport: { width: size.width, height: size.height },
      }),
      page = await context.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(base + '/prototype');
    await page.getByRole('button', { name: 'Step +', exact: true }).waitFor();
    await page.waitForFunction(
      () =>
        document.querySelector('#petros-observations') &&
        document.body.textContent?.includes('AI teacher'),
    );
    const read = () =>
      page
        .locator('#petros-observations')
        .textContent()
        .then((s) => JSON.parse(s!));
    for (const [topic, label, control, value, target] of [
      ['neural', 'Neural learning', 'Input x₁', '-1', 'prediction'],
      ['rocket', 'Rocket landing', 'Dry mass · kg', '2000', 'rocket'],
      [
        'attention',
        'Attention',
        'Token sequence',
        'the dog chased the ball',
        'attention-matrix',
      ],
      ['traffic', 'Traffic waves', 'Cars on ring', '30', 'jam-front'],
      ['relativity', 'Time dilation', 'Speed · v/c', '0.99', 'gamma'],
    ]) {
      await page.getByRole('button', { name: new RegExp(label) }).click();
      await page.waitForFunction(
        (id) =>
          JSON.parse(
            document.querySelector('#petros-observations')!.textContent!,
          ).topic === id,
        topic,
      );
      const before = await read();
      const field = page.getByLabel(control, { exact: true });
      await field.fill(value);
      if (topic === 'attention') await field.press('Tab');
      await page.waitForFunction(
        ({ key, value }) =>
          JSON.parse(
            document.querySelector('#petros-observations')!.textContent!,
          ).params[key] == value,
        {
          key: {
            neural: 'x1',
            rocket: 'dryMass',
            attention: 'tokens',
            traffic: 'count',
            relativity: 'beta',
          }[topic]!,
          value,
        },
      );
      await page.getByRole('button', { name: 'Step +', exact: true }).click();
      await page.waitForFunction(
        (rev) =>
          JSON.parse(
            document.querySelector('#petros-observations')!.textContent!,
          ).revision > rev,
        before.revision + 1,
      );
      if (topic === 'traffic')
        await page
          .getByRole('button', { name: 'Brake a car', exact: true })
          .click();
      await page.locator(`[data-petros-id="${target}"]`).first().click();
      await page.getByTestId('teaching-pointer').waitFor();
      assert.equal(
        await page.getByTestId('teaching-pointer').getAttribute('data-target'),
        target,
      );
      const layout = await page.evaluate(() => ({
        overflow: document.documentElement.scrollWidth > innerWidth + 1,
        targets: [...document.querySelectorAll('[data-petros-id]')]
          .filter((e) => {
            const r = e.getBoundingClientRect();
            return r.width <= 0 || r.height <= 0;
          })
          .map((e) => e.getAttribute('data-petros-id')),
      }));
      assert.equal(
        layout.overflow,
        false,
        `${size.name} ${topic} page overflow`,
      );
      await page.screenshot({
        path: fileURLToPath(new URL(`${topic}-${size.name}.png`, evidence)),
        fullPage: true,
      });
      results.push({
        topic,
        size: size.name,
        before: before.observations,
        after: (await read()).observations,
        layout,
      });
    }
    const beforeRefresh = await read();
    await page.waitForTimeout(200);
    await page.reload();
    await page.locator('#petros-observations').waitFor({ state: 'attached' });
    await page.waitForFunction(
      () =>
        JSON.parse(document.querySelector('#petros-observations')!.textContent!)
          .topic === 'relativity',
    );
    assert.equal((await read()).params.beta, 0.99);
    assert.deepEqual((await read()).observations, beforeRefresh.observations);
    await page.getByRole('button', { name: 'World ↗', exact: true }).click();
    await page.locator('canvas').waitFor({ timeout: 30000 });
    const world = await read();
    assert.equal(world.params.beta, 0.99);
    await page.getByRole('button', { name: 'Classic', exact: true }).click();
    assert.deepEqual((await read()).observations, world.observations);
    await context.close();
  }
  assert.deepEqual(errors, [], 'Browser JavaScript errors');
  await writeFile(
    new URL('browser-results.json', evidence),
    JSON.stringify({ passed: true, results, errors }, null, 2),
  );
  console.log(
    'PASS: five topics × desktop/mobile, mutations, pointers, refresh and Classic/World.',
  );
} finally {
  await browser.close();
}
