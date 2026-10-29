/** Runs against the disposable loopback demo only; never accepts a remote target. */
import { chromium } from 'playwright-core';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
if (process.argv.length !== 2 || !process.env.PETROS_M4_EVIDENCE_DIR)
  throw Error('M4_TIMESTAMPED_OUTPUT_REQUIRED');
const out = resolve(process.env.PETROS_M4_EVIDENCE_DIR);
if (existsSync(out)) throw Error('M4_NEW_BROWSER_EVIDENCE_DIRECTORY_REQUIRED');
mkdirSync(out);
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const checks = [],
  errors = [],
  loads = [];
function assert(ok, message) {
  checks.push({ message, passed: !!ok });
  if (!ok) throw Error(message);
}
async function visit(role, width = 1440) {
  const context = await browser.newContext({
      viewport: { width, height: 1000 },
      reducedMotion: 'reduce',
    }),
    page = await context.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('response', async (r) => {
    if (r.url().includes('/v1/student/petros/v2/')) {
      const text = await r.text().catch(() => '');
      if (text.includes('M4_PRIVATE_SENTINEL_9817')) errors.push('Private sentinel leaked');
    }
  });
  const began = performance.now();
  await page.goto(`http://127.0.0.1:4943/demo/${role}`, {
    waitUntil: 'domcontentloaded',
    timeout: 90000,
  });
  await page.locator('main').last().waitFor({ timeout: 90000 });
  if (role === 'entry')
    await page
      .getByRole('button', { name: /Start learning|Continue learning/ })
      .first()
      .waitFor({ timeout: 90000 });
  else if (role === 'blocked')
    await page
      .getByRole('heading', { name: 'This lesson isn’t available right now.' })
      .waitFor({ timeout: 90000 });
  else if (role === 'v1')
    await page
      .getByRole('button', { name: /Resume|Continue/ })
      .first()
      .waitFor({ timeout: 90000 });
  else
    await page
      .getByRole('heading', { level: 1 })
      .filter({ hasText: /Cloud|Argument|English/ })
      .waitFor({ timeout: 90000 });
  await page.waitForTimeout(350);
  loads.push({
    role,
    width,
    ms: performance.now() - began,
    warm: 'Next development server; includes compilation where cold',
  });
  return { context, page };
}
async function shot(page, name) {
  await page.screenshot({ path: resolve(out, `${name}.png`), fullPage: true });
}
try {
  let v = await visit('entry');
  await shot(v.page, '01-entry');
  assert(
    (await v.page.getByRole('button', { name: 'Start learning' }).count()) > 0,
    'Authorized start action is visible',
  );
  await v.page.getByRole('button', { name: 'Start learning' }).first().click();
  await v.page.getByRole('button', { name: 'Try a question' }).waitFor({ timeout: 90000 });
  assert(
    v.page.url().includes('/petros/v2/session'),
    'Admission dispatches into server-selected V2',
  );
  await v.context.close();
  v = await visit('delivery');
  await v.page.getByRole('button', { name: 'Try a question' }).waitFor();
  await shot(v.page, '02-delivery');
  await v.context.close();
  v = await visit('question');
  await v.page.getByLabel('Who manages the consumer’s access policy?').waitFor();
  await shot(v.page, '03-question');
  await v.page.getByLabel('Who manages the consumer’s access policy?').selectOption('consumer');
  await v.page.getByRole('button', { name: 'Pause lesson' }).click();
  await v.page.getByRole('heading', { name: 'Take your time.' }).waitFor();
  await v.page.reload();
  await v.page.getByRole('heading', { name: 'Take your time.' }).waitFor();
  await shot(v.page, '06-pause-resume');
  await v.page.getByRole('button', { name: 'Continue learning' }).click();
  await v.page.getByLabel('Who manages the consumer’s access policy?').waitFor();
  assert(
    (await v.page.getByLabel('Who manages the consumer’s access policy?').inputValue()) ===
      'consumer',
    'Pause/reload/resume restores saved draft',
  );
  await v.page.getByLabel('Which boundary explains your answer?').selectOption('data_access');
  await v.page.getByRole('button', { name: 'Submit answer', exact: true }).click();
  await v.page.getByText('Answer submitted.', { exact: false }).first().waitFor();
  await v.page.getByRole('heading', { name: 'Your feedback' }).waitFor({ timeout: 30000 });
  assert(
    (await v.page.locator('[role="status"]').filter({ hasText: 'Answer submitted' }).count()) > 0,
    'Durable answer is acknowledged',
  );
  await v.context.close();
  v = await visit('pending');
  await v.page
    .getByText('Checking your response…', { exact: false })
    .first()
    .waitFor({ timeout: 30000 });
  await shot(v.page, '04-pending');
  await v.page.reload();
  await v.page.getByText('Answer submitted.', { exact: false }).first().waitFor();
  assert(
    (await v.page.getByRole('button', { name: 'Submit answer', exact: true }).count()) === 0,
    'Reload during evaluation does not ask for resubmission',
  );
  await v.page.getByRole('heading', { name: 'Your feedback' }).waitFor({ timeout: 30000 });
  await v.context.close();
  v = await visit('feedback');
  await v.page.getByRole('heading', { name: 'Your feedback' }).waitFor();
  await shot(v.page, '05-feedback');
  await v.context.close();
  for (const width of [1440, 1280, 768, 390, 360]) {
    v = await visit('mobile', width);
    await v.page.getByLabel('Who manages the consumer’s access policy?').waitFor();
    assert(
      await v.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      `No horizontal overflow at ${width}px`,
    );
    await v.page.getByLabel('Who manages the consumer’s access policy?').focus();
    await v.page.keyboard.press('Tab');
    assert(
      await v.page
        .getByLabel('Which boundary explains your answer?')
        .evaluate((el) => el === document.activeElement),
      `Keyboard reaches next answer field at ${width}px`,
    );
    await shot(v.page, width === 360 ? '07-mobile-360' : `responsive-${width}`);
    await v.context.close();
  }
  v = await visit('blocked');
  await shot(v.page, '08-source-unavailable');
  assert(
    (await v.page.getByRole('button', { name: 'Submit answer', exact: true }).count()) === 0,
    'Withdrawn source cannot accept more work',
  );
  await v.context.close();
  v = await visit('english');
  await v.page
    .getByLabel('Your answer', { exact: true })
    .fill(
      'The claim concerns extending library hours. The survey supports preference, but does not prove attainment. A defensible alternative requires review.',
    );
  await v.page.getByRole('button', { name: 'Submit answer', exact: true }).click();
  await v.page.getByRole('heading', { name: 'Teacher review needed' }).waitFor({ timeout: 30000 });
  await shot(v.page, 'english-review');
  await v.context.close();
  v = await visit('v1');
  await shot(v.page, 'v1-paused');
  assert(v.page.url().includes('/petros/session?'), 'V1 keeps its original route');
  await v.context.close();
  assert(errors.length === 0, 'No browser runtime errors or observed private sentinel leakage');
} finally {
  writeFileSync(
    resolve(out, 'browser-results.json'),
    JSON.stringify(
      {
        checks,
        errors,
        loads,
        device:
          'Automated desktop Chrome emulation; no physical device or human screen-reader certification',
      },
      null,
      2,
    ),
  );
  await browser.close();
}
