import { chromium } from 'playwright-core';
import { browserExecutable } from './browser-executable';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const out = new URL('../evidence/world-rebuild/after/', import.meta.url);
await mkdir(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: browserExecutable(),
  headless: true,
});
const errors: string[] = [];
try {
  const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 2,
    }),
    page = await context.newPage();
  page.on('pageerror', (e) => {
    errors.push(e.message);
    console.log('ERROR', e.message.slice(0, 700));
  });
  page.on('console', (m) => {
    if (m.type() === 'error') {
      errors.push(m.text());
      console.log('CONSOLE', m.text().slice(0, 700));
    }
  });
  await page.goto('http://127.0.0.1:3022/prototype');
  await page.waitForTimeout(18000);
  await page.screenshot({
    path: fileURLToPath(new URL('opening-1440-dpr2.png', out)),
    fullPage: true,
  });
  console.log((await page.locator('body').innerText()).slice(0, 3000));
  await writeFile(
    new URL('../first-render.json', out),
    JSON.stringify(
      {
        errors,
        canvas: await page.locator('canvas').evaluateAll((cs) =>
          cs.map((c) => ({
            width: c.width,
            height: c.height,
            css: [c.clientWidth, c.clientHeight],
            data: c.dataset,
          })),
        ),
      },
      null,
      2,
    ),
  );
  await context.close();
} finally {
  await browser.close();
}
