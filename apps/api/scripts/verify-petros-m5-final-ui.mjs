/* Loopback browser evidence: actual session commands and evaluator outcomes; no response mocking. */
import { chromium } from 'playwright-core';
import { mkdirSync, existsSync, writeFileSync, copyFileSync } from 'node:fs';
import { resolve } from 'node:path';
if (!process.env.PETROS_M5_FINAL_BROWSER_DIR) throw Error('NEW_EVIDENCE_DIRECTORY_REQUIRED');
const out = resolve(process.env.PETROS_M5_FINAL_BROWSER_DIR);
if (existsSync(out)) throw Error('NEW_DIRECTORY_REQUIRED');
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser', headless: true });
const checks = [], errors = [], videos = [], snapshots = [], timings = [];
const check = (passed, label) => { checks.push({ passed: !!passed, label }); if (!passed) throw Error(label); };
const btn = (p, name) => p.getByRole('button', { name, exact: true });
const hold = (p, ms = 700) => p.waitForTimeout(ms);
async function wait(p, condition, label = 'session update') { for (let i = 0; i < 120; i++) { if (condition(p._s)) return; await hold(p, 150); } throw Error(`Timed out: ${label}`); }
async function command(p, name) { const revision = p._s?.revision ?? -1; await btn(p, name).click(); await wait(p, s => s?.revision > revision, name); await hold(p, 250); }
async function assessed(p) { await wait(p, s => s?.submission?.status === 'complete' && !!s?.evaluation, 'authoritative evaluation'); await btn(p, 'Work on this with Petros').waitFor(); await hold(p); }
async function cloud(p, conceptual = true) {
  await p.getByRole('radio', { name: conceptual ? 'Provider' : 'Consumer', exact: true }).check();
  check(await p.locator('label:has(input:checked)').evaluate(el => getComputedStyle(el).backgroundColor) === 'rgb(241, 244, 247)', 'Selected answer is neutral before evaluation');
  await p.getByRole('spinbutton', { name: 'Available memory (GB)', exact: true }).fill('48');
  await p.getByRole('spinbutton', { name: 'Whole-VM capacity (VM)', exact: true }).fill(conceptual ? '6' : '7');
  await btn(p, 'Submit answer').click(); await assessed(p);
}
async function teach(p, title) { await command(p, 'Work on this with Petros'); await p.getByRole('heading', { name: title, exact: true }).waitFor(); }
async function steps(p) { for (let i = 0; i < 32 && p._s?.teaching?.status === 'presenting'; i++) { await btn(p, 'Show next teaching step').waitFor(); await command(p, 'Show next teaching step'); } await hold(p, 300); }
async function link(p, to, relation = 'connects', from = 'guest-os') {
  await p.getByLabel('From', { exact: true }).selectOption(from); await p.getByLabel('To', { exact: true }).selectOption(to); await p.getByLabel('Relationship', { exact: true }).selectOption(relation); await command(p, 'Save relationship');
}
async function commit(p, explanation = 'This is my committed explanation of the edited relationship.') { await command(p, 'Use this work for the reviewed practice task'); await p.getByRole('textbox', { name: 'Your answer', exact: true }).fill(explanation); await btn(p, 'Submit answer').click(); await assessed(p); }
async function shot(p, name) { await p.screenshot({ path: `${out}/${name}.png`, fullPage: true }); }
async function run(name, role, flow, width = 1440, extra = {}) {
  const context = await browser.newContext({ viewport: { width, height: 1000 }, ...(width <= 390 ? { isMobile: true, hasTouch: true } : {}), ...extra, recordVideo: { dir: out + '/raw-videos', size: { width, height: 1000 } } });
  const p = await context.newPage();
  p.on('pageerror', e => errors.push({ name, error: e.message }));
  p.on('response', async r => {
    if (r.url().includes('/v1/student/petros/v2/sessions/')) {
      const t = r.request().timing(); timings.push({ name, method: r.request().method(), status: r.status(), ms: t.responseStart - t.requestStart });
      if (r.request().method() === 'GET' && r.status() === 200) { const s = await r.json().catch(() => null); if (s?.engine === 'v2') { p._s = s; snapshots.push({ name, snapshot: s }); if (JSON.stringify(s).includes('M4_PRIVATE_SENTINEL')) errors.push({ name, error: 'Private sentinel leaked' }); } }
    }
  });
  try {
    await p.goto(role ? `http://127.0.0.1:4943/demo/${role}?fresh=1` : 'http://127.0.0.1:4944/verification/petros-v2/feedback-gallery', { waitUntil: 'domcontentloaded', timeout: 90000 });
    if (role) { await btn(p, 'Submit answer').waitFor({ timeout: 90000 }); await wait(p, s => !!s); }
    await flow(p, context); check(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${name}: no overflow at ${width}px`); await shot(p, name); await hold(p);
  } catch (e) { errors.push({ name, error: String(e) }); await shot(p, name + '-failure').catch(() => {}); process.stdout.write(`${name}: ${e}\n`); }
  finally { const video = p.video(); await context.close(); copyFileSync(await video.path(), `${out}/${name}.webm`); videos.push(name); process.stdout.write(`Recorded ${name}\n`); }
}
await run('A-cloud-diagram', 'cloud-a', async p => {
  await cloud(p);
  check(await p.locator('fieldset[data-feedback="incorrect"] label:has(input:checked)').evaluate(el => getComputedStyle(el).backgroundColor) === 'rgb(255, 240, 243)', 'Incorrect selected responsibility is rose after evaluation');
  check(await p.locator('[aria-label="Response feedback"]').getAttribute('data-feedback') === 'partial', 'Mixed result is amber partial'); await shot(p, 'A-initial-partial');
  await teach(p, 'Compare the relationship'); await steps(p);
  const node = btn(p, 'Guest operating system'); await node.click(); check(await node.getAttribute('aria-pressed') === 'true', 'Diagram node selection works');
  const before = p._s.canvas.elements.find(e => e.id === 'guest-os'), rev = p._s.revision; await node.press('ArrowRight'); await wait(p, s => s?.revision > rev);
  check(p._s.canvas.elements.find(e => e.id === 'guest-os').x !== before.x, 'Keyboard movement persists an accepted canvas operation');
  await command(p, 'Undo diagram edit'); check(p._s.canvas.elements.find(e => e.id === 'guest-os').x === before.x, 'Undo restores actual node position');
  await command(p, 'Redo diagram edit'); check(p._s.canvas.elements.find(e => e.id === 'guest-os').x !== before.x, 'Redo restores the accepted move');
  const box = await node.boundingBox(), old = p._s.revision; await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await p.mouse.down(); await p.mouse.move(box.x + box.width / 2 + 45, box.y + box.height / 2 + 25, { steps: 12 }); await p.mouse.up(); await wait(p, s => s?.revision > old, 'mouse drag'); check(true, 'Mouse dragging persists accepted geometry');
  await link(p, 'provider'); const edge = p._s.canvas.elements.find(e => e.kind === 'edge' && e.editable);
  await p.locator(`[data-edge-label="${edge.id}"] button`).click(); check(await btn(p, 'Edit relationship').isVisible(), 'Edge selection exposes editing controls');
  await btn(p, 'Edit relationship').click(); await p.getByLabel('Relationship label', { exact: true }).selectOption('supports'); await command(p, 'Save label'); const modified = p._s.canvas.elements.find(e => e.kind === 'edge' && e.editable); check(modified.relation === 'supports', 'Edge label edit changes saved semantic relationship');
  await commit(p); check(await p.locator(`[data-edge-line="${modified.id}"]`).evaluate(el => getComputedStyle(el).stroke) === 'rgb(190, 80, 107)', 'Incorrect committed edge has rose stroke'); await shot(p, 'A-incorrect-edge');
  await teach(p, 'Compare the relationship'); await steps(p); await link(p, 'consumer'); await commit(p, 'In IaaS the consumer manages the guest operating system.');
  check(p._s.evaluation.criteria.every(c => c.status === 'satisfied'), 'Corrected diagram passes actual private criterion'); await shot(p, 'A-corrected-edge');
});
await run('B-cloud-equation', 'cloud-b', async p => {
  await cloud(p, false); await teach(p, 'Check the method'); await steps(p); await commit(p, 'I am checking the units and whole VM capacity.');
  check(p._s.evaluation.criteria.some(c => c.status === 'not_satisfied'), 'Uncorrected mathematical step actually fails evaluation');
  check(await p.locator('[data-canvas-element="capacity"]').getAttribute('data-feedback') === 'incorrect', 'Incorrect equation step has rose state'); await shot(p, 'B-incorrect-step');
  await teach(p, 'Check the method'); await steps(p); await p.getByRole('textbox', { name: 'Whole VM capacity', exact: true }).fill('6'); await command(p, 'Save Whole VM capacity step'); await commit(p, '48 GB divided by 8 GB per VM gives six whole VMs.');
  check(p._s.evaluation.criteria.every(c => c.status === 'satisfied'), 'Corrected mathematical step is evaluated from immutable work'); await shot(p, 'B-corrected-step');
  await teach(p, 'Try with less support'); await steps(p); await btn(p, 'Request a fresh reviewed check').click(); await p.getByRole('alert').getByText(/fresh reviewed task is not available/).waitFor(); check(true, 'Next unavailable reviewed check is explicit');
});
await run('C-english-argument', 'english', async p => {
  await p.getByRole('radio', { name: '84 of 120 learners preferred later access', exact: true }).check(); await p.getByRole('textbox', { name: 'Explain the warrant, uncertainty or alternative interpretation', exact: true }).fill('The survey reports a preference. The warrant to feasible policy needs scrutiny; other residents may differ.'); await btn(p, 'Submit answer').click(); await assessed(p);
  check(p._s.evaluation.status === 'review_required', 'English interpretation requires teacher review'); check(await p.locator('[aria-label="Response feedback"]').getAttribute('data-feedback') === 'review', 'Review remains blue with separate factual criteria');
  await teach(p, 'Look more closely'); await steps(p); await link(p, 'claim', 'supports', 'evidence'); await btn(p, 'Evidence · survey passage').click();
  await p.getByRole('textbox', { name: /Explain or annotate/ }).fill('The preference does not guarantee feasible longer hours. Sampling uncertainty remains.'); await command(p, 'Save annotation'); check(p._s.canvas.elements.some(e => e.annotation?.includes('feasible')), 'English warrant is saved on the actual canvas');
  await commit(p, 'A preference supports considering longer hours, with feasibility and sampling uncertainty open.'); check(p._s.evaluation.status === 'review_required', 'Committed English argument preserves qualitative uncertainty');
});
async function extensions(p) { await cloud(p); await teach(p, 'Compare the relationship'); await steps(p); await link(p, 'consumer'); await commit(p); await teach(p, 'Try with less support'); await steps(p); }
await run('D-bounded-experiment', 'cloud-a', async p => {
  await extensions(p); await command(p, 'Explore a bounded experiment'); await steps(p); await p.getByRole('textbox', { name: 'Your prediction and reason', exact: true }).fill('More memory should allow more equal-size VMs with a fixed reserve.'); await command(p, 'Run bounded experiment'); check(p._s.teaching.experiment.values.capacity === 6, 'Registered kernel initially returns six VMs'); await shot(p, 'D-model-six');
  await p.getByRole('spinbutton', { name: 'totalGB', exact: true }).fill('80'); await wait(p, s => s?.teaching?.experiment?.values.capacity === 8, 'checked automatic model update'); check(await p.locator('[data-model-capacity]').getAttribute('data-model-capacity') === '8', 'Parameter change updates checked visual geometry'); await p.getByRole('textbox', { name: 'Compare the observation with your prediction', exact: true }).fill('The observation has two more whole VMs.');
});
await run('E-process-graph', 'cloud-b', async p => {
  await extensions(p); await command(p, 'Inspect a process trace'); await command(p, 'Show next teaching step'); await command(p, 'Pause lesson'); await p.reload(); await btn(p, 'Continue learning').waitFor(); await command(p, 'Continue learning'); await steps(p); check(p._s.teaching.status === 'complete', 'Pause reload resume preserves process prefix');
  if (await btn(p, 'Previous process step').isEnabled()) await btn(p, 'Previous process step').click(); if (await btn(p, 'Next process step').isEnabled()) await btn(p, 'Next process step').click(); check(await p.locator('tr[aria-current="step"]').count() === 1, 'Process navigation marks current reviewed state'); await shot(p, 'E-process');
  await command(p, 'Compare a graph and table'); await steps(p); await btn(p, 'Graph table and text alternative').click(); await p.getByRole('dialog').waitFor(); check(await p.getByRole('dialog').getByRole('table').count() === 1, 'Graph includes equivalent accessible table'); await p.keyboard.press('Escape'); await hold(p, 150); check(await btn(p, 'Graph table and text alternative').evaluate(el => el === document.activeElement), 'Graph reader returns focus');
});
await run('F-petros-context', 'companion', async p => {
  await cloud(p); await teach(p, 'Compare the relationship'); await command(p, 'Show next teaching step'); const cue = p._s.teaching.targetId; const target = p.locator(`[data-canvas-element="${cue}"], [data-element-id="${cue}"]`).first(); const bounds = await target.boundingBox(); check(!!cue && !!bounds && bounds.y >= 0 && bounds.y + bounds.height <= 1000, 'Petros references a real accepted visible target'); await shot(p, 'F-teaching-target'); await steps(p);
  check(await p.locator('[aria-label="Petros companion"]').getAttribute('data-mode') === 'waiting', 'Companion yields while editing'); check(await p.locator('[data-pose]').getAttribute('data-pose') === 'neutral', 'Editing suppresses teaching gestures'); await link(p, 'provider'); await commit(p);
  check(await p.locator('[aria-label="Petros companion"]').getAttribute('data-mode') === 'thinking', 'Incorrect evaluation uses thoughtful cue'); check(await p.locator('[data-pose]').getAttribute('data-pose') === 'thinking', 'Incorrect reaction uses supported authored thinking artwork'); await shot(p, 'F-evaluated-reaction'); await btn(p, 'Sources').click(); await p.getByRole('dialog').waitFor(); await p.keyboard.press('Escape'); await hold(p, 150); check(await btn(p, 'Sources').evaluate(el => el === document.activeElement), 'Sources dialog returns focus');
});
await run('G-mobile-360', 'mobile', async p => {
  await cloud(p, false); await teach(p, 'Check the method'); await steps(p); await p.getByRole('textbox', { name: 'Whole VM capacity', exact: true }).fill('6'); const rev = p._s.revision; await btn(p, 'Save Whole VM capacity step').tap(); await wait(p, s => s?.revision > rev);
  await btn(p, 'Teaching text alternative').tap(); const dialog = p.getByRole('dialog'); await dialog.waitFor(); check((await dialog.innerText()).includes('Your saved step: 6'), 'Mobile reader preserves full saved equation'); await dialog.getByRole('button', { name: 'Close Teaching text alternative', exact: true }).tap(); await hold(p, 150); check(await btn(p, 'Teaching text alternative').evaluate(el => el === document.activeElement), 'Mobile reader returns focus'); await commit(p, 'Six whole VMs; GB units cancel.'); check(p._s.evaluation.criteria.every(c => c.status === 'satisfied'), '360px touch flow commits and evaluates real correction');
}, 360);
await run('H-feedback-comparison', null, async p => {
  await p.getByRole('heading', { name: 'M5 feedback comparison', exact: true }).waitFor(); check(await p.locator('[data-gallery-state]').count() === 9, 'Gallery contains nine real component fixture states'); await shot(p, 'H-gallery');
  for (const state of ['not-selected', 'selected', 'saved', 'pending', 'correct', 'incorrect', 'partial', 'review', 'assisted']) { await p.goto(`http://127.0.0.1:4944/verification/petros-v2/feedback-gallery?state=${state}`); await hold(p); if (['pending', 'incorrect', 'partial', 'review'].includes(state)) check(await p.locator('[aria-label="Response feedback"]').getAttribute('data-feedback') === state, `Gallery ${state} is semantically accurate`); if (['not-selected', 'selected', 'saved', 'pending', 'incorrect'].includes(state)) check(await p.locator('[data-feedback="correct"]').count() === 0, `${state} never implies achievement`); await shot(p, `H-${state}`); }
});
for (const width of [1440, 1280, 768, 390, 360]) await run(`width-${width}`, 'reduced', async (p, context) => {
  await cloud(p); await teach(p, 'Compare the relationship'); await steps(p); await btn(p, 'Teaching text alternative').focus(); await p.keyboard.press('Enter'); const dialog = p.getByRole('dialog'); await dialog.waitFor(); check((await dialog.innerText()).includes('Consumer responsibility'), `${width}px full educational content remains accessible`); await p.evaluate(() => document.documentElement.style.fontSize = '200%'); check(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth + 1), `${width}px reader supports enlarged text`); await shot(p, `reader-${width}`); await p.keyboard.press('Escape'); await hold(p, 150); check(await btn(p, 'Teaching text alternative').evaluate(el => el === document.activeElement), `${width}px keyboard focus restores`); await p.evaluate(() => document.documentElement.style.fontSize = '');
  await btn(p, 'Learning preferences').click(); await p.getByRole('checkbox', { name: 'Text-only presentation', exact: true }).check(); await p.keyboard.press('Escape'); await hold(p, 150); check(await p.locator('[data-text-only="true"]').count() > 0, `${width}px primary text presentation works`); await link(p, 'consumer'); await commit(p); check(p._s.evaluation.criteria.every(c => c.status === 'satisfied'), `${width}px text mode preserves real edit and evaluation`); check(await p.locator('[data-reduced-motion="true"]').count() > 0, `${width}px reduced motion honored`);
  const id = p._s.id; await context.setOffline(true); await hold(p, 300); await context.setOffline(false); await p.reload(); await p.locator('[aria-label="Response feedback"]').waitFor(); check(p._s.id === id && p._s.submission.status === 'complete', `${width}px reconnect retains immutable submission`);
}, width, { reducedMotion: 'reduce' });
await browser.close();
writeFileSync(`${out}/results.json`, JSON.stringify({ checks, errors, videos, timings, snapshotCount: snapshots.length, browser: 'Brave Chromium headless; emulated touch and reduced motion. No physical device or human screen reader qualification.' }, null, 2)); writeFileSync(`${out}/public-snapshots.json`, JSON.stringify(snapshots, null, 2));
writeFileSync(`${out}/review.html`, `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>M5 refinement recordings</title><style>body{font:16px system-ui;background:#f7f7f0;color:#213d34;margin:24px;max-width:1200px}video{width:100%;max-height:80vh}section{margin:30px 0}a{color:#164f42}</style><h1>M5 refinement · local browser recordings</h1><p>Synthetic isolated students and review records. Actual canvas commands and private deterministic evaluation. H is explicitly typed visual fixtures. No provider inference or academic qualification.</p>${videos.filter(n => /^[A-H]-/.test(n)).map(n => `<section><h2>${n}</h2><video controls preload="metadata" src="${n}.webm"></video><p><a href="${n}.png">Final screenshot</a></p></section>`).join('')}<p>${checks.filter(c => c.passed).length}/${checks.length} checks passed; ${errors.length} errors.</p></html>`);
process.stdout.write(JSON.stringify({ out, checks: checks.length, failed: checks.filter(c => !c.passed), errors }, null, 2) + '\n'); if (errors.length || checks.some(c => !c.passed)) process.exitCode = 1;
