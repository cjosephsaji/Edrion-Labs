/** Optimized-build GPU measurement with ephemeral local test authentication. No provider calls. */
import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { randomBytes, randomUUID, createHmac } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium, type Page } from 'playwright-core';
import { browserExecutable } from './browser-executable';
import assert from 'node:assert/strict';
const topic =
  process.env.PETROS_STAGE_LESSON === 'relativity'
    ? 'relativity'
    : process.env.PETROS_STAGE_LESSON === 'traffic'
      ? 'traffic'
      : process.env.PETROS_STAGE_LESSON === 'attention'
        ? 'attention'
        : process.env.PETROS_STAGE_LESSON === 'rocket'
          ? 'rocket'
          : 'neural';
const require = createRequire(import.meta.url),
  base = 'http://127.0.0.1:3024',
  secret = randomBytes(32).toString('hex');
const proc = spawn(
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
      PETROS_V2_ACCESS_SECRET: secret,
      PETROS_V2_YC_USERNAME: '',
      PETROS_V2_YC_PASSWORD_HASH: '',
      PETROS_V2_STAGE_DEFAULT: '1',
      OPENAI_API_KEY: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  },
);
const browser = await chromium.launch({
  executablePath: browserExecutable(),
  headless: true,
});
// Independent test-side RAF timing includes every interval in the window,
// including stalls; it does not add runtime telemetry or change the scene.
function frameProbe(page: Page, durationMs: number) {
  return page.evaluate(
    (duration) =>
      new Promise<{
        fps: number;
        meanMs: number;
        p95Ms: number;
        maxMs: number;
        frames: number;
        durationMs: number;
      }>((resolve) => {
        const intervals: number[] = [];
        let first = 0,
          last = 0;
        const tick = (time: number) => {
          if (!first) {
            first = last = time;
            requestAnimationFrame(tick);
            return;
          }
          intervals.push(time - last);
          last = time;
          if (time - first < duration) {
            requestAnimationFrame(tick);
            return;
          }
          const total = time - first,
            sorted = [...intervals].sort((a, b) => a - b);
          resolve({
            fps: (intervals.length * 1000) / total,
            meanMs: total / intervals.length,
            p95Ms: sorted[Math.floor(sorted.length * 0.95)],
            maxMs: Math.max(...intervals),
            frames: intervals.length,
            durationMs: total,
          });
        };
        requestAnimationFrame(tick);
      }),
    durationMs,
  );
}
try {
  for (let i = 0; i < 80; i++) {
    if (
      await fetch(base)
        .then((r) => r.ok)
        .catch(() => false)
    )
      break;
    await new Promise((r) => setTimeout(r, 250));
  }
  const id = randomUUID(),
    expires = Date.now() + 3600_000,
    body = `${id}.${expires}`,
    token =
      body +
      '.' +
      createHmac('sha256', secret)
        .update('petros-v2:' + body)
        .digest('hex');
  const results: Record<string, unknown>[] = [];
  for (const [width, height, quality] of [
    [1440, 900, 'balanced'],
    [1440, 900, 'high'],
    [1440, 900, 'low'],
    [390, 844, 'low'],
  ] as const) {
    const context = await browser.newContext({
      viewport: { width, height },
      deviceScaleFactor: 2,
    });
    await context.addInitScript('window.__name=(value)=>value');
    await context.addCookies([{ name: 'petros_v2', value: token, url: base }]);
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(base + '/prototype?view=stage&lesson=' + topic);
    if (process.env.PETROS_STAGE_NO_BACKDROP === '1')
      await page.addStyleTag({
        content:
          '[data-testid="petros-stage"] *{backdrop-filter:none!important;-webkit-backdrop-filter:none!important}',
      });
    await page.waitForFunction(
      () => document.querySelector('canvas')?.dataset.introComplete === 'true',
    );
    if (width === 1440 && quality !== 'balanced') {
      await page
        .getByRole('button', { name: 'Lesson & settings', exact: true })
        .click();
      await page
        .getByLabel('Stage quality', { exact: true })
        .selectOption(quality);
      await page
        .getByRole('button', { name: 'Close lesson and settings', exact: true })
        .click();
    }
    await page.waitForTimeout(2200);
    const overviewProbe = frameProbe(page, 8000);
    const samples: Record<string, string>[] = [];
    for (let i = 0; i < 10; i++) {
      await page.waitForTimeout(800);
      samples.push(
        await page.locator('canvas').evaluate((c) => ({ ...c.dataset })),
      );
    }
    const gpu = await page.locator('canvas').evaluate((c) => {
      const gl = c.getContext('webgl2')!,
        ext = gl.getExtension('WEBGL_debug_renderer_info');
      return ext
        ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)
        : gl.getParameter(gl.RENDERER);
    });
    assert.deepEqual(errors, []);
    assert.equal(await page.getByTestId('petros-stage').count(), 1);
    results.push({
      viewport: [width, height],
      quality,
      dpr: 2,
      canvas: await page.locator('canvas').evaluate((c) => ({
        cssWidth: c.clientWidth,
        cssHeight: c.clientHeight,
        bufferWidth: c.width,
        bufferHeight: c.height,
      })),
      gpu,
      samples,
      frameProbe: await overviewProbe,
      errors,
    });
    if (quality === 'balanced') {
      const focus: Record<string, unknown>[] = [];
      for (const id of topic === 'relativity'
        ? ['td-ship', 'td-gamma', 'td-frame']
        : topic === 'traffic'
          ? ['t-wave', 't-speed', 't-headway']
          : topic === 'attention'
            ? ['a-query', 'a-beams', 'a-context']
            : topic === 'rocket'
              ? ['r-thrust', 'r-fuel', 'r-landing']
              : ['q-weight', 'q-input-number', 'q-loss']) {
        const transitionProbe =
          topic === 'traffic' || topic === 'relativity'
            ? frameProbe(page, 1800)
            : null;
        await page.locator(`[id="${id}"]`).click();
        await page.waitForFunction(
          () =>
            document
              .querySelector('[data-testid="petros-stage"]')
              ?.getAttribute('data-camera-moving') === 'false',
        );
        await page.waitForTimeout(1000);
        const focusedProbe = frameProbe(page, 3200);
        const frames: Record<string, string>[] = [];
        for (let i = 0; i < 4; i++) {
          await page.waitForTimeout(800);
          frames.push(
            await page.locator('canvas').evaluate((c) => ({ ...c.dataset })),
          );
        }
        focus.push({
          id,
          samples: frames,
          frameProbe: await focusedProbe,
          ...(transitionProbe
            ? { transitionProbe: await transitionProbe }
            : {}),
        });
        await page.keyboard.press('Escape');
        await page.waitForFunction(
          () =>
            document
              .querySelector('[data-testid="petros-stage"]')
              ?.getAttribute('data-camera-moving') === 'false',
        );
      }
      results.at(-1)!.focus = focus;
      if (topic === 'relativity') {
        const introProbe = frameProbe(page, 2800);
        await page
          .getByRole('navigation', { name: 'Stage lessons', exact: true })
          .locator('button[aria-current="page"]')
          .click();
        await page.waitForFunction(
          () =>
            document.querySelector('canvas')?.dataset.introComplete === 'true',
        );
        results.at(-1)!.introProbe = await introProbe;
        await page
          .getByRole('button', { name: 'Run clocks', exact: true })
          .click();
        const activeProbe = frameProbe(page, 6400),
          active: Record<string, string>[] = [];
        for (let i = 0; i < 8; i++) {
          await page.waitForTimeout(800);
          active.push(
            await page.locator('canvas').evaluate((c) => ({ ...c.dataset })),
          );
        }
        await page
          .getByRole('button', { name: 'Pause clocks', exact: true })
          .click();
        results.at(-1)!.activeClocks = active;
        results.at(-1)!.activeClocksProbe = await activeProbe;
        await page
          .getByRole('button', { name: 'Lesson & settings', exact: true })
          .click();
        for (const [key, value] of [
          ['beta', 0.999],
          ['duration', 120],
        ] as const) {
          await page.locator('#stage-' + key).evaluate((el, v) => {
            Object.getOwnPropertyDescriptor(
              HTMLInputElement.prototype,
              'value',
            )!.set!.call(el, String(v));
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
          }, value);
          await page.waitForFunction(
            ({ key, value }) =>
              JSON.parse(
                document.querySelector('#petros-observations')!.textContent!,
              ).params[key] === value,
            { key, value },
          );
        }
        await page
          .getByLabel('Diagram coordinates', { exact: true })
          .selectOption('ship');
        await page
          .getByRole('button', {
            name: 'Close lesson and settings',
            exact: true,
          })
          .click();
        await page
          .getByRole('button', { name: 'Run clocks', exact: true })
          .click();
        const nearLightProbe = frameProbe(page, 4000),
          nearLight: Record<string, string>[] = [];
        for (let i = 0; i < 5; i++) {
          await page.waitForTimeout(800);
          nearLight.push(
            await page.locator('canvas').evaluate((c) => ({ ...c.dataset })),
          );
        }
        await page
          .getByRole('button', { name: 'Pause clocks', exact: true })
          .click();
        results.at(-1)!.nearLight = nearLight;
        results.at(-1)!.nearLightProbe = await nearLightProbe;
      }
      if (topic === 'attention') {
        await page
          .getByRole('button', { name: 'Scan sentence', exact: true })
          .click();
        const scanning: Record<string, string>[] = [];
        for (let i = 0; i < 8; i++) {
          await page.waitForTimeout(800);
          scanning.push(
            await page.locator('canvas').evaluate((c) => ({ ...c.dataset })),
          );
        }
        await page
          .getByRole('button', { name: 'Pause scan', exact: true })
          .click();
        results.at(-1)!.scanning = scanning;
        await page
          .getByRole('button', { name: 'Lesson & settings', exact: true })
          .click();
        await page
          .getByLabel('Sentence', { exact: true })
          .fill(Array.from({ length: 12 }, (_, i) => 'word' + i).join(' '));
        await page
          .getByRole('button', { name: 'Apply sentence', exact: true })
          .click();
        await page
          .getByRole('button', {
            name: 'Close lesson and settings',
            exact: true,
          })
          .click();
        await page.locator('#stage-query').selectOption('11');
        await page.waitForTimeout(2000);
        const twelve: Record<string, string>[] = [];
        for (let i = 0; i < 5; i++) {
          await page.waitForTimeout(800);
          twelve.push(
            await page.locator('canvas').evaluate((c) => ({ ...c.dataset })),
          );
        }
        results.at(-1)!.twelveTokens = twelve;
      }
      if (topic === 'traffic') {
        const introProbe = frameProbe(page, 2800);
        await page
          .getByRole('navigation', { name: 'Stage lessons', exact: true })
          .locator('button[aria-current="page"]')
          .click();
        await page.waitForFunction(
          () =>
            document.querySelector('canvas')?.dataset.introComplete === 'true',
        );
        results.at(-1)!.introProbe = await introProbe;
        await page
          .getByRole('button', { name: 'Brake & watch', exact: true })
          .click();
        const activeProbe = frameProbe(page, 6400);
        const active: Record<string, string>[] = [];
        for (let i = 0; i < 8; i++) {
          await page.waitForTimeout(800);
          active.push(
            await page.locator('canvas').evaluate((c) => ({ ...c.dataset })),
          );
        }
        await page
          .getByRole('button', { name: 'Pause road', exact: true })
          .click();
        results.at(-1)!.activeRoad = active;
        results.at(-1)!.activeRoadProbe = await activeProbe;
        await page
          .getByRole('button', { name: 'Lesson & settings', exact: true })
          .click();
        await page.locator('#stage-count').evaluate((el) => {
          Object.getOwnPropertyDescriptor(
            HTMLInputElement.prototype,
            'value',
          )!.set!.call(el, '45');
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        });
        await page.waitForFunction(
          () =>
            JSON.parse(
              document.querySelector('#petros-observations')!.textContent!,
            ).params.count === 45,
        );
        await page
          .getByRole('button', {
            name: 'Close lesson and settings',
            exact: true,
          })
          .click();
        await page
          .getByRole('button', { name: 'Brake & watch', exact: true })
          .click();
        await page.waitForTimeout(2000);
        const denseProbe = frameProbe(page, 4000);
        const dense: Record<string, string>[] = [];
        for (let i = 0; i < 5; i++) {
          await page.waitForTimeout(800);
          dense.push(
            await page.locator('canvas').evaluate((c) => ({ ...c.dataset })),
          );
        }
        await page
          .getByRole('button', { name: 'Pause road', exact: true })
          .click();
        results.at(-1)!.fortyFiveCars = dense;
        results.at(-1)!.fortyFiveCarsProbe = await denseProbe;
      }
      if (topic === 'rocket') {
        await page.getByRole('button', { name: 'Reset', exact: true }).click();
        await page
          .getByRole('button', { name: 'Run flight', exact: true })
          .click();
        const active: Record<string, string>[] = [];
        for (let i = 0; i < 8; i++) {
          await page.waitForTimeout(800);
          active.push(
            await page.locator('canvas').evaluate((c) => ({ ...c.dataset })),
          );
        }
        await page
          .getByRole('button', { name: 'Pause flight', exact: true })
          .click();
        results.at(-1)!.activeFlight = active;
      }
    }
    await context.close();
  }
  const out = new URL(
    `../../../audit-screenshots/${topic === 'relativity' ? 'stage-relativity' : topic === 'traffic' ? 'stage-traffic' : topic === 'attention' ? 'stage-attention' : topic === 'rocket' ? 'stage-rocket' : 'stage'}/`,
    import.meta.url,
  );
  await mkdir(out, { recursive: true });
  await writeFile(
    new URL('performance-production.json', out),
    JSON.stringify(
      {
        at: new Date().toISOString(),
        hardware: execFileSync('sysctl', ['-n', 'machdep.cpu.brand_string'], {
          encoding: 'utf8',
        }).trim(),
        browser: browser.version(),
        testStyleOverride:
          process.env.PETROS_STAGE_NO_BACKDROP === '1'
            ? 'no HUD backdrop filters (diagnostic only)'
            : null,
        environment:
          'optimized Next build; local headless Chromium; ANGLE Metal; DPR2; unthrottled; no provider calls; peak full-pass draw calls per sample window',
        results,
      },
      null,
      2,
    ),
  );
  process.stdout.write('Stage production performance captured.\n');
} finally {
  await browser.close();
  proc.kill('SIGTERM');
}
