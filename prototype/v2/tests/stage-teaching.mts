import { chromium } from 'playwright-core';
import { browserExecutable } from './browser-executable';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
const browser = await chromium.launch({
  executablePath: browserExecutable(),
  headless: true,
});
const errors: string[] = [],
  paid: string[] = [];
try {
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  });
  const page = await ctx.newPage();
  page.setDefaultTimeout(45000);
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('request', (r) => {
    if (/\/(speech|teacher|voice)(\/|$|\?)/.test(r.url())) paid.push(r.url());
  });
  const data = async () =>
    JSON.parse((await page.locator('#petros-observations').textContent())!) as {
      params: { weight: number; x1: number };
      guide: { phase: string; openingIndex: number };
      observations: { prediction: number; loss: number };
    };
  await page.goto('http://127.0.0.1:3022/prototype?view=stage');
  await page.waitForFunction(
    () => document.querySelector('canvas')?.dataset.introComplete === 'true',
  );
  await page
    .getByRole('button', { name: 'Lesson & settings', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Start learning with captions', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Continue with Petros →', exact: true })
    .click();
  await page.waitForFunction(
    () =>
      document
        .querySelector('[data-testid="petros-stage"]')
        ?.getAttribute('data-focus') === 'input-0',
  );
  await page
    .getByRole('button', { name: 'Continue with Petros →', exact: true })
    .click();
  await page.waitForFunction(
    () =>
      JSON.parse(document.querySelector('#petros-observations')!.textContent!)
        .params.weight === 1.1,
  );
  const demonstration = await data();
  await page
    .getByRole('button', { name: 'Continue with Petros →', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Farther from 4', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Try a fresh example →', exact: true })
    .click();
  await page.getByRole('button', { name: 'Farther away', exact: true }).click();
  const transfer = await data();
  assert.equal(transfer.params.x1, -2);
  assert.ok(Math.abs(transfer.params.weight - 0.7) < 1e-9);
  assert.ok(Math.abs(transfer.observations.prediction + 1.4) < 1e-9);
  assert.equal(transfer.guide.phase, 'EXPLORE');
  await page
    .getByRole('button', { name: 'Close lesson and settings', exact: true })
    .click();
  await page.keyboard.press('Escape');
  await page.locator('#q-weight').click();
  await page
    .getByRole('button', { name: 'Try it', exact: false })
    .first()
    .click();
  await page.waitForFunction(
    () =>
      JSON.parse(document.querySelector('#petros-observations')!.textContent!)
        .params.weight === 0,
  );
  await page.waitForFunction(
    () =>
      JSON.parse(document.querySelector('#petros-observations')!.textContent!)
        .params.weight === -2,
  );
  assert.equal((await data()).observations.loss, 0);
  // Cancelling a pending demo must prevent its delayed weight change.
  await page
    .getByRole('button', { name: 'Try it', exact: false })
    .first()
    .click();
  await page.waitForTimeout(300);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(1800);
  assert.equal((await data()).params.weight, 0);
  await page.reload();
  await page.waitForFunction(
    () => document.querySelector('canvas')?.dataset.introComplete === 'true',
  );
  assert.equal((await data()).params.x1, -2);
  assert.equal((await data()).params.weight, 0);
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  await page.waitForFunction(
    () =>
      JSON.parse(document.querySelector('#petros-observations')!.textContent!)
        .params.weight === 0.5,
  );
  await page.locator('#q-input-number').click();
  await page
    .getByRole('button', { name: 'Try it', exact: false })
    .first()
    .click();
  await page.waitForTimeout(350);
  const counting = await page
    .locator('[data-stage-label="input-0"] b')
    .textContent();
  assert.notEqual(counting, '2.00 h');
  assert.equal((await data()).params.x1, 2);
  await page.waitForTimeout(1700);
  assert.equal(
    await page.locator('[data-stage-label="input-0"] b').textContent(),
    '2.00 h',
  );
  await page.locator('#q-loss').click();
  await page
    .getByRole('button', { name: 'Try it', exact: false })
    .first()
    .click();
  assert.equal(
    await page.evaluate(() => document.activeElement?.id),
    'stage-weight',
  );
  await page.locator('#stage-weight').press('ArrowRight');
  await page.waitForTimeout(250);
  assert.ok((await data()).params.weight > 0.5);
  await page.keyboard.press('Escape');
  await page
    .getByTestId('stage-caption')
    .getByRole('button', { name: 'prediction', exact: false })
    .first()
    .click();
  await page.getByTestId('stage-explainer').waitFor();
  const saved = await data();
  await page.goto('http://127.0.0.1:3022/prototype?view=world');
  await page.getByTestId('petros-world').waitFor();
  await page.waitForFunction(
    () => document.querySelector('canvas')?.dataset.character === 'rigged-glb',
  );
  assert.equal((await data()).params.weight, saved.params.weight);
  await page
    .getByRole('button', { name: 'Explore the islands', exact: true })
    .click();
  await page
    .locator('nav[aria-label="Interactive topics"]')
    .getByRole('button', { name: /Rocket landing/ })
    .click();
  await page.waitForFunction(
    () =>
      JSON.parse(document.querySelector('#petros-observations')!.textContent!)
        .topic === 'rocket',
  );
  await page.goto('http://127.0.0.1:3022/prototype?view=stage');
  await page.waitForFunction(
    () => document.querySelector('canvas')?.dataset.introComplete === 'true',
  );
  await page.getByTestId('petros-stage').waitFor();
  assert.equal((await data()).params.weight, saved.params.weight);
  assert.deepEqual(errors, []);
  assert.deepEqual(paid, []);
  await writeFile(
    new URL(
      '../../../audit-screenshots/stage/teaching-results.json',
      import.meta.url,
    ),
    JSON.stringify(
      {
        at: new Date().toISOString(),
        demonstration,
        transfer,
        saved,
        errors,
        paid,
        checks: [
          'guided camera focus',
          'real demonstration .5→1.1',
          'wrong-answer correction',
          'negative transfer',
          'negative matching-weight demo',
          'demo cancellation',
          'reload recovery',
          'token counting without changing input',
          'loss Try it slider focus',
          'glossary inspection',
          'World route with same session',
          'Stage route selects Neural after visiting Rocket without losing its saved model',
        ],
      },
      null,
      2,
    ),
  );
  process.stdout.write('Stage prepared teaching and recovery passed.\n');
} finally {
  await browser.close();
}
