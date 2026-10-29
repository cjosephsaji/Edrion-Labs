import { chromium } from 'playwright-core';
import { fileURLToPath } from 'node:url';
import { writeFile } from 'node:fs/promises';
process.chdir(fileURLToPath(new URL('../', import.meta.url)));
const browser = await chromium.launch({
  executablePath:
    '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
  headless: true,
  args: ['--enable-webgl', '--use-angle=metal'],
});
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
  });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('http://127.0.0.1:3021/prototype');
  await page.getByRole('button', { name: 'Petros World', exact: true }).click();
  await page.locator('canvas').waitFor();
  await page.waitForFunction(
    () => Boolean(window.__PETROS_WORLD_METRICS__?.picks?.desk),
    { timeout: 30000 },
  );
  await page.screenshot({ path: 'evidence/world-wide.png', fullPage: true });
  for (const name of ['Desk', 'Bookshelf', 'Whiteboard', 'Experiment']) {
    await page
      .getByRole('navigation', { name: 'Room stations' })
      .getByRole('button', { name: new RegExp(name) })
      .click();
    await page.waitForTimeout(900);
  }
  await page
    .getByRole('navigation', { name: 'Room stations' })
    .getByRole('button', { name: /Bookshelf/ })
    .click();
  await page.getByRole('button', { name: 'AI · M3', exact: true }).click();
  await page
    .getByRole('button', { name: 'Open this module', exact: false })
    .click();
  await page.getByRole('button', { name: 'Start lesson', exact: true }).click();
  await page
    .getByRole('button', {
      name: 'A Opponent responds strategically',
      exact: true,
    })
    .click();
  await page
    .getByRole('button', { name: 'Check practice answer', exact: true })
    .click();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.screenshot({
    path: 'evidence/world-teaching.png',
    fullPage: true,
  });
  await page
    .getByRole('button', { name: 'Ask Petros A question', exact: false })
    .click();
  await page
    .getByRole('textbox', { name: 'Ask Petros a question' })
    .fill('A draft that must survive the mode switch');
  await page.getByRole('button', { name: 'Classic', exact: true }).click();
  if (
    (await page
      .getByRole('textbox', { name: 'Ask Petros a question' })
      .inputValue()) !== 'A draft that must survive the mode switch'
  )
    throw Error('Draft lost');
  await page.getByRole('button', { name: 'Petros World', exact: true }).click();
  if (
    (await page
      .getByRole('textbox', { name: 'Ask Petros a question' })
      .inputValue()) !== 'A draft that must survive the mode switch'
  )
    throw Error('Draft lost');
  await page.getByRole('button', { name: 'Try it', exact: true }).click();
  await page.waitForTimeout(900);
  await page.screenshot({
    path: 'evidence/world-interaction.png',
    fullPage: true,
  });
  const metrics = await page.evaluate(() => window.__PETROS_WORLD_METRICS__);
  await writeFile(
    'evidence/checkpoint-c-results.json',
    JSON.stringify(
      { errors, metrics, modeDraftPreserved: true, stations: true },
      null,
      2,
    ),
  );
  if (errors.length) throw Error(errors.join('\n'));
} finally {
  await browser.close();
}
