import { chromium, type Page } from 'playwright-core';
import { browserExecutable } from './browser-executable';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
const base = process.env.PETROS_BASE_URL ?? 'http://127.0.0.1:3022';
const out = new URL('../../../audit-screenshots/stage/', import.meta.url);
await mkdir(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: browserExecutable(),
  headless: true,
});
const errors: string[] = [],
  consoleErrors: string[] = [],
  results: Record<string, unknown>[] = [];
const observe = async (page: Page) =>
  JSON.parse((await page.locator('#petros-observations').textContent())!) as {
    params: { weight: number; x1: number };
    observations: { prediction: number; loss: number; steps: number };
    revision: number;
    caption: string;
    guide: { phase: string; openingIndex: number };
  };
async function ready(page: Page) {
  await page.waitForFunction(() => {
    const c = document.querySelector('canvas');
    return (
      c?.dataset.ready === 'true' &&
      c.dataset.introComplete === 'true' &&
      document
        .querySelector('[data-testid="petros-stage"]')
        ?.getAttribute('data-camera-moving') === 'false'
    );
  });
}
async function focusDone(page: Page) {
  await page.waitForFunction(
    () =>
      document
        .querySelector('[data-testid="petros-stage"]')
        ?.getAttribute('data-camera-moving') === 'false',
  );
}
async function shot(page: Page, name: string) {
  await page.screenshot({ path: fileURLToPath(new URL(name + '.png', out)) });
}
function listen(page: Page) {
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });
  page.on('request', (r) => {
    if (/\/(teacher|speech|voice)(\/|$|\?)/.test(r.url()))
      errors.push('Unexpected paid route ' + r.url());
  });
}
async function geometryChecks(page: Page) {
  const data = await page.evaluate(() => {
    const rect = (el: Element) => {
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    };
    const labels = Array.from(
      document.querySelectorAll<HTMLElement>('[data-stage-label]'),
    )
      .filter((e) => +e.style.opacity > 0.3)
      .map((e) => ({ id: e.dataset.stageLabel!, ...rect(e) }));
    const selected = document
      .querySelector('[data-testid="petros-stage"]')
      ?.getAttribute('data-focus');
    const card = document.querySelector('[data-testid="stage-explainer"]'),
      part = Array.from(document.querySelectorAll('[data-stage-anchor]')).find(
        (e) => e.getAttribute('data-stage-anchor') === selected,
      );
    return {
      labels,
      card: card ? rect(card) : null,
      part: part ? rect(part) : null,
      overflow: document.documentElement.scrollWidth > innerWidth,
    };
  });
  const intersects = (
    a: { x: number; y: number; w: number; h: number },
    b: { x: number; y: number; w: number; h: number },
  ) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  assert.equal(data.overflow, false);
  for (let i = 0; i < data.labels.length; i++)
    for (let j = i + 1; j < data.labels.length; j++)
      assert.equal(
        intersects(data.labels[i], data.labels[j]),
        false,
        `Labels overlap: ${data.labels[i].id} / ${data.labels[j].id}`,
      );
  if (data.card && data.part)
    assert.equal(
      intersects(data.card, data.part),
      false,
      'Explainer covers focused part',
    );
  return data;
}
try {
  for (const [width, height] of [
    [1440, 900],
    [390, 844],
  ]) {
    const ctx = await browser.newContext({
      viewport: { width, height },
      deviceScaleFactor: 2,
    });
    await ctx.addInitScript('window.__name = (value) => value');
    const page = await ctx.newPage();
    page.setDefaultTimeout(45000);
    listen(page);
    await page.goto(base + '/prototype?view=stage');
    await ready(page);
    await page.evaluate(() => document.fonts.ready);
    await shot(page, `overview-${width}-dpr2`);
    await geometryChecks(page);
    assert.equal(await page.locator('canvas').count(), 1);
    assert.equal(
      await page.locator('canvas').evaluate((c) => c.width / c.clientWidth),
      2,
    );
    const before = await observe(page);
    for (let i = 0; i < 3; i++) {
      const prev = await observe(page);
      await page
        .getByRole('button', { name: 'Train one step', exact: true })
        .click();
      await page.waitForFunction(
        (steps) =>
          JSON.parse(
            document.querySelector('#petros-observations')!.textContent!,
          ).observations.steps === steps,
        prev.observations.steps + 1,
      );
    }
    const after = await observe(page);
    assert.ok(after.observations.loss < before.observations.loss);
    assert.ok(Math.abs(after.params.weight - 1.676) < 1e-8);
    await page.waitForTimeout(800);
    await shot(page, `after-3-steps-${width}-dpr2`);
    for (const id of ['q-weight', 'q-input-number', 'q-loss']) {
      const cameraBefore = await page
        .locator('canvas')
        .getAttribute('data-camera-position');
      await page.locator(`[id="${id}"]`).click();
      await page
        .locator(`[data-testid="stage-explainer"][data-chip="${id}"]`)
        .waitFor();
      await focusDone(page);
      await page.waitForTimeout(150);
      assert.notEqual(
        await page.locator('canvas').getAttribute('data-camera-position'),
        cameraBefore,
      );
      await shot(page, `${id}-${width}-dpr2`);
      await geometryChecks(page);
      assert.ok((await observe(page)).caption.length > 20);
      await page.keyboard.press('Escape');
      await focusDone(page);
      assert.equal(await page.getByTestId('stage-explainer').count(), 0);
      assert.equal(
        await page.getByTestId('petros-stage').getAttribute('data-focus'),
        'overview',
      );
    }
    // Actual automatic steps, including self-stop at the specified tolerance.
    await page.getByRole('button', { name: 'Auto-train', exact: true }).click();
    await page
      .getByRole('button', { name: 'Auto-train', exact: true })
      .waitFor();
    await page.waitForFunction(
      () =>
        Math.abs(
          JSON.parse(
            document.querySelector('#petros-observations')!.textContent!,
          ).observations.prediction - 4,
        ) < 0.012,
    );
    const solved = await observe(page);
    assert.ok(Math.abs(solved.observations.prediction - 4) < 0.012);
    await page.waitForTimeout(700);
    await shot(page, `solved-${width}-dpr2`);
    await geometryChecks(page);
    await page
      .getByRole('button', { name: 'Lesson & settings', exact: true })
      .click();
    await page
      .getByRole('button', {
        name: 'What if the input becomes negative?',
        exact: true,
      })
      .click();
    await page
      .getByRole('button', { name: 'Close lesson and settings', exact: true })
      .click();
    await page.waitForFunction(
      () =>
        JSON.parse(document.querySelector('#petros-observations')!.textContent!)
          .params.x1 < 0,
    );
    await page.keyboard.press('Escape');
    await focusDone(page);
    await page.waitForTimeout(1000);
    await shot(page, `negative-input-${width}-dpr2`);
    await geometryChecks(page);
    assert.ok(await page.locator('[data-stage-ruler="0"]').count());
    assert.ok((await observe(page)).observations.prediction < 0);
    await page.reload();
    await ready(page);
    assert.equal((await observe(page)).params.x1, -2);
    assert.equal(
      await page.locator('[class*="firstHint"]').getAttribute('data-visible'),
      'false',
    );
    await page.getByRole('button', { name: 'Reset', exact: true }).click();
    await page.waitForFunction(
      () =>
        JSON.parse(document.querySelector('#petros-observations')!.textContent!)
          .params.weight === 0.5,
    );
    await page.waitForTimeout(500);
    const dialBox = await page
      .locator('[data-stage-anchor="weight"]')
      .boundingBox();
    assert.ok(dialBox);
    const initialWeight = (await observe(page)).params.weight;
    await page.mouse.move(
      dialBox.x + dialBox.width / 2,
      dialBox.y + dialBox.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      dialBox.x + dialBox.width / 2 + 90,
      dialBox.y + dialBox.height / 2,
      { steps: 8 },
    );
    await page.mouse.up();
    await page.waitForFunction(
      (w) =>
        Math.abs(
          JSON.parse(
            document.querySelector('#petros-observations')!.textContent!,
          ).params.weight - w,
        ) < 0.02,
      initialWeight + 0.5,
    );
    const inputBox = await page
      .locator('[data-stage-anchor="input-0"]')
      .boundingBox();
    assert.ok(inputBox);
    await page.mouse.click(
      inputBox.x + inputBox.width / 2,
      inputBox.y + inputBox.height / 2,
    );
    await page.locator('[data-chip="q-input-number"]').waitFor();
    await focusDone(page);
    await page.keyboard.press('Escape');
    await focusDone(page);
    // Exercise all other authored chips and their demos, with cancellation between them.
    for (const id of [
      'q-why-2.0',
      'q-prediction',
      'q-target',
      'q-step',
      'q-why-weight',
      'q-chatgpt',
    ]) {
      await page.locator(`[id="${id}"]`).click();
      await focusDone(page);
      await page
        .getByRole('button', { name: 'Try it', exact: false })
        .filter({ hasText: 'Try it' })
        .first()
        .click();
      await page.waitForTimeout(180);
      await page.keyboard.press('Escape');
      await focusDone(page);
    }
    if (width === 1440) {
      await page.getByRole('button', { name: 'Reset', exact: true }).click();
      await page.waitForTimeout(500);
      // Capture current-source motion frames; wall times are recorded, not an invented fixed frame rate.
      const motion: { name: string; elapsedMs: number }[] = [];
      await mkdir(new URL('motion/', out), { recursive: true });
      await page
        .getByRole('button', { name: 'Neural learning', exact: false })
        .click();
      let start = Date.now();
      for (let i = 0; i < 8; i++) {
        const name = `motion/intro-${String(i).padStart(2, '0')}`;
        await shot(page, name);
        motion.push({ name: name + '.png', elapsedMs: Date.now() - start });
        await page.waitForTimeout(160);
      }
      await ready(page);
      await page.locator('#q-weight').click();
      start = Date.now();
      for (let i = 0; i < 6; i++) {
        const name = `motion/focus-${String(i).padStart(2, '0')}`;
        await shot(page, name);
        motion.push({ name: name + '.png', elapsedMs: Date.now() - start });
        await page.waitForTimeout(100);
      }
      await page.keyboard.press('Escape');
      await focusDone(page);
      await writeFile(
        new URL('motion/frames.json', out),
        JSON.stringify(motion, null, 2),
      );
    }
    const samples: Record<string, string>[] = [];
    for (let i = 0; i < 8; i++) {
      await page.waitForTimeout(800);
      samples.push(
        await page.locator('canvas').evaluate((c) => ({ ...c.dataset })),
      );
    }
    const gpu = await page.locator('canvas').evaluate((c) => {
      const gl = c.getContext('webgl2')!;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      return ext
        ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)
        : gl.getParameter(gl.RENDERER);
    });
    results.push({
      viewport: [width, height],
      dpr: 2,
      before,
      after,
      solved,
      samples,
      gpu,
    });
    if (width === 390) await shot(page, 'phone-layout-390-dpr2');
    await ctx.close();
  }
  // Reduced motion is instant, and storage failure leaves a usable in-memory lesson.
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    reducedMotion: 'reduce',
  });
  await ctx.addInitScript('window.__name = (value) => value');
  const page = await ctx.newPage();
  listen(page);
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      get() {
        throw new DOMException('Blocked', 'SecurityError');
      },
    });
  });
  await page.goto(base + '/prototype?view=stage');
  await ready(page);
  await page.locator('#q-weight').focus();
  await page.keyboard.press('Enter');
  await focusDone(page);
  assert.equal(await page.getByTestId('stage-explainer').count(), 1);
  await page.keyboard.press('Escape');
  await focusDone(page);
  await page
    .getByRole('button', { name: 'Train one step', exact: true })
    .click();
  await page.waitForTimeout(300);
  assert.ok((await observe(page)).params.weight > 0.5);
  await ctx.close();
  assert.deepEqual(errors, []);
  assert.deepEqual(consoleErrors, []);
  await writeFile(
    new URL('results.json', out),
    JSON.stringify(
      {
        capturedAt: new Date().toISOString(),
        source: 'current working tree; stage-smoke.mts',
        browser: browser.version(),
        hardware: execFileSync('sysctl', ['-n', 'machdep.cpu.brand_string'], {
          encoding: 'utf8',
        }).trim(),
        errors,
        consoleErrors,
        results,
      },
      null,
      2,
    ),
  );
  await rm(new URL('failure.json', out), { force: true });
  process.stdout.write(
    'Stage smoke passed; fresh screenshots and metrics: ' +
      fileURLToPath(out) +
      '\n',
  );
} catch (e) {
  await writeFile(
    new URL('failure.json', out),
    JSON.stringify(
      { error: String(e), errors, consoleErrors, results },
      null,
      2,
    ),
  );
  throw e;
} finally {
  await browser.close();
}
