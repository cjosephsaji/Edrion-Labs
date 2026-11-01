import { chromium } from 'playwright-core';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { browserExecutable } from './browser-executable';

// Isolate first-render/loading time from the route benchmark's overview trip.
const dir = 'evidence/world-motion/after';
const browser = await chromium.launch({
  executablePath: browserExecutable(),
  headless: true,
  args: ['--enable-unsafe-swiftshader'],
});
const results: any = {
  method:
    'fresh browser contexts, shared browser process; local development server; selection-to-first-3D-render and selection-to-portal-dismissal measured separately',
  viewports: [],
  errors: [],
};
try {
  for (const [width, height] of [
    [1920, 1080],
    [1440, 900],
    [1366, 768],
  ]) {
    const context = await browser.newContext({
      viewport: { width, height },
      reducedMotion: 'no-preference',
    });
    const p = await context.newPage();
    p.setDefaultNavigationTimeout(120000);
    p.on('pageerror', (e) => results.errors.push(e.message));
    p.on('console', (m) => {
      if (m.type() === 'error' && /Shader|WebGLProgram/.test(m.text()))
        results.errors.push(m.text());
    });
    await p.goto(
      (process.env.SHOWCASE_TEST_URL ?? 'http://127.0.0.1:3022') + '/prototype',
      { waitUntil: 'networkidle' },
    );
    await p
      .getByRole('button', {
        name: 'How does artificial intelligence work?',
        exact: true,
      })
      .click();
    const start = Date.now();
    await p
      .getByRole('button', { name: 'Enter Petros World', exact: true })
      .click();
    await p.waitForFunction(
      () => (window as any).__PETROS_WORLD_METRICS__?.ready,
      undefined,
      { timeout: 90000 },
    );
    const first3DRenderMs = Date.now() - start;
    await p.waitForFunction(
      () => (window as any).__PETROS_BOARD__?.layout?.text?.length > 0,
      undefined,
      { timeout: 500 },
    );
    const initialBoardPixel = await p.evaluate(async () => {
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
      const board = (window as any).__PETROS_BOARD__.rect;
      const canvas = document.querySelector(
        '[data-world-scene] canvas',
      ) as HTMLCanvasElement;
      const gl = canvas.getContext('webgl2')!;
      const bounds = canvas.getBoundingClientRect();
      const pixel = new Uint8Array(4);
      gl.readPixels(
        Math.round(((board.x + board.w / 2) * canvas.width) / bounds.width),
        Math.round(
          ((bounds.height - board.y - board.h / 2) * canvas.height) /
            bounds.height,
        ),
        1,
        1,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        pixel,
      );
      return Array.from(pixel);
    });
    assert.ok(
      initialBoardPixel.slice(0, 3).every((value) => value > 180),
      `Board was not prepared under the portal: ${initialBoardPixel}`,
    );
    await p.waitForFunction(
      () =>
        !document.querySelector('[aria-label="Entering Petros World"]') &&
        document.querySelector('[data-world-phase]'),
      undefined,
      { timeout: 90000 },
    );
    results.viewports.push({
      width,
      height,
      first3DRenderMs,
      initialBoardPixel,
      arrivalReadyMs: Date.now() - start,
    });
    await context.close();
  }
  assert.deepEqual(results.errors, []);
} finally {
  await mkdir(dir, { recursive: true });
  await writeFile(dir + '/loading.json', JSON.stringify(results, null, 2));
  await browser.close();
}
console.log(JSON.stringify(results, null, 2));
