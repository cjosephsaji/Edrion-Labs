import { chromium } from 'playwright-core';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { stat, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const root = fileURLToPath(
  new URL('../evidence/teaching-correction/', import.meta.url),
);
const browser = await chromium.launch({
  executablePath:
    '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
  headless: true,
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } }),
  results: any = { recordings: [] };
try {
  for (const name of ['path-a-understands', 'path-b-struggles']) {
    const path = `${root}/recordings/${name}.webm`;
    await page.goto(pathToFileURL(path).href);
    await page.waitForFunction(() => {
      const video = document.querySelector('video');
      return (
        !!video && Number.isFinite(video.duration) && video.readyState >= 2
      );
    });
    const metadata = await page
      .locator('video')
      .evaluate((v) => ({
        duration: v.duration,
        width: v.videoWidth,
        height: v.videoHeight,
      }));
    assert.equal(metadata.width, 1440);
    assert.equal(metadata.height, 900);
    assert.ok(metadata.duration > 30);
    await page.locator('video').evaluate((v) => {
      v.pause();
      v.currentTime = Math.min(45, v.duration / 2);
    });
    await page.waitForFunction(() => {
      const v = document.querySelector('video')!;
      return !v.seeking && v.readyState >= 2;
    });
    await page.screenshot({ path: `${root}/playback-${name}.png` });
    results.recordings.push({
      name,
      ...metadata,
      bytes: (await stat(path)).size,
      decodedAndSeeked: true,
    });
  }
  results.passed = true;
} catch (error) {
  results.failure = String(error);
  console.error(error);
  process.exitCode = 1;
} finally {
  await writeFile(
    `${root}/playback-results.json`,
    JSON.stringify(results, null, 2),
  );
  await browser.close();
}
