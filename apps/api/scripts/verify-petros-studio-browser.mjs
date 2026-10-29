/* global process, performance, document, innerWidth, requestAnimationFrame, window */
/** Actual loopback browser UI, synthetic records, no remote targets or mocked grading. */
import { chromium } from 'playwright-core';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
if (process.argv.length !== 2 || !process.env.PETROS_STUDIO_BROWSER_DIR)
  throw Error('NEW_OUTPUT_REQUIRED');
const out = resolve(process.env.PETROS_STUDIO_BROWSER_DIR);
const apiBase = process.env.PETROS_STUDIO_BROWSER_API ?? 'http://127.0.0.1:4943';
if (!/^http:\/\/127\.0\.0\.1:\d{4,5}$/.test(apiBase)) throw Error('LOOPBACK_API_REQUIRED');
if (existsSync(out)) throw Error('NEW_DIRECTORY_REQUIRED');
mkdirSync(out, { recursive: true });
mkdirSync(out + '/recordings');
const brave = '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser';
const browser = await chromium.launch({
  ...(existsSync('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')
    ? { channel: 'chrome' }
    : { executablePath: brave }),
  headless: true,
});
const checks = [],
  errors = [],
  navigationRecoveries = [],
  loads = [],
  snapshots = [],
  recordings = [],
  latencies = [];
let active;
const check = (ok, label) => {
  checks.push({ label, passed: !!ok });
  if (!ok) throw Error(label);
};
const hold = (p, ms = 1400) => p.waitForTimeout(ms);
const shot = async (p, name) => {
  await p.evaluate(() => window.scrollTo(0, 0));
  await hold(p, 80);
  return p.screenshot({ path: out + '/' + name + '.png', fullPage: true });
};
const consumer = (p) => p.getByRole('radio', { name: 'The consumer', exact: true });
const reason = (p) =>
  p.getByRole('radio', {
    name: 'The consumer retains access-policy responsibilities',
    exact: true,
  });
