import { chromium } from 'playwright-core';
import { browserExecutable } from './browser-executable';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { predictions, transfers } from '../core/teaching';
import type { Simulation } from '../simulations/runtime';
const browser = await chromium.launch({
    executablePath: browserExecutable(),
    headless: true,
  }),
  errors: string[] = [],
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
      params: Simulation['params'];
      observations: { weights: string; rowSum: number; context: string };
      guide: { phase: string };
      caption: string;
    };
  const ready = () =>
    page.waitForFunction(
      () => document.querySelector('canvas')?.dataset.introComplete === 'true',
    );
  const base = process.env.PETROS_BASE_URL ?? 'http://127.0.0.1:3022';
  await page.goto(base + '/prototype?view=stage&lesson=attention');
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
    .getByRole('button', {
      name: predictions.attention.options[0],
      exact: true,
    })
    .click();
  await page.waitForFunction(
    () =>
      JSON.parse(document.querySelector('#petros-observations')!.textContent!)
        .guide.phase === 'RETEACH_OR_EXTEND',
  );
  const correction = await data();
  assert.equal(correction.params.query, 0);
  assert.equal(correction.params.causal, true);
  assert.deepEqual(
    JSON.parse(correction.observations.weights)[0],
    [1, 0, 0, 0, 0],
  );
  await page
    .getByRole('button', { name: 'Try a fresh example →', exact: true })
    .click();
  await page
    .getByRole('button', { name: transfers.attention.options[1], exact: true })
    .click();
  await page.waitForFunction(
    () =>
      JSON.parse(document.querySelector('#petros-observations')!.textContent!)
        .guide.phase === 'EXPLORE',
  );
  const transfer = await data(),
    row = JSON.parse(transfer.observations.weights)[1] as number[];
  assert.equal(transfer.params.query, 1);
  assert.equal(row.filter((w) => w > 0).length, 2);
  assert.ok(Math.abs(row.reduce((a, b) => a + b, 0) - 1) < 1e-12);
  await page
    .getByRole('complementary', { name: 'Prepared lesson and settings' })
    .getByRole('button', { name: 'What are Q, K and V?', exact: true })
    .click();
  await page.waitForFunction(() =>
    JSON.parse(
      document.querySelector('#petros-observations')!.textContent!,
    ).caption.includes('divided by √d'),
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
    .getByRole('button', { name: 'query', exact: true })
    .first()
    .click();
  await page
    .locator('[data-testid="stage-explainer"][data-chip="a-query"]')
    .waitFor();
  await page.keyboard.press('Escape');
  await page.locator('#a-swap').click();
  await page
    .getByRole('button', { name: 'Try it', exact: false })
    .first()
    .click();
  await page.waitForTimeout(250);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(1900);
  assert.equal((await data()).params.tokens, 'the cat chased the ball');
  const saved = (await data()).sim;
  await page.reload();
  await ready();
  assert.deepEqual((await data()).sim, saved);
  await page.goto(base + '/prototype?view=world');
  await page.getByTestId('petros-world').waitFor();
  await page.waitForFunction(
    () => document.querySelector('canvas')?.dataset.character === 'rigged-glb',
  );
  assert.equal((await data()).topic, 'attention');
  assert.deepEqual((await data()).sim, saved);
  assert.deepEqual(errors, []);
  assert.deepEqual(paid, []);
  await writeFile(
    new URL(
      '../../../audit-screenshots/stage-attention/teaching-results.json',
      import.meta.url,
    ),
    JSON.stringify(
      {
        at: new Date().toISOString(),
        correction,
        transfer,
        worldRestored: true,
        errors,
        paid,
      },
      null,
      2,
    ),
  );
  process.stdout.write(
    'Attention prepared teaching, transfer, glossary and recovery passed.\n',
  );
} finally {
  await browser.close();
}
