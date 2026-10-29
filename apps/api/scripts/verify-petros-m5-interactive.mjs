/* Authentic loopback UI recordings. Run only against the isolated M5 fixture.
 * No response mocking, frontend state injection, or fabricated evaluation. */
/* global document, scrollY, innerWidth */
import process from 'node:process';
import { chromium } from 'playwright-core';
import { mkdirSync, existsSync, writeFileSync, copyFileSync } from 'node:fs';
import { resolve } from 'node:path';

const out = resolve(process.env.PETROS_M5_INTERACTIVE_BROWSER_DIR ?? '');
if (!process.env.PETROS_M5_INTERACTIVE_BROWSER_DIR || existsSync(out))
  throw Error('A_NEW_EVIDENCE_DIRECTORY_IS_REQUIRED');
const api = process.env.PETROS_M5_BROWSER_API ?? 'http://127.0.0.1:4963';
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
const resource = (p) => p._s?.canvas?.elements.find((e) => e.id === 'memory-lab')?.resource;
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
async function steps(p, touch = false, until) {
  for (let i = 0; i < 32 && p._s.teaching?.status === 'presenting'; i++) {
    await command(p, 'Show next teaching step', touch);
    if (until?.()) return;
  }
  await hold(p);
}
async function predictAdd(p, touch = false, keyboard = false) {
  const before = resource(p).allocatedCount;
  await command(p, 'It will fit', touch);
  check(
    resource(p).prediction?.requestedCount === before + 1,
    'Prediction is acknowledged separately before allocation',
  );
  if (keyboard) {
    const revision = p._s.revision;
    await btn(p, 'Drag a VM into memory, or press Enter to add one').focus();
    await p.keyboard.press('Enter');
    await wait(p, (s) => s?.revision > revision, 'keyboard allocation');
    await hold(p);
  } else await command(p, 'Add one VM', touch);
}
async function boundary(p, touch = false) {
  while (resource(p).allocatedCount < 6) await predictAdd(p, touch);
  await predictAdd(p, touch);
  const r = resource(p),
    o = r.observations.at(-1);
  check(
    r.allocatedCount === 6 && o.requestedCount === 7 && !o.admitted && o.remainingGB === 0,
    'Actual kernel refuses seventh VM and preserves six allocated VMs',
  );
  check(
    o.prediction.expectation === 'fits',
    'A refused observation preserves the learner prediction without rewriting it',
  );
  await p.getByText('Allocation refused — capacity limit', { exact: true }).waitFor();
  await btn(p, 'Sources').focus();
  await hold(p);
  check(
    (await p.locator('[aria-label="Petros companion"]').getAttribute('data-mode')) === 'teaching',
    'Petros responds to actual capacity boundary',
  );
}
async function explain(p, text, touch = false) {
  await p.getByRole('textbox', { name: 'What happened, and why?', exact: true }).fill(text);
  await command(p, 'Save explanation', touch);
  await wait(
    p,
    () => p._s.canvas.elements.some((e) => e.id === 'memory-lab' && e.annotation === text),
    'explanation annotation',
  );
  // Saving the shared draft follows the annotation receipt; wait for the public busy state to settle.
  await p.waitForFunction(
    () => !Array.from(document.querySelectorAll('button')).some((b) => b.textContent === 'Saving…'),
  );
  await hold(p, 1200);
  check(resource(p).observations.length > 1, 'Explanation accompanies actual observed operations');
}
async function correctAndCommit(p, touch = false) {
  if (await btn(p, 'Revise calculation').isVisible()) await btn(p, 'Revise calculation').click();
  await p.getByRole('textbox', { name: 'Whole VM capacity', exact: true }).fill('6');
  await command(p, 'Save Whole VM capacity step', touch);
  check(
    p._s.canvas.elements.find((e) => e.id === 'capacity').value === '6',
    'Correction is acknowledged on the shared canvas',
  );
  await command(p, 'Use this work for the reviewed practice task', touch);
  await p
    .getByRole('textbox', { name: 'Your answer', exact: true })
    .fill('Six whole 8 GB VMs fit in the 48 GB remaining after the fixed reservation.');
  await command(p, 'Submit answer', touch);
  await assessed(p);
  check(
    p._s.evaluation.criteria.every((c) => c.status === 'satisfied'),
    'Private evaluator accepts the exact corrected committed work',
  );
  check(
    (await p.locator('body').innerText()).includes('Assisted practice'),
    'Exposed equivalent answer stays assisted practice',
  );
}
async function touchDrag(p, context) {
  await command(p, 'It will fit', true);
  const handle = btn(p, 'Drag a VM into memory, or press Enter to add one');
  await handle.scrollIntoViewIfNeeded();
  const a = await handle.boundingBox(),
    b = await p.locator('[data-allocation-drop]').boundingBox();
  const start = { x: a.x + a.width / 2, y: a.y + a.height / 2 };
  const end = { x: b.x + b.width / 2, y: Math.max(35, Math.min(b.y + b.height - 15, 700)) };
  check(
    end.y >= b.y && end.y <= b.y + b.height,
    'Touch drop lands inside actual visible memory area',
  );
  const scrollBefore = await p.evaluate(() => scrollY),
    before = resource(p).allocatedCount,
    rev = p._s.revision;
  const client = await context.newCDPSession(p);
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [start] });
  for (let n = 1; n <= 18; n++) {
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [
        {
          x: start.x + ((end.x - start.x) * n) / 18,
          y: start.y + ((end.y - start.y) * n) / 18,
        },
      ],
    });
    await hold(p, 30);
  }
  check(
    (await p.locator('[aria-label="Petros companion"]').getAttribute('data-mode')) === 'waiting',
    'Petros yields during real touch manipulation',
  );
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await wait(p, (s) => s?.revision > rev, 'touch allocation receipt');
  check(
    resource(p).allocatedCount === before + 1,
    'Actual browser touch drag produces accepted typed allocation',
  );
  check(
    (await p.evaluate(() => scrollY)) === scrollBefore,
    'Intended touch drag does not scroll the page',
  );
  await client.detach();
}
async function run(name, role, flow, width = 1440, extra = {}) {
  if (process.env.PETROS_M5_BROWSER_FLOW && !name.startsWith(process.env.PETROS_M5_BROWSER_FLOW))
    return;
  const context = await browser.newContext({
    viewport: { width, height: 900 },
    ...(width === 360 ? { isMobile: true, hasTouch: true } : {}),
    ...extra,
    recordVideo: { dir: `${out}/raw-videos`, size: { width, height: 900 } },
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

await run('A-interactive-laboratory', 'cloud-b', async (p) => {
  await wrongMath(p);
  await teach(p);
  await shot(p, 'A-introduction');
  await steps(p);
  check(
    resource(p).allocatedCount === 1,
    'Petros demonstration actually allocates one VM through accepted canvas operation',
  );
  await predictAdd(p, false, true);
  check(resource(p).allocatedCount === 2, 'Keyboard equivalent allocates the same whole VM');
  await boundary(p);
  await shot(p, 'A-limit');
  await explain(
    p,
    'Six complete VMs consume 48 GB. The seventh would exceed the available memory; the 16 GB host reservation stays protected.',
  );
  await command(p, 'Remove one VM');
  check(resource(p).allocatedCount === 5, 'Release updates acknowledged allocation');
  await p.getByText('Compare before and after', { exact: true }).click();
  check((await p.getByRole('table').count()) > 0, 'Before/after observations remain inspectable');
});
await run('B-mathematical-correction', 'method-preview', async (p) => {
  check(
    p._s.submission.response.values.capacity === 7,
    'Original wrong submission is present before correction',
  );
  await shot(p, 'B-original-seven');
  await predictAdd(p);
  await boundary(p);
  await explain(p, 'The limit is six whole VMs because 7 times 8 GB exceeds 48 GB.');
  const original = p._s.submission.id;
  await correctAndCommit(p);
  check(p._s.submission.id !== original, 'Correction creates a new immutable submission');
  await shot(p, 'B-authorized-assisted-feedback');
});
await run('C-compact-progression', 'method-preview', async (p) => {
  const summary = p.locator('summary').filter({ hasText: 'Available memory:' });
  check(
    (await summary.count()) === 1,
    'Previously correct available-memory step has one compact summary',
  );
  check(!(await summary.locator('..').getAttribute('open')), 'Completed step starts collapsed');
  await shot(p, 'C-collapsed');
  await summary.click();
  check(
    await p.getByRole('textbox', { name: 'Available memory', exact: true }).isVisible(),
    'Completed calculation reopens with actual saved value',
  );
  await shot(p, 'C-reopened');
  await summary.click();
  for (const width of [1440, 1280, 768, 390, 360]) {
    await p.setViewportSize({ width, height: 900 });
    await hold(p);
    check(
      await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      `Final resource layout fits ${width}px`,
    );
    await shot(p, `width-${width}-final`);
  }
  await btn(p, 'Revise calculation').click();
  check(
    await p.getByRole('textbox', { name: 'Whole VM capacity', exact: true }).isVisible(),
    'Mobile current-step navigation exposes numerical correction',
  );
  await shot(p, 'C-mobile-current-step');
});
await run('D-english-mapping', 'argument-preview', async (p) => {
  check(
    (await p.locator('[data-resource-count]').count()) === 0,
    'English has no resource-specific controls',
  );
  await p.getByLabel('From', { exact: true }).selectOption('evidence');
  await p.getByLabel('To', { exact: true }).selectOption('claim');
  await p.getByLabel('Relationship', { exact: true }).selectOption('supports');
  await command(p, 'Save relationship');
  await btn(p, 'Evidence · survey passage').click();
  await p
    .getByRole('textbox', { name: /Explain or annotate/ })
    .fill(
      'The sample preference supports considering longer hours, but feasibility and other residents remain uncertain.',
    );
  await command(p, 'Save annotation');
  await shot(p, 'D-actual-mapping');
  await command(p, 'Use this work for the reviewed practice task');
  await p
    .getByRole('textbox', { name: 'Your answer', exact: true })
    .fill(
      'The sampled learners preferred later access. This supports considering a change, subject to feasibility and sampling uncertainty.',
    );
  await command(p, 'Submit answer');
  await assessed(p);
  check(
    p._s.evaluation.status === 'review_required',
    'Ambiguous English interpretation stays review required',
  );
  await btn(p, 'Sources').click();
  await p.getByRole('dialog').waitFor();
  await shot(p, 'D-pinned-source');
  await p.keyboard.press('Escape');
  await hold(p);
  check(
    await btn(p, 'Sources').evaluate((e) => e === document.activeElement),
    'Source inspection restores keyboard focus',
  );
});
await run(
  'E-mobile-touch-360',
  'mobile',
  async (p, context) => {
    await wrongMath(p, true);
    await teach(p, true);
    await steps(p, true);
    await touchDrag(p, context);
    await command(p, 'Remove one VM', true);
    await predictAdd(p, true);
    await explain(
      p,
      'The fixed reservation leaves 48 GB, allowing six whole 8 GB allocations.',
      true,
    );
    await btn(p, 'Teaching text alternative').tap();
    const dialog = p.getByRole('dialog');
    await dialog.waitFor();
    check(
      (await dialog.innerText()).includes('GB'),
      'Touch-accessible text alternative retains model units',
    );
    await dialog
      .getByRole('button', { name: 'Close Teaching text alternative', exact: true })
      .tap();
    await correctAndCommit(p, true);
    await shot(p, 'E-touch-authorized-feedback');
  },
  360,
);
await run(
  'F-petros-coordination',
  'companion',
  async (p) => {
    await wrongMath(p);
    await teach(p);
    await shot(p, 'F-introduction');
    await steps(p, false, () => resource(p)?.allocatedCount === 1);
    const prefix = p._s.teaching.nextBeat,
      count = resource(p).allocatedCount;
    check(
      p._s.teaching.status === 'presenting',
      'Accepted demonstration is part of the current presentation',
    );
    await command(p, 'Pause lesson');
    await p.reload();
    await btn(p, 'Continue learning').waitFor();
    await command(p, 'Continue learning');
    check(
      p._s.teaching.nextBeat === prefix && resource(p).allocatedCount === count,
      'Pause/reload/resume preserves accepted prefix without replaying allocation',
    );
    await steps(p);
    await p.getByRole('textbox', { name: 'What happened, and why?', exact: true }).focus();
    await hold(p);
    check(
      (await p.locator('[aria-label="Petros companion"]').getAttribute('data-mode')) === 'waiting',
      'Companion waits during student explanation',
    );
    await boundary(p);
    await shot(p, 'F-actual-limit-cue');
    await explain(
      p,
      'The observed limit follows whole-VM allocation and a fixed host reservation.',
    );
    const id = p._s.id,
      annotation = p._s.canvas.elements.find((e) => e.id === 'memory-lab').annotation;
    await command(p, 'Pause lesson');
    await p.reload();
    await btn(p, 'Continue learning').waitFor();
    await command(p, 'Continue learning');
    check(
      p._s.id === id &&
        p._s.canvas.elements.find((e) => e.id === 'memory-lab').annotation === annotation,
      'Resume returns to real saved explanation and allocation context',
    );
    await btn(p, 'Learning preferences').click();
    await p.getByRole('checkbox', { name: 'Text-only presentation', exact: true }).check();
    await p.keyboard.press('Escape');
    await hold(p);
    check(
      (await p.locator('[data-text-only="true"]').count()) > 0,
      'Text-only representation remains available',
    );
    check(
      (await p.locator('[data-reduced-motion="true"]').count()) > 0,
      'Reduced motion is honored by existing presentation controller',
    );
  },
  1440,
  { reducedMotion: 'reduce' },
);

await browser.close();
writeFileSync(
  `${out}/review.html`,
  `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>M5 interactive learning recordings</title><style>body{font:16px system-ui;background:#f7f7f0;color:#213d34;margin:24px;max-width:1200px}video{width:100%;max-height:80vh}section{margin:28px 0}a{color:#164f42}</style><h1>M5 interactive learning · actual app recordings</h1><p>Synthetic isolated students and reviewed engineering fixtures. Real session commands and server-authoritative feedback. Touch is Chromium emulation, not physical device qualification.</p>${videos.map((n) => `<section><h2>${n}</h2><video controls preload="metadata" src="${n}.webm"></video><p><a href="${n}.png">Final screenshot</a></p></section>`).join('')}<p>${checks.filter((c) => c.passed).length}/${checks.length} checks passed; ${errors.length} errors. Inspect results.json for exact checks.</p></html>`,
);
process.stdout.write(
  JSON.stringify(
    { out, checks: checks.length, failed: checks.filter((c) => !c.passed), errors },
    null,
    2,
  ) + '\n',
);
if (errors.length || checks.some((c) => !c.passed)) process.exitCode = 1;
