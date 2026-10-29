/* Authentic loopback UI recordings. Run only against the isolated M5 fixture.
 * No response mocking, frontend state injection, or fabricated evaluation. */
/* global document, innerWidth, window, performance, MutationObserver, requestAnimationFrame */
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
async function steps(p, touch = false, until) {
  for (let i = 0; i < 32 && p._s.teaching?.status === 'presenting'; i++) {
    await command(p, 'Show next teaching step', touch);
    if (until?.()) return;
  }
  await hold(p);
}
async function run(name, role, flow, width = 1440, extra = {}) {
  if (
    process.env.PETROS_M6_BROWSER_FLOW &&
    !process.env.PETROS_M6_BROWSER_FLOW.split(',').some((f) => name.startsWith(f))
  )
    return;
  const context = await browser.newContext({
    viewport: { width, height: 900 },
    ...(width === 360 ? { isMobile: true, hasTouch: true } : {}),
    ...extra,
    recordVideo: { dir: `${out}/raw-videos`, size: { width, height: 900 } },
  });
  await context.addInitScript(() => {
    window.__m6CuePaints = [];
    const observe = () =>
      new MutationObserver(() => {
        const el = document.querySelector('[data-cue-id]');
        const id = el?.getAttribute('data-cue-id');
        if (!id || window.__m6CuePaints.some((e) => e.id === id)) return;
        requestAnimationFrame(() =>
          window.__m6CuePaints.push({ id, at: performance.timeOrigin + performance.now() }),
        );
      }).observe(document.body, {
        attributes: true,
        childList: true,
        subtree: true,
        attributeFilter: ['data-cue-id'],
      });
    if (document.body) observe();
    else document.addEventListener('DOMContentLoaded', observe, { once: true });
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
        snapshots.push({
          name,
          snapshot: s,
          receivedAt: Date.now(),
          networkAt: t.startTime + t.responseStart,
        });
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

await run('D-actual-incorrect-and-partial', 'cloud-a', async (p) => {
  await p.getByRole('radio', { name: 'Provider', exact: true }).check();
  await p.getByRole('spinbutton', { name: 'Available memory (GB)', exact: true }).fill('0');
  await p.getByRole('spinbutton', { name: 'Whole-VM capacity (VM)', exact: true }).fill('0');
  check(
    (await p.locator('[data-layered-character]').getAttribute('data-expression')) === 'neutral',
    'Before commitment, even a wrong-looking draft stays neutral',
  );
  await command(p, 'Submit answer');
  await assessed(p);
  check(
    p._s.companion.result === 'incorrect' && p._s.companion.expression !== 'pleased',
    'Actual all-incorrect result never celebrates',
  );
  await shot(p, 'D-all-incorrect');
  await hold(p, 2000);
  const firstPaints = await p.evaluate(() => window.__m6CuePaints);
  await p.goto(`${api}/demo/cloud-a?fresh=1`, { waitUntil: 'domcontentloaded' });
  await wait(p, (s) => s?.submission === null, 'new actual independent task');
  await wrongMath(p);
  check(p._s.companion.result === 'partial', 'Actual mixed criterion result is partial');
  await shot(p, 'D-partially-correct');
  await p.goto(`${api}/demo/cloud-a?fresh=1`,{waitUntil:'domcontentloaded'});
  await wait(p,s=>s?.submission===null,'new independent task for correct evaluation');
  await p.getByRole('radio',{name:'Consumer',exact:true}).check();
  await p.getByRole('spinbutton',{name:'Available memory (GB)',exact:true}).fill('48');
  await p.getByRole('spinbutton',{name:'Whole-VM capacity (VM)',exact:true}).fill('6');
  await command(p,'Submit answer');await assessed(p);
  check(p._s.companion.result==='correct' && p._s.companion.expression==='pleased','Only actual fully checked success permits a mild positive expression');
  await shot(p,'D-actual-correct');await hold(p,1500);
  await p.goto(`${api}/demo/english?fresh=1`,{waitUntil:'domcontentloaded'});
  await wait(p,s=>s?.submission===null,'new original English task');
  await p.getByRole('radio',{name:'84 of 120 learners preferred later access',exact:true}).check();
  await p.getByRole('textbox',{name:'Explain the warrant, uncertainty or alternative interpretation',exact:true}).fill('The survey concerns the sampled learners. Their preference supports considering later access, but feasibility and other residents need further review.');
  await command(p,'Submit answer');await assessed(p);
  check(p._s.companion.result==='review' && p._s.companion.expression==='uncertain','Actual qualitative interpretation stays review required');
  await shot(p,'D-actual-review-required');await hold(p,1800);
  await command(p,'Work on this with Petros');await steps(p);
  check(!!p._s.teaching && p._s.canvas.elements.some(e=>e.id==='claim'),'English teaching constructs the accepted real claim');
  await shot(p,'E-english-accepted-teaching');

  const paints = [...firstPaints, ...(await p.evaluate(() => window.__m6CuePaints))];
  const delays = paints
    .map((paint) => {
      const r = snapshots.find((s) => s.snapshot.companion?.eventId === paint.id);
      return r ? { eventId: paint.id, ms: paint.at - r.networkAt } : null;
    })
    .filter(Boolean);
  writeFileSync(
    `${out}/cue-to-frame.json`,
    JSON.stringify(
      {
        note: 'Actual response-start to first observed companion DOM frame; includes JSON/React/RAF time. Read-only performance observer, no lesson-state injection.',
        delays,
      },
      null,
      2,
    ),
  );
  check(
    snapshots.some((s) => s.snapshot.submission?.status === 'pending'),
    'Pending submission occurs naturally, without delayed evaluation or route mocking',
  );
});
await browser.close();
if (errors.length || checks.some((c) => !c.passed)) process.exitCode = 1;
