/* Authentic loopback UI recordings. Run only against the isolated M5 fixture.
 * No response mocking, frontend state injection, or fabricated evaluation. */
/* global document, innerWidth */
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
  await wait(p,()=>active(p)?.status==='predicted' && active(p).requestedCount===before+1,'exact current prediction');
  const attemptedId=active(p).id;
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
  await wait(p,()=>active(p)?.id===attemptedId && !!active(p).observedAt,'exact accepted allocation observation');
  await p.getByRole('status',{name:'Current experiment',exact:true}).getByText(`What happened · VM ${before+1}`,{exact:true}).waitFor();
  await hold(p,500);
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
    await p.locator('[data-rig="original-authored-poses"]').waitFor();
    check(await p.locator('[data-layered-character]').count() === 0, 'Selected original artwork is active throughout the learning recording');
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

await run('I-ten-minute-interaction', 'reduced', async (p) => {
  const started = Date.now();
  let cycle = 0;
  await wrongMath(p);
  await teach(p);
  await steps(p);
  while (Date.now() - started < 600000) {
    cycle++;
    if (resource(p).allocatedCount >= 6) await tools(p, 'Reset allocation');
    await predictAdd(p, false, cycle % 2 === 0);
    await hold(p,800);
    const input = p.getByRole('textbox', { name: 'What happened, and why?', exact: true });
    await input.fill(
      `Observation ${cycle}: ${resource(p).allocatedCount} whole VMs are allocated. I am comparing the remaining memory with one VM.`,
    );
    await hold(p, 4000);
    check((await input.inputValue()).includes(`Observation ${cycle}:`),'New explanation remains in the actual input after the acknowledged attempt'); // Scripted learner pacing; not human observation.
    check(
      (await p.locator('[aria-label="Petros companion"]').getAttribute('data-mode')) === 'waiting',
      'Long interaction: quiet while editing',
    );
    await command(p, 'Save explanation');
    await hold(p,1800);
    await btn(p, 'Sources').focus();
    if (cycle % 3 === 0) {
      const prefix = p._s.teaching.nextBeat;
      await command(p, 'Pause lesson');
      await hold(p, 2500);
      await resume(p);
      check(p._s.teaching.nextBeat === prefix, 'Long interaction: interruption preserves prefix');
    }
    if (cycle % 4 === 0) {
      await btn(p, 'Sources').click();
      await p.getByRole('dialog').waitFor();
      await hold(p, 3500);
      await p.keyboard.press('Escape');
    }
    if (cycle % 5 === 0) {
      await btn(p, 'Learning preferences').click();
      await p.getByRole('checkbox', { name: 'Hide character', exact: true }).check();
      await p.keyboard.press('Escape');
      await hold(p, 2500);
      check(
        (await p.locator('[aria-label="Petros companion"]').count()) === 0,
        'Long interaction: minimized character yields full learning surface',
      );
      await btn(p, 'Learning preferences').click();
      await p.getByRole('checkbox', { name: 'Hide character', exact: true }).uncheck();
      await p.keyboard.press('Escape');
    }
    await hold(p, Math.min(12000, Math.max(0, 600000 - (Date.now() - started))));
    process.stdout.write(
      `Long interaction: cycle ${cycle}, ${Math.round((Date.now() - started) / 1000)}s\n`,
    );
  }
  check(Date.now() - started >= 600000, 'At least ten minutes of actual paced interaction');
  await boundary(p);
  await explain(p, 'Six whole VMs use the 48 GB. The seventh is refused.');
  await correctAndCommit(p);
  writeFileSync(
    `${out}/long-duration.json`,
    JSON.stringify(
      { elapsedMs: Date.now() - started, cycles: cycle, scripted: true, humanParticipants: 0 },
      null,
      2,
    ),
  );
});
await browser.close();
writeFileSync(
  `${out}/review.html`,
  `<!doctype html><html><meta name="viewport" content="width=device-width"><title>M6 ten-minute actual interaction</title><h1>Scripted ten-minute application recording</h1><p>Real local commands and evaluation; zero human participants. Unedited browser output.</p><video controls style="width:100%" src="I-ten-minute-interaction.webm"></video></html>`,
);
if (errors.length || checks.some((c) => !c.passed)) process.exitCode = 1;
