/** Original prepared traffic teaching, interruption and World recovery, without providers. */
import { chromium } from 'playwright-core';
import { browserExecutable } from './browser-executable';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { predictions, transfers } from '../core/teaching';
import { observe, type Simulation } from '../simulations/runtime';
import { trafficHeadwayComparison } from '../stage/traffic-logic';
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
      sim: Simulation;
      observations: ReturnType<typeof observe>;
      guide: { phase: string };
      caption: string;
    };
  const ready = () =>
    page.waitForFunction(
      () => document.querySelector('canvas')?.dataset.introComplete === 'true',
    );
  const base = process.env.PETROS_BASE_URL ?? 'http://127.0.0.1:3022';
  await page.goto(base + '/prototype?view=stage&lesson=traffic');
  await ready();
  await page
    .getByRole('button', { name: 'Lesson & settings', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Start learning with captions', exact: true })
    .click();
  await page.waitForFunction(() =>
    document
      .querySelector('button[aria-label="Pause road"]')
      ?.textContent?.includes('1×'),
  );
  await page.getByRole('button', { name: 'Pause road', exact: true }).click();
  const paused = await data();
  assert.equal(paused.guide.phase, 'ORIENT');
  assert.equal(paused.sim.running, false);
  await page.waitForTimeout(350);
  assert.deepEqual((await data()).sim, paused.sim);
  for (let i = 0; i < 3; i++)
    await page
      .getByRole('button', { name: 'Continue with Petros →', exact: true })
      .click();
  await page.waitForFunction(
    () =>
      JSON.parse(document.querySelector('#petros-observations')!.textContent!)
        .guide.phase === 'PREDICT',
  );
  const prediction = await data(),
    expected = trafficHeadwayComparison(prediction.sim);
  assert.equal(prediction.sim.running, false);
  await page
    .getByRole('button', { name: predictions.traffic.options[1], exact: true })
    .click();
  await page.waitForFunction(
    () =>
      JSON.parse(document.querySelector('#petros-observations')!.textContent!)
        .guide.phase === 'RETEACH_OR_EXTEND',
  );
  const correction = await data();
  assert.equal(correction.sim.params.headway, 2.4);
  assert.ok(Math.abs(correction.sim.time - 48) < 1e-8);
  assert.ok(
    Math.abs(
      +correction.observations.speedSpread -
        +observe(expected.longer).speedSpread,
    ) < 1e-10,
  );
  assert.ok(correction.caption.includes('same eight-second test'));
  await page
    .getByRole('button', { name: 'Try a fresh example →', exact: true })
    .click();
  await page
    .getByRole('button', { name: transfers.traffic.options[1], exact: true })
    .click();
  await page.waitForFunction(
    () =>
      JSON.parse(document.querySelector('#petros-observations')!.textContent!)
        .guide.phase === 'EXPLORE',
  );
  const transfer = await data();
  const panel = page.getByRole('complementary', {
    name: 'Prepared lesson and settings',
  });
  await panel
    .getByRole('button', {
      name: 'Brake one car and point to the jam front.',
      exact: true,
    })
    .click();
  await page.waitForFunction(() =>
    JSON.parse(
      document.querySelector('#petros-observations')!.textContent!,
    ).caption.includes('advanced the engine for 2 seconds'),
  );
  const prepared = await data();
  assert.ok(Math.abs(prepared.sim.time - transfer.sim.time - 2) < 1e-8);
  assert.equal(prepared.sim.running, false);
  assert.equal(prepared.sim.params.headway, transfer.sim.params.headway);
  await panel
    .getByRole('button', {
      name: 'Why does the wave move backward?',
      exact: true,
    })
    .click();
  await page.waitForFunction(() =>
    JSON.parse(
      document.querySelector('#petros-observations')!.textContent!,
    ).caption.includes('successive cars'),
  );
  await page
    .getByRole('button', { name: 'Close lesson and settings', exact: true })
    .click();
  await page.keyboard.press('Escape');
  await page
    .getByRole('button', { name: 'Read full caption', exact: true })
    .click();
  await page
    .getByTestId('stage-transcript')
    .getByRole('button', { name: 'wave', exact: true })
    .first()
    .click();
  await page
    .locator('[data-testid="stage-explainer"][data-chip="t-wave"]')
    .waitFor();
  await page.keyboard.press('Escape');
  const saved = (await data()).sim;
  await page.reload();
  await ready();
  assert.deepEqual((await data()).sim, saved);
  await page.goto(base + '/prototype?view=world');
  await page.getByTestId('petros-world').waitFor();
  await page.waitForFunction(
    () => document.querySelector('canvas')?.dataset.character === 'rigged-glb',
  );
  assert.equal((await data()).topic, 'traffic');
  assert.deepEqual((await data()).sim, saved);
  assert.deepEqual(errors, []);
  assert.deepEqual(paid, []);
  await writeFile(
    new URL(
      '../../../audit-screenshots/stage-traffic/teaching-results.json',
      import.meta.url,
    ),
    JSON.stringify(
      {
        at: new Date().toISOString(),
        paused,
        correction,
        transfer,
        prepared,
        worldRestored: true,
        errors,
        paid,
      },
      null,
      2,
    ),
  );
  process.stdout.write(
    'Traffic prepared teaching, transfer, glossary and recovery passed.\n',
  );
} finally {
  await browser.close();
}
