import { spawn } from 'node:child_process';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { writeFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { browserExecutable } from './browser-executable';
import assert from 'node:assert/strict';
const secret = randomBytes(32).toString('hex'),
  base = 'http://127.0.0.1:3024',
  require = createRequire(import.meta.url),
  server = spawn(
    process.execPath,
    [
      require.resolve('next/dist/bin/next'),
      'start',
      '-H',
      '127.0.0.1',
      '-p',
      '3024',
    ],
    {
      cwd: new URL('..', import.meta.url),
      env: {
        ...process.env,
        NODE_ENV: 'production',
        OPENAI_API_KEY: '',
        PETROS_V2_ACCESS_SECRET: secret,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
let browser: any;
const results: any[] = [];
try {
  await new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => reject(Error('Server timeout')), 15000);
    server.stdout.on('data', (d) => {
      if (String(d).includes('Ready')) {
        clearTimeout(t);
        resolve();
      }
    });
    server.on('error', reject);
  });
  browser = await chromium.launch({
    executablePath: browserExecutable(),
    headless: true,
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  });
  await context.addInitScript('window.__name = f => f');
  const token = randomUUID() + '.' + (Date.now() + 3600000),
    mac = createHmac('sha256', secret)
      .update('petros-v2:' + token)
      .digest('hex');
  await context.addCookies([
    { name: 'petros_v2', value: token + '.' + mac, url: base },
  ]);
  const page = await context.newPage();
  page.setDefaultTimeout(45000);
  await page.goto(base + '/prototype');
  await page
    .getByRole('button', { name: 'Explore the islands', exact: true })
    .waitFor();
  await page.waitForFunction(
    () => document.querySelector('canvas')?.dataset.travelling === 'false',
  );
  const initial = await page.evaluate(() =>
    performance
      .getEntriesByType('resource')
      .map((r: any) => ({
        file: r.name.replace(location.origin, ''),
        decoded: r.decodedBodySize,
        encoded: r.encodedBodySize,
        transfer: r.transferSize,
      })),
  );
  const gpu = await page.locator('canvas').evaluate((c) => {
    const gl = c.getContext('webgl2')!,
      ext = gl.getExtension('WEBGL_debug_renderer_info');
    return ext
      ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)
      : gl.getParameter(gl.RENDERER);
  });
  await page
    .getByRole('button', { name: 'Explore the islands', exact: true })
    .click();
  for (const [i, label] of [
    'Neural learning',
    'Rocket landing',
    'Attention',
    'Traffic waves',
    'Time dilation',
  ].entries()) {
    const id = ['neural', 'rocket', 'attention', 'traffic', 'relativity'][i];
    await page
      .locator('nav[aria-label="Interactive topics"]')
      .getByRole('button', { name: new RegExp(label) })
      .click();
    await page.waitForFunction((id) => {
      const c = document.querySelector('canvas');
      return c?.dataset.destination === id && c.dataset.travelling === 'false';
    }, id);
    await page
      .getByRole('button', {
        name: 'World settings and information',
        exact: true,
      })
      .click();
    for (const quality of ['high', 'balanced', 'low']) {
      await page
        .getByLabel('World quality', { exact: true })
        .selectOption(quality);
      await page.waitForFunction(
        (q) => document.querySelector('canvas')?.dataset.quality === q,
        quality,
      );
      await page.waitForTimeout(1000);
      const frames = await page.evaluate(
        () =>
          new Promise<number[]>((resolve) => {
            const samples: number[] = [];
            let prior = performance.now(),
              start = prior;
            function tick(now: number) {
              samples.push(now - prior);
              prior = now;
              if (now - start >= 3000) resolve(samples.slice(3));
              else requestAnimationFrame(tick);
            }
            requestAnimationFrame(tick);
          }),
      );
      const sorted = frames.slice().sort((a, b) => a - b),
        canvas = await page
          .locator('canvas')
          .evaluate((c) => ({ dpr: c.width / c.clientWidth, ...c.dataset }));
      const row = {
        topic: id,
        quality,
        medianMs: sorted[Math.floor(sorted.length * 0.5)],
        p95Ms: sorted[Math.floor(sorted.length * 0.95)],
        fps: (1000 * frames.length) / frames.reduce((a, b) => a + b, 0),
        frames: frames.length,
        canvas,
      };
      results.push(row);
      console.log(JSON.stringify(row));
    }
    await page
      .getByRole('button', {
        name: 'World settings and information',
        exact: true,
      })
      .click();
  }
  await writeFile(
    new URL('../evidence/world-rebuild/performance.json', import.meta.url),
    JSON.stringify(
      {
        scope:
          'Local production build; headless Brave on this Mac; 1440×900 CSS at native DPR 2, each steady-state sample 3 seconds. Not physical phone measurements. Includes all render passes in telemetry.',
        gpu,
        initialDecodedBytes: initial.reduce(
          (s: any, r: any) => s + r.decoded,
          0,
        ),
        initialEncodedBytes: initial.reduce(
          (s: any, r: any) => s + r.encoded,
          0,
        ),
        initialResources: initial,
        results,
      },
      null,
      2,
    ),
  );
  assert.ok(initial.reduce((s: any, r: any) => s + r.encoded, 0) < 10e6);
} catch (e) {
  await writeFile(
    new URL(
      '../evidence/world-rebuild/performance-failure.json',
      import.meta.url,
    ),
    JSON.stringify({ error: String(e), results }, null, 2),
  );
  throw e;
} finally {
  await browser?.close();
  server.kill('SIGTERM');
}
