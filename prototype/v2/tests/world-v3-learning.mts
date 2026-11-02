import { chromium } from 'playwright-core';
import { browserExecutable } from './browser-executable';
import { writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const browser = await chromium.launch({
  executablePath: browserExecutable(),
  headless: true,
});
const results: any[] = [],
  errors: string[] = [];
try {
  const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 2,
    }),
    page = await context.newPage();
  page.setDefaultTimeout(45000);
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('http://127.0.0.1:3022/prototype');
  await page
    .getByRole('button', { name: 'Explore the islands', exact: true })
    .click();
  const read = async () =>
    JSON.parse((await page.locator('#petros-observations').textContent())!);
  for (const [i, label] of [
    'Neural learning',
    'Rocket landing',
    'Attention',
    'Traffic waves',
    'Time dilation',
  ].entries()) {
    const id = ['neural', 'rocket', 'attention', 'traffic', 'relativity'][i],
      correct = [0, 1, 1, 0, 0][i];
    await page
      .locator('nav[aria-label="Interactive topics"]')
      .getByRole('button', { name: new RegExp(label) })
      .click();
    await page.waitForFunction((id) => {
      const c = document.querySelector('canvas');
      return c?.dataset.destination === id && c.dataset.travelling === 'false';
    }, id);
    await page
      .getByRole('button', {
        name: 'Start learning with captions',
        exact: true,
      })
      .click();
    for (let j = 0; j < 3; j++)
      await page
        .getByRole('button', { name: 'Continue with Petros →', exact: true })
        .click();
    let d = await read();
    assert.equal(d.guide.phase, 'PREDICT');
    assert.ok(d.scene.focus);
    assert.ok(d.scene.marks.length);
    await page
      .locator('[aria-label="Your prediction"] button')
      .nth(1 - correct)
      .click();
    d = await read();
    assert.equal(d.evidence.at(-1).assessment, 'wrong');
    assert.equal(d.guide.representation, 'compare');
    assert.ok(d.scene.objects.length >= 2);
    await page
      .getByRole('button', { name: 'Try a fresh example →', exact: true })
      .click();
    assert.equal((await read()).guide.phase, 'TRANSFER_CHECK');
    await page.locator('[aria-label="Your prediction"] button').nth(0).click();
    assert.equal((await read()).guide.phase, 'EXPLORE');
    await page
      .getByRole('button', { name: 'Restart lesson', exact: true })
      .click();
    for (let j = 0; j < 3; j++)
      await page
        .getByRole('button', { name: 'Continue with Petros →', exact: true })
        .click();
    await page
      .locator('[aria-label="Your prediction"] button')
      .nth(correct)
      .click();
    assert.equal((await read()).evidence.at(-1).assessment, 'correct');
    await page
      .getByRole('button', { name: 'Try a fresh example →', exact: true })
      .click();
    const before = await read();
    await page.getByLabel('Experiment controls', { exact: true }).click();
    const after = await read();
    for (const key of ['params', 'history', 'sim', 'activeQuestion'])
      assert.deepEqual(after[key], before[key]);
    await page.reload();
    await page
      .getByRole('button', { name: 'Explore the islands', exact: true })
      .click();
    const restored = await read();
    assert.deepEqual(restored.params, before.params);
    assert.equal(restored.guide.phase, 'TRANSFER_CHECK');
    results.push({
      topic: id,
      wrong: true,
      correct: true,
      transfer: true,
      controlsPreserveModel: true,
      reload: true,
    });
    console.log('LEARNING', id);
  }
  assert.deepEqual(errors, []);
  await writeFile(
    new URL('../evidence/world-rebuild/learning-results.json', import.meta.url),
    JSON.stringify({ results, errors }, null, 2),
  );
  await context.close();
} catch (e) {
  await writeFile(
    new URL('../evidence/world-rebuild/learning-failure.json', import.meta.url),
    JSON.stringify({ error: String(e), results, errors }, null, 2),
  );
  throw e;
} finally {
  await browser.close();
}
