import { chromium, type Page } from 'playwright-core';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { browserExecutable } from './browser-executable';
import { makeTopicLesson } from '../teaching/topic-content';
import { currentQuestion } from '../teaching/checkpoint';
import { resolveLesson } from '../teaching/lesson-registry';
import { topicOutlineFixture } from './fixtures/topic-outline';
import type { ShowcaseState } from '../teaching/types';

const dir = 'evidence/topic-workflow';
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
const p = await context.newPage();
p.setDefaultNavigationTimeout(120000);
await p.addInitScript('window.__name=(fn)=>fn;');
const results: any = {
  tests: [],
  errors: [],
  productionMutations: [],
  liveModelCalls: false,
};
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
const base = process.env.SHOWCASE_TEST_URL ?? 'http://localhost:3022';
const cycle = () =>
  p.getByRole('region', { name: 'Student-paced teaching', exact: true });
async function key(name: RegExp) {
  const button = p.getByRole('button', { name }).first();
  await p.waitForFunction(
    (el) => !(el as HTMLButtonElement).disabled,
    await button.elementHandle(),
  );
  await button.focus();
  await p.keyboard.press('Enter');
}
async function state(): Promise<ShowcaseState> {
  await p.waitForTimeout(80);
  return p.evaluate(
    () => JSON.parse(sessionStorage.getItem('petros.learning.v3')!).state,
  );
}
async function answer(value?: string) {
  const s = await state(),
    q = currentQuestion(s, resolveLesson(s)!);
  await cycle()
    .getByRole('button', { name: value ?? q.correct[0]!, exact: true })
    .click();
  await key(/Check my answer/);
}
async function enter() {
  await key(/Enter Petros World/);
  await p
    .getByRole('main', { name: 'Petros World immersive study' })
    .waitFor({ timeout: 90000 });
  await p.waitForFunction(
    () => document.querySelector('[data-camera-moving="false"]'),
    undefined,
    { timeout: 60000 },
  );
  await p.waitForTimeout(250);
}
async function home() {
  const shelf = p.getByRole('button', { name: 'Learning shelf', exact: true });
  if (await shelf.isVisible()) await shelf.click();
}
async function submit(topic: string) {
  await p.getByRole('textbox', { name: 'Explore any topic' }).fill(topic);
  await key(/Let.s explore/);
}

