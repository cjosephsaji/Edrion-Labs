/* global process,document,innerWidth */
import { chromium } from 'playwright-core';
import { mkdirSync, existsSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
if (!process.env.PETROS_M5_BROWSER_DIR) throw Error('M5_NEW_BROWSER_EVIDENCE_REQUIRED');
const out = resolve(process.env.PETROS_M5_BROWSER_DIR);
if (existsSync(out)) throw Error('NEW_DIRECTORY_REQUIRED');
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
  headless: true,
});
const checks = [],
  errors = [],
  snapshots = [],
  recordings = [];
const check = (ok, label) => {
  checks.push({ passed: !!ok, label });
  if (!ok) throw Error(label);
};
const btn = (p, name) => p.getByRole('button', { name, exact: true });
const hold = (p, ms = 600) => p.waitForTimeout(ms);
async function open(role, name, width = 1440, reducedMotion = 'no-preference') {
  const context = await browser.newContext({
    viewport: { width, height: 1000 },
    ...(width <= 390 ? { isMobile: true, hasTouch: true } : {}),
    reducedMotion,
    recordVideo: { dir: out + '/videos', size: { width, height: 1000 } },
  });
  const p = await context.newPage();
  p.on('pageerror', (e) => errors.push({ role, message: e.message }));
  p.on('response', async (r) => {
    if (
      r.url().includes('/v1/student/petros/v2/sessions/') &&
      r.request().method() === 'GET' &&
      r.status() === 200
    ) {
      const s = await r.json().catch(() => null);
      if (s?.engine === 'v2') {
        snapshots.push({ role, snapshot: s });
        if (JSON.stringify(s).includes('M4_PRIVATE_SENTINEL'))
          errors.push({ role, message: 'Private sentinel leakage' });
      }
    }
  });
  await p.goto(`http://127.0.0.1:4943/demo/${role}?fresh=1`, {
    waitUntil: 'domcontentloaded',
    timeout: 90000,
  });
  await btn(p, 'Submit answer').waitFor({ timeout: 90000 });
  await hold(p);
  return { p, context, name };
}
async function finish(o) {
  await hold(o.p);
  await o.p.screenshot({ path: `${out}/${o.name}.png`, fullPage: true });
  await o.context.close();
  const file = await o.p.video().path();
  recordings.push({ name: o.name, file });
}
async function assessed(p) {
  await btn(p, 'Work on this with Petros').waitFor({ timeout: 30000 });
  await hold(p);
}
async function submitCloud(p, conceptual) {
  await p.getByRole('radio', { name: conceptual ? 'Provider' : 'Consumer', exact: true }).check();
  await p.getByRole('spinbutton', { name: 'Available memory (GB)', exact: true }).fill('48');
  await p
    .getByRole('spinbutton', { name: 'Whole-VM capacity (VM)', exact: true })
    .fill(conceptual ? '6' : '7');
  await btn(p, 'Submit answer').click();
  await assessed(p);
}
async function beginTeaching(p, expected) {
  await btn(p, 'Work on this with Petros').click();
  await p.getByRole('heading', { name: expected, exact: true }).waitFor({ timeout: 15000 });
  await hold(p);
}
async function stepAll(p) {
  await p.getByRole('region', { name: 'Interactive teaching workspace', exact: true }).waitFor();
  await hold(p, 250);
  for (let i = 0; i < 32; i++) {
    const button = btn(p, 'Show next teaching step');
    if (!(await button.isVisible())) break;
    const stage = p.getByRole('region', { name: 'Interactive teaching workspace', exact: true });
    const action = await stage.getAttribute('data-teaching-action'),
      beat = Number(await stage.getAttribute('data-next-beat'));
    await button.click();
    await p.waitForFunction(
      ({ action, beat }) => {
        const el = document.querySelector('[data-teaching-action]');
        return el?.dataset.teachingAction === action && Number(el.dataset.nextBeat) > beat;
      },
      { action, beat },
    );
  }
}
async function link(p, from, to, relation = 'connects') {
  await p.getByLabel('From', { exact: true }).selectOption(from);
  await p.getByLabel('To', { exact: true }).selectOption(to);
  await p.getByLabel('Relationship', { exact: true }).selectOption(relation);
  await btn(p, 'Save relationship').click();
  await hold(p);
}
async function commitCanvas(p, reason) {
  await btn(p, 'Use this work for the reviewed practice task').click();
  await p.getByRole('textbox', { name: 'Your answer', exact: true }).fill(reason);
  await btn(p, 'Submit answer').click();
  await assessed(p);
}
let active;
try {
  active = await open('cloud-a', 'A-cloud-responsibility');
  await submitCloud(active.p, true);
  await beginTeaching(active.p, 'Compare the relationship');
  await stepAll(active.p);
  check(
    (await active.p.getByText('Guest operating system', { exact: true }).count()) > 0,
    'Cloud A constructs responsibility elements',
  );
  await link(active.p, 'guest-os', 'consumer');
  await commitCanvas(active.p, 'In IaaS, the consumer manages the guest operating system.');
  check(
    (await active.p.locator('main').innerText()).includes(
      'Your committed work meets this bounded criterion.',
    ),
    'Cloud A evaluates committed diagram',
  );
  await beginTeaching(active.p, 'Try with less support');
  await stepAll(active.p);
  await btn(active.p, 'Request a fresh reviewed check').click();
  await active.p
    .getByRole('alert')
    .getByText(/fresh reviewed task is not available/)
    .waitFor();
  check(true, 'Fresh verification unavailable is explicit');
  await finish(active);
  active = await open('cloud-b', 'B-cloud-equation');
  await submitCloud(active.p, false);
  await beginTeaching(active.p, 'Check the method');
  await stepAll(active.p);
  await active.p.getByRole('textbox', { name: 'Whole VM capacity', exact: true }).fill('6');
  await btn(active.p, 'Save Whole VM capacity step').click();
  await hold(active.p);
  await commitCanvas(active.p, '48 GB / 8 GB per VM gives 6 VM.');
  check(
    (await active.p.locator('main').innerText()).includes(
      'Your committed work meets this bounded criterion.',
    ),
    'Cloud B evaluates saved equation step',
  );
  await finish(active);
  active = await open('english', 'C-english-argument');
  await active.p
    .getByRole('radio', { name: '84 of 120 learners preferred later access', exact: true })
    .check();
  await active.p
    .getByRole('textbox', {
      name: 'Explain the warrant, uncertainty or alternative interpretation',
      exact: true,
    })
    .fill(
      'The survey reports a preference. It may not represent all residents; the policy warrant needs scrutiny.',
    );
  await btn(active.p, 'Submit answer').click();
  await assessed(active.p);
  await beginTeaching(active.p, 'Look more closely');
  await stepAll(active.p);
  await link(active.p, 'evidence', 'claim', 'supports');
  await commitCanvas(
    active.p,
    'The survey supports a preference. Extending the opening hours may require additional evidence about feasibility.',
  );
  check(
    (await active.p.locator('main').innerText()).includes('teacher review'),
    'English interpretation preserves review uncertainty',
  );
  await finish(active);
  active = await open('companion', 'D-coordination');
  await submitCloud(active.p, true);
  await beginTeaching(active.p, 'Compare the relationship');
  await btn(active.p, 'Show next teaching step').click();
  await hold(active.p);
  await btn(active.p, 'Pause lesson').click();
  await active.p.getByRole('heading', { name: 'Take your time.', exact: true }).waitFor();
  await active.p.reload({ waitUntil: 'domcontentloaded' });
  await btn(active.p, 'Continue learning').click();
  await stepAll(active.p);
  await link(active.p, 'guest-os', 'consumer');
  check(
    await btn(active.p, 'Use this work for the reviewed practice task').isVisible(),
    'Pause/reload/resume preserves invitation and semantic prefix',
  );
  await finish(active);
  active = await open('mobile', 'E-mobile-360', 360);
  await submitCloud(active.p, false);
  await beginTeaching(active.p, 'Check the method');
  await stepAll(active.p);
  await active.p.getByRole('textbox', { name: 'Whole VM capacity', exact: true }).fill('6');
  await btn(active.p, 'Save Whole VM capacity step').tap();
  await hold(active.p);
  await commitCanvas(active.p, 'Six whole VMs; the GB units cancel.');
  check(
    await active.p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
    '360px interactive work has no page overflow',
  );
  await finish(active);
  active = await open('reduced', 'F-reduced-motion', 1280, 'reduce');
  await submitCloud(active.p, true);
  await beginTeaching(active.p, 'Compare the relationship');
  await btn(active.p, 'Learning preferences').click();
  await active.p.getByRole('checkbox', { name: 'Text-only presentation', exact: true }).check();
  await active.p.keyboard.press('Escape');
  await stepAll(active.p);
  await active.p.getByLabel('From', { exact: true }).focus();
  await active.p.keyboard.press('g');
  await link(active.p, 'guest-os', 'consumer');
  await commitCanvas(active.p, 'In IaaS the consumer manages the operating system.');
  check(
    (await active.p.locator('[data-text-only="true"]').count()) > 0,
    'Reduced-motion/text-only equivalent edits and commit',
  );
  await finish(active);
  for (const width of [1440, 1280, 768, 390, 360]) {
    const c = await browser.newContext({ viewport: { width, height: 1000 } }),
      p = await c.newPage();
    await p.goto('http://127.0.0.1:4943/demo/cloud-a', { waitUntil: 'domcontentloaded' });
    await p.locator('[data-studio]').waitFor();
    await hold(p, 300);
    check(
      await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      `${width}px accepted teaching reflow`,
    );
    await p.screenshot({ path: `${out}/width-${width}.png`, fullPage: true });
    await c.close();
  }
  check(errors.length === 0, 'No browser runtime errors or private sentinel leaks');
} catch (e) {
  errors.push({ message: String(e) });
  if (active) {
    await active.p.screenshot({ path: out + '/failure.png', fullPage: true }).catch(() => {});
    await active.context.close().catch(() => {});
  }
  process.exitCode = 1;
} finally {
  await browser.close();
  writeFileSync(
    out + '/results.json',
    JSON.stringify({ checks, errors, recordings, snapshots }, null, 2),
  );
  process.stdout.write(JSON.stringify({ checks, errors, recordings }, null, 2) + '\n');
}
