/** Offline clock/coordinate checks and fresh DPR2 evidence from the real worker. */
import { chromium, type Page } from 'playwright-core';
import { browserExecutable } from './browser-executable';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { observe, type Simulation } from '../simulations/runtime';
const base = process.env.PETROS_BASE_URL ?? 'http://127.0.0.1:3022',
  out = new URL(
    '../../../audit-screenshots/stage-relativity/',
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
type Data = {
  topic: string;
  sim: Simulation;
  observations: ReturnType<typeof observe>;
  caption: string;
  params: Simulation['params'];
  guide: { phase: string };
};
const data = async (page: Page): Promise<Data> =>
  JSON.parse((await page.locator('#petros-observations').textContent())!);
async function focusDone(page: Page) {
  await page.waitForFunction(
    () =>
      document
        .querySelector('[data-testid="petros-stage"]')
        ?.getAttribute('data-camera-moving') === 'false',
  );
}
async function ready(page: Page) {
  await page.waitForFunction(
    () =>
      document.querySelector('canvas')?.dataset.ready === 'true' &&
      document.querySelector('canvas')?.dataset.introComplete === 'true',
  );
  await focusDone(page);
  await page.evaluate(() => document.fonts.ready);
}
const shot = (page: Page, name: string) =>
  page.screenshot({ path: fileURLToPath(new URL(name + '.png', out)) });
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
    ({ id, value }) =>
      JSON.parse(document.querySelector('#petros-observations')!.textContent!)
        .params[id] === value,
    { id, value },
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
  await page.waitForTimeout(200);
}
async function layout(page: Page) {
  const result = await page.evaluate(() => {
    const rect = (e: Element) => {
        const r = e.getBoundingClientRect();
        return { x: r.x, y: r.y, w: r.width, h: r.height };
      },
      selected = document
        .querySelector('[data-testid="petros-stage"]')
        ?.getAttribute('data-focus'),
      part = Array.from(document.querySelectorAll('[data-stage-anchor]')).find(
        (p) => p.getAttribute('data-stage-anchor') === selected,
      ),
      card = document.querySelector('[data-testid="stage-explainer"]');
    return {
      selected,
      labels: Array.from(
        document.querySelectorAll<HTMLElement>('[data-stage-label]'),
      )
        .filter((p) => +p.style.opacity > 0.3)
        .map((p) => ({ id: p.dataset.stageLabel, ...rect(p) })),
      part: part ? rect(part) : null,
      card: card ? rect(card) : null,
      footer: rect(document.querySelector('footer')!),
      header: rect(document.querySelector('header')!),
      overflow: document.documentElement.scrollWidth > innerWidth,
      zero: document.querySelector<HTMLElement>('[data-stage-ruler="0"]')?.style
        .opacity,
    };
  });
  const intersects = (
    a: { x: number; y: number; w: number; h: number },
    b: { x: number; y: number; w: number; h: number },
  ) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  assert.equal(result.overflow, false);
  for (const label of result.labels) {
    if (label.id === result.selected && result.part)
      assert.equal(
        intersects(label, result.part),
        false,
        'label covers its focused clock: ' + label.id,
      );
    assert.equal(
      intersects(label, result.footer),
      false,
      'label covers footer: ' + label.id,
    );
    assert.equal(
      intersects(label, result.header),
      false,
      'label covers header: ' + label.id,
    );
    if (result.card)
      assert.equal(
        intersects(label, result.card),
        false,
        'label covers card: ' + label.id,
      );
  }
  for (let i = 0; i < result.labels.length; i++)
    for (let j = i + 1; j < result.labels.length; j++)
      assert.equal(
        intersects(result.labels[i], result.labels[j]),
        false,
        'clock labels collide',
      );
  if (result.part && result.card)
    assert.equal(
      intersects(result.part, result.card),
      false,
      'explainer covers actual focused geometry: ' + result.selected,
    );
  if (result.part && result.card) {
    const { width, height } = page.viewportSize()!;
    assert.ok(
      result.part.x >= 0 &&
        result.part.y >= 0 &&
        result.part.x + result.part.w <= width &&
        result.part.y + result.part.h <= height,
      'focused part clipped',
    );
  }
  return result;
}
async function sequence(
  page: Page,
  folder: string,
  count: number,
  delay: number,
) {
  const dir = new URL(folder + '/', out);
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  const start = performance.now(),
    timing: Record<string, unknown>[] = [];
  for (let i = 0; i < count; i++) {
    await page.waitForTimeout(delay);
    await page.screenshot({
      path: fileURLToPath(
        new URL(`frame-${String(i).padStart(3, '0')}.png`, dir),
      ),
    });
    const d = await data(page);
    timing.push({
      frame: i,
      actualWallMs: performance.now() - start,
      earthClock: d.observations.earthClock,
      shipClock: d.observations.shipClock,
      beta: d.params.beta,
      frameCoordinates: d.params.frame,
      selectedEarthSeconds: d.params.duration,
    });
  }
  await writeFile(new URL('timing.json', dir), JSON.stringify(timing, null, 2));
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
    page.setDefaultTimeout(45000);
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') consoleErrors.push(m.text());
    });
    page.on('request', (r) => {
      if (/\/(teacher|teach|speech|voice)(\/|$|\?)/.test(r.url()))
        paid.push(r.url());
    });
    await page.goto(base + '/prototype?view=stage&lesson=relativity');
    await ready(page);
    assert.equal((await data(page)).topic, 'relativity');
    assert.equal(await page.locator('canvas').count(), 1);
    assert.equal(
      await page.locator('canvas').evaluate((c) => c.width / c.clientWidth),
      2,
    );
    await shot(page, `overview-${width}-dpr2`);
    const overview = await layout(page);
    assert.equal(overview.zero, '1');
    for (let i = 0; i < 3; i++) {
      await page.getByRole('button', { name: 'Step 1 s', exact: true }).click();
      await page.waitForFunction(
        (n) =>
          JSON.parse(
            document.querySelector('#petros-observations')!.textContent!,
          ).sim.time >=
          n - 1e-8,
        i + 1,
      );
    }
    const three = await data(page);
    assert.ok(Math.abs(+three.observations.shipClock - 1.8) < 1e-8);
    await shot(page, `after-three-steps-${width}-dpr2`);
    await page.getByRole('button', { name: 'Run clocks', exact: true }).click();
    await page.waitForFunction(
      () =>
        JSON.parse(document.querySelector('#petros-observations')!.textContent!)
          .sim.time >=
        10 - 1e-8,
    );
    await page.waitForTimeout(300);
    assert.equal(
      await page
        .getByRole('button', { name: 'Pause clocks', exact: true })
        .count(),
      0,
    );
    const complete = await data(page);
    assert.ok(Math.abs(+complete.observations.shipClock - 6) < 1e-8);
    await shot(page, `complete-${width}-dpr2`);
    const focusLayouts: Record<string, unknown>[] = [];
    for (const id of [
      'td-clocks',
      'td-ship',
      'td-speed',
      'td-gamma',
      'td-light',
      'td-interval',
      'td-frame',
      'td-limit',
      'td-return',
    ]) {
      await page.locator('#' + id).click();
      await page.getByTestId('stage-explainer').waitFor();
      await focusDone(page);
      assert.equal(
        await page.getByTestId('stage-explainer').getAttribute('data-chip'),
        id,
      );
      focusLayouts.push({ id, ...(await layout(page)) });
      await shot(page, `${id}-${width}-dpr2`);
      await page.keyboard.press('Escape');
      await focusDone(page);
      assert.equal(
        await page.getByTestId('petros-stage').getAttribute('data-focus'),
        'overview',
      );
    }
    for (const [beta, name] of [
      [0, 'zero-speed'],
      [0.99, 'near-light'],
      [0.999, 'limit-speed'],
    ] as const) {
      await range(page, 'beta', beta);
      await page.waitForTimeout(350);
      const d = await data(page);
      assert.equal(+d.observations.shipClock, +observe(d.sim).shipClock);
      if (!beta)
        assert.equal(d.observations.earthClock, d.observations.shipClock);
      await shot(page, `${name}-${width}-dpr2`);
    }
    await page
      .getByRole('button', { name: 'Lesson & settings', exact: true })
      .click();
    await range(page, 'duration', 120);
    await page
      .getByRole('button', { name: 'Close lesson and settings', exact: true })
      .click();
    await page.locator('#td-clocks').click();
    await focusDone(page);
    await page.getByRole('button', { name: /^Try it/ }).click();
    await page.waitForFunction(
      () =>
        JSON.parse(document.querySelector('#petros-observations')!.textContent!)
          .sim.time >=
        120 - 1e-7,
    );
    const long = await data(page);
    assert.ok(
      Math.abs(+long.observations.shipClock - +long.observations.shipSeconds) <
        1e-7,
    );
    await shot(page, `long-interval-${width}-dpr2`);
    await page.keyboard.press('Escape');
    await focusDone(page);
    await page
      .getByRole('button', { name: 'Lesson & settings', exact: true })
      .click();
    await page
      .getByLabel('Diagram coordinates', { exact: true })
      .selectOption('ship');
    await page.waitForFunction(
      () =>
        JSON.parse(document.querySelector('#petros-observations')!.textContent!)
          .params.frame === 'ship',
    );
    const coordinates = await data(page);
    assert.equal(
      coordinates.observations.earthClock,
      long.observations.earthClock,
    );
    assert.equal(
      coordinates.observations.shipClock,
      long.observations.shipClock,
    );
    await page
      .getByRole('button', { name: 'Close lesson and settings', exact: true })
      .click();
    await page.locator('#td-frame').click();
    await focusDone(page);
    await layout(page);
    await shot(page, `ship-coordinates-${width}-dpr2`);
    await page.keyboard.press('Escape');
    await focusDone(page);
    await reset(page);
    // Actual pointer hits and drag on the specimen, not just DOM sliders.
    const dial = await page
      .locator('[data-stage-anchor="speed"]')
      .boundingBox();
    assert.ok(dial);
    await page.mouse.move(dial.x + dial.width / 2, dial.y + dial.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      dial.x + dial.width / 2 - 96,
      dial.y + dial.height / 2,
      { steps: 5 },
    );
    await page.mouse.up();
    await page.waitForFunction(
      () =>
        +JSON.parse(
          document.querySelector('#petros-observations')!.textContent!,
        ).params.beta < 0.8,
    );
    const dragged = await data(page);
    assert.equal(
      +(await page.locator('#stage-beta').inputValue()),
      +dragged.params.beta,
    );
    await reset(page);
    await page.getByRole('button', { name: 'Run clocks', exact: true }).click();
    await page.waitForTimeout(350);
    await range(page, 'beta', 0.4);
    await page.waitForTimeout(150);
    const paused = await data(page);
    await page.waitForTimeout(400);
    assert.equal((await data(page)).sim.time, paused.sim.time);
    await reset(page);
    await page.locator('#td-clocks').click();
    await focusDone(page);
    await page.getByRole('button', { name: /^Try it/ }).click();
    await page.waitForTimeout(350);
    await page.keyboard.press('Escape');
    await focusDone(page);
    const cancelled = await data(page);
    await page.waitForTimeout(700);
    assert.deepEqual((await data(page)).sim, cancelled.sim);
    if (width === 1440) {
      await reset(page);
      await page
        .getByRole('navigation', { name: 'Stage lessons' })
        .locator('[aria-current="page"]')
        .click();
      await sequence(page, 'intro', 12, 140);
      await ready(page);
      await page.locator('#td-ship').click();
      await sequence(page, 'focus', 10, 110);
      await focusDone(page);
      await page.keyboard.press('Escape');
      await focusDone(page);
      await page
        .getByRole('button', { name: 'Run clocks', exact: true })
        .click();
      await sequence(page, 'clocks', 16, 550);
      await page.waitForFunction(
        () =>
          JSON.parse(
            document.querySelector('#petros-observations')!.textContent!,
          ).sim.time >=
          10 - 1e-8,
      );
      await shot(page, 'run-final-1440-dpr2');
      const snapshot = (await data(page)).sim;
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
        await page.waitForTimeout(600);
        assert.deepEqual((await data(page)).sim, snapshot);
        if (quality !== 'balanced')
          await shot(page, `quality-${quality}-1440-dpr2`);
      }
    }
    await range(page, 'beta', 0.75);
    const saved = (await data(page)).sim;
    await page
      .getByRole('button', { name: 'Traffic waves', exact: true })
      .click();
    await ready(page);
    await page
      .getByRole('button', { name: 'Time dilation', exact: true })
      .click();
    await ready(page);
    assert.deepEqual((await data(page)).sim, saved);
    await page.reload();
    await ready(page);
    assert.deepEqual((await data(page)).sim, saved);
    await page.locator('#stage-beta').focus();
    await page.keyboard.press('Home');
    await page.waitForFunction(
      () =>
        +JSON.parse(
          document.querySelector('#petros-observations')!.textContent!,
        ).params.beta === 0,
    );
    const focusStyle = await page
      .locator('#stage-beta')
      .evaluate((e) => getComputedStyle(e).outlineStyle);
    assert.equal(focusStyle, 'solid');
    results.push({
      viewport: [width, height],
      overview,
      three,
      complete,
      long,
      coordinates,
      dragged,
      cancelled,
      focusLayouts,
      recovered: true,
      keyboard: true,
    });
    await context.close();
  }
  const reduced = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: 'reduce',
  });
  await reduced.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      get() {
        throw Error('blocked storage');
      },
    });
  });
  await reduced.addInitScript('window.__name=(value)=>value');
  const page = await reduced.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(base + '/prototype?view=stage&lesson=relativity');
  await ready(page);
  await page.locator('#td-gamma').click();
  await focusDone(page);
  await page.getByTestId('stage-explainer').waitFor();
  await reduced.close();
  assert.deepEqual(errors, []);
  assert.deepEqual(consoleErrors, []);
  assert.deepEqual(paid, []);
  await writeFile(
    new URL('smoke-results.json', out),
    JSON.stringify(
      {
        at: new Date().toISOString(),
        errors,
        consoleErrors,
        paid,
        reducedMotion: true,
        blockedStorage: true,
        results,
      },
      null,
      2,
    ),
  );
  process.stdout.write(
    'Time dilation Stage smoke and fresh evidence passed.\n',
  );
} finally {
  await browser.close();
}
