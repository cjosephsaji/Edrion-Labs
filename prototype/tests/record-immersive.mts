import { chromium, type Page } from 'playwright-core';
import { fileURLToPath } from 'node:url';
import { rename, writeFile, mkdir } from 'node:fs/promises';
import { lessons } from '../lessons';
process.chdir(fileURLToPath(new URL('../', import.meta.url)));
const dir = 'evidence/redesign/recordings';
await mkdir(dir, { recursive: true });
const browser = await chromium.launch({
  executablePath:
    '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
  headless: true,
  args: ['--use-angle=metal', '--window-size=1440,981'],
});
const base = process.env.SHOWCASE_TEST_URL ?? 'http://127.0.0.1:3021';
const recordings: any[] = [];
async function take(
  name: string,
  journey: (p: Page, mark: (x: string) => void) => Promise<void>,
) {
  const c = await browser.newContext({
    viewport: null,
    recordVideo: { dir, size: { width: 1440, height: 900 } },
  });
  const p = await c.newPage();
  const errors: string[] = [];
  p.on('pageerror', (e) => errors.push(e.message));
  const start = Date.now();
  const beats: any[] = [];
  const mark = (action: string) => {
    const b = { seconds: +((Date.now() - start) / 1000).toFixed(1), action };
    beats.push(b);
    console.log(name, b);
  };
  await p.goto(base + '/prototype');
  const dimensions = await p.evaluate(() => ({
    width: innerWidth,
    height: innerHeight,
  }));
  if (dimensions.height !== 900)
    throw Error('Native viewport changed: ' + JSON.stringify(dimensions));
  await journey(p, mark);
  const metrics = await p.evaluate(() => window.__PETROS_WORLD_METRICS__);
  await c.close();
  const file = await p.video()!.path();
  await rename(file, `${dir}/${name}.webm`);
  recordings.push({
    name,
    file: `${dir}/${name}.webm`,
    dimensions,
    beats,
    errors,
    metrics,
  });
  if (errors.length) throw Error(errors.join('\n'));
}
async function arrival(p: Page, mark: (x: string) => void) {
  await p.waitForTimeout(1500);
  await p
    .getByRole('button', { name: 'Learn AI_Module_3.pdf', exact: true })
    .click();
  mark('Selected source-backed AI Module 3 / minimax');
  await p.waitForTimeout(1700);
  await p
    .getByRole('button', { name: 'Enter Petros World', exact: true })
    .click();
  mark('Full loading and portal transition');
  await p
    .getByRole('dialog', { name: 'Entering Petros World' })
    .waitFor({ state: 'detached', timeout: 30000 });
  mark('Arrive at desk; actual topic greeting');
  await p.waitForTimeout(3500);
  await p.screenshot({ path: 'evidence/redesign/recorded-arrival.png' });
  await p.getByRole('button', { name: 'Find my module', exact: true }).click();
  mark('Library focus and correct AI 3 book');
  await p.waitForTimeout(2200);
  await p.getByRole('button', { name: /Retrieve this book/ }).click();
  mark('Independent book travels to reading stand');
  await p
    .getByRole('button', { name: 'Let me show you', exact: true })
    .waitFor();
  await p.waitForTimeout(4000);
  await p.screenshot({ path: 'evidence/redesign/recorded-book.png' });
  await p.getByRole('button', { name: 'Let me show you', exact: true }).click();
  mark('Whiteboard focus; incremental tree construction');
  await p.waitForTimeout(6000);
  await p.screenshot({ path: 'evidence/redesign/recorded-teaching.png' });
}
try {
  await take('01-arrival', arrival);
  await take('02-interactive-minimax', async (p, mark) => {
    await arrival(p, mark);
    const l = lessons.find((l) => l.id === 'ai3')!;
    for (const [i, q] of l.questions.entries()) {
      await p.getByRole('heading', { name: q.task, exact: true }).waitFor();
      await p.waitForTimeout(i < 3 ? 1600 : 950);
      await p
        .getByRole('button', { name: 'Try it yourself', exact: true })
        .click();
      await p.waitForTimeout(1150);
      mark(`Checkpoint ${i + 1}: ${q.task}`);
      if (i === 2) {
        await p
          .getByRole('group', { name: 'World practice choices' })
          .getByRole('button', { name: '5', exact: true })
          .click();
        await p
          .getByRole('button', { name: 'Check practice answer', exact: true })
          .click();
        mark('Incorrect MIN choice gets specific correction');
        await p.waitForTimeout(2600);
        const point = await p.evaluate(
          () => window.__PETROS_WORLD_METRICS__!.picks['leaf-0-0']!,
        );
        const box = (await p.locator('canvas').boundingBox())!;
        await p.mouse.click(box.x + point.x, box.y + point.y);
        mark('Actual spatial leaf pick: 3');
      } else if (q.type === 'number')
        await p
          .getByRole('textbox', { name: 'World practice value' })
          .fill(q.correct[0]!);
      else if (q.type === 'text')
        await p
          .getByRole('textbox', { name: 'World explanation' })
          .fill(
            'MIN models the strongest opponent response. MAX chooses the best guaranteed result. Alpha-beta skips branches only when the bounds show they cannot improve that decision.',
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
      await p.waitForTimeout(1600);
      if (i === 2) {
        await p
          .getByRole('button', { name: 'Ask Petros anything', exact: true })
          .click();
        await p
          .getByRole('textbox', { name: 'Ask Petros anything', exact: true })
          .fill('Why did MIN A choose 3 instead of 5?');
        await p
          .getByRole('button', { name: 'Ask Petros', exact: true })
          .click();
        await p
          .getByText('Prepared source-linked explanation', { exact: true })
          .waitFor();
        mark(
          'Paused contextual question: actual MIN A values and source pages',
        );
        await p.waitForTimeout(6000);
        await p.screenshot({ path: 'evidence/redesign/recorded-context.png' });
        await p
          .getByRole('button', {
            name: 'Continue lesson · same checkpoint',
            exact: true,
          })
          .click();
        mark('Same checkpoint resumes');
        await p.waitForTimeout(1000);
      }
      if (i === 10) {
        for (let n = 0; n < 6; n++) {
          await p
            .getByRole('button', { name: 'Step pruning', exact: true })
            .click();
          await p.waitForTimeout(700);
        }
        await p.getByText('4 evaluated · 2 skipped', { exact: true }).waitFor();
        mark('Real traversal computes four evaluated and two skipped');
        await p.screenshot({ path: 'evidence/redesign/recorded-pruning.png' });
        await p.waitForTimeout(3500);
      }
      await p
        .getByRole('button', { name: 'Continue lesson', exact: true })
        .click();
    }
    await p
      .getByRole('heading', { name: 'Ideas to take with you.', exact: true })
      .waitFor();
    mark('All twelve checkpoints completed; recap');
    await p.waitForTimeout(5000);
    await p.screenshot({ path: 'evidence/redesign/recorded-recap.png' });
    await p.getByRole('button', { name: 'Room overview', exact: true }).click();
    mark('Return to room overview');
    await p.waitForTimeout(2500);
    await p
      .getByRole('button', { name: 'Exit Petros World', exact: true })
      .click();
    await p
      .getByRole('dialog', { name: 'Leaving Petros World' })
      .waitFor({ state: 'detached' });
    mark('Classic restored with lesson completion');
    await p
      .getByText('12 of 12 checkpoints explored.', { exact: true })
      .waitFor();
    await p.waitForTimeout(5000);
    await p.screenshot({
      path: 'evidence/redesign/recorded-classic-resume.png',
    });
  });
} finally {
  await writeFile(
    `${dir}/recordings.json`,
    JSON.stringify(recordings, null, 2),
  );
  await browser.close();
}
