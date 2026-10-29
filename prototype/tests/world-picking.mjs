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
try {
  const p = await b.newPage({ viewport: { width: 1366, height: 768 } });
  await p.goto('http://127.0.0.1:3021/prototype');
  await p.getByRole('button', { name: 'Petros World', exact: true }).click();
  await p.waitForFunction(() =>
    Boolean(window.__PETROS_WORLD_METRICS__?.picks),
  );
  await p.waitForTimeout(300);
  const picks = [];
  for (const station of ['desk', 'bookshelf', 'board', 'experiment']) {
    await p.getByRole('button', { name: 'Room overview', exact: true }).click();
    await p.waitForTimeout(900);
    const pick = await p.evaluate(
      (s) => window.__PETROS_WORLD_METRICS__.picks[s],
      station,
    );
    const bounds = await p.locator('canvas').boundingBox();
    await p.mouse.click(bounds.x + pick.x, bounds.y + pick.y);
    await p.waitForTimeout(1000);
    const actual = await p
      .getByRole('region', { name: 'Petros World learning room' })
      .getAttribute('data-station');
    picks.push({ station, actual, pass: actual === station });
    if (actual !== station) throw Error(`Pick ${station} selected ${actual}`);
  }
  await p.getByRole('button', { name: 'Room overview', exact: true }).click();
  await p.waitForTimeout(1100);
  await p
    .getByRole('region', { name: 'Petros World learning room' })
    .screenshot({ path: 'evidence/world-room-1366.png' });
  await writeFile(
    'evidence/world-picking.json',
    JSON.stringify(
      {
        picks,
        metrics: await p.evaluate(() => window.__PETROS_WORLD_METRICS__),
      },
      null,
      2,
    ),
  );
} finally {
  await b.close();
}
