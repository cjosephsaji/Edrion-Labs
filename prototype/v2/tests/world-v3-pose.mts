import { chromium } from 'playwright-core';
import { browserExecutable } from './browser-executable';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const out = new URL('../evidence/world-rebuild/pose-fix/', import.meta.url);
await mkdir(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: browserExecutable(),
  headless: true,
});
const samples: { state: string; tilt: number }[] = [];
const errors: string[] = [];
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  });
  page.setDefaultTimeout(45000);
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('http://127.0.0.1:3022/prototype');
  await page
    .getByRole('button', { name: 'Explore the islands', exact: true })
    .click();
  await page
    .locator('nav[aria-label="Interactive topics"]')
    .getByRole('button', { name: /Rocket landing/ })
    .click();
  await page.waitForFunction(
    () =>
      document.querySelector('canvas')?.dataset.destination === 'rocket' &&
      document.querySelector('canvas')?.dataset.travelling === 'false',
  );
  await page
    .getByRole('button', { name: 'Start learning with captions', exact: true })
    .click();
  const sample = async (seconds: number) => {
    const end = Date.now() + seconds * 1000;
    while (Date.now() < end) {
      const d = await page
        .locator('canvas')
        .evaluate((c) => ({
          state: c.dataset.petrosState!,
          tilt: Number(c.dataset.petrosHeadTilt),
        }));
      assert.ok(
        Number.isFinite(d.tilt) && d.tilt < 0.3,
        `Head left its intended pose: ${JSON.stringify(d)}`,
      );
      samples.push(d);
      await page.waitForTimeout(200);
    }
  };
  // Holding the cursor still used to add rotation each frame until the face flipped.
  await page.mouse.move(1350, 190);
  await sample(15);
  await page
    .getByRole('button', { name: 'Continue with Petros →', exact: true })
    .click();
  await page.mouse.move(200, 700);
  await sample(25);
  assert.ok(samples.some((s) => s.state === 'Idle'));
  assert.ok(samples.some((s) => s.state === 'Point'));
  assert.equal(
    await page.locator('[data-testid="teaching-pointer"]').count(),
    0,
  );
  assert.equal(
    await page.locator('div[aria-hidden="true"] > svg').count(),
    0,
    'Legacy screen-space world halo returned',
  );
  await page.screenshot({
    path: fileURLToPath(new URL('rocket-fixed-dpr2.png', out)),
    fullPage: true,
  });
  await page
    .getByRole('button', {
      name: 'World settings and information',
      exact: true,
    })
    .click();
  await page.getByLabel('World quality', { exact: true }).selectOption('low');
  await page.waitForFunction(
    () =>
      document.querySelector('canvas')?.dataset.quality === 'low' &&
      document.querySelector('canvas')?.dataset.petrosHeadTilt !== undefined,
  );
  await sample(3);
  await page
    .getByLabel('World quality', { exact: true })
    .selectOption('balanced');
  await sample(3);
  assert.deepEqual(errors, []);
  await writeFile(
    new URL('results.json', out),
    JSON.stringify(
      {
        passed: true,
        heldCursorSeconds: 40,
        qualitySwitches: ['low', 'balanced'],
        samples: samples.length,
        maximumHeadTiltRadians: Math.max(...samples.map((s) => s.tilt)),
        oversizedWorldHighlight: false,
        errors,
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
