/* Actual loopback browser verification after the artwork rejection.
 * No response mocks or injected lesson state. Existing evidence is preserved. */
/* global document, innerWidth */
import process from 'node:process';
import { chromium } from 'playwright-core';
import { mkdirSync, existsSync, writeFileSync, copyFileSync } from 'node:fs';
import { resolve } from 'node:path';
const out = resolve(process.env.PETROS_ORIGINAL_EVIDENCE_DIR ?? '');
if (!process.env.PETROS_ORIGINAL_EVIDENCE_DIR || existsSync(out)) throw Error('NEW_EVIDENCE_DIRECTORY_REQUIRED');
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser', headless: true });
const checks = [], errors = [], requests = [];
const check = (value, label) => { checks.push({ passed: !!value, label }); if (!value) throw Error(label); };
async function run(name, width, flow, extra = {}) {
  const context = await browser.newContext({ viewport: { width, height: 1000 }, recordVideo: { dir: `${out}/raw`, size: { width, height: 1000 } }, ...extra });
  const p = await context.newPage();
  p.setDefaultTimeout(60000);
  p.on('pageerror', e => errors.push({ name, error: e.message }));
  p.on('request', r => { if (r.url().includes('/petros/')) requests.push(r.url()); });
  try {
    await flow(p);
    check(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${name}: no horizontal overflow`);
    await p.screenshot({ path: `${out}/${name}.png`, fullPage: true });
  } catch (e) {
    errors.push({ name, error: String(e) });
    await p.screenshot({ path: `${out}/${name}-failure.png`, fullPage: true }).catch(() => {});
  } finally {
    const video = p.video();
    await context.close();
    copyFileSync(await video.path(), `${out}/${name}.webm`);
    writeFileSync(`${out}/results.json`, JSON.stringify({ checks, errors, requests }, null, 2));
    process.stdout.write(`Recorded ${name}\n`);
  }
}
async function sampler(p) {
  await p.goto('http://127.0.0.1:4984/verification/petros-v2/companion', { waitUntil: 'domcontentloaded', timeout: 180000 });
  await p.getByRole('heading', { name: 'The familiar Petros.' }).waitFor();
  await p.waitForLoadState('networkidle');
  const image = p.locator('[data-original-preview] img[data-active="true"]');
  for (const [pose, file] of Object.entries({ neutral: 'idle', listening: 'listening', thinking: 'thinking', speaking: 'talking', 'point-right': 'point-right', 'point-left': 'point-left', 'point-up': 'point-up', 'point-down': 'point-down' })) {
    await p.getByLabel('Pose', { exact: true }).selectOption(pose);
    await p.waitForTimeout(400);
    check(await image.getAttribute('src') === `/petros/states/petros-${file}.png`, `Sampler: original ${pose} image`);
    check(await image.evaluate(img => img.complete && img.naturalWidth > 0), `Sampler: ${pose} decoded successfully`);
  }
  await p.getByLabel('Pose', { exact: true }).selectOption('neutral');
  await p.getByRole('button', { name: 'Play existing narration', exact: true }).click();
  await p.locator('[data-original-preview] [data-speaking="true"]').waitFor();
  check(await image.getAttribute('src') === '/petros/states/petros-talking.png', 'Actual audio selects original static talking pose');
  check(await p.locator('[data-original-preview] svg').count() === 0, 'No generated facial or mouth overlays');
  await p.waitForTimeout(700);
  await p.getByRole('button', { name: 'Stop playback', exact: true }).click();
  await p.locator('[data-original-preview] [data-speaking="false"]').waitFor();
  check(await image.getAttribute('src') === '/petros/states/petros-idle.png', 'Stop returns to original neutral pose');
  await p.getByLabel('Minimize', { exact: true }).check();
  check(await image.count() === 0 && await p.getByRole('status').count() === 1, 'Minimize keeps public caption without artwork');
  await p.getByLabel('Minimize', { exact: true }).uncheck();
  check(await p.locator('[data-layered-character]').count() === 0, 'Rejected candidate is absent from live sampler');
}
await run('restored-original-sampler-desktop', 1440, async p => {
  await sampler(p);
  await p.screenshot({ path: `${out}/original-sampler.png`, fullPage: true });

});
await run('restored-original-sampler-mobile', 360, sampler, { isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
await run('restored-original-studio', 1440, async p => {
  await p.goto('http://127.0.0.1:4983/demo/cloud-a?fresh=1', { waitUntil: 'domcontentloaded', timeout: 180000 });
  await p.locator('[data-rig="original-authored-poses"]').waitFor();
  check(await p.locator('[aria-label="Petros companion"]').count() === 1, 'Studio has one companion owner');
  const image = p.locator('[data-rig] img[data-active="true"]');
  check(await image.getAttribute('src') === '/petros/states/petros-idle.png', 'Issued Studio question uses original neutral artwork');
  const answer = p.getByRole('spinbutton', { name: 'Whole-VM capacity (VM)', exact: true });
  await answer.fill('7');
  await p.waitForTimeout(500);
  check(await answer.inputValue() === '7', 'Editing retains the draft value');
  check(await image.getAttribute('src') === '/petros/states/petros-idle.png', 'Assessment stays neutral during input');
  check(await p.locator('[data-layered-character], [data-rig] svg').count() === 0, 'Studio does not render generated avatar or facial overlays');
});
check(!requests.some(url => /\/petros\/v2\/rig\/(layers\.svg|neutral\.png|attentive\.png|thoughtful\.png|pleased\.png|uncertain\.png)/.test(url)), 'No rejected candidate art fetched by the live sampler or Studio');
await browser.close();
writeFileSync(`${out}/results.json`, JSON.stringify({ checks, errors, requests }, null, 2));
if (errors.length || checks.some(c => !c.passed)) process.exitCode = 1;
