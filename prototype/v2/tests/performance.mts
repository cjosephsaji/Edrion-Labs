import { chromium } from 'playwright-core';
import { browserExecutable } from './browser-executable';
import { writeFile } from 'node:fs/promises';
const browser = await chromium.launch({
  executablePath: browserExecutable(),
  headless: true,
});
try {
  const page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
    }),
    cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const start = Date.now();
  await page.goto('http://127.0.0.1:3022/prototype');
  await page.locator('#petros-observations').waitFor({ state: 'attached' });
  const interactiveMs = Date.now() - start;
  await page.getByRole('button', { name: /Traffic waves/ }).click();
  const stepStart = Date.now();
  await page.getByRole('button', { name: 'Step +', exact: true }).click();
  await page.waitForFunction(
    () =>
      JSON.parse(document.querySelector('#petros-observations')!.textContent!)
        .observations.elapsed > 0,
  );
  const workerStepAndPaintMs = Date.now() - stepStart;
  await page.getByRole('button', { name: 'World ↗', exact: true }).click();
  await page.locator('canvas').waitFor();
  await page.getByRole('button', { name: /Run experiment/ }).click();
  const frames = (await page.evaluate(
    '(() => new Promise(resolve => { const times=[]; let last=performance.now(),start=last; function frame(now){times.push(now-last);last=now;if(now-start>1500)resolve(times);else requestAnimationFrame(frame)} requestAnimationFrame(frame) }))()',
  )) as number[];
  await page.getByRole('button', { name: /Pause/ }).click();
  const sorted = frames.slice(1).sort((a, b) => a - b),
    result = {
      environment:
        'Local Brave headless; development build; 4× CPU throttling; not physical low-end hardware',
      interactiveMs,
      workerStepAndPaintMs,
      worldFrameMedianMs: sorted[Math.floor(sorted.length / 2)],
      worldFrameP95Ms: sorted[Math.floor(sorted.length * 0.95)],
      sampleFrames: sorted.length,
    };
  await writeFile(
    new URL('../evidence/performance.json', import.meta.url),
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result));
} finally {
  await browser.close();
}