try {
  await p.goto(base + '/prototype', { waitUntil: 'networkidle' });
  const capabilities = await (
    await p.request.get(base + '/prototype/api/capabilities')
  ).json();
  results.connectionCheck = capabilities.topicModel
    ? 'Key configured: the missing-connection form state uses an explicit fixture; blank-key endpoint handling is covered by unit tests.'
    : 'Real blank-key endpoint.';
  if (capabilities.topicModel)
    await p.route(
      '**/prototype/api/topic',
      (route) =>
        route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({
            error:
              'New topics need a model connection. Prepared lessons remain available.',
            code: 'MODEL_UNAVAILABLE',
          }),
        }),
      { times: 1 },
    );
  await submit('How does photosynthesis work?');
  await p
    .locator('#topics')
    .getByRole('alert')
    .getByText(/model connection/i)
    .waitFor();
  assert.equal(
    await p.getByRole('textbox', { name: 'Explore any topic' }).inputValue(),
    'How does photosynthesis work?',
  );
  await p.screenshot({
    path: dir + '/inline-connection-message.png',
    fullPage: true,
  });
  results.tests.push(
    (capabilities.topicModel
      ? 'explicit unconfigured-response fixture'
      : 'unconfigured topic') +
      ' reports its error beside the form and preserves the question',
  );

  await submit('How do integrals work?');
  await p.getByRole('region', { name: 'Topic learning model' }).waitFor();
  assert.equal((await state()).topicLesson?.id, 'topic-integrals');
  await p.getByRole('button', { name: '32 rectangles', exact: true }).click();
  assert.match(
    (await p
      .getByRole('img', { name: /Left rectangles/ })
      .getAttribute('aria-label')) ?? '',
    /1.9375/,
  );
  await p.getByText('Learning path, prerequisites and lesson details', { exact: true }).click();
  await p.getByText(/Explain integration as accumulation/).waitFor();
  await p.getByText('Learning path, prerequisites and lesson details', { exact: true }).click();
  await p.screenshot({ path: dir + '/integrals-classic.png', fullPage: true });
  await p.reload({ waitUntil: 'networkidle' });
  await cycle().waitFor();
  const restored = await state();
  assert.equal(restored.visualState.kind, 'topic');
  assert.equal(
    restored.visualState.kind === 'topic' && restored.visualState.area?.slices,
    32,
  );
  results.tests.push(
    'the exact requested topic opens a real integrals model, exposes the lesson plan and survives refresh',
  );

  await key(/Show me/);
  await key(/Your turn/);
  const first = await state();
  await p.waitForTimeout(600);
  assert.equal((await state()).questionId, first.questionId);
  const q = currentQuestion(first, resolveLesson(first)!);
  await answer(q.options.find((o) => !q.correct.includes(o))!);
  assert.equal((await state()).teaching.status, 'RETEACHING');
  assert.equal((await state()).questionId, first.questionId);
  await key(/Try a new example|Compare and try again/);
  const fresh = currentQuestion(await state(), resolveLesson(await state())!);
  assert.notEqual(fresh.task, q.task);
  await answer();
  assert.equal((await state()).teaching.status, 'READY_TO_CONTINUE');
  await key(/Continue/);
  for (let i = 1; i < 6; i++) {
    await key(/Show me/);
    await key(/Your turn/);
    if (i === 1) {
      await key(/Need help/);
      await key(/Explain it more simply/);
      await key(/Resume this step/);
    }
    await answer();
    await key(/Continue/);
  }
  assert.equal((await state()).phase, 'recap');
  assert.equal(Object.keys((await state()).completion).length, 6);
  results.tests.push(
    'all six integral concepts complete through demonstration, response, targeted feedback, fresh retry, help and explicit continuation',
  );

  await key(/Choose another lesson/);
  await submit('integrals');
  await enter();
  await p
    .getByLabel('Whiteboard text equivalent')
    .getByText(/Left sum/)
    .waitFor();
  await key(/Model tools/);
  await p.getByRole('button', { name: '16 rectangles', exact: true }).click();
  await p
    .getByLabel('Whiteboard text equivalent')
    .getByText(/16 rectangles/)
    .waitFor();
  await key(/Close model tools/);
  await key(/Focus board/);
  await p.getByRole('dialog', { name: 'Focused teaching board' }).waitFor();
  await p.keyboard.press('Escape');
  await p
    .getByRole('dialog', { name: 'Focused teaching board' })
    .waitFor({ state: 'hidden' });
  await p.screenshot({ path: dir + '/integrals-world.png' });
  if (await p.getByRole('button', { name: 'Choose a station' }).isVisible())
    await key(/Choose a station/);
  await key(/02\s*Library/);
  await p
    .getByRole('button', { name: 'How do integrals work?', exact: true })
    .click();
  await cycle().waitFor();
  assert.equal(
    await p.getByRole('button', { name: 'Close library' }).isVisible(),
    false,
  );
  assert.equal((await state()).lessonId, 'topic-integrals');
  results.tests.push(
    'World uses the same topic/area controls, focus and context; a topic does not wait for a nonexistent source book',
  );
  await key(/Exit Petros World/);
  await p
    .getByRole('button', { name: 'Enter Petros World', exact: true })
    .waitFor();
  await home();

  // Provider-dependent cases remain controlled fixtures, even when a real key is configured.
  const fixture = makeTopicLesson(
    topicOutlineFixture,
    'generated',
    'topic-fixture-photosynthesis',
  );
  let requests = 0;
  await p.route('**/prototype/api/topic', async (route) => {
    requests++;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ lesson: fixture }),
    });
  });
  await submit('How does photosynthesis work?');
  await cycle().waitFor();
  assert.equal((await state()).inputOrigin, 'live_open_topic');
  await p.getByText('AI-GENERATED LESSON', { exact: true }).waitFor();
  await cycle().getByRole('button', { name: /Skip diagnostic/ }).click();
  assert.ok(await p.locator('[data-visual-type="relationships"] svg path').count());
  await p.screenshot({
    path: dir + '/provider-fixture-flow.png',
    fullPage: true,
  });
  await p.reload({ waitUntil: 'networkidle' });
  await cycle().waitFor();
  assert.equal((await state()).topicLesson?.title, fixture.title);
  const beforeQuestion = await state();
  await p.route('**/prototype/api/ask', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        answer:
          'Provider fixture: chlorophyll absorbs some wavelengths of light. This is a controlled contextual-answer test.',
      }),
    }),
  );
  await key(/Need help/);
  await key(/Ask Petros a question/);
  await p
    .getByRole('textbox', { name: 'Ask Petros a question' })
    .fill('What wavelengths are absorbed by chlorophyll?');
  await p.getByRole('button', { name: 'Ask Petros', exact: true }).click();
  await p.getByText(/Provider fixture: chlorophyll/).waitFor();
  assert.equal((await state()).questionId, beforeQuestion.questionId);
  assert.equal(
    Object.values((await state()).observations).flatMap((o) => o.responses)
      .length,
    0,
  );
  await key(/Resume this step/);
  await p.unroute('**/prototype/api/ask');
  results.tests.push(
    'controlled contextual-answer fixture: a tutor reply preserves the question and cannot submit an answer or advance the lesson',
  );
  await enter();
  await p
    .getByLabel('Whiteboard text equivalent')
    .getByText(/Light-powered reactions/)
    .waitFor();
  await key(/Exit Petros World/);
  await p
    .getByRole('button', { name: 'Enter Petros World', exact: true })
    .waitFor();
  for (let i = 0; i < 4; i++) {
    await key(/Show me/);
    await key(/Your turn/);
    await answer();
    assert.equal(
      (await state()).evidence?.attempts.at(-1)?.validation,
      'unverified',
    );
    await key(/Continue/);
  }
  assert.equal((await state()).phase, 'recap');
  assert.equal(requests, 1);
  results.tests.push(
    'controlled provider fixture: a validated generated plan renders, refreshes, switches modes and completes all concepts',
  );
  await p.unroute('**/prototype/api/topic');
  await key(/Choose another lesson/);

  let release!: () => void;
  let seen!: () => void;
  const waiting = new Promise<void>((resolve) => {
      release = resolve;
    }),
    started = new Promise<void>((resolve) => {
      seen = resolve;
    });
  await p.route('**/prototype/api/topic', async (route) => {
    seen();
    await waiting;
    await route
      .fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ lesson: fixture }),
      })
      .catch(() => {});
  });
  await submit('A different plant question');
  await started;
  assert.equal(
    await p.getByRole('button', { name: /Preparing your lesson/ }).isDisabled(),
    true,
  );
  await p
    .getByRole('button', { name: 'Learn AI_Module_3.pdf', exact: true })
    .click();
  release();
  await p.waitForTimeout(250);
  assert.equal((await state()).lessonId, 'ai3');
  results.tests.push(
    'in-flight generation is visibly busy; a late result cannot replace a module the student selected',
  );
  await p.unroute('**/prototype/api/topic');
  await home();
  await p.route('**/prototype/api/topic', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ lesson: fixture }),
    }),
  );
  await submit('How does photosynthesis work?');
  await cycle().waitFor();
  let releaseAnswer!: () => void, answerStarted!: () => void;
  const answerWaiting = new Promise<void>((resolve) => {
      releaseAnswer = resolve;
    }),
    answerSeen = new Promise<void>((resolve) => {
      answerStarted = resolve;
    });
  await p.route('**/prototype/api/ask', async (route) => {
    if (route.request().postDataJSON().lessonId !== fixture.id) {
      await route.continue();
      return;
    }
    answerStarted();
    await answerWaiting;
    await route
      .fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ answer: 'Stale provider fixture response' }),
      })
      .catch(() => {});
  });
  await key(/Need help/);
  await key(/Ask Petros a question/);
  await p
    .getByRole('textbox', { name: 'Ask Petros a question' })
    .fill('What wavelengths are absorbed by chlorophyll?');
  await p.getByRole('button', { name: 'Ask Petros', exact: true }).click();
  await answerSeen;
  await home();
  await p
    .getByRole('button', { name: 'Learn AI_Module_4.pdf', exact: true })
    .click();
  try {
    await key(/Need help/);
    await key(/Ask Petros a question/);
    await p
      .getByRole('textbox', { name: 'Ask Petros a question' })
      .fill('Name the capital of Chile.');
    await p.getByRole('button', { name: 'Ask Petros', exact: true }).click();
    await p.getByText('Model unavailable', { exact: true }).waitFor();
  } finally {
    releaseAnswer();
  }
  await p.waitForTimeout(150);
  assert.equal((await state()).lessonId, 'ai4');
  assert.equal(
    (await state()).conversationHistory.some((message) =>
      message.text.includes('Stale provider fixture'),
    ),
    false,
  );
  await key(/Resume this step/);
  await p.unroute('**/prototype/api/topic');
  await p.unroute('**/prototype/api/ask');
  results.tests.push(
    'a cancelled tutor request cannot overwrite the next lesson or leave its Ask button locked',
  );
  await home();
  await submit('integrals');
  for (const [width, height] of [
    [1366, 768],
    [390, 844],
    [360, 800],
  ]) {
    await p.setViewportSize({ width, height });
    await p.waitForTimeout(200);
    assert.equal(
      await p.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
    await p.screenshot({
      path: `${dir}/integrals-${width}.png`,
      fullPage: true,
    });
  }
  results.tests.push(
    'integrals layout remains usable without horizontal overflow on desktop and phone',
  );
  assert.deepEqual(results.errors, []);
  assert.deepEqual(results.productionMutations, []);
} catch (error) {
  results.failure = String(error);
  results.body = (await p.locator('body').innerText()).slice(-5000);
  await p
    .screenshot({ path: dir + '/failure.png', fullPage: true })
    .catch(() => {});
  throw error;
} finally {
  await writeFile(dir + '/results.json', JSON.stringify(results, null, 2));
  await context.close();
  await browser.close();
}
console.log(JSON.stringify(results, null, 2));
