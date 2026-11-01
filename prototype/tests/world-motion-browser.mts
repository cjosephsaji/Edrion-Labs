import { chromium, type Page } from 'playwright-core';
import { mkdir, writeFile, rename, copyFile } from 'node:fs/promises';
import { browserExecutable } from './browser-executable';
import assert from 'node:assert/strict';
const phase = process.env.MOTION_PHASE ?? 'after';
const dir = `evidence/world-motion/${phase}`;
await mkdir(dir + '/recordings', { recursive: true });
const browser = await chromium.launch({
  executablePath: browserExecutable(),
  headless: true,
  args: ['--enable-unsafe-swiftshader'],
});
const results: any = {
  phase,
  viewports: [],
  errors: [],
  productionMutations: [],
};
let lastPage: Page;
const base = process.env.SHOWCASE_TEST_URL ?? 'http://127.0.0.1:3022';
async function key(p: Page, name: RegExp) {
  const b = p.getByRole('button', { name }).first();
  await p.waitForFunction(
    (el) => !(el as HTMLButtonElement).disabled,
    await b.elementHandle(),
  );
  await b.focus();
  await p.keyboard.press('Enter');
}
async function station(p: Page, name: RegExp) {
  if (await p.getByRole('button', { name: 'Choose a station' }).isVisible())
    await key(p, /Choose a station/);
  await key(p, name);
}
async function settle(p: Page) {
  // Let React commit the request before observing the completion flag.
  await p.waitForTimeout(120);
  await p.waitForFunction(
    () =>
      document.querySelector(
        '[data-world-phase][data-camera-moving="false"]',
      ) && (window as any).__PETROS_ANIMATION__?.camera.status === 'idle',
    undefined,
    { timeout: 90000 },
  );
  await p.waitForTimeout(100);
}
async function sample(
  p: Page,
  label: string,
  action: () => Promise<void>,
  ms = 1900,
) {
  await p.evaluate(() => {
    const w = window as any;
    w.__MOTION_SAMPLE__ = { times: [], start: performance.now(), stop: false };
    const frame = (t: number) => {
      if (w.__MOTION_SAMPLE__.stop) return;
      w.__MOTION_SAMPLE__.times.push(t);
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });
  const start = Date.now();
  await action();
  await p.waitForTimeout(Math.max(0, ms - (Date.now() - start)));
  return p.evaluate((label) => {
    const w = window as any,
      s = w.__MOTION_SAMPLE__;
    s.stop = true;
    const intervals = s.times
      .slice(1)
      .map((t: number, i: number) => t - s.times[i]);
    const sorted = [...intervals].sort((a: number, b: number) => a - b);
    const mean =
      intervals.reduce((a: number, b: number) => a + b, 0) /
      Math.max(1, intervals.length);
    return {
      label,
      method:
        'browser requestAnimationFrame intervals during the operation; renderer transition counters reported separately',
      frames: s.times.length,
      elapsedMs: performance.now() - s.start,
      averageFps: 1000 / mean,
      p99FrameMs: sorted[Math.max(0, Math.ceil(sorted.length * 0.99) - 1)],
      maxFrameMs: sorted.at(-1),
      over50Ms: intervals.filter((t: number) => t > 50).length,
      transitions: w.__PETROS_WORLD_METRICS__?.transitions?.slice(-3),
      budget: w.__PETROS_WORLD_METRICS__?.budget,
      animation: w.__PETROS_ANIMATION__ ?? null,
    };
  }, label);
}
try {
  for (const [width, height] of process.env.MOTION_LIGHTER
    ? [[1920, 1080]]
    : [
        [1440, 900],
        [1920, 1080],
        [1366, 768],
      ]) {
    console.log(phase, width, height);
    const c = await browser.newContext({
      viewport: { width, height },
      reducedMotion: 'no-preference',
      ...(width === 1440
        ? { recordVideo: { dir: dir + '/recordings', size: { width, height } } }
        : {}),
    });
    const p = await c.newPage();
    lastPage = p;
    p.setDefaultNavigationTimeout(120000);
    await p.addInitScript('window.__name = (fn) => fn;');
    p.on('pageerror', (e) => results.errors.push(e.message));
    p.on('console', (m) => {
      if (m.type() === 'error' && /Shader|WebGLProgram/.test(m.text()))
        results.errors.push(m.text());
    });
    p.on('request', (r) => {
      if (
        ['POST', 'PUT', 'PATCH', 'DELETE'].includes(r.method()) &&
        !r.url().includes('/prototype/api/')
      )
        results.productionMutations.push(r.url());
    });
    await p.goto(base + '/prototype', { waitUntil: 'networkidle' });
    await p
      .getByRole('button', {
        name: 'How does artificial intelligence work?',
        exact: true,
      })
      .click();
    const loaded = Date.now();
    await key(p, /Enter Petros World/);
    await p.waitForFunction(
      () =>
        document.querySelector('[data-world-phase]') &&
        (window as any).__PETROS_WORLD_METRICS__?.ready,
      undefined,
      { timeout: 90000 },
    );
    await p.waitForFunction(
      () =>
        !document.querySelector('[aria-label="Entering Petros World"]') &&
        !!document.querySelector('[data-world-phase]'),
      undefined,
      { timeout: 90000 },
    );
    await settle(p);
    await key(p, /Room overview/);
    await settle(p);
    if (process.env.MOTION_LIGHTER) {
      await key(p, /Accessibility and preferences/);
      await key(p, /Graphics: detailed/);
      await key(p, /Close preferences/);
      await p.waitForTimeout(500);
    }
    const row: any = {
      width,
      height,
      sceneLoadMs: Date.now() - loaded,
      samples: [],
    };
    row.samples.push(
      await sample(p, 'overview-to-library', () => station(p, /02\s*Library/)),
    );
    await p
      .getByRole('button', {
        name: 'How does artificial intelligence work?',
        exact: true,
      })
      .click();
    await Promise.race([
      p
        .getByRole('button', { name: /Continue this lesson|Let me show you/ })
        .waitFor({ timeout: 15000 }),
      p
        .getByRole('region', { name: 'Student-paced teaching', exact: true })
        .waitFor({ timeout: 15000 }),
    ]);
    const bookReady = await p
      .getByRole('button', { name: /Continue this lesson|Let me show you/ })
      .isVisible();
    row.bookRetrievalPresented = bookReady;
    row.samples.push(
      await sample(p, 'library-to-whiteboard', () =>
        bookReady
          ? key(p, /Continue this lesson|Let me show you/)
          : station(p, /03\s*Whiteboard/),
      ),
    );
    await settle(p);
    await p.screenshot({ path: `${dir}/board-${width}.png` });
    const original = await p.evaluate(
      () => JSON.parse(sessionStorage.getItem('petros.learning.v3')!).state,
    );
    row.samples.push(
      await sample(p, 'teaching-input-connection-weight', () =>
        key(p, /Show me/),
      ),
    );
    await key(p, /Your turn/);
    const noAnswer = await p.evaluate(
      () => JSON.parse(sessionStorage.getItem('petros.learning.v3')!).state,
    );
    await p.waitForTimeout(1400);
    assert.equal(
      (
        await p.evaluate(
          () => JSON.parse(sessionStorage.getItem('petros.learning.v3')!).state,
        )
      ).questionId,
      noAnswer.questionId,
    );
    row.samples.push(
      await sample(p, 'whiteboard-to-experiment', () =>
        station(p, /04\s*Experiment/),
      ),
    );
    await settle(p);
    row.samples.push(
      await sample(
        p,
        'rapid-latest-station',
        async () => {
          await station(p, /02\s*Library/);
          await p.waitForTimeout(140);
          await station(p, /03\s*Whiteboard/);
          await p.waitForTimeout(140);
          await station(p, /04\s*Experiment/);
        },
        2300,
      ),
    );
    await settle(p);
    await station(p, /03\s*Whiteboard/);
    await settle(p);
    row.drawerStaleAfterStation = await p
      .getByRole('button', { name: 'Close library', exact: true })
      .isVisible();
    if (phase.startsWith('after'))
      assert.equal(row.drawerStaleAfterStation, false);
    if (row.drawerStaleAfterStation)
      await p
        .getByRole('button', { name: 'Close library', exact: true })
        .click();
    const before = await p.evaluate(
      () => JSON.parse(sessionStorage.getItem('petros.learning.v3')!).state,
    );
    await key(p, /Need help/);
    await key(p, /Explain it more simply/);
    await p.waitForTimeout(600);
    const paused = await p.evaluate(
      () => JSON.parse(sessionStorage.getItem('petros.learning.v3')!).state,
    );
    assert.deepEqual(paused.visualState, before.visualState);
    await key(p, /Resume this step/);
    row.interruptionPreserved = true;
    row.noAutomaticProgress = true;
    row.inputLatencyMs = await p.evaluate(async () => {
      const button = Array.from(document.querySelectorAll('button')).find(
        (e) => e.textContent === 'Need help?',
      )!;
      const start = performance.now();
      button.focus();
      await new Promise(requestAnimationFrame);
      return performance.now() - start;
    });
    row.final = await p.evaluate(() => ({
      metrics: (window as any).__PETROS_WORLD_METRICS__,
      animation: (window as any).__PETROS_ANIMATION__,
    }));
    results.viewports.push(row);
    await writeFile(`${dir}/results.json`, JSON.stringify(results, null, 2));
    const video = p.video();
    await c.close();
    if (video)
      await rename(
        await video.path(),
        `${dir}/recordings/continuous-world.webm`,
      );
  }
  assert.deepEqual(results.errors, []);
  assert.deepEqual(results.productionMutations, []);
} catch (e) {
  results.failure = String(e);
  if (lastPage! && !lastPage.isClosed()) {
    results.body = (await lastPage.locator('body').innerText()).slice(-2500);
    await lastPage
      .screenshot({ path: dir + '/failure.png', timeout: 5000 })
      .catch(() => {});
  }
  throw e;
} finally {
  await writeFile(`${dir}/results.json`, JSON.stringify(results, null, 2));
  await browser.close();
}
console.log(
  JSON.stringify(
    results.viewports.map((v: any) => ({
      width: v.width,
      load: v.sceneLoadMs,
      samples: v.samples.map((s: any) => ({
        label: s.label,
        fps: s.averageFps,
        p99: s.p99FrameMs,
      })),
    })),
    null,
    2,
  ),
);
