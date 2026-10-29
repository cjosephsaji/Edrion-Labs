import { chromium, type Page } from 'playwright-core';
import { fileURLToPath } from 'node:url';
import { writeFile } from 'node:fs/promises';
import { lessons } from '../lessons';
import { lessonForState } from '../teaching/tree-variant';
import { initialState } from '../teaching/controller';
process.chdir(fileURLToPath(new URL('../', import.meta.url)));
const b = await chromium.launch({
  executablePath:
    '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
  headless: true,
  args: ['--use-angle=metal'],
});
const base = process.env.SHOWCASE_TEST_URL ?? 'http://127.0.0.1:3021';
const results: any = {
  classic: [],
  world: [],
  layouts: [],
  errors: [],
  productionMutations: [],
};
async function enter(p: Page) {
  await p
    .getByRole('button', { name: 'Enter Petros World', exact: true })
    .click();
  await p
    .getByRole('dialog', { name: 'Entering Petros World' })
    .waitFor({ state: 'detached', timeout: 30000 });
}
async function source(p: Page) {
  await p.getByRole('button', { name: 'Find my module', exact: true }).click();
  await p.getByRole('button', { name: /Retrieve this book/ }).click();
  await p.waitForFunction(
    () =>
      ['teaching', 'practice'].includes(
        document
          .querySelector('[data-world-phase]')
          ?.getAttribute('data-world-phase') ?? '',
      ),
    { timeout: 15000 },
  );
}
async function skip(p: Page) {
  for (let i = 0; i < 12; i++) {
    const main = p.getByRole('main', { name: 'Petros World immersive study' });
    if ((await main.getAttribute('data-world-phase')) === 'practice') return;
    const button = p.getByRole('button', {
      name: 'Skip explanation',
      exact: true,
    });
    if (await button.isVisible()) {
      try {
        await button.click({ timeout: 1000 });
      } catch (error) {
        if ((await main.getAttribute('data-world-phase')) !== 'practice')
          throw error;
      }
    }
    await p.waitForTimeout(150);
  }
  throw Error('No interaction gate after skip');
}

