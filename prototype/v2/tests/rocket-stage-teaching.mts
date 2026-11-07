import { chromium } from 'playwright-core';
import { browserExecutable } from './browser-executable';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { predictions, transfers } from '../core/teaching';
const browser = await chromium.launch({
  executablePath: browserExecutable(),
  headless: true,
});
const errors: string[] = [],
  paid: string[] = [];
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  });
  await context.addInitScript('window.__name=(value)=>value');
  const page = await context.newPage();
  page.setDefaultTimeout(45000);
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('request', (r) => {
    if (/\/(teacher|teach|voice|speech)(\/|$|\?)/.test(r.url()))
      paid.push(r.url());
  });
  const data = async () =>
    JSON.parse((await page.locator('#petros-observations').textContent())!) as {
      topic: string;
      params: { dryMass: number; fuel: number; throttle: number };
      observations: {
        status: string;
        altitude: number;
        velocity: number;
        mass: number;
        acceleration: number;
      };
      guide: { phase: string; openingIndex: number };
      caption: string;
    };
  const ready = () =>
    page.waitForFunction(
      () => document.querySelector('canvas')?.dataset.introComplete === 'true',
    );
  await page.goto(
    (process.env.PETROS_BASE_URL ?? 'http://127.0.0.1:3022') +
      '/prototype?view=stage&lesson=rocket',
  );
  await ready();
  await page
    .getByRole('button', { name: 'Lesson & settings', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Start learning with captions', exact: true })
    .click();
  for (let i = 0; i < 3; i++)
    await page
      .getByRole('button', { name: 'Continue with Petros →', exact: true })
      .click();
  await page
    .getByRole('button', { name: predictions.rocket.options[0], exact: true })
    .click();
  await page.waitForFunction(
    () =>
      JSON.parse(document.querySelector('#petros-observations')!.textContent!)
        .guide.phase === 'RETEACH_OR_EXTEND',
  );
  const demonstration = await data();
  assert.equal(demonstration.observations.status, 'landed');
  assert.ok(Math.abs(demonstration.observations.velocity) < 2);
  assert.match(demonstration.caption, /timed burn/i);
  await page
    .getByRole('button', { name: 'Try a fresh example →', exact: true })
    .click();
  await page
    .getByRole('button', { name: transfers.rocket.options[1], exact: true })
    .click();
  await page.waitForFunction(
    () =>
      JSON.parse(document.querySelector('#petros-observations')!.textContent!)
        .guide.phase === 'EXPLORE',
  );
  const transfer = await data();
  assert.equal(transfer.observations.mass, 2900);
  assert.equal(transfer.params.dryMass, 2450);
  assert.ok(transfer.observations.acceleration < 0);
  await page
    .getByRole('button', { name: 'Close lesson and settings', exact: true })
    .click();
  await page.keyboard.press('Escape');
  await page
    .getByRole('button', { name: 'Read full caption', exact: true })
    .click();
  await page
    .getByTestId('stage-transcript')
    .getByRole('button', { name: 'mass', exact: false })
    .first()
    .click();
  await page
    .locator('[data-testid="stage-explainer"][data-chip="r-mass"]')
    .waitFor();
  assert.ok(
    (await data()).caption.includes('2,900') ||
      (await data()).caption.includes('2900'),
  );
  await page.keyboard.press('Escape');
  // Replay cancellation preserves the last committed engine state; no delayed restoration.
  await page.locator('#r-landing').click();
  await page
    .getByRole('button', { name: 'Try it', exact: false })
    .first()
    .click();
  await page.waitForTimeout(1400);
  await page.keyboard.press('Escape');
  const frozen = (await data()).observations;
  await page.waitForTimeout(1700);
  assert.deepEqual((await data()).observations, frozen);
  await page.reload();
  await ready();
  assert.deepEqual((await data()).observations, frozen);
  // World remains independently reachable with the same stored Rocket state.
  await page.goto(
    (process.env.PETROS_BASE_URL ?? 'http://127.0.0.1:3022') +
      '/prototype?view=world',
  );
  await page.getByTestId('petros-world').waitFor();
  await page.waitForFunction(
    () => document.querySelector('canvas')?.dataset.character === 'rigged-glb',
  );
  assert.equal((await data()).topic, 'rocket');
  assert.deepEqual((await data()).observations, frozen);
  assert.deepEqual(errors, []);
  assert.deepEqual(paid, []);
  await writeFile(
    new URL(
      '../../../audit-screenshots/stage-rocket/teaching-results.json',
      import.meta.url,
    ),
    JSON.stringify(
      {
        at: new Date().toISOString(),
        demonstration,
        transfer,
        cancelledReplay: frozen,
        worldRestored: true,
        errors,
        paid,
      },
      null,
      2,
    ),
  );
  process.stdout.write(
    'Rocket prepared teaching, transfer, glossary and cancellation passed.\n',
  );
} finally {
  await browser.close();
}
