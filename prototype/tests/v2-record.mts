import { chromium } from 'playwright-core';
import { fileURLToPath } from 'node:url';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { lessons } from '../lessons';
import { lessonForState } from '../teaching/tree-variant';
import { initialState } from '../teaching/controller';
process.chdir(fileURLToPath(new URL('../', import.meta.url)));
const dir = 'evidence/v2/recordings';
await mkdir(dir, { recursive: true });
const b = await chromium.launch({
  executablePath:
    '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
  headless: true,
  args: ['--use-angle=metal', '--window-size=1440,981'],
});
const c = await b.newContext({
  viewport: null,
  recordVideo: { dir, size: { width: 1440, height: 900 } },
});
const p = await c.newPage();
const errors: string[] = [],
  beats: any[] = [];
p.on('pageerror', (e) => errors.push(e.message));
const start = Date.now();
const mark = (action: string) => {
  const item = { seconds: +((Date.now() - start) / 1000).toFixed(1), action };
  beats.push(item);
  console.log(item);
};
const main = p.getByRole('main', { name: 'Petros World immersive study' });
let result: any;
try {
  await p.goto('http://127.0.0.1:3021/prototype');
  const dimensions = await p.evaluate(() => ({
    width: innerWidth,
    height: innerHeight,
  }));
  if (dimensions.width !== 1440 || dimensions.height !== 900)
    throw Error('Native viewport changed');
  await p.waitForTimeout(1700);
  await p
    .getByRole('button', { name: 'Learn AI_Module_3.pdf', exact: true })
    .click();
  mark('Select the actual AI Module 3 source');
  await p.waitForTimeout(1000);
  await p
    .getByRole('button', { name: 'Enter Petros World', exact: true })
    .click();
  mark('Load destination and enter through the real portal');
  await p
    .getByRole('dialog', { name: 'Entering Petros World' })
    .waitFor({ state: 'detached', timeout: 30000 });
  await p.waitForTimeout(1800);
  await p.screenshot({ path: 'evidence/v2/recorded-arrival.png' });
  mark('Human-scale interior and anchored welcome');
  await p.getByRole('button', { name: 'Find my module', exact: true }).click();
  await p.waitForTimeout(1200);
  await p.screenshot({ path: 'evidence/v2/recorded-library.png' });
  await p.getByRole('button', { name: /Retrieve this book/ }).click();
  mark('Actual source book travels independently to the stand');
  await p
    .getByRole('button', { name: /Let me show you|Continue this lesson/ })
    .waitFor();
  await p.screenshot({ path: 'evidence/v2/recorded-book.png' });
  await p.waitForFunction(
    () =>
      document
        .querySelector('[data-world-phase]')
        ?.getAttribute('data-world-phase') === 'teaching',
    null,
    { timeout: 15000 },
  );
  mark('Petros begins automatically; no sentence-advance clicks');
  await p.waitForTimeout(1300);
  await p.screenshot({ path: 'evidence/v2/recorded-empty-board.png' });
  await p.waitForFunction(
    () =>
      Number(
        document.querySelector('[data-reveal]')?.getAttribute('data-reveal'),
      ) >= 6,
    null,
    { timeout: 30000 },
  );
  await p.screenshot({ path: 'evidence/v2/recorded-tree-construction.png' });
  mark('Tree constructed progressively from the authorized script');
  await p
    .getByRole('heading', {
      name: 'Which first move should MAX choose?',
      exact: true,
    })
    .waitFor({ timeout: 30000 });
  await p.waitForTimeout(1200);
  mark('MIN comparisons and MAX backup complete; student gate');
  await p
    .getByRole('group', { name: 'World practice choices' })
    .getByRole('button', { name: 'B', exact: true })
    .click();
  await p
    .getByRole('button', { name: 'Check practice answer', exact: true })
    .click();
  await p.waitForTimeout(2400);
  mark('Incorrect branch gets relevant correction');
  const point = await p.evaluate(
    () => window.__PETROS_WORLD_METRICS__!.picks['branch-0']!,
  );
  const box = (await p.locator('[data-world-scene] canvas').boundingBox())!;
  await p.mouse.click(box.x + point.x, box.y + point.y);
  await p
    .getByRole('button', { name: 'Check practice answer', exact: true })
    .click();
  await p
    .getByRole('button', { name: 'Continue lesson', exact: true })
    .waitFor();
  mark('Actual canvas branch A is checked by deterministic minimax');
  await p.screenshot({ path: 'evidence/v2/recorded-max-choice.png' });
  await p.waitForTimeout(1800);
  await p.getByRole('button', { name: 'Continue lesson', exact: true }).click();
  mark('Automatic alpha-beta traversal begins');
  await p.waitForFunction(
    () =>
      document
        .querySelector('[data-teaching-script="minimax-pruning"]')
        ?.getAttribute('data-teaching-beat') === '4',
    null,
    { timeout: 25000 },
  );
  await p
    .getByRole('button', { name: 'Ask Petros anything', exact: true })
    .click();
  const pausedBeat = await main.getAttribute('data-teaching-beat');
  await p
    .getByRole('textbox', { name: 'Ask Petros anything', exact: true })
    .fill('Why didn’t you check the 9?');
  await p.getByRole('button', { name: 'Ask Petros', exact: true }).click();
  await p
    .locator('[aria-label="World conversation"]')
    .getByText('Prepared source-linked explanation', { exact: true })
    .waitFor();
  await p
    .locator('[aria-label="World conversation"]')
    .getByText(/alpha = 3/)
    .waitFor();
  await p.screenshot({ path: 'evidence/v2/recorded-context.png' });
  mark('Contextual why-not-9 question pauses the traversal at its exact beat');
  await p.waitForTimeout(6000);
  if ((await main.getAttribute('data-teaching-beat')) !== pausedBeat)
    throw Error('Timeline advanced during question');
  await p
    .getByRole('button', {
      name: 'Continue lesson · same checkpoint',
      exact: true,
    })
    .click();
  mark('Resume the same pruning beat');
  await p.waitForFunction(
    () =>
      document
        .querySelector('[data-world-phase]')
        ?.getAttribute('data-world-phase') === 'practice',
    null,
    { timeout: 20000 },
  );
  await p.waitForFunction(
    () =>
      (window as any).__PETROS_BOARD__?.layout.text.some((t: string) =>
        t.includes('5 examined · 1 skipped'),
      ),
    null,
    { timeout: 5000 },
  );
  await p.screenshot({ path: 'evidence/v2/recorded-pruning.png' });
  mark('Computed result: five examined, one skipped, root remains 3');
  await p.waitForTimeout(2400);
  const l = lessonForState(lessons[0], {
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
  for (let n = 0; n < 11; n++) {
    await p.waitForFunction(
      () =>
        document
          .querySelector('[data-world-phase]')
          ?.getAttribute('data-world-phase') === 'practice',
      null,
      { timeout: 20000 },
    );
    const id = (await main.getAttribute('data-question-id'))!,
      q = l.questions.find((q) => q.id === id)!;
    mark('Prepared checkpoint ' + id);
    await p.waitForTimeout(700);
    if (q.type === 'number')
      await p
        .getByRole('textbox', { name: 'World practice value' })
        .fill(q.correct[0]!);
    else if (q.type === 'text')
      await p
        .getByRole('textbox', { name: 'World explanation' })
        .fill(
          'MIN supplies the strongest opposing reply. MAX chooses the best guaranteed score. Alpha-beta skips a leaf only when a bound shows it cannot improve that decision.',
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
    await p.waitForTimeout(1000);
    await p
      .getByRole('button', { name: 'Continue lesson', exact: true })
      .click();
  }
  await p
    .getByRole('heading', { name: 'Ideas to take with you.', exact: true })
    .waitFor();
  await p.screenshot({ path: 'evidence/v2/recorded-recap.png' });
  mark(
    'All twelve checkpoints complete; text explanation recorded without automatic grade',
  );
  await p.waitForTimeout(3500);
  await p.getByRole('button', { name: 'Room overview', exact: true }).click();
  await p.waitForTimeout(1200);
  await p
    .getByRole('button', { name: 'Exit Petros World', exact: true })
    .click();
  await p
    .getByRole('dialog', { name: 'Leaving Petros World' })
    .waitFor({ state: 'detached' });
  await p
    .getByText('12 of 12 checkpoints explored.', { exact: true })
    .waitFor();
  await p.screenshot({ path: 'evidence/v2/recorded-classic-resume.png' });
  mark('Classic retains all completion and help records');
  await p.waitForTimeout(3000);
  result = {
    dimensions,
    beats,
    errors,
    textLed: true,
    tts: false,
    metrics: await p.evaluate(() => window.__PETROS_WORLD_METRICS__),
    passed: errors.length === 0,
  };
  if (errors.length) throw Error(errors.join('\n'));
} finally {
  await c.close();
  const file = await p.video()!.path();
  await rename(file, `${dir}/petros-world-v2-continuous.webm`);
  await writeFile(
    `${dir}/recording.json`,
    JSON.stringify(result ?? { beats, errors, passed: false }, null, 2),
  );
  await b.close();
}
