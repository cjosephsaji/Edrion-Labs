import { chromium } from 'playwright-core';
const browser = await chromium.launch({
  executablePath:
    '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
  headless: true,
  args: ['--use-angle=metal'],
});
const page = await browser.newPage({
  viewport: { width: 1440, height: 900 },
  reducedMotion: 'reduce',
});
page.on('pageerror', (e) => console.log('PAGE ERROR', e.message));
await page.goto('http://127.0.0.1:3021/prototype');
await page
  .getByRole('button', { name: 'Learn AI_Module_3.pdf', exact: true })
  .click();
await page.getByRole('button', { name: 'Start lesson', exact: true }).click();
await page.getByRole('button', { name: 'Show me', exact: true }).click();
await page.getByRole('button', { name: 'Let me try', exact: true }).click();
await page
  .getByRole('button', { name: 'I’m ready to answer', exact: true })
  .click();
await page
  .getByRole('group', { name: 'Practice choices', exact: true })
  .getByRole('button', { name: 'Opponent responds strategically', exact: true })
  .click();
await page
  .getByRole('button', { name: 'Check practice answer', exact: true })
  .click();
await page.getByRole('button', { name: 'Continue', exact: true }).click();
await page.getByRole('button', { name: 'Show me', exact: true }).click();
await page.screenshot({
  path: 'evidence/teaching-correction/smoke-classic.png',
  fullPage: true,
});
await page
  .getByRole('button', { name: 'Enter Petros World', exact: true })
  .click();
await page
  .getByRole('dialog', { name: 'Entering Petros World' })
  .waitFor({ state: 'detached', timeout: 60000 });
await page.waitForTimeout(1500);
await page.screenshot({ path: 'evidence/teaching-correction/smoke-world.png' });
console.log(
  await page.locator('[aria-label="Student-paced teaching"]').innerText(),
);
console.log(
  await page.locator('[aria-label="Student-paced teaching"]').boundingBox(),
);
await browser.close();
