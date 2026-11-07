/** Offline Attention Stage smoke, geometric checks and fresh DPR2 captures. */
import { chromium, type Page } from 'playwright-core';
import { browserExecutable } from './browser-executable';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  initial,
  observe as engineObserve,
  type Simulation,
} from '../simulations/runtime';
const base = process.env.PETROS_BASE_URL ?? 'http://127.0.0.1:3022';
const out = new URL(
  '../../../audit-screenshots/stage-attention/',
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
      query: (await data(page)).params.query,
    });
    await page.waitForTimeout(wait);
  }
  await writeFile(
    new URL(folder + '/timing.json', out),
    JSON.stringify(timing, null, 2),
  );
}
// Node and Chromium may differ by one ulp in Math.exp; preserve exact zeros separately.
function near(a: unknown, b: unknown): void {
  if (typeof a === 'number' && typeof b === 'number') {
    assert.ok(Math.abs(a - b) < 1e-12, `${a} != ${b}`);
    return;
  }
  if (
    typeof a === 'string' &&
    typeof b === 'string' &&
    a.startsWith('[') &&
    b.startsWith('[')
  ) {
    near(JSON.parse(a), JSON.parse(b));
    return;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    assert.equal(a.length, b.length);
    a.forEach((v, i) => near(v, b[i]));
    return;
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const aa = a as Record<string, unknown>,
      bb = b as Record<string, unknown>;
    assert.deepEqual(Object.keys(aa), Object.keys(bb));
    for (const key of Object.keys(aa)) near(aa[key], bb[key]);
    return;
  }
  assert.deepEqual(a, b);
}
async function selectQuery(page: Page, value: number) {
  await page.locator('#stage-query').selectOption(String(value));
  await page.waitForFunction(
    (q) =>
      JSON.parse(document.querySelector('#petros-observations')!.textContent!)
        .params.query === q,
    value,
  );
}
async function sentence(page: Page, value: string) {
  await page
    .getByRole('button', { name: 'Lesson & settings', exact: true })
    .click();
  await page.getByLabel('Sentence', { exact: true }).fill(value);
  await page
    .getByRole('button', { name: 'Apply sentence', exact: true })
    .click();
  await page.waitForFunction(
    (s) =>
      JSON.parse(document.querySelector('#petros-observations')!.textContent!)
        .params.tokens === s,
    value,
  );
  await page
    .getByRole('button', { name: 'Close lesson and settings', exact: true })
    .click();
  await page.keyboard.press('Escape');
  await focusDone(page);
  await page.waitForTimeout(400);
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
    await page.goto(base + '/prototype?view=stage&lesson=attention');
    await ready(page);
    assert.equal((await data(page)).topic, 'attention');
    assert.equal(await page.locator('canvas').count(), 1);
    assert.equal(
      await page.locator('canvas').evaluate((c) => c.width / c.clientWidth),
      2,
    );
    assert.equal(
      await page.locator('canvas').getAttribute('data-quality'),
      width === 390 ? 'low' : 'balanced',
    );
    const initialState = await data(page);
    await shot(page, `overview-${width}-dpr2`);
    const layout = await geometryChecks(page);
    for (let i = 0; i < 3; i++) {
      await page
        .getByRole('button', { name: 'Next word', exact: true })
        .click();
      await page.waitForFunction(
        (q) =>
          JSON.parse(
            document.querySelector('#petros-observations')!.textContent!,
          ).params.query === q,
        i,
      );
    }
    assert.equal((await data(page)).sim.time, 0);
    near(
      (await data(page)).observations,
      engineObserve(initial('attention', { query: 2 })),
    );
    await page.waitForTimeout(400);
    await shot(page, `after-3-query-changes-${width}-dpr2`);
    const focusLayouts = [];
    for (const id of [
      'a-query',
      'a-token',
      'a-beams',
      'a-weights',
      'a-mask',
      'a-qkv',
      'a-context',
      'a-swap',
      'a-chatgpt',
    ]) {
      const before = await page
        .locator('canvas')
        .getAttribute('data-camera-position');
      await page.locator('#' + id).click();
      await page
        .locator(`[data-testid="stage-explainer"][data-chip="${id}"]`)
        .waitFor();
      await focusDone(page);
      await page.waitForTimeout(150);
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
    }
    // Query/mask changes go through the real worker; future shares are exactly zero.
    await selectQuery(page, 0);
    await focusDone(page);
    await page.waitForTimeout(400);
    let observed = await data(page);
    assert.deepEqual(
      JSON.parse(String(observed.observations.weights))[0],
      [1, 0, 0, 0, 0],
    );
    await shot(page, `first-word-masked-${width}-dpr2`);
    await geometryChecks(page);
    await page.locator('[data-stage-toggle="causal"]').click();
    await page.waitForFunction(
      () =>
        JSON.parse(document.querySelector('#petros-observations')!.textContent!)
          .params.causal === false,
    );
    await page.waitForTimeout(400);
    observed = await data(page);
    assert.ok(
      JSON.parse(String(observed.observations.weights))[0].every(
        (w: number) => w > 0,
      ),
    );
    near(
      observed.observations,
      engineObserve(initial('attention', { query: 0, causal: false })),
    );
    await shot(page, `first-word-unmasked-${width}-dpr2`);
    // A real word tablet selects that query and opens its explanation.
    const token = await page
      .locator('[data-stage-anchor="token-1"]')
      .boundingBox();
    assert.ok(token);
    await page.mouse.click(
      token.x + token.width / 2,
      token.y + token.height / 2,
    );
    await page.getByTestId('stage-explainer').waitFor();
    await focusDone(page);
    assert.equal((await data(page)).params.query, 1);
    assert.equal(
      await page.getByTestId('petros-stage').getAttribute('data-focus'),
      'token-1',
    );
    await geometryChecks(page);
    await page.keyboard.press('Escape');
    await focusDone(page);
    await page
      .getByRole('button', { name: 'Scan sentence', exact: true })
      .click();
    await page.waitForTimeout(3000);
    await page.getByRole('button', { name: 'Pause scan', exact: true }).click();
    assert.equal((await data(page)).params.query, 3);
    const frozen = (await data(page)).sim;
    await page.waitForTimeout(1600);
    assert.deepEqual((await data(page)).sim, frozen);
    // Demo comparison and cancellation, including a stale delayed query change.
    await page.locator('#a-mask').click();
    await page
      .getByRole('button', { name: 'Try it', exact: false })
      .first()
      .click();
    await page.waitForFunction(
      () =>
        JSON.parse(document.querySelector('#petros-observations')!.textContent!)
          .params.query === 0,
    );
    await page.waitForFunction(
      () =>
        JSON.parse(document.querySelector('#petros-observations')!.textContent!)
          .params.causal === false,
    );
    await page.waitForFunction(
      () =>
        JSON.parse(document.querySelector('#petros-observations')!.textContent!)
          .params.causal === true,
    );
    await page.locator('#a-context').click();
    await page
      .getByRole('button', { name: 'Try it', exact: false })
      .first()
      .click();
    await page.waitForTimeout(250);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(1900);
    assert.equal((await data(page)).params.query, 0);
    await page.locator('#a-swap').click();
    await page
      .getByRole('button', { name: 'Try it', exact: false })
      .first()
      .click();
    await page.waitForFunction(
      () =>
        JSON.parse(document.querySelector('#petros-observations')!.textContent!)
          .params.tokens === 'the dog chased the ball',
    );
    await page.waitForTimeout(400);
    await shot(page, `cat-to-dog-${width}-dpr2`);
    assert.notEqual(
      (await data(page)).observations.context,
      initialState.observations.context,
    );
    await page.keyboard.press('Escape');
    await focusDone(page);
    await sentence(page, 'word0 word1 word2');
    await selectQuery(page, 0);
    assert.ok(
      JSON.parse(String((await data(page)).observations.context)).some(
        (v: number) => v < 0,
      ),
    );
    await shot(page, `signed-context-${width}-dpr2`);
    await geometryChecks(page);
    await sentence(
      page,
      Array.from({ length: 12 }, (_, i) => 'word' + i).join(' '),
    );
    await selectQuery(page, 11);
    await page.waitForTimeout(400);
    await shot(page, `twelve-tokens-${width}-dpr2`);
    assert.equal(await page.locator('#stage-query option').count(), 12);
    await geometryChecks(page);
    await sentence(page, 'cat');
    assert.equal((await data(page)).params.query, 0);
    assert.equal(
      await page
        .getByRole('button', { name: 'Next word', exact: true })
        .isDisabled(),
      true,
    );
    await shot(page, `single-token-${width}-dpr2`);
    await page.getByRole('button', { name: 'Reset', exact: true }).click();
    await page.waitForFunction(
      () =>
        JSON.parse(document.querySelector('#petros-observations')!.textContent!)
          .params.tokens === 'the cat chased the ball',
    );
    await ready(page);
    if (width === 1440) {
      await page
        .locator('nav[aria-label="Stage lessons"] button[aria-current="page"]')
        .click();
      await frames(page, 'intro', 12, 80);
      await ready(page);
      await page.locator('#a-context').click();
      await frames(page, 'focus', 10, 80);
      await focusDone(page);
      await page.keyboard.press('Escape');
      await focusDone(page);
    }
    await selectQuery(page, 1);
    await page.locator('[data-stage-toggle="causal"]').click();
    await page.waitForFunction(
      () =>
        JSON.parse(document.querySelector('#petros-observations')!.textContent!)
          .params.causal === false,
    );
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
    assert.equal((await data(page)).topic, 'rocket');
    await page.getByRole('button', { name: 'Attention', exact: true }).click();
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
      initial: initialState.observations,
      saved: engineObserve(saved),
      canvas: await page.locator('canvas').evaluate((c) => ({ ...c.dataset })),
      layout,
      focusLayouts,
    });
    await context.close();
  }
  const reduced = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    reducedMotion: 'reduce',
  });
  await reduced.addInitScript(
    'window.__name=(value)=>value;Storage.prototype.getItem=function(){throw Error("blocked storage")};Storage.prototype.setItem=function(){throw Error("blocked storage")}',
  );
  const page = await reduced.newPage();
  listen(page);
  await page.goto(base + '/prototype?view=stage&lesson=attention');
  await ready(page);
  await page.locator('#a-query').click();
  await focusDone(page);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Next word', exact: true }).click();
  await page.waitForFunction(
    () =>
      JSON.parse(document.querySelector('#petros-observations')!.textContent!)
        .params.query === 0,
  );
  await reduced.close();
  assert.deepEqual(errors, []);
  assert.deepEqual(consoleErrors, []);
  assert.deepEqual(paid, []);
  await rm(new URL('failure.json', out), { force: true });
  await writeFile(
    new URL('smoke-results.json', out),
    JSON.stringify(
      {
        at: new Date().toISOString(),
        source: 'current Attention Stage working tree',
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
  process.stdout.write('Attention Stage smoke and evidence passed.\n');
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
