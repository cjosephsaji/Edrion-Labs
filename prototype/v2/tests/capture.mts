import { chromium } from 'playwright-core';
import { browserExecutable } from './browser-executable';
import { fileURLToPath } from 'node:url';
const browser = await chromium.launch({
  headless: true,
  executablePath: browserExecutable(),
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
await page.goto('http://127.0.0.1:3022/prototype');
await page.locator('#petros-observations').waitFor({ state: 'attached' });
await page.getByRole('button', { name: /Rocket landing/ }).click();
await page.getByRole('button', { name: 'World ↗', exact: true }).click();
await page.locator('canvas').waitFor();
await page.waitForTimeout(1500);
await page.screenshot({
  path: fileURLToPath(new URL('../evidence/rocket-world.png', import.meta.url)),
  fullPage: true,
});
console.log(await page.locator('[data-world-anchor="rocket"]').count());
await browser.close();
