/* Authentic loopback UI recordings. Run only against the isolated M5 fixture.
 * No response mocking, frontend state injection, or fabricated evaluation. */
/* global document, innerWidth, window, MutationObserver, performance */
import process from 'node:process';
import { chromium } from 'playwright-core';
import { mkdirSync, existsSync, writeFileSync, copyFileSync } from 'node:fs';
import { resolve } from 'node:path';

const out = resolve(process.env.PETROS_M6_BROWSER_DIR ?? '');
if (!process.env.PETROS_M6_BROWSER_DIR || existsSync(out))
  throw Error('A_NEW_EVIDENCE_DIRECTORY_IS_REQUIRED');
const api = process.env.PETROS_M6_BROWSER_API ?? 'http://127.0.0.1:4983';
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(api)) throw Error('ISOLATED_LOOPBACK_ONLY');
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
  headless: true,
});
const checks = [],
  errors = [],
  videos = [],
  snapshots = [],
  timings = [];
const btn = (p, name) => p.getByRole('button', { name, exact: true });
const hold = (p, ms = 550) => p.waitForTimeout(ms);
function check(value, label) {
  checks.push({ passed: !!value, label });
  if (!value) throw Error(label);
}
async function wait(p, condition, label = 'authoritative session update') {
  const end = Date.now() + 120000;
  while (Date.now() < end) {
    if (condition(p._s)) return;
    await hold(p, 200);
  }
  throw Error(`Timed out: ${label}`);
}
async function command(p, name, touch = false) {
  process.stdout.write(`UI: ${name}\n`);
  const revision = p._s?.revision ?? -1;
  const target = btn(p, name);
  await target.waitFor();
  if (touch) await target.tap();
  else await target.click();
  await wait(p, (s) => s?.revision > revision, name);
  await hold(p, 350);
}

