import { chromium } from 'playwright-core';
import { fileURLToPath } from 'node:url';
import { writeFile } from 'node:fs/promises';
import { lessons } from '../lessons';
process.chdir(fileURLToPath(new URL('../', import.meta.url)));
const base = process.env.SHOWCASE_TEST_URL ?? 'http://127.0.0.1:3021';
const browser = await chromium.launch({
  executablePath:
    '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
  headless: true,
  args: ['--use-angle=metal'],
});
const results: any = {
  lessons: [],
  viewports: [],
  errors: [],
  productionMutations: [],
  askRequests: [],
};
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  await context.tracing.start({
    screenshots: true,
    snapshots: true,
    sources: true,
  });
  const page = await context.newPage();
  page.on('pageerror', (e) => results.errors.push(e.message));
  page.on('request', (r) => {
    if (
      ['POST', 'PUT', 'PATCH', 'DELETE'].includes(r.method()) &&
      !r.url().includes('/prototype/api/')
    )
      results.productionMutations.push(r.url());
  });
  await page.route('**/prototype/api/ask', async (route) => {
    results.askRequests.push(route.request().postDataJSON());
    await new Promise((resolve) => setTimeout(resolve, 300));
    await route.continue();
  });
  await page.goto(base + '/prototype');
  await page
    .getByRole('heading', { name: 'What are we learning today?' })
    .waitFor();
  if (
    (await page
      .getByRole('button', { name: 'Classic', exact: true })
      .getAttribute('aria-pressed')) !== 'true'
  )
    throw Error('Classic not default');
  await page.screenshot({
    path: 'evidence/final-home-1440.png',
    fullPage: true,
  });
  await page
    .locator('input[type=file]')
    .setInputFiles(
      [
        'AI_Module_3.pdf',
        'AI_Module_4.pdf',
        'EHS_Module_3.pdf',
        'EHS_Module_5.pdf',
      ].map((f) => 'assets/source-pdfs/' + f),
    );
  await page
    .getByText(/recognized by content/)
    .nth(3)
    .waitFor({ timeout: 60000 });
  await page.screenshot({
    path: 'evidence/final-upload-receipts.png',
    fullPage: true,
  });
  results.fourUploads = true;
  for (const lesson of lessons) {
    await page.getByRole('button', { name: 'Classic', exact: true }).click();
    await page
      .getByRole('button', { name: 'Petros Showcase', exact: true })
      .click();
    if (lesson.filename)
      await page
        .getByRole('button', { name: `Learn ${lesson.filename}`, exact: true })
        .click();
    else
      await page
        .getByRole('button', { name: lesson.title, exact: false })
        .click();
    await page
      .getByRole('button', { name: 'Start lesson', exact: true })
      .click();
    let explored = 0;
    for (const [index, q] of lesson.questions.entries()) {
      await page.getByRole('heading', { name: q.task, exact: true }).waitFor();
      if (q.type === 'number')
        await page
          .getByRole('textbox', { name: 'Practice value' })
          .fill(q.correct[0]!);
      else if (q.type === 'text') {
        const draft = `My explanation for ${lesson.id}: I connect the visible relationship to its assumptions, then check a changed example.`;
        await page
          .getByRole('textbox', { name: 'Your explanation' })
          .fill(draft);
        if (lesson.id === 'ai3') {
          await page
            .getByRole('button', { name: 'Petros World', exact: true })
            .click();
          await page.locator('canvas').waitFor();
          if (
            (await page
              .getByRole('textbox', { name: 'Your explanation' })
              .inputValue()) !== draft
          )
            throw Error('Answer draft lost in World');
          await page
            .getByRole('button', { name: 'Classic', exact: true })
            .click();
          if (
            (await page
              .getByRole('textbox', { name: 'Your explanation' })
              .inputValue()) !== draft
          )
            throw Error('Answer draft lost in Classic');
          results.answerDraftPreserved = true;
        }
      } else if (lesson.id === 'ai3' && [3, 4, 5, 10].includes(index + 1)) {
        const ids: Record<number, string> = {
          3: 'leaf-0-0',
          4: 'leaf-1-0',
          5: 'leaf-2-0',
          10: 'leaf-2-1',
        };
        await page
          .getByRole('button', { name: new RegExp(`^${ids[index + 1]}:`) })
          .click();
      } else if (q.id === 'AI4-Q02')
        await page
          .getByRole('button', { name: 'TELL Bird(Tweety)', exact: true })
          .click();
      else if (q.id === 'AI4-Q05')
        await page
          .getByRole('button', { name: 'Apply rule · Tweety', exact: true })
          .click();
      else if (q.id === 'AI4-Q10') {
        await page
          .getByRole('button', { name: 'TELL Bird(Rio)', exact: true })
          .click();
        await page
          .getByRole('button', { name: 'Apply rule · Rio', exact: true })
          .click();
      } else if (q.id === 'EHS3-Q02')
        await page.getByRole('button', { name: /^Inspect hazard 1:/ }).click();
      else if (q.id === 'EHS3-Q04')
        await page.getByRole('button', { name: /^Inspect hazard 5:/ }).click();
      else if (q.id === 'EHS3-Q11')
        await page
          .getByRole('button', {
            name: 'Identify unsupported sidewall',
            exact: true,
          })
          .click();
      else if (q.id === 'EHS5-Q02')
        await page
          .getByRole('button', {
            name: 'Inspect Untreated wastewater',
            exact: true,
          })
          .click();
      else if (q.id === 'EHS5-Q04')
        await page
          .getByRole('button', {
            name: 'Inspect Farm chemical runoff',
            exact: true,
          })
          .click();
      else if (q.id === 'AI-Q06')
        await page
          .getByRole('slider', { name: 'Connection weight' })
          .fill('1.5');
      else {
        if (q.id === 'TIME-Q04') {
          await page.getByRole('button', { name: 'Try 0.6c' }).click();
          await page.getByRole('button', { name: 'Try 0.8c' }).click();
        }
        const group = page.getByRole('group', {
          name:
            q.type === 'multi' ? 'Select all that apply' : 'Practice choices',
        });
        for (const answer of q.correct) {
          const optIndex = q.options.indexOf(answer);
          await group
            .getByRole('button', {
              name: `${q.type === 'multi' ? '□' : String.fromCharCode(65 + optIndex)} ${answer}`,
              exact: true,
            })
            .click();
        }
      }
      await page
        .getByRole('button', {
          name:
            q.type === 'text' ? 'Record explanation' : 'Check practice answer',
          exact: true,
        })
        .click();
      await page
        .getByRole('button', { name: 'Continue', exact: true })
        .waitFor();
      explored++;
      if (lesson.id === 'ai3' && index === 3) {
        await page
          .getByRole('button', { name: 'Ask Petros A question', exact: false })
          .click();
        await page
          .getByRole('textbox', { name: 'Ask Petros a question' })
          .fill('Why did this highlighted MIN B choose 2 instead of 9?');
        await page
          .getByRole('button', { name: 'Ask Petros', exact: true })
          .click();
        await page
          .getByRole('button', { name: 'Petros World', exact: true })
          .click();
        await page.getByText('Model unavailable', { exact: true }).waitFor();
        await page
          .getByRole('button', { name: 'Resume explanation · same step' })
          .click();
        await page
          .getByRole('heading', { name: q.task, exact: true })
          .waitFor();
        await page
          .getByRole('button', { name: 'Classic', exact: true })
          .click();
        results.interruptResume = true;
      }
      if (index === lesson.questions.length - 2)
        await page.screenshot({
          path: `evidence/final-${lesson.id}.png`,
          fullPage: true,
        });
      await page.getByRole('button', { name: 'Continue', exact: true }).click();
    }
    await page
      .getByRole('heading', { name: 'Here’s what you explored.', exact: true })
      .waitFor();
    await page
      .getByText(
        `${lesson.questions.length} of ${lesson.questions.length} checkpoints explored.`,
        { exact: true },
      )
      .waitFor();
    results.lessons.push({ id: lesson.id, checkpoints: explored, recap: true });
    console.log('Completed', lesson.id, explored);
  }
  await page
    .getByRole('button', { name: 'Petros Showcase', exact: true })
    .click();
  await page
    .getByRole('textbox', { name: 'Explore any topic' })
    .fill('Why do stars form?');
  await page
    .getByRole('button', { name: 'Let’s explore', exact: false })
    .click();
  await page.getByText(/No qualified read-only model connector/).waitFor();
  if (
    (await page
      .getByRole('textbox', { name: 'Explore any topic' })
      .inputValue()) !== 'Why do stars form?'
  )
    throw Error('Topic was lost');
  results.arbitraryFallback = true;
  await context.tracing.stop({ path: 'evidence/browser-trace.zip' });
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
    const p = await c.newPage();
    await p.goto(base + '/prototype');
    await p
      .getByRole('heading', { name: 'What are we learning today?' })
      .waitFor();
    const homeOverflow = await p.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    );
    await p.screenshot({ path: `evidence/home-${width}.png`, fullPage: true });
    await p
      .getByRole('button', { name: 'Learn AI_Module_3.pdf', exact: true })
      .click();
    await p.getByRole('button', { name: 'Start lesson', exact: true }).click();
    await p.getByRole('button', { name: 'Show next step →' }).click();
    await p.keyboard.press('Tab');
    const focus = await p.evaluate(() => document.activeElement?.tagName);
    const lessonOverflow = await p.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    );
    await p.screenshot({
      path: `evidence/classic-${width}.png`,
      fullPage: true,
    });
    await p.getByRole('button', { name: 'Petros World', exact: true }).click();
    await p.locator('canvas').waitFor();
    await p.waitForFunction(() =>
      Boolean((window as any).__PETROS_WORLD_METRICS__?.picks),
    );
    await p.waitForTimeout(180);
    await p.getByRole('button', { name: 'Try it', exact: true }).click();
    await p.waitForTimeout(150);
    const worldOverflow = await p.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    );
    await p.screenshot({ path: `evidence/world-${width}.png`, fullPage: true });
    const metrics = await p.evaluate(
      () => (window as any).__PETROS_WORLD_METRICS__,
    );
    await p
      .locator('canvas')
      .evaluate((canvas: HTMLCanvasElement) =>
        canvas.dispatchEvent(
          new Event('webglcontextlost', { cancelable: true }),
        ),
      );
    await p
      .getByRole('heading', {
        name: 'The 3D canvas was interrupted.',
        exact: true,
      })
      .waitFor();
    await p
      .getByRole('button', { name: 'Switch to Classic', exact: true })
      .click();
    await p
      .getByRole('heading', {
        name: 'Why must a game-playing AI consider the opponent?',
        exact: true,
      })
      .waitFor();
    results.viewports.push({
      width,
      height,
      homeOverflow,
      lessonOverflow,
      worldOverflow,
      focus,
      reducedMotionFrames: metrics.transitions.map((t: any) => t.frames),
      contextLossFallback: true,
    });
    if (homeOverflow || lessonOverflow || worldOverflow)
      throw Error('Overflow at ' + width);
    await c.close();
    console.log('Viewport verified', width, height);
  }
  if (results.errors.length || results.productionMutations.length)
    throw Error('Browser errors or production writes');
  if (results.askRequests.length !== 1) throw Error('Duplicate ask');
  const ask = results.askRequests[0];
  if (
    ask.highlight !== 'leaf-1-0' ||
    ask.source !== 'AI_Module_3.pdf' ||
    !ask.excerpt ||
    ask.excerpt.length > 3000
  )
    throw Error('Context not bounded/source-grounded');
  results.totalCheckpoints = results.lessons.reduce(
    (n: any, l: any) => n + l.checkpoints,
    0,
  );
  results.passed = true;
} finally {
  await writeFile(
    'evidence/browser-results.json',
    JSON.stringify(results, null, 2),
  );
  await browser.close();
}
