import { chromium, type Page } from 'playwright-core';
import { mkdir, writeFile, rename } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { browserExecutable } from './browser-executable';
const dir = 'evidence/world-motion/interaction';
await mkdir(dir + '/recordings', { recursive: true });
const browser = await chromium.launch({
  executablePath: browserExecutable(),
  headless: true,
  args: ['--enable-unsafe-swiftshader'],
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  reducedMotion: 'no-preference',
  recordVideo: { dir: dir + '/recordings', size: { width: 1440, height: 900 } },
});
const p = await context.newPage();
p.setDefaultNavigationTimeout(120000);
await p.addInitScript('window.__name=(fn)=>fn;');
const results: any = { tests: [], errors: [], productionMutations: [] };
p.on('pageerror', (e) => results.errors.push(e.message));
p.on('console', (m) => {
  if (m.type() === 'error' && /Shader|WebGLProgram/.test(m.text()))
    results.errors.push(m.text());
});
p.on('request', (r) => {
  if (
    ['POST', 'PUT', 'PATCH', 'DELETE'].includes(r.method()) &&
    !r.url().includes('/prototype/api/')
  )
    results.productionMutations.push(r.url());
});
const base = process.env.SHOWCASE_TEST_URL ?? 'http://127.0.0.1:3022';
const world = () =>
  p.getByRole('main', { name: 'Petros World immersive study' });
