import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { readFile, mkdir } from 'node:fs/promises';
import { browserExecutable } from './browser-executable';
const browser = await chromium.launch({
  executablePath: browserExecutable(),
  headless: true,
});
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  await page.route('**/stage-reference-modules/**', async (route) => {
    const file = route.request().url().split('/stage-reference-modules/')[1];
    if (file.includes('..')) return route.abort();
    await route.fulfill({
      body: await readFile(
        new URL('../node_modules/three/' + file, import.meta.url),
      ),
      contentType: 'application/javascript',
    });
  });
  let html = await readFile(
    new URL('../reference/petros-stage.html', import.meta.url),
    'utf8',
  );
  html = html
    .replace(
      'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js',
      '/stage-reference-modules/build/three.module.js',
    )
    .replace(
      'https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/',
      '/stage-reference-modules/examples/jsm/',
    );
  html = html.replace(/<link[^>]*>/g, '');
  html = html.replace(
    '<style>',
    `<style>@font-face{font-family:Fraunces;src:url('/stage/fonts/display.ttf')}@font-face{font-family:Geist;src:url('/stage/fonts/ui.ttf')}@font-face{font-family:'Geist Mono';src:url('/stage/fonts/mono.ttf')}`,
  );
  await page.route('**/stage-approved-reference.html', (route) =>
    route.fulfill({ contentType: 'text/html; charset=utf-8', body: html }),
  );
  page.on('pageerror', (e) => console.error(e));
  await page.goto('http://127.0.0.1:3022/stage-approved-reference.html#still');
  await page.waitForTimeout(4000);
  await mkdir(new URL('../../../audit-screenshots/stage/', import.meta.url), {
    recursive: true,
  });
  await page.screenshot({
    path: fileURLToPath(
      new URL(
        '../../../audit-screenshots/stage/approved-reference-1440-dpr2.png',
        import.meta.url,
      ),
    ),
  });
} finally {
  await browser.close();
}
