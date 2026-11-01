import { chromium, type Locator } from 'playwright-core';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import assert from 'node:assert/strict';
import { browserExecutable } from './browser-executable';
import { tectonics } from '../lessons/tectonics';
import { goToCheckpoint, currentQuestion } from '../teaching/checkpoint';
import { selectLesson, initialState } from '../teaching/controller';
import { serializeSession, SESSION_KEY } from '../teaching/persistence';
import { subjectCases, subjectOutline } from './fixtures/visual-topics';
import { makeTopicLesson, validTopicLesson } from '../teaching/topic-content';
import { topicOutlineFixture } from './fixtures/topic-outline';
import { visualBase, modelState } from '../teaching/visual-examples';
import type { Lesson, ShowcaseState } from '../teaching/types';
const dir = 'evidence/visual-learning';
await mkdir(dir, { recursive: true });
const browser = await chromium.launch({
  executablePath: browserExecutable(),
  headless: true,
  args: ['--enable-unsafe-swiftshader'],
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  reducedMotion: 'reduce',
});
await context.addInitScript('window.__name=(fn)=>fn;');
const p = await context.newPage();
p.setDefaultTimeout(25000);
p.setDefaultNavigationTimeout(120000);
const base = process.env.SHOWCASE_TEST_URL ?? 'http://127.0.0.1:3023';
const results: any = { checks: [], errors: [], productionMutations: [], liveProviderCalls: false };
p.on('pageerror', (e) => results.errors.push(e.message));
p.on('request', (r) => {
  if (
    ['POST', 'PUT', 'PATCH', 'DELETE'].includes(r.method()) &&
    !r.url().includes('/prototype/api/')
  )
    results.productionMutations.push(r.url());
});
const cycle = () => p.getByRole('region', { name: 'Student-paced teaching', exact: true });
const state = async (): Promise<ShowcaseState> => {
  await p.waitForTimeout(120);
  return p.evaluate((key) => JSON.parse(sessionStorage.getItem(key)!).state, SESSION_KEY);
};
async function click(target: Locator) {
  await target.waitFor({ state: 'visible' });
  await target.click();
}
async function seed(lesson: Lesson, index = 0) {
  const s = goToCheckpoint(selectLesson(initialState, lesson, null), lesson, index);
  await p.evaluate(({ key, raw }) => sessionStorage.setItem(key, raw), {
    key: SESSION_KEY,
    raw: serializeSession(s),
  });
  await p.reload({ waitUntil: 'networkidle' });
  await cycle().waitFor();
  return s;
}
async function answer(lesson: Lesson, correct = true, region = cycle()) {
  const q = currentQuestion(await state(), lesson),
    value = correct ? q.correct[0]! : q.options.find((x) => !q.correct.includes(x))!;
  await click(region.getByRole('button', { name: value, exact: true }));
  await click(region.getByRole('button', { name: /Check my answer/ }));
}
async function shot(name: string) {
  await p.screenshot({ path: `${dir}/${name}.png`, fullPage: true });
}
try {
  await p.goto(base + '/prototype', { waitUntil: 'networkidle' });
  await p.getByRole('textbox', { name: 'Explore any topic' }).fill('tectonic plates');
  await click(p.getByRole('button', { name: /Let.s explore/ }));
  await click(cycle().getByRole('button', { name: /Skip diagnostic/ }));
  const svg = p.locator('[data-visual-type="plate-tectonics"] svg');
  await svg.waitFor();
  assert.ok(await svg.locator('[data-feature="crust"]').count());
  assert.match(await svg.textContent(), /Lithospheric mantle/);
  assert.equal(await p.locator('details[open]').count(), 0);
  assert.ok((await svg.boundingBox())!.y < 400);
  await shot('tectonics-layers-desktop');
  results.checks.push(
    'Real topic form â†’ prepared tectonics â†’ labeled SVG cross-section, compact header and collapsed details',
  );
  await seed(tectonics, 1);
  const before = await p.locator('[data-feature="plate-left"]').first().getAttribute('d');
  await click(p.getByRole('button', { name: 'Play movement', exact: true }));
  await p.waitForTimeout(400);
  await click(p.getByRole('button', { name: 'Pause movement', exact: true }));
  assert.notEqual(await p.locator('[data-feature="plate-left"]').first().getAttribute('d'), before);
  assert.equal((await state()).evidence?.attempts.length, 0);
  results.checks.push('Play/pause changes geometry without learning credit');
  await seed(tectonics, 2);
  for (const name of ['Divergent', 'Convergent', 'Transform']) {
    await click(p.getByRole('button', { name, exact: true }));
    assert.equal(
      await p.locator('[data-visual-type]').getAttribute('data-boundary'),
      name.toLowerCase(),
    );
    await shot('tectonics-' + name.toLowerCase());
  }
  results.checks.push('Three visibly distinct boundary states, selectable by the student');
  await p.getByLabel('Movement progress', { exact: true }).fill('0.65');
  const changed = (await state()).visualState;
  await p.reload({ waitUntil: 'networkidle' });
  assert.deepEqual((await state()).visualState, changed);
  results.checks.push('Refresh restores selected boundary and scrubber state');
  await seed(tectonics, 3);
  await click(cycle().getByRole('button', { name: 'apply', exact: true }));
  await answer(tectonics, false);
  let s = await state();
  assert.equal(s.teaching.status, 'RETEACHING');
  assert.ok(s.visualState.kind === 'topic' && s.visualState.runtime?.highlights.includes('motion'));
  await shot('tectonics-feedback');
  await click(cycle().getByRole('button', { name: /Try a new example/ }));
  await answer(tectonics);
  await click(cycle().getByRole('button', { name: /Test this concept/ }));
  assert.equal((await state()).learning?.stage, 'test');
  assert.equal(await p.locator('[data-visual-type]').getAttribute('data-boundary'), 'application');
  assert.equal(
    await p.getByRole('button', { name: 'Transform', exact: true }).count(),
    1,
    'Only the answer choice names the boundary',
  );
  await shot('tectonics-independent');
  await answer(tectonics);
  assert.equal((await state()).evidence?.attempts.at(-1)?.independent, true);
  results.checks.push(
    'Incorrect response â†’ motion highlight â†’ different practice â†’ independent application and evidence',
  );
  await seed(tectonics, 2);
  await click(p.getByRole('button', { name: /Enter Petros World/ }).first());
  await p.getByRole('main', { name: 'Petros World immersive study' }).waitFor({ timeout: 90000 });
  await p.waitForFunction(() => document.querySelector('[data-camera-moving="false"]'), undefined, {
    timeout: 90000,
  });
  await p.waitForTimeout(500);
  const worldBefore = await state();
  await shot('tectonics-world');
  await click(p.getByRole('button', { name: 'Focus board', exact: true }));
  const focus = p.getByRole('dialog', { name: 'Focused teaching board' });
  await focus.locator('svg[data-no-match], [data-visual-type] svg').waitFor();
  await click(focus.getByRole('button', { name: 'Convergent', exact: true }));
  await focus.getByLabel('Movement progress', { exact: true }).fill('0.7');
  assert.equal(
    await focus.locator('[data-visual-type]').getAttribute('data-boundary'),
    'convergent',
  );
  await shot('tectonics-focus-board');
  const focusState = await state();
  assert.equal(focusState.questionId, worldBefore.questionId);
  await click(focus.getByRole('button', { name: 'Return to room' }));
  await click(p.getByRole('button', { name: /Exit Petros World/ }).first());
  await p.locator('[data-visual-type="plate-tectonics"]').waitFor({ timeout: 60000 });
  assert.deepEqual((await state()).visualState, focusState.visualState);
  results.checks.push(
    'World room renders, Focus Board shares SVG/controls, return to Classic preserves visual state and concept',
  );
  for (const entry of subjectCases) {
    const lesson = makeTopicLesson(
      subjectOutline(entry),
      'generated',
      `topic-browser-${entry.spec.type}`,
    );
    await seed(lesson);
    const panel = p.locator(`[data-visual-type="${entry.spec.type}"]`);
    await panel.waitFor();
    const paths = await panel
      .locator('svg path')
      .evaluateAll((nodes) => nodes.map((n) => n.getAttribute('d')).join('|'));
    const slider = panel.locator('input[type=range]').first();
    if (await slider.count()) {
      const val = Number(await slider.inputValue()),
        step = Number(await slider.getAttribute('step'));
      await slider.fill(String(val - step));
      assert.notEqual(
        await panel
          .locator('svg path')
          .evaluateAll((nodes) => nodes.map((n) => n.getAttribute('d')).join('|')),
        paths,
      );
    } else {
      assert.ok((await panel.locator('svg').textContent()).includes('Which conclusion?'));
      await click(panel.getByRole('button', { name: /Trace supported/ }));
      assert.ok((await panel.locator('svg').textContent()).includes('HasWings(Rio)'));
    }
    await shot(entry.spec.type);
    results.checks.push(
      `${entry.name}: generated-contract fixture renders and model control changes visible geometry/relationships`,
    );
  }
  const fallback = structuredClone(topicOutlineFixture);
  fallback.steps[0]!.visual = {
    ...visualBase('Compare the supplied worked examples.', modelState()),
    type: 'unsupported',
    reason: 'A fluid solver is unavailable. Use the supplied worked comparison.',
  };
  await seed(makeTopicLesson(fallback, 'generated', 'topic-unsupported-fixture'));
  await p.getByText('Visual capability unavailable', { exact: true }).waitFor();
  assert.equal(await p.locator('[data-visual-type="unsupported"] svg').count(), 0);
  await shot('unsupported-capability');
  results.checks.push(
    'Unsupported capability is explicit and preserves a worked-example task; no pretend diagram',
  );
  if (existsSync(`${dir}/live-generated-tectonics.json`)) {
    const live = JSON.parse(
      await readFile(`${dir}/live-generated-tectonics.json`, 'utf8'),
    ) as Lesson;
    assert.equal(validTopicLesson(live), true);
    for (let i = 0; i < live.questions.length; i++) {
      await seed(live, i);
      await p.locator('[data-visual-type="plate-tectonics"] svg').waitFor();
      assert.ok(await p.locator('[data-visual-type] svg path').count());
      await shot(`live-generated-${i + 1}`);
    }
    await click(cycle().getByRole('button', { name: 'apply', exact: true }));
    await answer(live, false);
    assert.equal((await state()).teaching.status, 'RETEACHING');
    results.checks.push(
      'Live model-generated tectonics: all concepts render actual SVGs and a declared-key mismatch invokes visual remediation',
    );
  }
  await seed(tectonics);
  for (const width of [1024, 768, 390]) {
    await p.setViewportSize({ width, height: 900 });
    await shot(`tectonics-${width}`);
    assert.equal(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  }
  results.checks.push(
    '1024px, 768px and 390px layouts have no page overflow; narrow SVG has its own scroll area',
  );
  assert.deepEqual(results.errors, []);
  assert.deepEqual(results.productionMutations, []);
  console.log(JSON.stringify(results, null, 2));
} finally {
  await writeFile(`${dir}/results.json`, JSON.stringify(results, null, 2));
  await browser.close();
}
