/** Original offline relativity opening, prediction, transfer, glossary and World recovery. */
import { chromium } from 'playwright-core';
import { browserExecutable } from './browser-executable';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { predictions, transfers } from '../core/teaching';
import { observe, type Simulation } from '../simulations/runtime';
const base = process.env.PETROS_BASE_URL ?? 'http://127.0.0.1:3022',
  out = new URL(
    '../../../audit-screenshots/stage-relativity/',
    import.meta.url,
  );
await mkdir(out, { recursive: true });
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
  const phase = (value: string) =>
    page.waitForFunction(
      (p) =>
        JSON.parse(document.querySelector('#petros-observations')!.textContent!)
          .guide.phase === p,
      value,
    );
  const ready = () =>
    page.waitForFunction(
      () => document.querySelector('canvas')?.dataset.introComplete === 'true',
    );
  await page.goto(base + '/prototype?view=stage&lesson=relativity');
  await ready();
  await page
    .getByRole('button', { name: 'Lesson & settings', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Start learning with captions', exact: true })
    .click();
  await phase('ORIENT');
  assert.equal((await data()).sim.time, 0);
  for (let i = 0; i < 3; i++)
    await page
      .getByRole('button', { name: 'Continue with Petros →', exact: true })
      .click();
  await phase('PREDICT');
  const demonstration = await data();
  assert.ok(Math.abs(+demonstration.observations.earthClock - 10) < 1e-8);
  assert.ok(Math.abs(+demonstration.observations.shipClock - 6) < 1e-8);
  await page
    .getByRole('button', {
      name: predictions.relativity.options[1],
      exact: true,
    })
    .click();
  await phase('RETEACH_OR_EXTEND');
  const correction = await data();
  assert.ok(Math.abs(+correction.observations.shipClock - 6) < 1e-8);
  await page
    .getByRole('button', { name: 'Try a fresh example →', exact: true })
    .click();
  await phase('TRANSFER_CHECK');
  const fresh = await data();
  assert.equal(fresh.sim.params.beta, 0.99);
  assert.ok(+fresh.observations.shipSeconds < 6);
  await page
    .getByRole('button', { name: transfers.relativity.options[1], exact: true })
    .click();
  await phase('EXPLORE');
  const transfer = await data();
  const panel = page.getByRole('complementary', {
    name: 'Prepared lesson and settings',
  });
  await page
    .getByLabel('Selected Earth interval', { exact: true })
    .evaluate((el) => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        'value',
      )!.set!.call(el, '20');
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });
  await page.waitForFunction(
    () =>
      JSON.parse(document.querySelector('#petros-observations')!.textContent!)
        .params.duration === 20,
  );
  const elapsed = (await data()).sim.time;
  await panel
    .getByRole('button', {
      name: 'At 0.99c, how much time passes?',
      exact: true,
    })
    .click();
  await page.waitForFunction(() =>
    JSON.parse(
      document.querySelector('#petros-observations')!.textContent!,
    ).caption.includes('selected 20.00 seconds'),
  );
  const prepared = await data();
  assert.equal(prepared.sim.time, elapsed);
  assert.ok(
    Math.abs(
      +prepared.observations.shipClock - +observe(prepared.sim).shipClock,
    ) < 1e-10,
  );
  assert.ok(
    +prepared.observations.shipSeconds > +prepared.observations.shipClock,
  );
  await panel
    .getByRole('button', {
      name: 'Why does the moving clock tick slower?',
      exact: true,
    })
    .click();
  await page.waitForFunction(() =>
    JSON.parse(
      document.querySelector('#petros-observations')!.textContent!,
    ).caption.includes('diagonal path'),
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
    .getByRole('button', { name: 'ship', exact: true })
    .first()
    .click();
  await page
    .locator('[data-testid="stage-explainer"][data-chip="td-ship"]')
    .waitFor();
  await page.keyboard.press('Escape');
  await page
    .getByRole('button', { name: 'Lesson & settings', exact: true })
    .click();
  const beforeFrame = await data();
  await page
    .getByLabel('Diagram coordinates', { exact: true })
    .selectOption('ship');
  await page.waitForFunction(
    () =>
      JSON.parse(document.querySelector('#petros-observations')!.textContent!)
        .params.frame === 'ship',
  );
  await panel
    .getByRole('button', { name: 'Which clock is really slower?', exact: true })
    .click();
  await page.waitForFunction(() =>
    JSON.parse(
      document.querySelector('#petros-observations')!.textContent!,
    ).caption.includes('different sets of simultaneous events'),
  );
  const frame = await data();
  assert.equal(
    frame.observations.shipClock,
    beforeFrame.observations.shipClock,
  );
  assert.equal(frame.sim.params.frame, 'ship');
  await panel
    .getByRole('button', {
      name: 'Can the ship reach the speed of light?',
      exact: true,
    })
    .click();
  await page.waitForFunction(() =>
    JSON.parse(
      document.querySelector('#petros-observations')!.textContent!,
    ).caption.includes('cannot reach or exceed c'),
  );
  await page
    .getByRole('button', { name: 'Close lesson and settings', exact: true })
    .click();
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
  assert.equal((await data()).topic, 'relativity');
  assert.deepEqual((await data()).sim, saved);
  assert.deepEqual(errors, []);
  assert.deepEqual(paid, []);
  await writeFile(
    new URL('teaching-results.json', out),
    JSON.stringify(
      {
        at: new Date().toISOString(),
        demonstration,
        correction,
        transfer,
        prepared,
        frame,
        worldRestored: true,
        errors,
        paid,
      },
      null,
      2,
    ),
  );
  process.stdout.write(
    'Time dilation prepared teaching, transfer, glossary and World recovery passed.\n',
  );
} finally {
  await browser.close();
}
