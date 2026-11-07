/** Offline Traffic Stage smoke, actual engine outcomes and fresh DPR2 evidence. */
import { chromium, type Page } from 'playwright-core';
import { browserExecutable } from './browser-executable';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  observe as engineObserve,
  type Simulation,
} from '../simulations/runtime';
const base = process.env.PETROS_BASE_URL ?? 'http://127.0.0.1:3022';
const out = new URL(
  '../../../audit-screenshots/stage-traffic/',
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
  params: Simulation['params'];
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
      footer: rect(document.querySelector('footer')!),
      overflow: document.documentElement.scrollWidth > innerWidth,
    };
  });
  const intersects = (
    a: { x: number; y: number; w: number; h: number },
    b: { x: number; y: number; w: number; h: number },
  ) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  assert.equal(r.overflow, false);
  for (const label of r.labels)
    assert.equal(
      intersects(label, r.footer),
      false,
      `Label covers the edge HUD: ${label.id}`,
    );
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
    const snapshot = await data(page);
    if (folder === 'wave') await geometryChecks(page);
    timing.push({
      file: name + '.png',
      atMs: Date.now() - start,
      modelTime: snapshot.sim.time,
      boundaryCar: snapshot.observations.jamFrontCar,
      boundaryPosition: snapshot.observations.jamFrontPosition,
      boundaryExists: snapshot.observations.jamFrontExists,
      witnessPosition: snapshot.sim.data.traffic!.cars.find(
        (c) => c.id === 'car_0',
      )!.position,
    });
    await page.waitForTimeout(wait);
  }
  await writeFile(
    new URL(folder + '/timing.json', out),
    JSON.stringify(timing, null, 2),
  );
}
async function range(page: Page, id: string, value: number) {
  await page.locator('#stage-' + id).evaluate((el, v) => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value',
    )!.set!.call(el, String(v));
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
  await page.waitForFunction(
    ({ id, v }) =>
      JSON.parse(document.querySelector('#petros-observations')!.textContent!)
        .params[id] === v,
    { id, v: value },
  );
}
async function reset(page: Page) {
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  await page.waitForFunction(
    () =>
      JSON.parse(document.querySelector('#petros-observations')!.textContent!)
        .sim.time === 0,
  );
  await focusDone(page);
  await page.waitForTimeout(350);
}
async function pause(page: Page) {
  if (
    await page.getByRole('button', { name: 'Pause road', exact: true }).count()
  )
    await page.getByRole('button', { name: 'Pause road', exact: true }).click();
  await page.waitForTimeout(100);
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
    await page.goto(base + '/prototype?view=stage&lesson=traffic');
    await ready(page);
    assert.equal((await data(page)).topic, 'traffic');
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
    // Initially the car and wave share an anchor: both pills must still fit.
    await page
      .getByRole('button', { name: 'Brake & watch', exact: true })
      .click();
    await page.getByRole('button', { name: 'Pause road', exact: true }).click();
    await page.waitForTimeout(250);
    assert.equal((await data(page)).observations.jamFrontExists, true);
    await geometryChecks(page);
    await shot(page, `immediate-brake-${width}-dpr2`);
    await reset(page);
    // One tap applies the original brake and starts actual engine playback.
    await page
      .getByRole('button', { name: 'Brake & watch', exact: true })
      .click();
    await page.waitForFunction(
      () =>
        JSON.parse(document.querySelector('#petros-observations')!.textContent!)
          .sim.time >= 6,
    );
    await pause(page);
    const wave = await data(page);
    assert.equal(wave.sim.running, false);
    assert.ok(+wave.observations.speedSpread > 2);
    assert.equal(wave.observations.jamFrontExists, true);
    assert.ok(
      Math.abs(
        +wave.observations.meanSpeed - +engineObserve(wave.sim).meanSpeed,
      ) < 1e-8,
    );
    await page.waitForTimeout(400);
    await shot(page, `braked-wave-${width}-dpr2`);
    await geometryChecks(page);
    const focusLayouts = [];
    for (const id of [
      't-cars',
      't-brake',
      't-wave',
      't-ribbon',
      't-speed',
      't-gap',
      't-headway',
      't-density',
      't-identity',
    ]) {
      await page.locator('#' + id).click();
      await page
        .locator(`[data-testid="stage-explainer"][data-chip="${id}"]`)
        .waitFor();
      await focusDone(page);
      await page.waitForTimeout(150);
      focusLayouts.push({ id, ...(await geometryChecks(page)) });
      await shot(page, `${id}-${width}-dpr2`);
      await page.keyboard.press('Escape');
      await focusDone(page);
      assert.equal(await page.getByTestId('stage-explainer').count(), 0);
    }
    // Direct headway dial drag is the same parameter as the accessible slider.
    await reset(page);
    const dial = await page
      .locator('[data-stage-anchor="headway"]')
      .boundingBox();
    assert.ok(dial);
    await page.mouse.move(dial.x + dial.width / 2, dial.y + dial.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      dial.x + dial.width / 2 + 90,
      dial.y + dial.height / 2,
      { steps: 8 },
    );
    await page.mouse.up();
    await page.waitForFunction(
      () =>
        JSON.parse(document.querySelector('#petros-observations')!.textContent!)
          .params.headway >= 1.69,
    );
    assert.equal((await data(page)).params.headway, 1.7);
    assert.equal((await data(page)).sim.time, 0);
    await range(page, 'headway', 1.2);
    await page.getByRole('button', { name: 'Run road', exact: true }).click();
    await page.waitForTimeout(350);
    const beforeChange = (await data(page)).sim.time;
    await range(page, 'headway', 2);
    await page.waitForTimeout(450);
    assert.ok((await data(page)).sim.time > beforeChange);
    await pause(page);
    // A synchronous Escape must cancel the pending automatic start as well as narration.
    await reset(page);
    await page
      .getByRole('button', { name: 'Brake & watch', exact: true })
      .evaluate((el) => {
        (el as HTMLButtonElement).click();
        window.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
        );
      });
    await page.waitForTimeout(700);
    assert.equal((await data(page)).sim.time, 0);
    assert.equal(
      await page.getByRole('button', { name: 'Run road', exact: true }).count(),
      1,
    );
    // Count and desired-speed controls use engine validation; a count change resets the road.
    await page
      .getByRole('button', { name: 'Lesson & settings', exact: true })
      .click();
    await range(page, 'count', 45);
    await range(page, 'desiredSpeed', 28);
    await page
      .getByRole('button', { name: 'Close lesson and settings', exact: true })
      .click();
    await page.waitForTimeout(350);
    assert.equal((await data(page)).sim.data.traffic!.cars.length, 45);
    assert.equal((await data(page)).sim.time, 0);
    await shot(page, `forty-five-cars-${width}-dpr2`);
    await geometryChecks(page);
    await page
      .getByRole('button', { name: 'Brake & watch', exact: true })
      .click();
    await page.waitForFunction(
      () =>
        JSON.parse(document.querySelector('#petros-observations')!.textContent!)
          .sim.time >= 2,
    );
    await pause(page);
    assert.equal((await data(page)).sim.data.traffic!.cars.length, 45);
    await shot(page, `dense-wave-${width}-dpr2`);
    await reset(page);
    await page
      .getByRole('button', { name: 'Lesson & settings', exact: true })
      .click();
    await range(page, 'count', 5);
    await page
      .getByRole('button', { name: 'Close lesson and settings', exact: true })
      .click();
    await page.waitForTimeout(300);
    assert.equal((await data(page)).observations.jamFrontExists, false);
    await shot(page, `five-cars-no-front-${width}-dpr2`);
    await geometryChecks(page);
    await reset(page);
    await page.locator('#t-headway').click();
    await page
      .getByRole('button', { name: 'Try it', exact: false })
      .first()
      .click();
    await page.waitForFunction(
      () =>
        JSON.parse(document.querySelector('#petros-observations')!.textContent!)
          .sim.time > 47.9,
    );
    const short = await data(page);
    await page.waitForFunction(
      () =>
        JSON.parse(document.querySelector('#petros-observations')!.textContent!)
          .params.headway === 2.4,
    );
    const longer = await data(page);
    assert.ok(
      +longer.observations.speedSpread < +short.observations.speedSpread,
    );
    await page.waitForTimeout(350);
    await shot(page, `more-following-time-${width}-dpr2`);
    // A cancelled prepared wave cannot restore a stale future snapshot.
    await page.locator('#t-wave').click();
    await page
      .getByRole('button', { name: 'Try it', exact: false })
      .first()
      .click();
    await page.waitForTimeout(650);
    await page.keyboard.press('Escape');
    const frozen = (await data(page)).sim;
    await page.waitForTimeout(900);
    assert.deepEqual((await data(page)).sim, frozen);
    await reset(page);
    if (width === 1440) {
      await page
        .locator('nav[aria-label="Stage lessons"] button[aria-current="page"]')
        .click();
      await frames(page, 'intro', 12, 80);
      await ready(page);
      await page.locator('#t-speed').click();
      await frames(page, 'focus', 10, 80);
      await focusDone(page);
      await page.keyboard.press('Escape');
      await focusDone(page);
      await page.locator('#t-identity').click();
      await page
        .getByRole('button', { name: 'Try it', exact: false })
        .first()
        .click();
      await frames(page, 'wave', 20, 300);
      await page.waitForFunction(
        () =>
          JSON.parse(
            document.querySelector('#petros-observations')!.textContent!,
          ).sim.time >= 44.9,
      );
      await page.waitForTimeout(300);
      await shot(page, 'prepared-wave-final-1440-dpr2');
      await page.keyboard.press('Escape');
      await focusDone(page);
    }
    await range(page, 'headway', 1.8);
    const saved = (await data(page)).sim;
    await page.getByRole('button', { name: 'Attention', exact: true }).click();
    await ready(page);
    assert.equal((await data(page)).topic, 'attention');
    await page
      .getByRole('button', { name: 'Traffic waves', exact: true })
      .click();
    await ready(page);
    assert.deepEqual((await data(page)).sim, saved);
    await page.reload();
    await ready(page);
    assert.deepEqual((await data(page)).sim, saved);
    const qualityCycle: Record<string, unknown>[] = [];
    if (width === 1440) {
      // AO needs resolved depth; returning to Balanced must remove that cost
      // without changing the committed road or breaking color SMAA.
      for (const quality of ['high', 'low', 'balanced']) {
        await page
          .getByRole('button', { name: 'Lesson & settings', exact: true })
          .click();
        await page
          .getByLabel('Stage quality', { exact: true })
          .selectOption(quality);
        await page
          .getByRole('button', {
            name: 'Close lesson and settings',
            exact: true,
          })
          .click();
        await page.waitForFunction(
          (q) => document.querySelector('canvas')?.dataset.quality === q,
          quality,
        );
        await page.waitForTimeout(350);
        assert.deepEqual((await data(page)).sim, saved);
        if (quality !== 'balanced')
          await shot(page, `quality-${quality}-1440-dpr2`);
        qualityCycle.push({
          quality,
          canvas: await page
            .locator('canvas')
            .evaluate((c) => ({ ...c.dataset })),
        });
      }
    }
    results.push({
      viewport: [width, height],
      dpr: 2,
      wave: wave.observations,
      comparison: { short: short.observations, longer: longer.observations },
      layout,
      focusLayouts,
      qualityCycle,
      canvas: await page.locator('canvas').evaluate((c) => ({ ...c.dataset })),
    });
    await context.close();
  }
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    reducedMotion: 'reduce',
  });
  await context.addInitScript(
    'window.__name=(value)=>value;Storage.prototype.getItem=function(){throw Error("blocked storage")};Storage.prototype.setItem=function(){throw Error("blocked storage")}',
  );
  const page = await context.newPage();
  listen(page);
  await page.goto(base + '/prototype?view=stage&lesson=traffic');
  await ready(page);
  await page.locator('#t-gap').click();
  await focusDone(page);
  await page.keyboard.press('Escape');
  await page
    .getByRole('button', { name: 'Brake & watch', exact: true })
    .click();
  await page.waitForFunction(
    () =>
      JSON.parse(document.querySelector('#petros-observations')!.textContent!)
        .sim.time >= 0.4,
  );
  await pause(page);
  await context.close();
  assert.deepEqual(errors, []);
  assert.deepEqual(consoleErrors, []);
  assert.deepEqual(paid, []);
  await rm(new URL('failure.json', out), { force: true });
  await writeFile(
    new URL('smoke-results.json', out),
    JSON.stringify(
      {
        at: new Date().toISOString(),
        source: 'current Traffic Stage working tree',
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
  process.stdout.write('Traffic Stage smoke and evidence passed.\n');
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
