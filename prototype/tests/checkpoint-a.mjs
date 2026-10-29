import { chromium } from 'playwright-core';
import { fileURLToPath } from 'node:url';
import { writeFile } from 'node:fs/promises';
process.chdir(fileURLToPath(new URL('../', import.meta.url)));
const browser = await chromium.launch({
  executablePath:
    '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
  headless: true,
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('http://127.0.0.1:3021/prototype');
await page
  .getByRole('heading', { name: 'What are we learning today?' })
  .waitFor();
await page.screenshot({
  path: 'evidence/checkpoint-a-home.png',
  fullPage: true,
});
await page
  .getByRole('button', { name: 'Learn AI_Module_3.pdf', exact: true })
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
await page
  .getByText('Practice feedback · An opponent responds strategically', {
    exact: false,
  })
  .waitFor();
await page.getByRole('button', { name: 'Continue', exact: true }).click();
await page.getByRole('button', { name: 'Show next step →' }).click();
await page.getByRole('button', { name: 'View source', exact: true }).click();
await page.getByRole('dialog').waitFor();
await page.getByRole('button', { name: 'Close reader' }).click();
await page.screenshot({
  path: 'evidence/checkpoint-a-lesson.png',
  fullPage: true,
});
await page.getByRole('button', { name: 'Learning shelf' }).click();
await page
  .locator('input[type=file]')
  .setInputFiles('assets/source-pdfs/AI_Module_3.pdf');
await page.getByText(/recognized by content/).waitFor({ timeout: 30000 });
await page.screenshot({
  path: 'evidence/checkpoint-a-receipt.png',
  fullPage: true,
});
await writeFile(
  'evidence/checkpoint-a-results.json',
  JSON.stringify(
    { errors, home: true, lesson: true, sourceReader: true, upload: true },
    null,
    2,
  ),
);
if (errors.length) throw Error(errors.join('\n'));
await browser.close();
