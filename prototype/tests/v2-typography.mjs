import { chromium } from 'playwright-core';
import { fileURLToPath } from 'node:url';
import { writeFile } from 'node:fs/promises';
process.chdir(fileURLToPath(new URL('../', import.meta.url)));
const b = await chromium.launch({
  executablePath:
    '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
  headless: true,
  args: ['--use-angle=metal'],
});
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
try {
  await p.goto('http://127.0.0.1:3021/prototype');
  await p
    .getByRole('button', { name: 'Learn AI_Module_3.pdf', exact: true })
    .click();
  const classic = await p
    .getByRole('heading', { name: /Minimax & Alpha/ })
    .evaluate((e) => getComputedStyle(e).fontFamily);
  await p
    .getByRole('button', { name: 'Enter Petros World', exact: true })
    .click();
  await p
    .getByRole('dialog', { name: 'Entering Petros World' })
    .waitFor({ state: 'detached', timeout: 30000 });
  await p.getByRole('button', { name: 'Find my module', exact: true }).click();
  await p.getByRole('button', { name: /Retrieve this book/ }).click();
  await p.waitForFunction(
    () =>
      document
        .querySelector('[data-world-phase]')
        ?.getAttribute('data-world-phase') === 'teaching',
  );
  await p.waitForTimeout(1500);
  await p.getByRole('button', { name: 'Pause', exact: true }).click();
  const result = await p.evaluate(() => {
    const main = document.querySelector('[data-world-typeface]'),
      family = getComputedStyle(main).fontFamily;
    const board = window.__PETROS_BOARD__;
    const canvas = document.createElement('canvas'),
      ctx = canvas.getContext('2d');
    ctx.font = `500 48px ${family}`;
    const branded = ctx.measureText('MAX and MIN · A learning companion').width;
    ctx.font = '500 48px sans-serif';
    return {
      uiFamily: family,
      boardFamily: board.layout.fontFamily,
      loadedFaces: [...document.fonts]
        .filter((f) => f.family.toLowerCase().includes('outfit'))
        .map((f) => ({ family: f.family, status: f.status, weight: f.weight })),
      brandedWidth: branded,
      fallbackWidth: ctx.measureText('MAX and MIN · A learning companion')
        .width,
      boardErrors: board.layout.errors,
    };
  });
  if (
    result.uiFamily !== classic ||
    result.boardFamily !== classic ||
    !result.loadedFaces.some((f) => f.status === 'loaded') ||
    result.boardErrors.length ||
    Math.abs(result.brandedWidth - result.fallbackWidth) < 1
  )
    throw Error('Font verification failed ' + JSON.stringify(result));
  await p.screenshot({ path: 'evidence/v2/typography-desktop.png' });
  await writeFile(
    'evidence/v2/typography-results.json',
    JSON.stringify({ classic, ...result, passed: true }, null, 2),
  );
} finally {
  await b.close();
}
