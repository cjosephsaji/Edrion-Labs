/** Offline Rocket Stage smoke and fresh DPR2 evidence. Uses the real worker/runtime. */
import { chromium, type Page, type BrowserContext } from 'playwright-core';
import { browserExecutable } from './browser-executable';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  initial,
  observe as engineObserve,
  step,
  type Simulation,
} from '../simulations/runtime';
import { freshSession, lesson, STORAGE_KEY } from '../core/session-store';
import { rocketComparison } from '../core/teaching';
const base = process.env.PETROS_BASE_URL ?? 'http://127.0.0.1:3022';
const out = new URL(
  '../../../audit-screenshots/stage-rocket/',
  import.meta.url,
);
await mkdir(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: browserExecutable(),
  headless: true,
});
const errors: string[] = [],
  consoleErrors: string[] = [],
  paid: string[] = [],
  results: Record<string, unknown>[] = [];
interface Data {
  topic: string;
  params: Record<string, number | string>;
  observations: ReturnType<typeof engineObserve>;
  sim: Simulation;
  caption: string;
  guide: { phase: string; openingIndex: number };
  revision: number;
}
async function data(page: Page): Promise<Data> {
  return JSON.parse(
    (await page.locator('#petros-observations').textContent())!,
  );
}
async function ready(page: Page) {
  await page.waitForFunction(
    () =>
      document.querySelector('canvas')?.dataset.ready === 'true' &&
      document.querySelector('canvas')?.dataset.introComplete === 'true' &&
      document
        .querySelector('[data-testid="petros-stage"]')
        ?.getAttribute('data-camera-moving') === 'false',
  );
  await page.evaluate(() => document.fonts.ready);
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
  page.setDefaultTimeout(45000);
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });
  page.on('request', (r) => {
    if (/\/(teacher|teach|speech|voice)(\/|$|\?)/.test(r.url()))
      paid.push(r.url());
  });
}
async function range(page: Page, value: number) {
  await page.locator('#stage-throttle').evaluate((el, v) => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value',
    )!.set!.call(el, String(v));
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
  await page.waitForFunction(
    (v) =>
      JSON.parse(document.querySelector('#petros-observations')!.textContent!)
        .params.throttle === v,
    value,
  );
}
async function seed(context: BrowserContext, sim: Simulation) {
  const s = freshSession();
  s.active = 'rocket';
  s.topics.rocket = { ...lesson('rocket'), sim };
  await context.addInitScript(
    ({ key, value }) => localStorage.setItem(key, value),
    { key: STORAGE_KEY, value: JSON.stringify(s) },
  );
}
async function geometryChecks(page: Page) {
  const r = await page.evaluate(() => {
    const rect = (e: Element) => {
      const r = e.getBoundingClientRect();
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
      selected,
      card: card ? rect(card) : null,
      part: part ? rect(part) : null,
      overflow: document.documentElement.scrollWidth > innerWidth,
    };
  });
  const intersects = (
    a: { x: number; y: number; w: number; h: number },
    b: { x: number; y: number; w: number; h: number },
  ) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  assert.equal(r.overflow, false);
  for (let i = 0; i < r.labels.length; i++)
    for (let j = i + 1; j < r.labels.length; j++)
      assert.equal(
        intersects(r.labels[i], r.labels[j]),
        false,
        `Labels overlap: ${r.labels[i].id}/${r.labels[j].id}`,
      );
  if (r.card)
    for (const label of r.labels)
      assert.equal(
        intersects(r.card, label),
        false,
        `Explainer covers label ${label.id}`,
      );
  if (r.card && r.part)
    assert.equal(
      intersects(r.card, r.part),
      false,
      `Explainer covers ${r.selected}`,
    );
  return r;
}
async function frames(page: Page, folder: string, count: number, wait: number) {
  await mkdir(new URL(folder + '/', out), { recursive: true });
  const start = Date.now(),
    timing: Record<string, unknown>[] = [];
  for (let i = 0; i < count; i++) {
    const name = `${folder}/frame-${String(i).padStart(3, '0')}`;
    await shot(page, name);
    timing.push({
      file: name + '.png',
      atMs: Date.now() - start,
      flightTime: (await data(page)).sim.time,
    });
    await page.waitForTimeout(wait);
  }
  await writeFile(
    new URL(folder + '/timing.json', out),
    JSON.stringify(timing, null, 2),
  );
}
try {
  for (const [width, height] of [
    [1440, 900],
    [390, 844],
  ]) {
    const context = await browser.newContext({
      viewport: { width, height },
      deviceScaleFactor: 2,
    });
    await context.addInitScript('window.__name=(value)=>value');
    const page = await context.newPage();
    listen(page);
    await page.goto(base + '/prototype?view=stage&lesson=rocket');
    await ready(page);
    assert.equal((await data(page)).topic, 'rocket');
    assert.equal(await page.locator('canvas').count(), 1);
    assert.equal(
      await page.locator('canvas').evaluate((c) => c.width / c.clientWidth),
      2,
    );
    assert.equal(
      await page.locator('canvas').getAttribute('data-quality'),
      width === 390 ? 'low' : 'balanced',
    );
    await shot(page, `overview-${width}-dpr2`);
    const layout = await geometryChecks(page);
    for (let i = 0; i < 3; i++) {
      const t = (await data(page)).sim.time;
      await page.getByRole('button', { name: 'Step ½ s', exact: true }).click();
      await page.waitForFunction(
        (time) =>
          JSON.parse(
            document.querySelector('#petros-observations')!.textContent!,
          ).sim.time > time,
        t,
      );
    }
    const stepped = await data(page),
      expected = engineObserve(step(initial('rocket'), 1.5));
    for (const key of ['altitude', 'velocity', 'fuel'] as const)
      assert.ok(
        Math.abs(+stepped.observations[key] - +expected[key]) < 1e-7,
        key,
      );
    await page.waitForTimeout(650);
    await shot(page, `after-3-steps-${width}-dpr2`);
    const focusLayouts = [];
    for (const id of [
      'r-thrust',
      'r-velocity',
      'r-fuel',
      'r-landing',
      'r-gravity',
      'r-altitude',
      'r-falling',
      'r-mass',
    ]) {
      const before = await page
        .locator('canvas')
        .getAttribute('data-camera-position');
      await page.locator('#' + id).click();
      await page
        .locator(`[data-testid="stage-explainer"][data-chip="${id}"]`)
        .waitFor();
      await focusDone(page);
      await page.waitForTimeout(100);
      assert.notEqual(
        await page.locator('canvas').getAttribute('data-camera-position'),
        before,
      );
      focusLayouts.push({ id, ...(await geometryChecks(page)) });
      await shot(page, `${id}-${width}-dpr2`);
      assert.ok((await data(page)).caption.length > 20);
      await page.keyboard.press('Escape');
      await focusDone(page);
      assert.equal(await page.getByTestId('stage-explainer').count(), 0);
      assert.equal(
        await page.getByTestId('petros-stage').getAttribute('data-focus'),
        'overview',
      );
    }
    // Direct 3D lever drag and slider synchronize; neither changes elapsed time.
    await page.getByRole('button', { name: 'Reset', exact: true }).click();
    await page.waitForFunction(
      () =>
        JSON.parse(document.querySelector('#petros-observations')!.textContent!)
          .sim.time === 0,
    );
    await page.waitForTimeout(600);
    const lever = await page
      .locator('[data-stage-anchor="throttle"]')
      .boundingBox();
    assert.ok(lever);
    await page.mouse.move(
      lever.x + lever.width / 2,
      lever.y + lever.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      lever.x + lever.width / 2,
      lever.y + lever.height / 2 - 36,
      { steps: 6 },
    );
    await page.mouse.up();
    await page.waitForFunction(
      () =>
        JSON.parse(document.querySelector('#petros-observations')!.textContent!)
          .params.throttle >= 0.795,
    );
    assert.ok(Math.abs(+(await data(page)).params.throttle - 0.8) < 0.015);
    assert.equal((await data(page)).sim.time, 0);
    await range(page, 0.8);
    await page.getByRole('button', { name: 'Step ½ s', exact: true }).click();
    await page.waitForFunction(
      () =>
        JSON.parse(document.querySelector('#petros-observations')!.textContent!)
          .sim.time > 0.4,
    );
    const braking = await data(page);
    assert.ok(+braking.observations.velocity < 0);
    assert.ok(+braking.observations.acceleration > 0);
    await page.waitForTimeout(600);
    await shot(page, `braking-${width}-dpr2`);
    await page.getByRole('button', { name: 'Run flight', exact: true }).click();
    await page.waitForTimeout(350);
    const running = (await data(page)).sim.time;
    await range(page, 0.7);
    await page.waitForTimeout(350);
    assert.ok((await data(page)).sim.time > running);
    assert.equal(
      await page
        .getByRole('button', { name: 'Pause flight', exact: true })
        .count(),
      1,
    );
    await page
      .getByRole('button', { name: 'Pause flight', exact: true })
      .click();
    const stopped = (await data(page)).sim.time;
    await page.waitForTimeout(350);
    assert.equal((await data(page)).sim.time, stopped);
    await page.locator('#r-fuel').click();
    await focusDone(page);
    await page
      .getByRole('button', { name: 'Try it', exact: false })
      .first()
      .click();
    await page.waitForFunction(
      () =>
        JSON.parse(document.querySelector('#petros-observations')!.textContent!)
          .params.fuel === 0,
    );
    await page.waitForTimeout(1200);
    const empty = await data(page);
    assert.equal(+empty.observations.thrust, 0);
    assert.equal(empty.params.throttle, 1);
    await page.keyboard.press('Escape');
    await focusDone(page);
    await shot(page, `empty-tank-${width}-dpr2`);
    await page.getByRole('button', { name: 'Run flight', exact: true }).click();
    await page.waitForFunction(
      () =>
        JSON.parse(document.querySelector('#petros-observations')!.textContent!)
          .observations.status === 'crashed',
    );
    await page.waitForTimeout(250);
    assert.equal(
      await page
        .getByRole('button', { name: 'Run flight', exact: true })
        .isDisabled(),
      true,
    );
    await shot(page, `hard-impact-${width}-dpr2`);
    // Cancel delayed demos; a stale phase must not overwrite a subsequent reset.
    await page.locator('#r-thrust').click();
    await page
      .getByRole('button', { name: 'Try it', exact: false })
      .first()
      .click();
    await page.waitForTimeout(250);
    await page.getByRole('button', { name: 'Reset', exact: true }).click();
    await page.waitForTimeout(1600);
    assert.equal((await data(page)).params.throttle, 0.6);
    assert.equal((await data(page)).sim.time, 0);
    if (width === 1440) {
      await page
        .locator('nav[aria-label="Stage lessons"] button[aria-current="page"]')
        .click();
      await frames(page, 'intro', 12, 80);
      await ready(page);
      await page.locator('#r-fuel').click();
      await frames(page, 'focus', 10, 80);
      await focusDone(page);
      await page.keyboard.press('Escape');
      await focusDone(page);
    }
    // Reuse and animate the exact pre-existing timed burn, then stop at terminal contact.
    await page.locator('#r-landing').click();
    await focusDone(page);
    await page
      .getByRole('button', { name: 'Try it', exact: false })
      .first()
      .click();
    if (width === 1440) await frames(page, 'prepared-landing', 16, 220);
    await page.waitForFunction(
      () =>
        JSON.parse(document.querySelector('#petros-observations')!.textContent!)
          .observations.status === 'landed',
    );
    await page.waitForTimeout(1500);
    await focusDone(page);
    const landed = await data(page),
      reference = engineObserve(rocketComparison().timed);
    assert.equal(+landed.observations.altitude, 0);
    assert.ok(
      Math.abs(+landed.observations.velocity - +reference.velocity) < 1e-8,
    );
    assert.equal(
      await page
        .getByRole('button', { name: 'Run flight', exact: true })
        .isDisabled(),
      true,
    );
    await shot(page, `soft-landing-focus-${width}-dpr2`);
    await page.keyboard.press('Escape');
    await focusDone(page);
    await page.waitForTimeout(300);
    await shot(page, `soft-landing-${width}-dpr2`);
    await geometryChecks(page);
    // Topic switching and reload preserve each lesson independently.
    const saved = (await data(page)).sim;
    await page
      .getByRole('button', { name: 'Neural learning', exact: true })
      .click();
    await ready(page);
    assert.equal((await data(page)).topic, 'neural');
    await page
      .getByRole('button', { name: 'Rocket landing', exact: true })
      .click();
    await ready(page);
    assert.deepEqual((await data(page)).sim, saved);
    await page.reload();
    await ready(page);
    assert.deepEqual((await data(page)).sim, saved);
    assert.equal(
      await page.locator('[class*="firstHint"]').getAttribute('data-visible'),
      'false',
    );
    results.push({
      viewport: [width, height],
      dpr: 2,
      canvas: await page.locator('canvas').evaluate((c) => ({ ...c.dataset })),
      stepped: stepped.observations,
      braking: braking.observations,
      empty: empty.observations,
      landed: landed.observations,
      layout,
      focusLayouts,
    });
    await context.close();
  }
  // Engine-driven crash fixture, not a visual-only failure flag.
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  });
  await context.addInitScript('window.__name=(value)=>value');
  await seed(context, step(initial('rocket', { throttle: 0 }), 20));
  const page = await context.newPage();
  listen(page);
  await page.goto(base + '/prototype?view=stage&lesson=rocket');
  await ready(page);
  assert.equal((await data(page)).observations.status, 'crashed');
  await shot(page, 'hard-impact-1440-dpr2');
  await context.close();
  // Reduced motion is immediate, and storage failure still permits an offline flight.
  const reduced = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    reducedMotion: 'reduce',
  });
  await reduced.addInitScript(
    'window.__name=(value)=>value;Storage.prototype.getItem=function(){throw Error("blocked storage")};Storage.prototype.setItem=function(){throw Error("blocked storage")}',
  );
  const rp = await reduced.newPage();
  listen(rp);
  await rp.goto(base + '/prototype?view=stage&lesson=rocket');
  await ready(rp);
  await rp.locator('#r-fuel').click();
  await focusDone(rp);
  await rp.keyboard.press('Escape');
  await rp.getByRole('button', { name: 'Step ½ s', exact: true }).click();
  await rp.waitForFunction(
    () =>
      JSON.parse(document.querySelector('#petros-observations')!.textContent!)
        .sim.time > 0.4,
  );
  await reduced.close();
  assert.deepEqual(errors, []);
  assert.deepEqual(consoleErrors, []);
  assert.deepEqual(paid, []);
  await writeFile(
    new URL('smoke-results.json', out),
    JSON.stringify(
      {
        at: new Date().toISOString(),
        source: 'current Rocket Stage working tree',
        browser: browser.version(),
        hardware: execFileSync('sysctl', ['-n', 'machdep.cpu.brand_string'], {
          encoding: 'utf8',
        }).trim(),
        errors,
        consoleErrors,
        paid,
        results,
      },
      null,
      2,
    ),
  );
  process.stdout.write('Rocket Stage smoke and evidence passed.\n');
} finally {
  await browser.close();
}