async function key(name: RegExp) {
  const button = p.getByRole('button', { name }).first();
  await p.waitForFunction(
    (el) => !(el as HTMLButtonElement).disabled,
    await button.elementHandle(),
  );
  await button.focus();
  await p.keyboard.press('Enter');
}
async function station(name: RegExp) {
  if (await p.getByRole('button', { name: 'Choose a station' }).isVisible())
    await key(/Choose a station/);
  await key(name);
}
async function settle() {
  await p.waitForTimeout(120);
  await p.waitForFunction(
    () =>
      document.querySelector(
        '[data-world-phase][data-camera-moving="false"]',
      ) && (window as any).__PETROS_ANIMATION__?.camera.status === 'idle',
    undefined,
    { timeout: 60000 },
  );
  await p.waitForTimeout(100);
}
async function state() {
  await p.waitForTimeout(40);
  return p.evaluate(
    () => JSON.parse(sessionStorage.getItem('petros.learning.v3')!).state,
  );
}
async function motion() {
  return p.evaluate(() =>
    structuredClone((window as any).__PETROS_ANIMATION__),
  );
}
async function checkpoint(index: number) {
  await key(/Accessibility and preferences/);
  await key(new RegExp('^' + index + '\\.'));
  await settle();
}
async function enter() {
  await key(/Enter Petros World/);
  await p.waitForFunction(
    () =>
      !document.querySelector('[aria-label="Entering Petros World"]') &&
      document.querySelector('[data-world-phase]'),
    undefined,
    { timeout: 90000 },
  );
  await settle();
}
try {
  await p.goto(base + '/prototype', { waitUntil: 'networkidle' });
  await p
    .getByRole('button', {
      name: 'How does artificial intelligence work?',
      exact: true,
    })
    .click();
  await enter();
  const saved = await state();
  await station(/02\s*Library/);
  await p.waitForTimeout(240);
  await key(/Pause motion/);
  await p.waitForFunction(
    () => (window as any).__PETROS_ANIMATION__?.camera.status === 'paused',
  );
  const paused = await motion();
  await p.waitForTimeout(400);
  const still = await motion();
  assert.equal(paused.camera.progress, still.camera.progress);
  assert.equal(still.camera.status, 'paused');
  await key(/Resume motion/);
  await settle();
  assert.equal((await motion()).camera.status, 'idle');
  assert.deepEqual((await motion()).character, {
    station: 'bookshelf',
    opacity: 1,
    moving: false,
  });
  await p.waitForTimeout(100);
  assert.equal((await motion()).character.opacity, 1);
  assert.equal((await state()).questionId, saved.questionId);
  results.tests.push(
    'camera pause retains progress; resume completes without academic advancement',
  );
  await p
    .getByRole('button', {
      name: 'How does artificial intelligence work?',
      exact: true,
    })
    .click();
  await key(/Continue this lesson|Let me show you/);
  await settle();
  await key(/Show me/);
  await p.waitForTimeout(350);
  const live = await motion();
  assert.equal(live.board.status, 'moving');
  assert.ok(live.board.elapsed > 0 && live.board.elapsed < 1450);
  await key(/Need help/);
  await key(/Ask Petros a question/);
  await p.waitForFunction(
    () => (window as any).__PETROS_ANIMATION__?.board.status === 'paused',
  );
  const helpFrame = await motion();
  const assetBefore = helpFrame.assets;
  await p
    .getByRole('textbox', { name: 'Ask Petros a question' })
    .fill('Why is this input multiplied by that weight?');
  await p.waitForTimeout(350);
  assert.equal((await motion()).board.elapsed, helpFrame.board.elapsed);
  assert.deepEqual((await motion()).assets, assetBefore);
  await p.getByRole('button', { name: 'Ask Petros', exact: true }).focus();
  await p.keyboard.press('Enter');
  await p
    .getByRole('region', { name: 'Lesson help' })
    .getByText(/Prepared general-knowledge explanation/)
    .waitFor();
  await p.screenshot({ path: dir + '/interrupted-board.png' });
  await key(/Resume this step/);
  await p.waitForTimeout(1600);
  assert.equal((await motion()).board.status, 'idle');
  assert.equal((await state()).questionId, saved.questionId);
  results.tests.push(
    'board animation pauses for a contextual question, typing creates no scene/texture mounts, resume finishes the same operation',
  );
  await key(/Your turn/);
  const unanswered = await state();
  await p.waitForTimeout(1200);
  assert.deepEqual((await state()).observations, unanswered.observations);
  assert.equal((await state()).questionId, unanswered.questionId);
  results.tests.push('response gate remains stationary and unanswered');
  await checkpoint(6);
  const priorTransitions = await p.evaluate(
    () => (window as any).__PETROS_WORLD_METRICS__.transitions.length,
  );
  await key(/Show me/);
  await p.waitForTimeout(120);
  assert.equal((await motion()).board.key.endsWith('network-update'), true);
  await p.waitForTimeout(600);
  assert.equal((await state()).visualState.weight, 1.5);
  assert.match(
    await p.getByLabel('Whiteboard text equivalent').innerText(),
    /3.0/,
  );
  assert.equal(
    await p.evaluate(
      () => (window as any).__PETROS_WORLD_METRICS__.transitions.length,
    ),
    priorTransitions,
  );
  await p.screenshot({ path: dir + '/validated-weight.png' });
  results.tests.push(
    'validated weight 0.5 -> 1.5 interpolates with its computed output, with no caption-driven camera move',
  );
  await key(/Focus board/);
  await p.getByRole('dialog', { name: 'Focused teaching board' }).waitFor();
  await p.keyboard.press('Escape');
  await p
    .getByRole('dialog', { name: 'Focused teaching board' })
    .waitFor({ state: 'hidden' });
  await settle();
  results.tests.push(
    'focus mode and Escape preserve the camera and teaching context',
  );
  await checkpoint(1);
  await key(/Show me/);
  await p.waitForTimeout(180);
  const modeBefore = await state();
  await key(/Exit Petros World/);
  await p
    .getByRole('button', { name: 'Enter Petros World', exact: true })
    .waitFor();
  await enter();
  const modeAfter = await state();
  assert.equal(modeAfter.questionId, modeBefore.questionId);
  assert.deepEqual(modeAfter.observations, modeBefore.observations);
  assert.equal((await motion()).board.status, 'idle');
  results.tests.push(
    'mode exit cancels presentation; return preserves progress and settles committed visuals without replay',
  );
  await station(/02\s*Library/);
  await p.waitForTimeout(130);
  await station(/03\s*Whiteboard/);
  await p.waitForTimeout(130);
  await station(/04\s*Experiment/);
  await settle();
  assert.equal((await motion()).camera.station, 'experiment');
  assert.equal((await state()).sceneStation, 'experiment');
  assert.equal(
    await p.getByRole('button', { name: 'Close library' }).isVisible(),
    false,
  );
  results.tests.push(
    'rapid station requests finish at the latest target without stale drawer/callback',
  );
  await station(/02\s*Library/);
  await p
    .getByRole('button', { name: /Find the Construction Hazards/ })
    .click();
  await key(/Retrieve this book/);
  await key(/Continue this lesson|Let me show you/);
  await settle();
  await key(/Model tools/);
  await key(/Show safer setup/);
  await p.waitForTimeout(200);
  const partial = await p.evaluate(() => (window as any).__PETROS_MODEL__);
  assert.ok(partial.railScale > 0 && partial.railScale < 1);
  await key(/Pause motion/);
  await p.locator('[data-world-phase][data-paused="true"]').waitFor();
  const railPause = await p.evaluate(
    () => (window as any).__PETROS_MODEL__.railScale,
  );
  await p.waitForTimeout(300);
  assert.equal(
    await p.evaluate(() => (window as any).__PETROS_MODEL__.railScale),
    railPause,
  );
  await key(/Resume motion/);
  await p.waitForTimeout(700);
  assert.equal(
    await p.evaluate(() => (window as any).__PETROS_MODEL__.railScale),
    1,
  );
  assert.match(
    await p
      .getByRole('region', { name: 'Student-paced teaching', exact: true })
      .innerText(),
    /This is the safer comparison/,
  );
  await p.screenshot({ path: dir + '/safer-model.png' });
  const counts = await p.evaluate(
    () => (window as any).__PETROS_WORLD_METRICS__.budget?.rendererObjects,
  );
  for (let i = 0; i < 2; i++) {
    await key(/Model tools/);
    await key(/Show before/);
    await p.waitForTimeout(120);
    await key(/Model tools/);
    await key(/Show safer setup/);
    await p.waitForTimeout(600);
  }
  await key(/Model tools/);
  await key(/Show before/);
  await p.waitForTimeout(700);
  assert.equal(
    await p.evaluate(() => (window as any).__PETROS_MODEL__.railScale),
    0,
  );
  const afterCounts = await p.evaluate(
    () => (window as any).__PETROS_WORLD_METRICS__.budget?.rendererObjects,
  );
  assert.deepEqual(afterCounts, counts);
  results.tests.push(
    'actual scaffold changes interpolate, pause/resume and reset precisely; repeated changes do not duplicate geometry/textures',
  );
  await key(/Accessibility and preferences/);
  await key(/Reduced motion off/);
  await key(/Close preferences/);
  await station(/03\s*Whiteboard/);
  await settle();
  assert.equal((await motion()).camera.progress, 1);
  await p.reload({ waitUntil: 'networkidle' });
  await p.waitForFunction(
    () =>
      !document.querySelector('[aria-label="Entering Petros World"]') &&
      document.querySelector('[data-world-phase]'),
    undefined,
    { timeout: 90000 },
  );
  await settle();
  await key(/Accessibility and preferences/);
  await p
    .getByRole('button', { name: 'Reduced motion on', exact: true })
    .waitFor();
  await key(/Close preferences/);
  assert.equal((await state()).lessonId, 'ehs3');
  results.tests.push(
    'reduced motion settles camera/models and persists with lesson/mode after refresh',
  );
  assert.deepEqual(results.errors, []);
  assert.deepEqual(results.productionMutations, []);
} catch (e) {
  results.failure = String(e);
  results.debug = await p.evaluate(() => ({
    animation: (window as any).__PETROS_ANIMATION__,
    reduced: matchMedia('(prefers-reduced-motion: reduce)').matches,
    state: JSON.parse(sessionStorage.getItem('petros.learning.v3') ?? '{}')
      .state,
  }));
  results.body = (await p.locator('body').innerText()).slice(-3000);
  await p.screenshot({ path: dir + '/failure.png' }).catch(() => {});
  throw e;
} finally {
  await writeFile(dir + '/results.json', JSON.stringify(results, null, 2));
  const video = p.video();
  await context.close();
  if (video)
    await rename(
      await video.path(),
      dir + '/recordings/continuous-interactions.webm',
    );
  await browser.close();
}
console.log(JSON.stringify(results, null, 2));