const button = (p, name) => p.getByRole('button', { name, exact: true });
async function open(
  role,
  { width = 1440, height = 1000, video, reducedMotion = 'no-preference', missing = false } = {},
) {
  const context = await browser.newContext({
    viewport: { width, height },
    reducedMotion,
    ...(video ? { recordVideo: { dir: out + '/recordings', size: { width, height } } } : {}),
  });
  if (missing) await context.route('**/petros/states/*.png', (r) => r.abort());
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push({ role, message: e.message }));
  page.on('response', async (r) => {
    if (!r.url().includes('/v1/student/petros/v2/')) return;
    const text = await r.text().catch(() => '');
    if (text.includes('M4_PRIVATE_SENTINEL_9817'))
      errors.push({ role, message: 'Private sentinel leakage' });
    if (/\/sessions\/[a-f0-9-]+$/.test(r.url()) && r.status() === 200) {
      try {
        const s = JSON.parse(text);
        snapshots.push({
          role,
          id: s.id,
          revision: s.revision,
          epoch: s.epoch,
          status: s.status,
          task: s.task?.taskId,
          submission: s.submission?.id,
          evaluation: s.evaluation?.status,
          redacted: !s.task || s.lesson?.excerpts?.length === 0,
        });
      } catch {
        /* Ignore non-JSON responses; the app handles the error. */
      }
    }
  });
  const began = performance.now();
  try {
    await page.goto(apiBase + '/demo/' + role, {
      waitUntil: 'networkidle',
      timeout: 90000,
    });
  } catch (error) {
    if (!/net::ERR_EMPTY_RESPONSE/.test(error.message)) throw error;
    navigationRecoveries.push({ role, reason: error.message });
    await page.goto(apiBase + '/demo/' + role, {
      waitUntil: 'networkidle',
      timeout: 90000,
    });
  }
  await page.locator('[data-studio],[data-studio-entry]').waitFor({ timeout: 90000 });
  loads.push({ role, width, ms: performance.now() - began });
  active = { context, page, video };
  return active;
}
async function finish() {
  if (!active) return;
  const v = active,
    record = v.video ? v.page.video() : null;
  await v.context.close();
  if (record) {
    const path = out + '/recordings/' + v.video + '.webm';
    await record.saveAs(path);
    recordings.push(path);
  }
  active = null;
}
async function close(p, title) {
  await button(p, 'Close ' + title).click();
}
async function steps(p) {
  for (let i = 0; i < 15; i++) {
    const b = p.getByRole('button', { name: /^Show next excerpt/ });
    if (!(await b.count())) break;
    await b.click();
    await hold(p, 120);
  }
}
async function save(p) {
  await Promise.all([
    p.waitForResponse(
      (r) => r.url().endsWith('/commands') && r.request().method() === 'POST' && r.status() === 201,
    ),
    button(p, 'Save draft').click(),
  ]);
  await hold(p, 400);
}
async function pause(p) {
  await button(p, 'Pause lesson').click();
  await p.getByRole('heading', { name: 'Take your time.' }).waitFor();
}
async function resume(p) {
  await button(p, 'Continue learning').click();
  await button(p, 'Pause lesson').waitFor();
}
try {
  let v = await open('entry', { video: 'A-desktop-cloud' }),
    p = v.page;
  await p
    .getByRole('button', { name: /Start learning|Continue learning/ })
    .first()
    .waitFor();
  await shot(p, '01-welcome');
  await hold(p, 2000);
  const cloud = p.getByRole('button', { name: 'Explore Cloud Computing', exact: true });
  if (await cloud.count()) await cloud.click();
  else await p.locator('section[aria-label="Recommended next action"]').getByRole('button').click();
  await button(p, 'Try a question').waitFor({ timeout: 90000 });
  check(p.url().includes('/petros/v2/session'), 'Server dispatch enters the V2 studio');
  await shot(p, '02-cloud-intro');
  await hold(p, 1800);
  await p.getByRole('button', { name: /^Explore with Petros/ }).click();
  await p.locator('[data-mode="teaching"]').waitFor();
  await hold(p, 1100);
  await button(p, 'Pause explanation').click();
  await steps(p);
  await p.getByRole('table').waitFor();
  check(
    (await p.getByRole('cell', { name: 'Access policy', exact: true }).count()) === 1,
    'Cloud uses actual native source table cells',
  );
  await button(p, 'Focus PaaS').click();
  check(
    (await button(p, 'Focus PaaS').getAttribute('aria-pressed')) === 'true',
    'Source row exploration works without assessment',
  );
  await shot(p, '03-cloud-comparison');
  await hold(p, 1800);
  let askBody;
  p.on('request', (r) => {
    if (r.url().endsWith('/commands')) {
      const body = r.postDataJSON();
      if (body.type === 'ask') askBody = body;
    }
  });
  await button(p, 'Ask about this excerpt').click();
  await p.getByLabel('Your question', { exact: true }).fill('Can we look at this boundary again?');
  await button(p, 'Bring back the source').click();
  await p.getByText('Here is the reviewed wording.', { exact: false }).waitFor();
  check(
    !!askBody?.target?.unitId && !!askBody?.target?.sourceRevisionId,
    'Ask carries validated unit ID and exact source revision',
  );
  check(
    (await p.getByRole('dialog').innerText()).includes('not a generated answer'),
    'Source reread is labelled honestly',
  );
  await shot(p, '04-ask');
  await hold(p, 1800);
  await close(p, 'Ask Petros');
  const count = await p.locator('[data-element-id]').count();
  await pause(p);
  await p.reload({ waitUntil: 'networkidle' });
  await resume(p);
  check(
    (await p.locator('[data-element-id]').count()) === count,
    'Reading checkpoint survives pause/reload/resume',
  );
  await button(p, 'Try a question').click();
  await consumer(p).waitFor();
  check(
    (await p.locator('[data-mode="waiting"]').count()) === 1,
    'Petros yields quietly during student work',
  );
  check(
    (await p.getByRole('table').count()) === 0,
    'Source comparison is absent during the issued task',
  );
  await shot(p, '05-your-turn');
  await hold(p, 1700);
  await button(p, 'Ask Petros').click();
  check(
    (await p.getByRole('dialog').innerText()).includes('Answer-revealing help'),
    'Independent task blocks Ask coaching',
  );
  await close(p, 'Ask Petros');
  await button(p, 'Sources').click();
  check(
    !(await p.getByRole('dialog').innerText()).includes('consumer manages access policy'),
    'Source drawer cannot reveal the explanation during assessment',
  );
  await close(p, 'Your sources');
  await consumer(p).check();
  await reason(p).check();
  await save(p);
  await pause(p);
  await shot(p, '06-paused');
  await hold(p, 1500);
  await p.reload({ waitUntil: 'networkidle' });
  await resume(p);
  await consumer(p).waitFor();
  check(
    (await consumer(p).isChecked()) && (await reason(p).isChecked()),
    'Exact draft choices survive pause and reload',
  );
  let posts = 0;
  p.on('request', (r) => {
    if (r.url().endsWith('/responses') && r.method() === 'POST') posts++;
  });
  await button(p, 'Submit answer').evaluate((b) => {
    b.click();
    b.click();
  });
  await p.getByRole('heading', { name: 'Your feedback', exact: true }).waitFor({ timeout: 30000 });
  check(posts === 1, 'Double click sends one commitment request');
  check(
    (await p.locator('[data-result="satisfied"]').count()) === 2,
    'Only server-evaluated criteria receive satisfied markers',
  );
  check(await consumer(p).isDisabled(), 'Committed work remains visible and frozen');
  await shot(p, '07-cloud-feedback');
  await hold(p, 2100);
  await p.reload({ waitUntil: 'networkidle' });
  await p.getByRole('heading', { name: 'Your feedback', exact: true }).waitFor();
  check(
    (await consumer(p).isChecked()) && (await button(p, 'Submit answer').count()) === 0,
    'Reload restores committed response without resubmission',
  );
  await p.getByRole('button', { name: /^End session/ }).click();
  await p.getByRole('heading', { name: 'Your session is closed.' }).waitFor();
  await hold(p);
  await finish();

  v = await open('english-delivery', { video: 'B-desktop-english' });
  p = v.page;
  await button(p, 'Try a question').waitFor();
  await hold(p, 1800);
  await steps(p);
  await shot(p, '08-english-source');
  await hold(p, 1900);
  await button(p, 'Try a question').click();
  await button(p, 'Focus passage paragraph 2').click();
  check(
    (await button(p, 'Focus passage paragraph 2').getAttribute('aria-pressed')) === 'true',
    'English paragraph focus preserves the source wording',
  );
  const prose =
    'The author argues for extending evening library hours. The survey of 120 learners reports that 84 preferred later access. This supports a preference for access, but does not prove improved attainment. An alternative interpretation needs review.';
  await p.getByLabel('Your answer', { exact: true }).fill(prose);
  await shot(p, '09-english-writing');
  await hold(p, 2200);
  await save(p);
  await pause(p);
  await p.reload({ waitUntil: 'networkidle' });
  await resume(p);
  check(
    (await p.getByLabel('Your answer', { exact: true }).inputValue()) === prose,
    'English prose survives pause/reload/resume',
  );
  await button(p, 'Submit answer').click();
  await p
    .getByRole('heading', { name: 'Teacher review needed', exact: true })
    .waitFor({ timeout: 30000 });
  check(
    (await p.locator('[data-result="satisfied"],[data-mode="acknowledging"]').count()) === 0,
    'Qualitative work stays unverified without a success reaction',
  );
  await shot(p, '10-english-review');
  await hold(p, 2200);
  await finish();

  v = await open('mobile', { width: 360, height: 800, video: 'C-mobile-360' });
  p = v.page;
  await consumer(p).waitFor();
  await shot(p, '11-mobile-360');
  await hold(p, 1800);
  check(
    await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    'Mobile has no horizontal page overflow',
  );
  await consumer(p).check();
  await reason(p).check();
  await save(p);
  await pause(p);
  await p.reload({ waitUntil: 'networkidle' });
  await resume(p);
  await consumer(p).waitFor();
  check(await consumer(p).isChecked(), 'Mobile saves and restores the exact response');
  await button(p, 'Submit answer').click();
  await p.getByRole('heading', { name: 'Your feedback', exact: true }).waitFor({ timeout: 30000 });
  await shot(p, '12-mobile-feedback');
  await hold(p, 2200);
  await finish();

  v = await open('delivery', { video: 'D-companion-behavior' });
  p = v.page;
  await button(p, 'Try a question').waitFor();
  await hold(p, 2200);
  check(
    (await p.locator('[data-idle-motion="true"]').count()) === 0,
    'Quiet idle has no periodic animation loop',
  );
  await p.getByRole('button', { name: /^Explore with Petros/ }).click();
  await p.locator('[data-mode="teaching"]').waitFor();
  await hold(p, 450);
  await shot(p, '13-companion-teaching');
  await button(p, 'Ask Petros').click();
  await p.getByRole('dialog').waitFor();
  check(
    (await p.locator('[data-mode="listening"]').count()) === 1,
    'Question interruption revokes teaching and admits listening',
  );
  await hold(p, 1800);
  await close(p, 'Ask Petros');
  const play = p.getByRole('button', { name: /^Explore with Petros/ });
  if (await play.count()) {
    await play.click();
    await hold(p, 1200);
  }
  if (await button(p, 'Pause explanation').count()) await button(p, 'Pause explanation').click();
  await steps(p);
  await button(p, 'Try a question').click();
  await consumer(p).waitFor();
  await hold(p, 1800);
  await consumer(p).check();
  await reason(p).check();
  await button(p, 'Submit answer').click();
  await p.getByRole('heading', { name: 'Your feedback', exact: true }).waitFor({ timeout: 30000 });
  check(
    (await p.locator('[data-mode="acknowledging"]').count()) === 1,
    'Actual evaluated feedback alone admits acknowledgment',
  );
  await hold(p, 2200);
  await finish();

  for (const width of [360, 390, 768, 1280, 1440]) {
    v = await open('question', { width, reducedMotion: 'reduce' });
    p = v.page;
    await consumer(p).waitFor();
    check(
      await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      'No horizontal overflow at ' + width + 'px',
    );
    await consumer(p).focus();
    await p.keyboard.press('ArrowRight');
    check(
      await p.getByRole('radio', { name: 'The provider', exact: true }).isChecked(),
      'Native keyboard radio navigation at ' + width + 'px',
    );
    await p.keyboard.press('ArrowLeft');
    await p.keyboard.press('Tab');
    check(
      await p.evaluate(() => document.activeElement?.getAttribute('name') === 'answer-reason'),
      'Keyboard reaches next response group at ' + width + 'px',
    );
    await shot(p, 'responsive-' + width);
    await finish();
  }
  v = await open('question', { reducedMotion: 'reduce' });
  p = v.page;
  await consumer(p).waitFor();
  await button(p, 'Learning preferences').click();
  check(
    await p.getByLabel('Reduce motion · show complete steps', { exact: true }).isChecked(),
    'System reduced motion is honored',
  );
  await p.getByLabel('Text-only presentation', { exact: true }).check();
  check(
    (await p.getByRole('dialog').innerText()).includes('Voice is unavailable'),
    'Voice unavailability is explicit',
  );
  await close(p, 'Learning preferences');
  check(
    (await p.locator('[data-shared-petros]').count()) === 0,
    'Text-only mode preserves learning without artwork',
  );
  await shot(p, '14-text-only');
  await p.reload({ waitUntil: 'networkidle' });
  await consumer(p).waitFor();
  check(
    (await p.locator('[data-studio][data-text-only="true"]').count()) === 1 &&
      (await p.locator('[data-shared-petros]').count()) === 0,
    'Text-only preference survives browser reload without losing the task',
  );
  await button(p, 'Learning preferences').click();
  await p.getByLabel('Text-only presentation', { exact: true }).uncheck();
  await p.getByLabel('Hide character', { exact: true }).check();
  await close(p, 'Learning preferences');
  check(
    (await button(p, 'Show Petros character').count()) === 1 &&
      (await button(p, 'Submit answer').isEnabled()),
    'Hidden character leaves navigation and input available',
  );
  await p.reload({ waitUntil: 'networkidle' });
  await consumer(p).waitFor();
  check(
    (await button(p, 'Show Petros character').count()) === 1,
    'Hidden-character preference survives browser reload',
  );
  await consumer(p).check();
  await reason(p).check();
  const savedSessionUrl = p.url();
  await button(p, 'Petros learning studio').click();
  await p.locator('[data-studio-entry]').waitFor();
  await p.goto(savedSessionUrl, { waitUntil: 'networkidle' });
  await p.getByRole('heading', { name: 'Take your time.' }).waitFor();
  await resume(p);
  check(
    (await consumer(p).isChecked()) && (await reason(p).isChecked()),
    'Masthead navigation saves the dirty draft and resumes the same task',
  );
  await finish();

  v = await open('question');
  p = v.page;
  await consumer(p).check();
  await reason(p).check();
  await v.context.setOffline(true);
  await button(p, 'Save draft').click();
  await p.getByRole('alert').waitFor();
  check(
    (await consumer(p).isChecked()) && (await reason(p).isChecked()),
    'Connection failure preserves local response',
  );
  await shot(p, '15-offline');
  await v.context.setOffline(false);
  await hold(p, 500);
  await save(p);
  await p.reload({ waitUntil: 'networkidle' });
  await consumer(p).waitFor();
  check(
    (await consumer(p).isChecked()) && (await reason(p).isChecked()),
    'Reconnection saves the retained draft durably',
  );
  for (let i = 0; i < 20; i++)
    latencies.push(
      await p.evaluate(async (i) => {
        const t = performance.now();
        document.querySelectorAll('input[name="answer-responsibility"]')[i % 2].click();
        await new Promise(requestAnimationFrame);
        return performance.now() - t;
      }, i),
    );
  await consumer(p).check();
  await save(p);
  await finish();
  v = await open('pending');
  p = v.page;
  await p.getByText('Answer submitted.', { exact: false }).first().waitFor();
  await shot(p, '16-pending');
  await p.reload({ waitUntil: 'networkidle' });
  check(
    (await button(p, 'Submit answer').count()) === 0,
    'Pending reload never invites another submission',
  );
  await p.getByRole('heading', { name: 'Your feedback', exact: true }).waitFor({ timeout: 30000 });
  await finish();
  v = await open('unavailable');
  p = v.page;
  await p
    .getByRole('heading', { name: 'Feedback pending', exact: true })
    .waitFor({ timeout: 30000 });
  check(
    (await p.locator('[data-mode="acknowledging"],[data-result="satisfied"]').count()) === 0,
    'Unavailable evaluation cannot show success',
  );
  await shot(p, '17-evaluation-unavailable');
  await finish();
  v = await open('blocked');
  p = v.page;
  await p.getByRole('heading', { name: 'This lesson isn’t available right now.' }).waitFor();
  check(
    (await button(p, 'Submit answer').count()) === 0 &&
      (await p.locator('[data-target]').count()) === 0,
    'Source withdrawal revokes activity and companion targets',
  );
  await shot(p, '18-source-withdrawn');
  await finish();
  v = await open('empty');
  p = v.page;
  await p.getByRole('heading', { name: 'Your next idea is on its way.' }).waitFor();
  check(
    (await button(p, 'Start learning').count()) === 0,
    'Unenrolled student receives no invented available lesson',
  );
  await shot(p, '19-no-lesson');
  await finish();
  v = await open('question', { missing: true });
  p = v.page;
  await consumer(p).waitFor();
  await hold(p, 600);
  check(
    await button(p, 'Submit answer').isEnabled(),
    'Missing artwork leaves input and submission usable',
  );
  await shot(p, '20-missing-art');
  await finish();
  v = await open('question', { width: 1280 });
  p = v.page;
  await consumer(p).waitFor();
  await p.evaluate(() => (document.documentElement.style.zoom = '2'));
  check(
    await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    '200% CSS zoom reflows without page overflow',
  );
  await shot(p, '21-zoom-200');
  await finish();
  const vc = await browser.newContext(),
    vp = await vc.newPage();
  await vp.goto(apiBase + '/demo/v1', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await vp
    .getByRole('button', { name: /Resume|Continue/ })
    .first()
    .waitFor({ timeout: 90000 });
  check(vp.url().includes('/petros/session?'), 'V1 retains its existing session route');
  await shot(vp, '22-v1');
  await vc.close();
  check(errors.length === 0, 'No observed runtime errors or private sentinel leakage');
} catch (error) {
  checks.push({ label: 'Execution error: ' + error.message, passed: false });
  if (active) await shot(active.page, 'failure').catch(() => {});
  process.exitCode = 1;
} finally {
  await finish().catch((e) => errors.push({ message: e.message }));
  await browser.close();
  writeFileSync(
    out + '/browser-results.json',
    JSON.stringify(
      {
        checks,
        errors,
        navigationRecoveries,
        loads,
        snapshots,
        recordings,
        latencies,
        scope:
          'Actual Chromium browser UI and loopback M4 services. Viewport emulation; no physical device or human screen-reader certification. CSS zoom is a reflow check.',
      },
      null,
      2,
    ),
  );
  process.stdout.write(
    JSON.stringify({
      passed: checks.filter((c) => c.passed).length,
      failed: checks.filter((c) => !c.passed).length,
      errors,
      out,
    }),
  );
}
