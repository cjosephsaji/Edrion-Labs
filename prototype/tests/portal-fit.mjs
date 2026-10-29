import { chromium } from 'playwright-core';
import { fileURLToPath } from 'node:url';
import { writeFile } from 'node:fs/promises';
process.chdir(fileURLToPath(new URL('../', import.meta.url)));
const browser = await chromium.launch({
  executablePath:
    '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
  headless: true,
  args: ['--use-angle=metal'],
});
const results = { viewports: [], errors: [] };
async function sample(page) {
  return page.evaluate(() => {
    const portal = document.querySelector('[data-phase]'),
      ring = portal?.querySelector('[data-portal-ring]'),
      copy = portal?.querySelector('[data-portal-copy]');
    if (!ring || !copy) return null;
    const r = ring.getBoundingClientRect(),
      c = copy.getBoundingClientRect(),
      opacity = Number(getComputedStyle(copy).opacity),
      visible = getComputedStyle(ring).display !== 'none';
    const center = { x: r.x + r.width / 2, y: r.y + r.height / 2 },
      radius = r.width / 2;
    let clearance = Infinity;
    for (const el of copy.querySelectorAll('span,h2,p,progress')) {
      const box = el.getBoundingClientRect();
      for (const x of [box.left, box.right])
        for (const y of [box.top, box.bottom])
          clearance = Math.min(
            clearance,
            radius - Math.hypot(x - center.x, y - center.y),
          );
    }
    return {
      phase: portal.dataset.phase,
      opacity,
      ringVisible: visible,
      clearance,
      circle: { x: r.x, y: r.y, width: r.width, height: r.height },
      copy: { x: c.x, y: c.y, width: c.width, height: c.height },
      overflow: document.documentElement.scrollWidth > innerWidth,
    };
  });
}
try {
  for (const [width, height] of [
    [1920, 1080],
    [1566, 1086],
    [1440, 900],
    [1366, 768],
    [390, 844],
    [360, 800],
    [844, 390],
    [640, 320],
  ]) {
    const context = await browser.newContext({ viewport: { width, height } }),
      page = await context.newPage();
    page.on('pageerror', (e) => results.errors.push(e.message));
    await page.goto('http://127.0.0.1:3021/prototype');
    await page
      .getByRole('button', { name: 'Learn AI_Module_3.pdf', exact: true })
      .click();
    let release;
    const gate = new Promise((r) => (release = r));
    await page.route('**/petros/states/*.png', async (route) => {
      await gate;
      await route.continue();
    });
    await page
      .getByRole('button', { name: 'Enter Petros World', exact: true })
      .click();
    const dialog = page.getByRole('dialog', { name: 'Entering Petros World' });
    await dialog.getByRole('progressbar').waitFor();
    await page.waitForTimeout(180);
    const loading = await sample(page);
    await page.screenshot({
      path: `evidence/portal-fit/loading-${width}x${height}.png`,
    });
    if (
      !loading ||
      loading.phase !== 'loading' ||
      loading.overflow ||
      (loading.ringVisible && loading.clearance < 8)
    )
      throw Error('Loading fit ' + JSON.stringify(loading));
    release();
    await page.waitForFunction(
      () => document.querySelector('[data-phase="entering"]'),
      null,
      { timeout: 30000 },
    );
    const animation = await page.evaluate(
      () =>
        new Promise((resolve) => {
          let frames = 0,
            minClearance = Infinity,
            visibleFrames = 0;
          const start = performance.now();
          function tick() {
            const portal = document.querySelector('[data-phase="entering"]'),
              ring = portal?.querySelector('[data-portal-ring]'),
              copy = portal?.querySelector('[data-portal-copy]');
            if (!ring || !copy) {
              resolve({ frames, visibleFrames, minClearance });
              return;
            }
            const r = ring.getBoundingClientRect(),
              opacity = Number(getComputedStyle(copy).opacity);
            if (opacity > 0.8 && getComputedStyle(ring).display !== 'none') {
              visibleFrames++;
              const cx = r.x + r.width / 2,
                cy = r.y + r.height / 2;
              for (const el of copy.querySelectorAll('span,h2,p')) {
                const b = el.getBoundingClientRect();
                for (const x of [b.left, b.right])
                  for (const y of [b.top, b.bottom])
                    minClearance = Math.min(
                      minClearance,
                      r.width / 2 - Math.hypot(x - cx, y - cy),
                    );
              }
            }
            frames++;
            if (performance.now() - start > 700)
              resolve({ frames, visibleFrames, minClearance });
            else requestAnimationFrame(tick);
          }
          requestAnimationFrame(tick);
        }),
    );
    await page.screenshot({
      path: `evidence/portal-fit/entering-${width}x${height}.png`,
    });
    if (animation.visibleFrames && animation.minClearance < 8)
      throw Error('Animated text crosses ring ' + JSON.stringify(animation));
    await dialog.waitFor({ state: 'detached' });
    await page
      .getByRole('main', { name: 'Petros World immersive study' })
      .waitFor();
    results.viewports.push({
      width,
      height,
      loading,
      animation,
      arrived: true,
    });
    await context.close();
    console.log('Portal fit passed', width, height);
  }
  if (results.errors.length) throw Error(results.errors.join('\n'));
  results.passed = true;
} finally {
  await writeFile(
    'evidence/portal-fit/results.json',
    JSON.stringify(results, null, 2),
  );
  await browser.close();
}