async function shot(p, name) {
  await p.screenshot({ path: `${out}/${name}.png`, fullPage: true });
}
async function assessed(p) {
  await wait(
    p,
    (s) => s?.submission?.status === 'complete' && !!s.evaluation,
    'private evaluator result',
  );
  await btn(p, 'Work on this with Petros').waitFor();
  await hold(p);
}
async function wrongMath(p, touch = false) {
  await p.getByRole('radio', { name: 'Consumer', exact: true }).check();
  await p.getByRole('spinbutton', { name: 'Available memory (GB)', exact: true }).fill('48');
  await p.getByRole('spinbutton', { name: 'Whole-VM capacity (VM)', exact: true }).fill('7');
  await command(p, 'Submit answer', touch);
  await assessed(p);
  check(
    p._s.evaluation.criteria.some((c) => c.status === 'not_satisfied'),
    'Original 48 / 8 = 7 actually fails its private criterion',
  );
}
async function teach(p, touch = false) {
  await command(p, 'Work on this with Petros', touch);
  await btn(p, 'Show next teaching step').waitFor();
}
async function run(name, role, flow, width = 1440, extra = {}) {
  if (
    process.env.PETROS_M6_BROWSER_FLOW &&
    !process.env.PETROS_M6_BROWSER_FLOW.split(',').some((f) => name.startsWith(f))
  )
    return;
  const context = await browser.newContext({
    viewport: { width, height: 1200 },
    ...(width === 360 ? { isMobile: true, hasTouch: true } : {}),
    ...extra,
    recordVideo: { dir: `${out}/raw-videos`, size: { width, height: 1200 } },
  });
  await context.addInitScript(() => {
    window.__m6Attention = [];
    const start = () =>
      new MutationObserver(() => {
        const el = document.querySelector('[aria-label="Petros companion"]');
        if (!el) return;
        const item = {
          cue: el.getAttribute('data-cue-id'),
          phase: el.getAttribute('data-attention-phase'),
          gesture: el.getAttribute('data-gesture'),
          target: el.getAttribute('data-target'),
          at: performance.now(),
        };
        const previous = window.__m6Attention.at(-1);
        if (item.cue && (item.phase !== previous?.phase || item.cue !== previous?.cue))
          window.__m6Attention.push(item);
      }).observe(document.body, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ['data-attention-phase', 'data-gesture', 'data-target', 'data-cue-id'],
      });
    document.addEventListener('DOMContentLoaded', start, { once: true });
  });
  const p = await context.newPage();
  p.setDefaultTimeout(90000);
  p.on('dialog', (d) => (d.type() === 'beforeunload' ? d.accept() : d.dismiss()));
  p.on('pageerror', (e) => errors.push({ name, error: e.message }));
  p.on('response', async (response) => {
    if (!response.url().includes('/v1/student/petros/v2/sessions/')) return;
    const t = response.request().timing();
    timings.push({
      name,
      method: response.request().method(),
      status: response.status(),
      ms: t.responseStart - t.requestStart,
    });
    if (response.request().method() === 'GET' && response.status() === 200) {
      const s = await response.json().catch(() => null);
      if (s?.engine === 'v2' && s.id) {
        p._s = s;
        snapshots.push({ name, snapshot: s });
        if (JSON.stringify(s).includes('M4_PRIVATE_SENTINEL'))
          errors.push({ name, error: 'Private sentinel leaked' });
      }
    }
  });
  try {
    await p.goto(`${api}/demo/${role}?fresh=1`, { waitUntil: 'domcontentloaded', timeout: 180000 });
    await wait(p, (s) => !!s, 'initial authenticated public session');
    await p.locator('[data-layered-character]').waitFor();
    check(
      (await p.locator('[aria-label="Petros companion"]').count()) === 1,
      `${name}: one companion owner`,
    );
    check(!!p._s.companion, `${name}: backend public cue is present`);
    await flow(p, context);
    check(
      await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      `${name}: no horizontal overflow`,
    );
    await shot(p, name);
    await hold(p, 1000);
  } catch (e) {
    errors.push({ name, error: String(e) });
    await shot(p, `${name}-failure`).catch(() => {});
    writeFileSync(
      `${out}/${name}-failure.txt`,
      await p
        .locator('body')
        .innerText()
        .catch(() => 'Unavailable'),
    );
    process.stdout.write(`${name}: ${e}\n`);
  } finally {
    const video = p.video();
    await context.close();
    copyFileSync(await video.path(), `${out}/${name}.webm`);
    videos.push(name);
    writeFileSync(
      `${out}/results.json`,
      JSON.stringify({ checks, errors, videos, timings }, null, 2),
    );
    writeFileSync(`${out}/public-snapshots.json`, JSON.stringify(snapshots, null, 2));
    process.stdout.write(`Recorded ${name}\n`);
  }
}

await run('B-accepted-target-sequence', 'companion', async (p) => {
  await wrongMath(p);
  await teach(p);
  await hold(p, 1400);
  while (p._s.teaching.status === 'presenting') {
    await command(p, 'Show next teaching step');
    await hold(p, 1400);
  }
  const trace = await p.evaluate(() => window.__m6Attention);
  writeFileSync(`${out}/actual-attention-trace.json`, JSON.stringify(trace, null, 2));
  const point = trace.find((e) => e.gesture === 'point' && e.target);
  check(!!point, 'Actual accepted teaching event produces a visible supported point');
  const sequence = trace.filter((e) => e.cue === point.cue).map((e) => e.phase);
  check(
    sequence.indexOf('look') >= 0 &&
      sequence.indexOf('gesture') > sequence.indexOf('look') &&
      sequence.indexOf('highlight') > sequence.indexOf('gesture') &&
      sequence.indexOf('settled') > sequence.indexOf('highlight'),
    'Actual target runs look → gesture → highlight → settle in order',
  );
  const accepted = snapshots.find((s) => s.snapshot.companion?.eventId === point.cue)?.snapshot;
  check(
    accepted?.canvas.elements.some((e) => e.id === point.target),
    'Point target exists in its exact accepted public canvas',
  );
  check(
    accepted?.companion.targetId === point.target && accepted?.companion.epoch === accepted.epoch,
    'Point belongs to current action/source/session epoch',
  );
  await shot(p, 'B-final-shared-stage');
});
await browser.close();
if (errors.length || checks.some((c) => !c.passed)) process.exitCode = 1;