try {
  const c = await b.newContext({ viewport: { width: 1440, height: 900 } }),
    p = await c.newPage();
  p.on('pageerror', (e) => results.errors.push(e.message));
  p.on('request', (r) => {
    if (
      ['POST', 'PATCH', 'PUT', 'DELETE'].includes(r.method()) &&
      !r.url().includes('/prototype/api/')
    )
      results.productionMutations.push(r.url());
  });
  await c.tracing.start({ screenshots: true, snapshots: true, sources: true });
  await p.goto(base + '/prototype');
  for (const l of lessons) {
    await p
      .getByRole('button', { name: 'Petros Showcase', exact: true })
      .click();
    await p
      .getByRole('button', {
        name: l.filename ? `Learn ${l.filename}` : l.title,
        exact: !!l.filename,
      })
      .click();
    await p.getByRole('button', { name: 'Start lesson', exact: true }).click();
    for (const q of l.questions) {
      await p.getByRole('heading', { name: q.task, exact: true }).waitFor();
      if (q.type === 'number')
        await p
          .getByRole('textbox', { name: 'Practice value' })
          .fill(q.correct[0]!);
      else if (q.type === 'text')
        await p
          .getByRole('textbox', { name: 'Your explanation' })
          .fill(
            'An explanation connecting the visible example to its stated assumptions.',
          );
      else
        for (const answer of q.correct) {
          const i = q.options.indexOf(answer);
          await p
            .getByRole('group', {
              name:
                q.type === 'multi'
                  ? 'Select all that apply'
                  : 'Practice choices',
            })
            .getByRole('button', {
              name: `${q.type === 'multi' ? '□' : String.fromCharCode(65 + i)} ${answer}`,
              exact: true,
            })
            .click();
        }
      await p
        .getByRole('button', {
          name:
            q.type === 'text' ? 'Record explanation' : 'Check practice answer',
          exact: true,
        })
        .click();
      await p.getByRole('button', { name: 'Continue', exact: true }).click();
    }
    await p
      .getByText(
        `${l.questions.length} of ${l.questions.length} checkpoints explored.`,
        { exact: true },
      )
      .waitFor();
    results.classic.push({ id: l.id, count: l.questions.length });
    console.log('Classic passed', l.id);
  }
  await p.getByRole('button', { name: 'Petros Showcase', exact: true }).click();
  await p
    .getByRole('button', { name: 'Learn AI_Module_3.pdf', exact: true })
    .click();
  await enter(p);
  await source(p);
  for (const original of lessons) {
    if (original.id !== 'ai3') {
      const stationToggle = p.getByRole('button', {
        name: 'Choose a station',
        exact: true,
      });
      if (await stationToggle.isVisible()) await stationToggle.click();
      await p
        .getByRole('navigation', { name: 'World stations' })
        .getByRole('button', { name: /Library/ })
        .click();
      const drawer = p.locator('[aria-label="World library"]');
      await drawer
        .getByRole('button')
        .filter({ hasText: original.title })
        .first()
        .click();
      if (!original.general)
        await p.getByRole('button', { name: /Retrieve this book/ }).click();
      await p.waitForFunction(
        () =>
          document
            .querySelector('[data-world-phase]')
            ?.getAttribute('data-world-phase') === 'teaching',
      );
    }
    const l = lessonForState(original, {
      ...initialState,
      visualState: {
        kind: 'tree',
        treeOrder: 'v2',
        reveal: 0,
        pruneStep: 0,
        allLeaves: false,
        selected: '',
        transfer: false,
      },
    })!;
    const completed = new Set<string>();
    for (let loop = 0; loop < l.questions.length; loop++) {
      await skip(p);
      const id = (await p
        .getByRole('main', { name: 'Petros World immersive study' })
        .getAttribute('data-question-id'))!;
      if (completed.has(id)) throw Error('Duplicate question ' + id);
      const q = l.questions.find((q) => q.id === id)!;
      await p.getByRole('heading', { name: q.task, exact: true }).waitFor();
      if (q.type === 'number')
        await p
          .getByRole('textbox', { name: 'World practice value' })
          .fill(q.correct[0]!);
      else if (q.type === 'text')
        await p
          .getByRole('textbox', { name: 'World explanation' })
          .fill(
            'My explanation remains stored across the Classic and World presenters.',
          );
      else
        for (const answer of q.correct)
          await p
            .getByRole('group', { name: 'World practice choices' })
            .getByRole('button', { name: answer, exact: true })
            .click();
      await p
        .getByRole('button', {
          name:
            q.type === 'text' ? 'Record explanation' : 'Check practice answer',
          exact: true,
        })
        .click();
      await p
        .getByRole('button', { name: 'Continue lesson', exact: true })
        .waitFor();
      completed.add(id);
      if (q.id === 'AI3-Q11') {
        await p
          .getByRole('button', { name: 'Model tools', exact: true })
          .click();
        await p.getByText('5 evaluated · 1 skipped', { exact: true }).waitFor();
        await p.screenshot({ path: 'evidence/realism/regression/final-pruning.png' });
        await p
          .getByRole('button', { name: 'Close model tools', exact: true })
          .click();
      }
      await p
        .getByRole('button', { name: 'Continue lesson', exact: true })
        .click();
    }
    await p
      .getByRole('heading', { name: 'Ideas to take with you.', exact: true })
      .waitFor();
    results.world.push({ id: l.id, count: completed.size });
    console.log('World passed', l.id);
  }
  results.metrics = await p.evaluate(() => window.__PETROS_WORLD_METRICS__);
  await c.tracing.stop({ path: 'evidence/realism/regression/full-browser-trace.zip' });
  await c.close();
  for (const [width, height] of [
    [1920, 1080],
    [1440, 900],
    [1366, 768],
    [1024, 768],
    [768, 1024],
    [390, 844],
  ]) {
    const context = await b.newContext({
        viewport: { width, height },
        reducedMotion: 'reduce',
      }),
      page = await context.newPage();
    page.on('pageerror', (e) => results.errors.push(e.message));
    await page.goto(base + '/prototype');
    await page
      .getByRole('button', { name: 'Learn AI_Module_3.pdf', exact: true })
      .click();
    await enter(page);
    await page.waitForTimeout(300);
    await page.screenshot({ path: `evidence/realism/regression/arrival-${width}.png` });
    await source(page);
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: `evidence/realism/regression/teaching-${width}.png` });
    const teaching = await page.evaluate(() => {
      const stage = document
          .querySelector('[data-world-scene]')!
          .getBoundingClientRect(),
        board = (window as any).__PETROS_BOARD__,
        cloud = document.querySelector('[data-avatar-visible]') as HTMLElement;
      const r = cloud?.getBoundingClientRect();
      return {
        overflow: document.documentElement.scrollWidth > innerWidth,
        stage: stage.toJSON(),
        boardErrors: board.layout.errors,
        cloud: r?.toJSON(),
        docked: cloud?.dataset.docked,
        headerBottom: document.querySelector('header')!.getBoundingClientRect()
          .bottom,
      };
    });
    if (
      teaching.overflow ||
      teaching.boardErrors.length ||
      (teaching.cloud &&
        (teaching.cloud.y < teaching.headerBottom - 1 ||
          teaching.cloud.x < 0 ||
          teaching.cloud.right > width + 1))
    )
      throw Error('Layout failed ' + width + JSON.stringify(teaching));
    await page.getByRole('button', { name: 'Resume', exact: true }).click();
    await skip(page);
    await page.waitForTimeout(1100);
    await page.screenshot({ path: `evidence/realism/regression/practice-${width}.png` });
    if (width === 390) {
      await page
        .getByRole('button', { name: 'Focus board', exact: true })
        .click();
      await page.screenshot({ path: 'evidence/realism/regression/mobile-readable-board.png' });
      await page
        .getByRole('button', { name: 'Return to room', exact: true })
        .click();
    }
    results.layouts.push({ width, height, ...teaching });
    await context.close();
    console.log('Viewport passed', width, height);
  }
  if (results.errors.length || results.productionMutations.length)
    throw Error('Page errors or production mutations');
  results.passed = true;
  results.totalCheckpoints = [...results.classic, ...results.world].reduce(
    (n, x) => n + x.count,
    0,
  );
} catch (error) {
  const page = b
    .contexts()
    .flatMap((c) => c.pages())
    .at(-1);
  if (page) {
    await page.screenshot({ path: 'evidence/realism/regression/browser-failure.png' });
    results.failureState = await page.evaluate(() => ({
      text: document.body.innerText,
      main: document
        .querySelector('[data-world-typeface]')
        ?.outerHTML.slice(0, 2500),
    }));
  }
  throw error;
} finally {
  await writeFile(
    'evidence/realism/regression/browser-results.json',
    JSON.stringify(results, null, 2),
  );
  await b.close();
}
