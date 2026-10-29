/* Read-only frame instrumentation around real UI input. No lesson state injection. */
/* global document, window, performance, requestAnimationFrame */
import process from 'node:process';
import { chromium } from 'playwright-core';
import { writeFileSync } from 'node:fs';
const b = await chromium.launch({
  executablePath: '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
  headless: true,
});
const context = await b.newContext({ viewport: { width: 1440, height: 900 } });
await context.addInitScript(() => {
  window.__m6InputFrames = [];
  document.addEventListener(
    'input',
    (e) => {
      if (e.target.id !== 'answer-available') return;
      const el = e.target,
        value = el.value,
        start = performance.now();
      requestAnimationFrame(() =>
        window.__m6InputFrames.push({
          ms: performance.now() - start,
          valueRetained: el.value === value,
          width: window.innerWidth,
        }),
      );
    },
    true,
  );
});
const p = await context.newPage();
p.setDefaultTimeout(60000);
await p.goto('http://127.0.0.1:4983/demo/cloud-a?fresh=1', { waitUntil: 'domcontentloaded' });
const input = p.getByRole('spinbutton', { name: 'Available memory (GB)', exact: true });
await input.waitFor();
let posts = 0;
p.on('request', (r) => {
  if (r.method() === 'POST') posts++;
});
for (const width of [1440, 360]) {
  await p.setViewportSize({ width, height: 900 });
  for (let i = 0; i < 6; i++) {
    const count = await p.evaluate(() => window.__m6InputFrames.length);
    await input.fill(String(i + 10));
    await p.waitForFunction((n) => window.__m6InputFrames.length > n, count);
  }
}
const result = {
  frames: await p.evaluate(() => window.__m6InputFrames),
  postsDuringTyping: posts,
  verificationExpression: await p
    .locator('[data-layered-character]')
    .getAttribute('data-expression'),
  note: 'Native input event to following observed animation frame; actual controlled field value retained. Includes one frame boundary, not photons or physical-device qualification. No command, model call or grade created by these inputs.',
};
writeFileSync(process.env.PETROS_M6_BROWSER_PERF_OUTPUT, JSON.stringify(result, null, 2));
await context.close();
await b.close();
