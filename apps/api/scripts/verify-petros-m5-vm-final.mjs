/* Authentic loopback UI recordings. Run only against the isolated M5 fixture.
 * No response mocking, frontend state injection, or fabricated evaluation. */
/* global document, scrollY, innerWidth, structuredClone */
import process from 'node:process';
import { chromium } from 'playwright-core';
import { mkdirSync, existsSync, writeFileSync, copyFileSync } from 'node:fs';
import { resolve } from 'node:path';

const out = resolve(process.env.PETROS_M5_FINAL_BROWSER_DIR ?? '');
if (!process.env.PETROS_M5_FINAL_BROWSER_DIR || existsSync(out))
  throw Error('A_NEW_EVIDENCE_DIRECTORY_IS_REQUIRED');
const api = process.env.PETROS_M5_BROWSER_API ?? 'http://127.0.0.1:4973';
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
const active = (p) => resource(p)?.attempts?.find((a) => a.id === resource(p).activeAttemptId);
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

async function tools(p, name, touch = false) {
  const summary = p.locator('summary').filter({ hasText: /^Change the allocation$/ });
  if ((await summary.locator('..').getAttribute('open')) === null) await summary.click();
  await command(p, name, touch);
}
async function resume(p, touch = false) {
  await btn(p, 'Continue learning').waitFor();
  await command(p, 'Continue learning', touch);
}
async function freshUnavailable(p) {
  await teach(p);
  await steps(p);
  await btn(p, 'Request a fresh reviewed check').click();
  await p
    .getByRole('alert')
    .filter({ hasText: /unavailable|not available|eligible|reviewed/i })
    .waitFor();
  check(
    p._s.assistance === 'assisted',
    'Unavailable transfer cannot relabel exposed work independent',
  );
  await shot(p, 'fresh-verification-unavailable');
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
  if (active(p)?.observedAt) await command(p, 'Try another VM', touch);
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
  await p
    .getByRole('status', { name: 'Current experiment', exact: true })
    .getByText(/Observed: the allocation was refused/)
    .waitFor();
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
  await hold(p, 1500);
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
  await command(p, 'Review your correction', touch);
  await p
    .getByRole('textbox', { name: 'Your answer', exact: true })
    .fill('Six whole 8 GB VMs fit in the 48 GB remaining after the fixed reservation.');
  await command(p, 'Submit answer', touch);
  await assessed(p);
  check(
    p._s.evaluation.criteria.every((c) => c.status === 'satisfied'),
    'Private evaluator accepts the exact corrected committed work',
  );
  for (const criterion of p._s.evaluation.criteria) {
    await p.locator(`[data-criterion="${criterion.criterionId}"]`).waitFor();
    check(
      (await p.locator(`[data-criterion="${criterion.criterionId}"]`).innerText()).includes(
        'Correct',
      ),
      'Actual criterion-level feedback stays visible with compact completed calculations',
    );
  }
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
  const duringScroll = await p.evaluate(() => scrollY);
  check(duringScroll === scrollBefore, 'Intended touch drag does not pan the page before release');
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await wait(p, (s) => s?.revision > rev, 'touch allocation receipt');
  check(
    resource(p).allocatedCount === before + 1,
    'Actual browser touch drag produces accepted typed allocation',
  );
  timings.push({
    kind: 'touch-scroll',
    before: scrollBefore,
    during: duringScroll,
    afterAcknowledgment: await p.evaluate(() => scrollY),
  });
  await client.detach();
}
async function run(name, role, flow, width = 1440, extra = {}) {
  if (
    process.env.PETROS_M5_BROWSER_FLOW &&
    !process.env.PETROS_M5_BROWSER_FLOW.split(',').some((f) => name.startsWith(f))
  )
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
await run('A-full-correction-cycle', 'cloud-b', async (p) => {
  await wrongMath(p);
  const original = structuredClone(p._s.submission);
  await shot(p, 'A-original-private-feedback');
  await teach(p);
  await shot(p, 'A-experiment-introduction');
  await steps(p);
  check(
    resource(p).allocatedCount === 1,
    'Accepted Petros demonstration changes the actual shared model',
  );
  await predictAdd(p, false, true);
  await boundary(p);
  await shot(p, 'A-capacity-boundary');
  await explain(
    p,
    'Six whole VMs consume 48 GB. A seventh needs another 8 GB, but no memory remains after preserving the 16 GB host reservation.',
  );
  await correctAndCommit(p);
  check(
    p._s.submission.id !== original.id && original.response.values.capacity === 7,
    'Assisted correction is a new immutable response after original seven',
  );
  check(p._s.assistance === 'assisted', 'Actually evaluated correction remains assisted');
  await shot(p, 'A-real-assisted-evaluation');
  await freshUnavailable(p);
});

await run('B-exact-experiment-history', 'method-preview', async (p) => {
  await predictAdd(p);
  const first = structuredClone(active(p));
  check(
    first.requestedCount === 2 && first.observedAt,
    'VM2 has its own prediction and observed receipt',
  );
  await command(p, 'Try another VM');
  await command(p, 'It won’t fit');
  const pending = active(p).id;
  check(
    active(p).requestedCount === 3 && !active(p).observedAt,
    'New VM3 attempt has no inherited VM2 observation',
  );
  check(
    !(
      await p.getByRole('status', { name: 'Current experiment', exact: true }).innerText()
    ).includes('Observed:'),
    'Pending current question displays no historical result',
  );
  await p
    .locator('summary')
    .filter({ hasText: /^Earlier tests/ })
    .click();
  check(
    (await p.locator(`[data-history-attempt="${first.id}"]`).innerText()).includes('2 VMs'),
    'VM2 result is explicitly historical while VM3 pending',
  );
  await shot(p, 'B-current-three-history-two');
  await command(p, 'Pause lesson');
  await p.reload();
  await resume(p);
  check(
    active(p)?.id === pending && !active(p).observedAt,
    'Pending identity survives pause, reload and resume',
  );
  await command(p, 'Add one VM');
  check(
    active(p).id === pending && active(p).observedAt,
    'Only the same pending identity receives VM3 outcome',
  );
  await p.reload();
  await wait(
    p,
    () => active(p)?.id === pending && !!active(p).observedAt,
    'persisted VM3 observation',
  );
  await command(p, 'Try another VM');
  await command(p, 'It will fit');
  const cancelled = active(p).id;
  await command(p, 'Cancel this test');
  check(
    !active(p) && resource(p).attempts.find((a) => a.id === cancelled).status === 'cancelled',
    'Cancel is durable and does not keep active result',
  );
  await tools(p, 'Remove one VM');
  check(
    resource(p).allocatedCount === 2 && !active(p),
    'Release returns to ready without stale observation',
  );
  await predictAdd(p);
  await command(p, 'Undo edit');
  check(
    !active(p) && resource(p).allocatedCount === 2,
    'Undo restores acknowledged quantity without resurrecting prediction',
  );
  await command(p, 'Redo edit');
  check(
    !active(p) && resource(p).allocatedCount === 3,
    'Redo retains history without reactivating old outcome',
  );
  await tools(p, 'Reset allocation');
  check(
    !active(p) && resource(p).allocatedCount === 0,
    'Reset clears active experiment and quantities',
  );
  await predictAdd(p);
  check(
    active(p).requestedCount === 1 && active(p).id !== first.id,
    'A new first VM is a distinguishable attempt after reset',
  );
});

await run('C-compact-reference-and-focus', 'method-preview', async (p) => {
  await predictAdd(p);
  const input = p.getByRole('textbox', { name: 'What happened, and why?', exact: true });
  const draft = 'Unsaved observation: VM2 used 16 GB; I am comparing it with the remaining memory.';
  await input.fill(draft);
  const opener = p.getByRole('button', { name: /Available memory — 48 GB/ });
  await opener.scrollIntoViewIfNeeded();
  const measure = () =>
    p.locator('[data-resource-count]').evaluate((e) => ({
      y: e.getBoundingClientRect().top + scrollY,
      height: e.getBoundingClientRect().height,
      scroll: scrollY,
    }));
  const before = await measure();
  await opener.click();
  const dialog = p.getByRole('dialog', { name: 'Available memory — 48 GB', exact: true });
  await dialog.waitFor();
  check(
    (await dialog.innerText()).includes('48'),
    'Completed calculation is shown in compact reference dialog',
  );
  check((await input.inputValue()) === draft, 'Opening reference preserves dirty explanation');
  await shot(p, 'C-reference-open');
  await p.keyboard.press('Escape');
  await hold(p);
  const after = await measure();
  check(
    Math.abs(before.y - after.y) < 2 &&
      Math.abs(before.height - after.height) < 2 &&
      Math.abs(before.scroll - after.scroll) < 2,
    'Reference opening and closing causes no lab displacement or scroll jump',
  );
  check(
    await opener.evaluate((e) => e === document.activeElement),
    'Reference closes to its keyboard opener',
  );
  check((await input.inputValue()) === draft, 'Closing reference preserves unsaved explanation');
  for (const width of [1440, 1280, 768, 390, 360]) {
    await p.setViewportSize({ width, height: 900 });
    await hold(p);
    check(
      await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      `Lab has no horizontal overflow at ${width}px`,
    );
    await shot(p, `width-${width}-lab`);
  }
  await opener.click();
  await dialog.waitFor();
  await shot(p, 'C-mobile-reference');
  await p.keyboard.press('Escape');
  check(
    await opener.evaluate((e) => e === document.activeElement),
    '360px reference restores focus without losing work',
  );
  check((await input.inputValue()) === draft, '360px reference retains draft');
  await command(p, 'Save explanation');
});

await run('D-meaningful-petros-coordination', 'companion', async (p) => {
  await wrongMath(p);
  await teach(p);
  await shot(p, 'D-introduction');
  await steps(p, false, () => resource(p)?.allocatedCount === 1);
  const prefix = p._s.teaching.nextBeat;
  await command(p, 'Pause lesson');
  await p.reload();
  await resume(p);
  check(
    p._s.teaching.nextBeat === prefix && resource(p).allocatedCount === 1,
    'Pause/resume does not replay demonstration or restart timeline',
  );
  await steps(p);
  await command(p, 'It will fit');
  await btn(p, 'Sources').focus();
  await hold(p);
  check(
    (await p.locator('[aria-label="Petros companion"]').innerText()).includes(
      'Your prediction is recorded',
    ),
    'Petros acknowledges an actual prediction without grading',
  );
  await command(p, 'Add one VM');
  await btn(p, 'Sources').focus();
  await hold(p);
  await shot(p, 'D-first-observation');
  const input = p.getByRole('textbox', { name: 'What happened, and why?', exact: true });
  await input.fill('Two VMs use 16 GB and leave 32 GB.');
  await hold(p);
  check(
    (await p.locator('[aria-label="Petros companion"]').getAttribute('data-mode')) === 'waiting',
    'Petros yields while a learner types an explanation',
  );
  await command(p, 'Save explanation');
  await btn(p, 'Sources').focus();
  await p
    .locator('[aria-label="Petros companion"]')
    .getByText(/Your explanation is saved/)
    .waitFor();
  check(
    (await p.locator('[aria-label="Petros companion"]').innerText()).includes(
      'hasn’t been checked',
    ),
    'Saved explanation is acknowledged without invented evaluation',
  );
  await boundary(p);
  await shot(p, 'D-real-boundary');
  await explain(p, 'Six whole VMs use all 48 GB; another 8 GB cannot fit.');
  await correctAndCommit(p);
  await shot(p, 'D-real-evaluated-feedback');
  await command(p, 'Pause lesson');
  await p.reload();
  await resume(p);
  check(
    p._s.evaluation?.status === 'evaluated' && p._s.assistance === 'assisted',
    'Evaluated assisted result survives pause and resume',
  );
});

await run(
  'E-full-mobile-touch-360',
  'mobile',
  async (p, context) => {
    await wrongMath(p, true);
    await teach(p, true);
    await steps(p, true);
    await touchDrag(p, context);
    await boundary(p, true);
    await explain(
      p,
      'Six whole 8 GB VMs consume the 48 GB available. A seventh cannot fit without using reserved memory.',
      true,
    );
    await btn(p, 'Read this explanation').tap();
    const dialog = p.getByRole('dialog');
    await dialog.waitFor();
    check((await dialog.innerText()).includes('GB'), 'Mobile text alternative retains model units');
    await dialog.getByRole('button', { name: 'Close Read this explanation', exact: true }).tap();
    await correctAndCommit(p, true);
    await shot(p, 'E-mobile-authorized-feedback');
  },
  360,
);

await run(
  'F-english-argument-regression',
  'argument-preview',
  async (p) => {
    check(
      (await p.locator('[data-resource-count]').count()) === 0,
      'English retains its own qualitative activity',
    );
    await p.getByLabel('From', { exact: true }).selectOption('evidence');
    await p.getByLabel('To', { exact: true }).selectOption('claim');
    await p.getByLabel('Relationship', { exact: true }).selectOption('supports');
    await command(p, 'Save relationship');
    await btn(p, 'Evidence · survey passage').click();
    await p
      .getByRole('textbox', { name: /Explain or annotate/ })
      .fill(
        'The sample supports considering longer hours, but other residents and feasibility remain uncertain.',
      );
    await command(p, 'Save annotation');
    await command(p, 'Review your correction');
    await p
      .getByRole('textbox', { name: 'Your answer', exact: true })
      .fill(
        'The sampled learners preferred later access. This supports considering a change, subject to feasibility and sampling uncertainty.',
      );
    await command(p, 'Submit answer');
    await assessed(p);
    check(
      p._s.evaluation.status === 'review_required',
      'Actual private English evaluation abstains on uncertain interpretation',
    );
    await btn(p, 'Sources').click();
    await p.getByRole('dialog').waitFor();
    await shot(p, 'F-source-inspection');
    await p.keyboard.press('Escape');
    check(
      await btn(p, 'Sources').evaluate((e) => e === document.activeElement),
      'Source dialog restores keyboard focus',
    );
    await btn(p, 'Learning preferences').click();
    await p.getByRole('checkbox', { name: 'Text-only presentation', exact: true }).check();
    await p.keyboard.press('Escape');
    await hold(p);
    check(
      (await p.locator('[data-text-only="true"]').count()) > 0,
      'Text-only rendering remains available',
    );
    check(
      (await p.locator('[data-reduced-motion="true"]').count()) > 0,
      'Reduced motion uses existing presentation controller',
    );
  },
  1440,
  { reducedMotion: 'reduce' },
);

await browser.close();
writeFileSync(
  `${out}/review.html`,
  `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>M5 final refinement recordings</title><style>body{font:16px system-ui;background:#f7f7f0;color:#213d34;margin:24px;max-width:1200px}video{width:100%;max-height:80vh}section{margin:28px 0}a{color:#164f42}</style><h1>M5 final refinement · continuous actual app recordings</h1><p>Isolated synthetic students; real commands, checkpoints and private evaluation. Mobile uses Chromium touch emulation.</p>${videos.map((n) => `<section><h2>${n}</h2><video controls preload="metadata" src="${n}.webm"></video><p><a href="${n}.png">Final screenshot</a></p></section>`).join('')}<p>${checks.filter((c) => c.passed).length}/${checks.length} checks passed; ${errors.length} errors. See results.json.</p></html>`,
);
process.stdout.write(
  JSON.stringify(
    { out, checks: checks.length, failed: checks.filter((c) => !c.passed), errors },
    null,
    2,
  ) + '\n',
);
if (errors.length || checks.some((c) => !c.passed)) process.exitCode = 1;
