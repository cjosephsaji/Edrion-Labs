import { chromium } from 'playwright-core';
import { browserExecutable } from './browser-executable';
import { writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const browser = await chromium.launch({
  executablePath: browserExecutable(),
  headless: true,
});
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  await page.goto('http://127.0.0.1:3022/prototype');
  await page.locator('#petros-observations').waitFor({ state: 'attached' });
  await page.getByRole('button', { name: /Rocket landing/ }).click();
  await page.getByRole('button', { name: 'World ↗', exact: true }).click();
  await page
    .locator('[data-world-anchor="rocket"]')
    .waitFor({ state: 'attached' });
  await page
    .getByRole('button', { name: 'Point to rocket', exact: true })
    .click();
  await page.getByTestId('teaching-pointer').waitFor();
  await page.waitForFunction(() => {
    const target = document
        .querySelector('[data-world-anchor="rocket"]')!
        .getBoundingClientRect(),
      pointer = document
        .querySelector('[data-testid="teaching-pointer"]')!
        .getBoundingClientRect();
    return (
      Math.abs(pointer.x - Math.min(innerWidth - 34, target.right - 4)) < 2 &&
      Math.abs(pointer.y - Math.min(innerHeight - 40, target.bottom - 2)) < 2
    );
  });
  const before = await page
    .locator('[data-world-anchor="rocket"]')
    .boundingBox();
  await page.getByRole('button', { name: /Run experiment/ }).click();
  await page.waitForFunction(
    () =>
      JSON.parse(document.querySelector('#petros-observations')!.textContent!)
        .observations.flightTime > 1,
  );
  await page.getByRole('button', { name: /Pause/ }).click();
  const state = JSON.parse(
    (await page.locator('#petros-observations').textContent())!,
  );
  assert.ok(state.observations.altitude < 120);
  await page.waitForFunction(() => {
    const a = document
        .querySelector('[data-world-anchor="rocket"]')!
        .getBoundingClientRect(),
      p = document
        .querySelector('[data-testid="teaching-pointer"]')!
        .getBoundingClientRect();
    return Math.abs(p.x - Math.min(innerWidth - 34, a.right - 4)) < 2;
  });
  await writeFile(
    new URL('../evidence/world-pointer.json', import.meta.url),
    JSON.stringify(
      {
        passed: true,
        projection: 'Three.js Box3 corners projected by the active camera',
        before,
        after: await page.locator('[data-world-anchor="rocket"]').boundingBox(),
        observations: state.observations,
      },
      null,
      2,
    ),
  );
  console.log(
    'PASS camera-projected target and pointer remain aligned as the actual rocket descends.',
  );
} finally {
  await browser.close();
}
