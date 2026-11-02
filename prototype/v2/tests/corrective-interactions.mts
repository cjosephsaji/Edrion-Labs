import { chromium } from 'playwright-core';
import { browserExecutable } from './browser-executable';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const browser = await chromium.launch({
  executablePath: browserExecutable(),
  headless: true,
});
const results: any[] = [];
try {
  const context = await browser.newContext({
      viewport: { width: 1366, height: 768 },
    }),
    page = await context.newPage();
  await page.goto('http://127.0.0.1:3022/prototype');
  await page.locator('#petros-observations').waitFor({ state: 'attached' });
  for (const label of [
    'Neural learning',
    'Rocket landing',
    'Attention',
    'Traffic waves',
    'Time dilation',
  ]) {
    await page.getByRole('button', { name: new RegExp(label) }).click();
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
  }
  const before = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('petros.v2.session')!),
  );
  await page.waitForTimeout(31000);
  const after = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('petros.v2.session')!),
  );
  for (const id of ['neural', 'rocket', 'attention', 'traffic', 'relativity']) {
    assert.equal(after.topics[id].guide.phase, 'PREDICT');
    assert.equal(after.topics[id].evidence.length, 0);
  }
  results.push({ silenceSeconds: 31, allFiveWaitForStudent: true });
  await page
    .getByRole('button', { name: 'Explore World ↗', exact: true })
    .click();
  for (const name of [
    'Neural Learning Lab',
    'Rocket Launch Bay',
    'Language Studio',
    'Traffic Control Table',
    'Relativity Observatory',
  ]) {
    await page
      .getByRole('button', { name: `Visit ${name}`, exact: true })
      .click();
    await page.waitForFunction(
      () => document.querySelector('canvas')?.dataset.travelling === 'false',
    );
    await page
      .getByRole('button', { name: 'Move closer', exact: true })
      .click();
    await page.waitForTimeout(600);
    const aligned = await page.evaluate(() => {
      const pointer = document.querySelector(
          '[data-testid="teaching-pointer"]',
        )!,
        id = pointer?.getAttribute('data-target');
      const target = document.querySelector(`[data-world-anchor="${id}"]`);
      if (!pointer || !target) return { ok: false, id };
      const p = pointer.getBoundingClientRect(),
        t = target.getBoundingClientRect();
      return {
        ok:
          Math.abs(p.x - Math.min(innerWidth - 34, t.right - 4)) < 2 &&
          Math.abs(p.y - Math.min(innerHeight - 40, t.bottom - 2)) < 2,
        id,
        target: { x: t.x, y: t.y, width: t.width, height: t.height },
      };
    });
    assert.ok(aligned.ok, JSON.stringify(aligned));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(350);
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    );
    const prompt = await page
      .locator('[aria-label="Your prediction"]')
      .boundingBox();
    assert.ok(
      prompt && prompt.y + prompt.height < 844,
      'World learner action must be above the fold',
    );
    await page.screenshot({
      path: fileURLToPath(
        new URL(
          `../evidence/corrective/${name.replaceAll(' ', '-')}-mobile.png`,
          import.meta.url,
        ),
      ),
      fullPage: true,
    });
    await page.setViewportSize({ width: 1366, height: 768 });
    results.push({
      station: name,
      semanticPointer: aligned,
      mobilePromptAboveFold: true,
    });
    console.log('PASS world pointer and mobile layout', name);
  }
  await page.getByRole('button', { name: 'Focus', exact: true }).click();
  await page.getByRole('button', { name: /Attention/ }).click();
  await page
    .getByText('Experiment controls & live measurements', { exact: false })
    .click();
  await page.getByText('Show the maths & evidence', { exact: true }).click();
  await page.getByRole('table').waitFor();
  const rows = await page.getByRole('row').count();
  assert.equal(rows, 6);
  results.push({ attentionMathsComputedRows: rows - 1 });
  await writeFile(
    new URL('../evidence/corrective/interactions.json', import.meta.url),
    JSON.stringify(results, null, 2),
  );
  await context.close();
} catch (e) {
  await writeFile(
    new URL(
      '../evidence/corrective/interactions-failure.json',
      import.meta.url,
    ),
    JSON.stringify({ error: String(e), results }, null, 2),
  );
  throw e;
} finally {
  await browser.close();
}
