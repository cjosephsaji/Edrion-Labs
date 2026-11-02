import { chromium } from 'playwright-core';
import { browserExecutable } from './browser-executable';
import { mkdir, writeFile, rename } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const out = new URL('../evidence/corrective/motion/', import.meta.url);
await mkdir(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: browserExecutable(),
  headless: true,
});
const shots: any[] = [];
try {
  for (const station of [
    'Atrium',
    'Neural Learning Lab',
    'Rocket Launch Bay',
    'Language Studio',
    'Traffic Control Table',
    'Relativity Observatory',
  ]) {
    const context = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        recordVideo: {
          dir: fileURLToPath(out),
          size: { width: 1440, height: 900 },
        },
      }),
      page = await context.newPage();
    const video = page.video()!;
    const start = Date.now();
    await page.goto('http://127.0.0.1:3022/prototype');
    await page.locator('#petros-observations').waitFor({ state: 'attached' });
    await page
      .getByRole('button', { name: 'Explore World ↗', exact: true })
      .click();
    await page.locator('canvas').waitFor();
    if (station !== 'Atrium') {
      await page
        .getByRole('button', { name: `Visit ${station}`, exact: true })
        .click();
      await page
        .getByRole('button', {
          name: 'Start learning with captions',
          exact: true,
        })
        .click();
      await page.waitForFunction(
        () => document.querySelector('canvas')?.dataset.travelling === 'false',
      );
      await page
        .getByRole('button', { name: 'Continue with Petros →', exact: true })
        .click();
      await page.waitForTimeout(1100);
      await page
        .getByRole('button', { name: 'Continue with Petros →', exact: true })
        .click();
      await page.waitForTimeout(1100);
      await page
        .getByRole('button', { name: 'Continue with Petros →', exact: true })
        .click();
    } else
      await page.getByRole('button', { name: '⌂ Atrium', exact: true }).click();
    await page.waitForTimeout(Math.max(1500, 16000 - (Date.now() - start)));
    const slug = station.toLowerCase().replaceAll(' ', '-');
    await page.screenshot({
      path: fileURLToPath(new URL(`${slug}.png`, out)),
      fullPage: true,
    });
    await context.close();
    await rename(
      await video.path(),
      fileURLToPath(new URL(`${slug}.webm`, out)),
    );
    shots.push({
      station,
      durationSeconds: (Date.now() - start) / 1000,
      video: `${slug}.webm`,
      screenshot: `${slug}.png`,
    });
    console.log('RECORDED', station);
  }
  await writeFile(
    new URL('storyboard.json', out),
    JSON.stringify(shots, null, 2),
  );
} finally {
  await browser.close();
}
