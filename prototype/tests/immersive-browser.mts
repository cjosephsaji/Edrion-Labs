import { chromium, type Page } from 'playwright-core';
import { fileURLToPath } from 'node:url';
import { writeFile } from 'node:fs/promises';
import { lessons } from '../lessons';
import type { Lesson } from '../teaching/types';
process.chdir(fileURLToPath(new URL('../', import.meta.url)));
const base = process.env.SHOWCASE_TEST_URL ?? 'http://127.0.0.1:3021';
const browser = await chromium.launch({
  executablePath:
    '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
  headless: true,
  args: ['--use-angle=metal'],
});
const results: any = {
  classic: [],
  world: [],
  viewports: [],
  errors: [],
  productionMutations: [],
  portalReplaysDuringLessonChange: 0,
};
async function entered(p: Page) {
  await p
    .getByRole('button', { name: 'Enter Petros World', exact: true })
    .click();
  await p
    .getByRole('dialog', { name: 'Entering Petros World' })
    .waitFor({ state: 'detached', timeout: 30000 });
  await p.getByRole('main', { name: 'Petros World immersive study' }).waitFor();
}
async function exit(p: Page) {
  await p
    .getByRole('button', { name: 'Exit Petros World', exact: true })
    .click();
  await p
    .getByRole('dialog', { name: 'Leaving Petros World' })
    .waitFor({ state: 'detached' });
}
async function retrieveCurrent(p: Page) {
  await p.getByRole('button', { name: 'Find my module', exact: true }).click();
  await p
    .getByRole('button', { name: 'Retrieve this book', exact: false })
    .click();
  await p
    .getByRole('button', { name: /^(Let me show you|Continue this lesson)$/ })
    .click();
}
async function book(p: Page, l: Lesson) {
  await p
    .getByRole('navigation', { name: 'World stations' })
    .getByRole('button', { name: /Library/ })
    .click();
  const drawer = p.locator('[aria-label="World library"]');
  await drawer.getByRole('button').filter({ hasText: l.title }).first().click();
  if (!l.general)
    await p
      .getByRole('button', { name: 'Retrieve this book', exact: false })
      .click();
  await p.getByRole('button', { name: 'Let me show you', exact: true }).click();
  if (await p.getByRole('dialog', { name: 'Entering Petros World' }).count())
    throw Error('Portal replayed while changing lesson');
}
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  await context.tracing.start({
    screenshots: true,
    snapshots: true,
    sources: true,
  });
  const p = await context.newPage();
  p.on('pageerror', (e) => results.errors.push(e.message));
  p.on('request', (r) => {
    if (
      ['POST', 'PUT', 'PATCH', 'DELETE'].includes(r.method()) &&
      !r.url().includes('/prototype/api/')
    )
      results.productionMutations.push(r.url());
  });
  await p.goto(base + '/prototype');
  // The existing Classic presenter exercises the same shared commands without an embedded World.
  for (const l of lessons) {
    await p
      .getByRole('button', { name: 'Petros Showcase', exact: true })
      .click();
    if (l.filename)
      await p
        .getByRole('button', { name: `Learn ${l.filename}`, exact: true })
        .click();
    else await p.getByRole('button', { name: l.title, exact: false }).click();
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
            'My own explanation connects the visible example with the stated assumptions.',
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
    results.classic.push({ id: l.id, checkpoints: l.questions.length });
    console.log('Classic passed', l.id);
  }
  // A fresh minimax lesson enters through the complete portal/book sequence.
  await p.getByRole('button', { name: 'Petros Showcase', exact: true }).click();
  await p
    .getByRole('button', { name: 'Learn AI_Module_3.pdf', exact: true })
    .click();
  await entered(p);
  await p.screenshot({ path: 'evidence/redesign/final-arrival-1440.png' });
  await retrieveCurrent(p);
  for (const l of lessons) {
    if (l.id !== 'ai3') await book(p, l);
    for (const [index, q] of l.questions.entries()) {
      await p.getByRole('heading', { name: q.task, exact: true }).waitFor();
      await p
        .getByRole('button', { name: 'Try it yourself', exact: true })
        .click();
      if (q.type === 'number')
        await p
          .getByRole('textbox', { name: 'World practice value' })
          .fill(q.correct[0]!);
      else if (q.type === 'text') {
        const draft =
          'My World explanation must remain exactly the same across both renderers.';
        await p.getByRole('textbox', { name: 'World explanation' }).fill(draft);
        if (l.id === 'ai3') {
          await exit(p);
          if (
            (await p
              .getByRole('textbox', { name: 'Your explanation' })
              .inputValue()) !== draft
          )
            throw Error('Draft lost in Classic');
          await entered(p);
          await retrieveCurrent(p);
          await p
            .getByRole('button', { name: 'Try it yourself', exact: true })
            .click();
          if (
            (await p
              .getByRole('textbox', { name: 'World explanation' })
              .inputValue()) !== draft
          )
            throw Error('Draft lost on reentry');
          results.draftAndCompletedPreserved = true;
        }
      } else
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
      if (l.id === 'ai3' && index === 3) {
        await p
          .getByRole('button', { name: 'Ask Petros anything', exact: true })
          .click();
        await p
          .getByRole('textbox', { name: 'Ask Petros anything', exact: true })
          .fill('Why did MIN B choose 2 instead of 9?');
        await p
          .getByRole('button', { name: 'Ask Petros', exact: true })
          .click();
        await p
          .getByText('Prepared source-linked explanation', { exact: true })
          .waitFor();
        await p
          .locator('[aria-label="World conversation"]')
          .getByText(/min\(2, 9\) = 2/)
          .waitFor();
        await p.screenshot({ path: 'evidence/redesign/final-context.png' });
        await p
          .getByRole('button', {
            name: 'Continue lesson · same checkpoint',
            exact: true,
          })
          .click();
        await p.getByRole('heading', { name: q.task, exact: true }).waitFor();
        results.contextInterruptionResumed = true;
      }
      if (l.id === 'ai3' && index === 10) {
        for (let i = 0; i < 6; i++)
          await p
            .getByRole('button', { name: 'Step pruning', exact: true })
            .click();
        await p.getByText('4 evaluated · 2 skipped', { exact: true }).waitFor();
        await p.waitForTimeout(900);
        await p.screenshot({ path: 'evidence/redesign/final-pruning.png' });
        results.actualPruning = true;
      }
      if (l.id === 'ehs3' && index === 8) {
        await p
          .getByRole('button', { name: 'Show safer setup', exact: true })
          .click();
        await p.getByRole('button', { name: 'Rotate model right' }).click();
        await p.screenshot({
          path: 'evidence/redesign/final-construction.png',
        });
      }
      if (l.id === 'ehs5' && index === 10) {
        await p
          .getByRole('button', {
            name: '+ Treat wastewater before discharge',
            exact: true,
          })
          .click();
        await p
          .getByRole('button', {
            name: '+ Reduce agrochemical runoff',
            exact: true,
          })
          .click();
        await p.screenshot({ path: 'evidence/redesign/final-river.png' });
      }
      if (l.id === 'open-ai' && index === 5) {
        await p
          .getByRole('slider', { name: 'World connection weight' })
          .fill('1.5');
        await p.screenshot({ path: 'evidence/redesign/final-network.png' });
      }
      if (l.id === 'time' && index === 4) {
        await p.getByRole('button', { name: 'Try 0.8c', exact: true }).click();
        await p.screenshot({ path: 'evidence/redesign/final-clocks.png' });
      }
      await p
        .getByRole('button', { name: 'Continue lesson', exact: true })
        .click();
    }
    await p
      .getByRole('heading', { name: 'Ideas to take with you.', exact: true })
      .waitFor();
    results.world.push({
      id: l.id,
      checkpoints: l.questions.length,
      recap: true,
    });
    console.log('World passed', l.id);
  }
  results.metrics = await p.evaluate(() => window.__PETROS_WORLD_METRICS__);
  await context.tracing.stop({
    path: 'evidence/redesign/complete-browser-trace.zip',
  });
  await context.close();
  for (const [width, height] of [
    [1440, 900],
    [1366, 768],
    [390, 844],
    [360, 800],
  ]) {
    const c = await browser.newContext({
      viewport: { width, height },
      reducedMotion: 'reduce',
    });
    const page = await c.newPage();
    page.on('pageerror', (e) => results.errors.push(e.message));
    await page.goto(base + '/prototype');
    await page
      .getByRole('button', { name: 'Learn EHS_Module_3.pdf', exact: true })
      .click();
    await entered(page);
    await retrieveCurrent(page);
    await page
      .getByRole('button', { name: 'Try it yourself', exact: true })
      .click();
    await page.waitForTimeout(150);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    );
    await page.screenshot({ path: `evidence/redesign/world-${width}.png` });
    await page
      .getByRole('button', { name: 'Ask Petros anything', exact: true })
      .click();
    await page
      .getByRole('textbox', { name: 'Ask Petros anything', exact: true })
      .fill('A draft while the camera stays still');
    await page.screenshot({ path: `evidence/redesign/ask-${width}.png` });
    await page
      .getByRole('button', { name: 'Close World conversation' })
      .click();
    await page
      .locator('canvas')
      .evaluate((canvas) =>
        canvas.dispatchEvent(
          new Event('webglcontextlost', { cancelable: true }),
        ),
      );
    await page
      .getByRole('heading', {
        name: 'The 3D canvas was interrupted.',
        exact: true,
      })
      .waitFor();
    await page
      .getByRole('button', { name: 'Back to Classic', exact: true })
      .click();
    await page
      .getByRole('dialog', { name: 'Leaving Petros World' })
      .waitFor({ state: 'detached' });
    results.viewports.push({
      width,
      height,
      overflow,
      reducedMotion: true,
      contextLossRecovered: true,
    });
    if (overflow) throw Error('Overflow at ' + width);
    await c.close();
    console.log('Viewport passed', width, height);
  }
  if (results.errors.length || results.productionMutations.length)
    throw Error('Browser errors or production writes');
  results.passed = true;
  results.totalCheckpoints = [...results.classic, ...results.world].reduce(
    (n: any, x: any) => n + x.checkpoints,
    0,
  );
} finally {
  await writeFile(
    'evidence/redesign/browser-results.json',
    JSON.stringify(results, null, 2),
  );
  await browser.close();
}
