import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { browserExecutable } from './browser-executable';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const browser = await chromium.launch({
    executablePath: browserExecutable(),
    headless: true,
  }),
  out = new URL('../evidence/world-rebuild/', import.meta.url);
await mkdir(new URL('video/', out), { recursive: true });
const results: any[] = [];
try {
  const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 2,
      recordVideo: {
        dir: fileURLToPath(new URL('video/', out)),
        size: { width: 1440, height: 900 },
      },
    }),
    page = await context.newPage();
  page.setDefaultTimeout(45000);
  await page.goto('http://127.0.0.1:3022/prototype');
  await page.getByRole('button', { name: /^Start the tour/ }).click();
  const start = Date.now();
  for (const [i, id] of [
    'neural',
    'rocket',
    'attention',
    'traffic',
    'relativity',
  ].entries()) {
    const target = start + i * 24000 + 21400;
    await page.waitForTimeout(Math.max(0, target - Date.now()));
    const d = JSON.parse(
      (await page.locator('#petros-observations').textContent())!,
    );
    assert.equal(d.topic, id);
    assert.equal(d.guide.phase, 'PREDICT');
    assert.equal(
      await page.locator('canvas').getAttribute('data-destination'),
      id,
    );
    assert.equal(
      await page.locator('canvas').getAttribute('data-travelling'),
      'false',
    );
    results.push({
      topic: id,
      elapsedMs: Date.now() - start,
      phase: d.guide.phase,
      hash: d.stateHash,
    });
    console.log('TOUR', id);
  }
  await page.waitForTimeout(Math.max(0, start + 120500 - Date.now()));
  assert.equal(
    await page
      .getByRole('button', { name: 'Ⅱ Stop the tour', exact: true })
      .count(),
    0,
  );
  await page
    .getByRole('button', { name: 'Start the tour ↗', exact: true })
    .click();
  await page.waitForTimeout(1500);
  await page
    .getByRole('button', { name: 'Ⅱ Stop the tour', exact: true })
    .click();
  await page.waitForTimeout(300);
  assert.equal(
    await page.locator('canvas').getAttribute('data-travelling'),
    'false',
  );
  const stopped = await page.locator('canvas').getAttribute('data-destination');
  await page.waitForTimeout(25000);
  assert.equal(
    await page.locator('canvas').getAttribute('data-destination'),
    stopped,
  );
  await page
    .getByRole('button', { name: 'Start the tour ↗', exact: true })
    .click();
  await page.waitForTimeout(200);
  await page
    .locator('nav[aria-label="Interactive topics"]')
    .getByRole('button', { name: /Time dilation/ })
    .click();
  assert.equal(
    await page
      .getByRole('button', { name: 'Ⅱ Stop the tour', exact: true })
      .count(),
    0,
  );
  await page.waitForFunction(
    () =>
      document.querySelector('canvas')?.dataset.destination === 'relativity' &&
      document.querySelector('canvas')?.dataset.travelling === 'false',
  );
  const anchor = page.locator('[data-world-anchor="ship-clock"]');
  const before = await anchor.boundingBox();
  await page.locator('[data-testid="petros-world"]').focus();
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(700);
  const after = await anchor.boundingBox();
  assert.notEqual(before?.x, after?.x);
  const video = page.video()!;
  await context.close();
  await rename(
    await video.path(),
    new URL('video/tour-and-controls.webm', out),
  );
  await writeFile(
    new URL('tour-results.json', out),
    JSON.stringify(
      {
        durationMs: 120000,
        results,
        stopCancelsTimers: true,
        manualNavigationStopsTour: true,
        keyboardOrbit: true,
      },
      null,
      2,
    ),
  );
  const reduced = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    reducedMotion: 'reduce',
  });
  const p = await reduced.newPage();
  await p.goto('http://127.0.0.1:3022/prototype');
  await p
    .getByRole('button', { name: 'Explore the islands', exact: true })
    .click();
  const t = Date.now();
  await p
    .locator('nav[aria-label="Interactive topics"]')
    .getByRole('button', { name: /Traffic waves/ })
    .click();
  await p.waitForFunction(
    () =>
      document.querySelector('canvas')?.dataset.destination === 'traffic' &&
      document.querySelector('canvas')?.dataset.travelling === 'false',
  );
  assert.ok(Date.now() - t < 3000);
  await writeFile(
    new URL('reduced-motion.json', out),
    JSON.stringify(
      { navigationMs: Date.now() - t, viewport: [390, 844], passed: true },
      null,
      2,
    ),
  );
  await reduced.close();
} catch (e) {
  await writeFile(
    new URL('tour-failure.json', out),
    JSON.stringify({ error: String(e), results }, null, 2),
  );
  throw e;
} finally {
  await browser.close();
}
