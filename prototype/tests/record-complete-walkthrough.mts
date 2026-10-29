import { chromium, type Locator } from 'playwright-core';
import { fileURLToPath } from 'node:url';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { lessons } from '../lessons';
import type { Lesson, Question } from '../teaching/types';
import { lessonForState } from '../teaching/tree-variant';
import { initialState } from '../teaching/controller';
import { POLLUTION, HAZARDS } from '../teaching/algorithms';
process.chdir(fileURLToPath(new URL('../', import.meta.url)));
const dry = process.env.PETROS_RECORDING_TRIAL === '1';
const dir = `evidence/full-walkthrough/${dry ? 'trial' : 'capture'}`;
await mkdir(dir, { recursive: true });
const b = await chromium.launch({
  executablePath:
    '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
  headless: true,
  args: ['--use-angle=metal', '--window-size=1920,1161'],
});
const ctx = await b.newContext({
  viewport: null,
  ...(dry ? {} : { recordVideo: { dir, size: { width: 1920, height: 1080 } } }),
});
const p = await ctx.newPage();
p.setDefaultTimeout(18000);
const start = Date.now();
let stopped = false;
process.on('SIGINT', () => {
  stopped = true;
});
process.on('SIGTERM', () => {
  stopped = true;
});
const results: any = {
  dry,
  chapters: [],
  events: [],
  modules: [],
  errors: [],
  productionMutations: [],
  startedAt: new Date().toISOString(),
  silent: true,
  edited: false,
};
p.on('pageerror', (e) => results.errors.push(e.message));
p.on('request', (r) => {
  if (
    ['POST', 'PATCH', 'PUT', 'DELETE'].includes(r.method()) &&
    !r.url().includes('/prototype/api/')
  )
    results.productionMutations.push(r.url());
});
const sec = () => +((Date.now() - start) / 1000).toFixed(1);
let mode = 'Classic',
  current = 'Preparation';
async function mark(label: string, chapter = false) {
  const event = { seconds: sec(), mode, module: current, label };
  results.events.push(event);
  if (chapter) results.chapters.push(event);
  await writeFile(
    `${dir}/progress.json`,
    JSON.stringify({ ...results, current: event }, null, 2),
  );
  console.log(JSON.stringify(event));
}
async function hold(seconds: number) {
  if (stopped) throw Error('Recording stopped by operator');
  await p.waitForTimeout(dry ? Math.min(seconds * 35, 200) : seconds * 1000);
}
async function glide(loc: Locator, block: ScrollLogicalPosition = 'center') {
  await loc.waitFor({ state: 'visible' });
  const r = await loc.boundingBox();
  const height = await p.evaluate(() => innerHeight);
  if (
    r &&
    r.y >= 100 &&
    r.y + r.height <= height - 90 &&
    (block !== 'start' || r.y < height * 0.45)
  ) {
    await hold(0.25);
    return;
  }
  await loc.evaluate(
    (el, block) => el.scrollIntoView({ behavior: 'smooth', block }),
    block,
  );
  await hold(1);
}
async function click(loc: Locator) {
  await glide(loc);
  const box = await loc.boundingBox();
  if (box) {
    await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2, {
      steps: 18,
    });
    await hold(0.7);
  }
  await loc.click();
  await hold(0.65);
}
function button(name: string | RegExp) {
  return p.getByRole('button', { name, exact: typeof name === 'string' });
}
async function type(loc: Locator, text: string) {
  await click(loc);
  await loc.fill('');
  await loc.pressSequentially(text, { delay: dry ? 1 : 120, timeout: 90000 });
  await hold(1.3);
}
async function read(loc: Locator, min = 6, max = 12) {
  await glide(loc, 'start');
  const n = (await loc.innerText()).trim().split(/\s+/).length;
  await hold(Math.max(min, Math.min(max, n / 3 + 1)));
}
async function shot(name: string) {
  await p.screenshot({ path: `${dir}/${name}.png` });
}
const world = () =>
  p.getByRole('main', { name: 'Petros World immersive study' });
const phase = () => world().getAttribute('data-world-phase');
const bank = lessons.filter((l) => !l.general);
const words: Record<string, string> = {
  ai3: 'At each MIN node the opponent chooses the lower score for MAX. MAX chooses the branch with the best guaranteed score. A leaf can be skipped only when a bound proves that it cannot change that choice.',
  ai4: 'TELL adds a fact or rule to the knowledge base. ASK checks what follows from the stored knowledge. Knowing that Tweety has wings does not prove that Tweety can fly without a supporting flight rule.',
  ehs3: 'The open platform edge is a fall hazard, so the illustration adds edge protection. Loose tools may strike people below, so they are secured away from the edge. The base also needs firm, level and secured support.',
  ehs5: 'I would treat wastewater before discharge, reduce excessive farm chemicals, collect solid waste and keep oil out of drains. Each measure addresses a different pollution pathway. This illustration does not prove drinking-water safety.',
};
const asks: Record<string, string> = {
  ai3: 'Why does MIN choose the smaller value instead of the biggest leaf?',
  ai4: 'Why is CanFly(Tweety) unknown rather than definitely false?',
  ehs3: 'Why is this selected scaffold hazard dangerous, and what changes in the safer setup?',
  ehs5: 'How does controlling this pollution pathway help, and does it prove the river is safe to drink?',
};
const milestones: Record<string, Record<number, number>> = {
  ai3: { 1: 0, 3: 1, 6: 2, 7: 3, 9: 4, 12: 5 },
  ai4: { 1: 0, 2: 1, 4: 2, 5: 3, 6: 4, 8: 5 },
  ehs3: { 1: 0, 2: 1, 3: 2, 4: 3, 7: 4, 11: 5 },
  ehs5: { 1: 0, 2: 1, 4: 2, 6: 3, 7: 4, 10: 5 },
};
async function reader(kind: 'source' | 'explanation') {
  await click(button(kind === 'source' ? 'View source' : 'Full explanation'));
  const dialog = p.getByRole('dialog', {
    name: kind === 'source' ? 'Verified source reader' : 'Full explanation',
    exact: true,
  });
  await dialog.waitFor();
  await hold(kind === 'source' ? 10 : 9);
  await mark(
    kind === 'source'
      ? 'Read the verified source page'
      : 'Read the prepared full explanation',
  );
  await click(button('Close reader'));
}
async function askClassic(l: Lesson) {
  await click(button(/^Ask Petros A question/));
  await type(
    p.getByRole('textbox', { name: 'Ask Petros a question', exact: true }),
    asks[l.id]!,
  );
  await click(button('Ask Petros'));
  await p.getByText('Model unavailable', { exact: true }).last().waitFor();
  await mark(
    'Ask a real question; inspect the actual live-model-unavailable response',
  );
  await hold(10);
  await click(button('Resume explanation · same step'));
  await click(button(/^Ask Petros A question/));
  await reader('explanation');
}
async function askWorld(text: string) {
  const id = await world().getAttribute('data-question-id');
  await click(button('Ask Petros anything'));
  await type(
    p.getByRole('textbox', { name: 'Ask Petros anything', exact: true }),
    text,
  );
  await click(button('Ask Petros'));
  const answer = p
    .locator('[aria-label="World conversation"] [data-role="assistant"]')
    .last();
  await answer.waitFor();
  await read(answer, 11, 17);
  await mark('Read the actual labelled prepared answer to the typed question');
  await shot(`${current.replace(/\W/g, '-')}-question`);
  await click(button('Continue lesson · same checkpoint'));
  if ((await world().getAttribute('data-question-id')) !== id)
    throw Error('Question changed during interruption');
}
async function tools() {
  const close = button('Close model tools');
  if (!(await close.isVisible())) await click(button('Model tools'));
}
async function closeTools() {
  const close = button('Close model tools');
  if (await close.isVisible()) await click(close);
}
async function worldTeaching() {
  const seen = new Set<string>();
  let tries = 0;
  while (!['practice', 'recap'].includes((await phase()) ?? '')) {
    if (++tries > 1000) throw Error('Teaching did not reach a student gate');
    if (dry) {
      const skip = button('Skip explanation');
      if (await skip.isVisible()) await skip.click();
      await p.waitForTimeout(120);
      continue;
    }
    const info = await world().evaluate((el) => ({
      phase: el.getAttribute('data-world-phase'),
      script: el.getAttribute('data-teaching-script'),
      beat: el.getAttribute('data-teaching-beat'),
    }));
    if (info.phase === 'teaching') {
      const key = `${info.script}-${info.beat}`;
      if (!seen.has(key)) {
        seen.add(key);
        await hold(0.55);
        const pause = button('Pause');
        if (await pause.isVisible()) await pause.click();
        await mark(
          `Read teaching beat: ${info.script} / ${Number(info.beat) + 1}`,
        );
        await hold(info.script === 'checkpoint' ? 3 : 5);
        if (info.script === 'minimax-pruning' && info.beat === '4')
          await askWorld(
            'Why is the 9 skipped, but both 4 and 1 at C are examined?',
          );
        else {
          const resume = button('Resume');
          if (await resume.isVisible()) await click(resume);
        }
      }
    }
    await p.waitForTimeout(200);
  }
}
async function readBook() {
  await p.waitForFunction(
    () =>
      ['book', 'teaching', 'practice'].includes(
        document
          .querySelector('[data-world-phase]')
          ?.getAttribute('data-world-phase') ?? '',
      ),
    null,
    { timeout: 20000 },
  );
  if ((await phase()) === 'book' && !dry) {
    await button('Pause').click();
    await hold(7);
    await mark('Read the source-book card before teaching starts');
    await click(button('Resume'));
  }
  await worldTeaching();
}
async function classicStep(l: Lesson, n: number) {
  const target = milestones[l.id]?.[n];
  if (target === undefined) return;
  const label = p
    .locator('#prototype-learning-tool')
    .getByText(/^Teaching step /);
  let currentStep =
    Number((await label.innerText()).match(/(\d+)\//)?.[1] ?? 1) - 1;
  while (currentStep < target) {
    await glide(p.locator('#prototype-learning-tool'), 'start');
    await click(button(/^Show next step/));
    currentStep++;
    await mark(`Teaching step ${currentStep + 1}: ${l.steps[currentStep]}`);
    await hold(7);
  }
}
async function classicVisual(l: Lesson, n: number) {
  if (l.id === 'ai3' && n >= 3 && n <= 5) {
    const b = n - 3,
      leaf = b === 0 ? 0 : b === 1 ? 0 : 0;
    await click(
      p.getByRole('button', { name: new RegExp(`^leaf-${b}-${leaf}:`) }),
    );
    await hold(4);
  }
  if (l.id === 'ai3' && n === 7) {
    await click(p.getByRole('button', { name: /^branch-0:/ }));
    await hold(4);
  }
  if (l.id === 'ai3' && n === 11) {
    await glide(p.locator('#prototype-learning-tool'), 'start');
    await click(button('Show all leaves'));
    for (let i = 0; i < 6; i++) {
      await click(button('Step pruning'));
      await hold(3);
    }
    await mark('Step the actual pruning traversal and read its counters');
  }
  if (l.id === 'ai4' && n === 2) {
    await click(button('TELL Bird(Tweety)'));
    await hold(6);
  }
  if (l.id === 'ai4' && n === 5) {
    await click(button('Apply rule · Tweety'));
    await hold(7);
  }
  if (l.id === 'ai4' && n === 6) {
    await click(button('ASK HasWings(Tweety)?'));
    await hold(7);
  }
  if (l.id === 'ai4' && n === 7) {
    await click(button('ASK CanFly(Tweety)?'));
    await hold(8);
  }
  if (l.id === 'ai4' && n === 9) {
    await click(button('Backward chaining'));
    await hold(6);
  }
  if (l.id === 'ai4' && n === 10) {
    await click(button('TELL Bird(Rio)'));
    await hold(5);
    await click(button('Apply rule · Rio'));
    await hold(7);
  }
  if (l.id === 'ehs3') {
    const map: Record<number, string> = {
      2: 'edge',
      3: 'tools',
      4: 'power',
      5: 'wheel',
      6: 'ladder',
    };
    const h = HAZARDS.find((h) => h.id === map[n]);
    if (h) {
      await click(
        p.getByRole('button', {
          name: `Inspect hazard ${HAZARDS.indexOf(h) + 1}: ${h.label}`,
          exact: true,
        }),
      );
      await hold(7);
    }
    if (n === 9) {
      await click(button('Before'));
      await hold(5);
      await click(button('Show safer setup'));
      await hold(9);
      await mark('Compare the actual before/safer changes');
    }
    if (n === 11) {
      const details = p.locator('details').filter({ hasText: 'Second scene' });
      if ((await details.getAttribute('open')) === null)
        await click(details.locator('summary'));
      await click(button('Identify unsupported sidewall'));
      await hold(7);
    }
  }
  if (l.id === 'ehs5') {
    const ids: Record<number, string> = {
      2: 'sewage',
      4: 'runoff',
      6: 'waste',
      7: 'oil',
    };
    const a = POLLUTION.find((x) => x.id === ids[n]);
    if (a) {
      await click(
        p.getByRole('button', { name: `Inspect ${a.label}`, exact: true }),
      );
      await hold(5);
      const control = p
        .getByRole('button')
        .filter({ hasText: a.control })
        .first();
      if ((await control.getAttribute('aria-pressed')) !== 'true')
        await click(control);
      await hold(7);
    }
  }
}
async function worldVisual(l: Lesson, n: number) {
  if (l.id === 'ai3' && n === 11) {
    await tools();
    await hold(7);
    await mark('Read World pruning count: five evaluated, one skipped');
    await closeTools();
  }
  if (l.id === 'ai4' && [2, 5, 6, 7, 10].includes(n)) {
    await tools();
    const panel = p.getByRole('complementary', {
      name: 'In-world activity controls',
    });
    const action = (name: string) =>
      panel.getByRole('button', { name, exact: true });
    if (n === 2) await click(action('TELL Bird(Tweety)'));
    if (n === 5) await click(action('Apply rule · Tweety'));
    if (n === 6) await click(action('ASK HasWings(Tweety)?'));
    if (n === 7) await click(action('ASK CanFly(Tweety)?'));
    if (n === 10) {
      await click(action('TELL Bird(Rio)'));
      await hold(5);
      await click(action('Apply rule · Rio'));
    }
    await hold(7);
    await closeTools();
  }
  if (l.id === 'ehs3') {
    const map: Record<number, string> = {
      2: 'edge',
      3: 'tools',
      4: 'power',
      5: 'wheel',
      6: 'ladder',
    };
    const h = HAZARDS.find((h) => h.id === map[n]);
    if (h) {
      await tools();
      await click(button(`${HAZARDS.indexOf(h) + 1}. ${h.label}`));
      await hold(7);
      await closeTools();
    }
    if (n === 9) {
      await tools();
      const safer = button('Show safer setup');
      if (await safer.isVisible()) {
        await click(safer);
        await hold(9);
      }
      await tools();
      await click(button('Rotate model right'));
      await hold(6);
      await click(button('Rotate model left'));
      await closeTools();
      await mark('Inspect the safer model and rotate it slowly');
    }
    if (n === 11) {
      await tools();
      await click(button('Inspect unsupported sidewall'));
      await hold(7);
      await closeTools();
    }
  }
  if (l.id === 'ehs5' && [2, 4, 6, 7].includes(n)) {
    const a = POLLUTION.find(
      (x) =>
        x.id ===
        (
          { 2: 'sewage', 4: 'runoff', 6: 'waste', 7: 'oil' } as Record<
            number,
            string
          >
        )[n],
    )!;
    await tools();
    const control = p
      .getByRole('complementary', { name: 'In-world activity controls' })
      .getByRole('button')
      .filter({ hasText: a.control });
    if ((await control.getAttribute('aria-pressed')) !== 'true')
      await click(control);
    await hold(7);
    await closeTools();
  }
}
async function answer(q: Question, l: Lesson, isWorld: boolean, wrong = false) {
  const region = isWorld
    ? p.getByRole('group', { name: 'World practice choices' })
    : p.getByRole('group', {
        name: q.type === 'multi' ? 'Select all that apply' : 'Practice choices',
      });
  if (q.type === 'text') {
    await type(
      p.getByRole('textbox', {
        name: isWorld ? 'World explanation' : 'Your explanation',
        exact: true,
      }),
      words[l.id]!,
    );
  } else if (q.type === 'number') {
    await type(
      p.getByRole('textbox', {
        name: isWorld ? 'World practice value' : 'Practice value',
        exact: true,
      }),
      q.correct[0]!,
    );
  } else {
    const answers = wrong
      ? [q.options.find((v) => !q.correct.includes(v))!]
      : q.correct;
    for (const a of answers) {
      const index = q.options.indexOf(a);
      const name = isWorld
        ? a
        : `${q.type === 'multi' ? '□' : String.fromCharCode(65 + index)} ${a}`;
      const target = region.getByRole('button', { name, exact: true });
      if ((await target.getAttribute('aria-pressed')) !== 'true')
        await click(target);
    }
  }
  await click(
    button(q.type === 'text' ? 'Record explanation' : 'Check practice answer'),
  );
  await hold(wrong ? 8 : 7);
}
async function questions(l: Lesson, isWorld: boolean) {
  const completed = new Set<string>();
  let trial = 0;
  while (completed.size < 12) {
    if (++trial > 18) throw Error('Repeated checkpoint loop');
    if (isWorld) await worldTeaching();
    let q: Question;
    if (isWorld) {
      const id = await world().getAttribute('data-question-id');
      q = l.questions.find((q) => q.id === id)!;
    } else q = l.questions[completed.size]!;
    if (!q || completed.has(q.id))
      throw Error('Missing or repeated checkpoint');
    const n = Number(q.id.slice(-2));
    if (!isWorld) await classicStep(l, n);
    await mark(`${q.id}: ${q.task}`, false);
    await read(p.getByRole('heading', { name: q.task, exact: true }), 5, 9);
    const wrong =
      (l.id === 'ai3' && n === (isWorld ? 7 : 3)) ||
      (l.id === 'ai4' && n === 7) ||
      (l.id === 'ehs3' && n === 6) ||
      (l.id === 'ehs5' && n === 8);
    if (wrong) {
      await answer(q, l, isWorld, true);
      await mark('Read the correction to an intentional wrong answer');
      await click(button(isWorld ? 'A hint' : 'Give me a hint'));
      await hold(7);
    }
    if (isWorld) await worldVisual(l, n);
    else await classicVisual(l, n);
    await glide(p.getByRole('heading', { name: q.task, exact: true }), 'start');
    await hold(1);
    await answer(q, l, isWorld);
    const cont = button(isWorld ? 'Continue lesson' : 'Continue');
    await cont.waitFor();
    completed.add(q.id);
    await mark(`Answered ${q.id}; ${completed.size}/12 complete`);
    if (
      (l.id === 'ai3' && n === 4) ||
      (l.id === 'ai4' && n === 7) ||
      (l.id === 'ehs3' && n === 4) ||
      (l.id === 'ehs5' && n === 8)
    ) {
      if (isWorld) await askWorld(asks[l.id]!);
      else await askClassic(l);
    }
    if (n === 6)
      await shot(`${isWorld ? 'world' : 'classic'}-${l.id}-midlesson`);
    await click(cont);
    await hold(1.5);
  }
  const recap = p.getByRole('heading', {
    name: isWorld ? 'Ideas to take with you.' : 'Here’s what you explored.',
    exact: true,
  });
  await recap.waitFor();
  if (isWorld && (await button('Dismiss World speech').isVisible())) {
    await button('Dismiss World speech').click();
    await hold(1);
  }
  await read(recap, 10, 13);
  await shot(`${isWorld ? 'world' : 'classic'}-${l.id}-recap`);
  results.modules.push({ mode, lesson: l.id, completed: [...completed] });
  await mark('Read the 12-checkpoint practice recap');
}
try {
  const dims = await p.evaluate(() => ({
    width: innerWidth,
    height: innerHeight,
  }));
  if (dims.width !== 1920 || dims.height !== 1080)
    throw Error('Native viewport mismatch');
  results.dimensions = dims;
  await p.goto('http://127.0.0.1:3021/prototype');
  await mark('Learning shelf and both available modes', true);
  await hold(8);
  for (const l of bank) {
    await glide(button('browse files'));
    await p
      .locator('input[type=file]')
      .setInputFiles(
        fileURLToPath(
          new URL(`../assets/source-pdfs/${l.filename}`, import.meta.url),
        ),
      );
    await p
      .locator('[class*="receipt"]')
      .filter({ hasText: l.filename! })
      .filter({ hasText: 'recognized by content' })
      .first()
      .waitFor({ timeout: 30000 });
    await mark(`Upload and verify ${l.filename}`);
    await hold(6);
  }
  for (const l of bank) {
    if (dry && process.env.PETROS_TRIAL_WORLD_ONLY === '1') continue;
    if (
      dry &&
      process.env.PETROS_TRIAL_FROM &&
      bank.indexOf(l) <
        bank.findIndex((x) => x.id === process.env.PETROS_TRIAL_FROM)
    )
      continue;
    current = `${l.id.toUpperCase()} — ${l.title}`;
    await click(button(`Learn ${l.filename}`));
    await mark('Classic · ' + current, true);
    await read(
      p.getByRole('heading', { name: l.introduction, exact: true }),
      8,
      11,
    );
    await reader('source');
    await click(button('Start lesson'));
    await shot(`classic-${l.id}-start`);
    await questions(l, false);
    await click(button('Choose another lesson'));
    await hold(4);
  }
  const worldBank =
    dry && process.env.PETROS_TRIAL_WORLD_FROM
      ? bank.slice(
          bank.findIndex((l) => l.id === process.env.PETROS_TRIAL_WORLD_FROM),
        )
      : bank;
  current = 'Enter Petros World';
  mode = 'Petros World';
  await click(button(`Learn ${worldBank[0]!.filename}`));
  await mark('Switch from Classic to Petros World', true);
  await hold(5);
  await click(button('Enter Petros World'));
  await p
    .getByRole('dialog', { name: 'Entering Petros World' })
    .waitFor({ state: 'detached', timeout: 40000 });
  await hold(9);
  await mark('Read the room arrival and source-book stations');
  for (const [i, original] of worldBank.entries()) {
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
    current = `${l.id.toUpperCase()} — ${l.title}`;
    if (i === 0) await click(button('Find my module'));
    else await click(button('Choose another book'));
    const drawer = p.getByRole('region', { name: 'World library' });
    await click(
      drawer.getByRole('button').filter({ hasText: l.title }).first(),
    );
    await mark('Petros World · ' + current, true);
    await hold(7);
    await click(button('Retrieve this book'));
    await readBook();
    await shot(`world-${l.id}-start`);
    await questions(l, true);
    await hold(5);
  }
  await click(button('Exit Petros World'));
  await p
    .getByRole('dialog', { name: 'Leaving Petros World' })
    .waitFor({ state: 'detached', timeout: 20000 });
  await hold(6);
  await mark('Classic preserves the completed World lesson');
  await click(button('Choose another lesson'));
  await hold(8);
  if (results.errors.length || results.productionMutations.length)
    throw Error('Browser errors or production mutations');
  results.completedCheckpoints = results.modules.reduce(
    (s: number, m: any) => s + m.completed.length,
    0,
  );
  if (!dry && results.completedCheckpoints !== 96)
    throw Error('Incomplete module coverage');
  results.passed = true;
  await mark(
    dry
      ? 'Preflight path complete'
      : 'Complete: all four modules in both modes',
    true,
  );
} catch (e) {
  results.failure = String(e);
  await shot('failure');
  throw e;
} finally {
  results.durationSeconds = sec();
  await ctx.close();
  if (!dry) {
    const video = await p.video()!.path();
    const final = `${dir}/petros-complete-classic-and-world.webm`;
    await rename(video, final);
    results.video = fileURLToPath(new URL(`../${final}`, import.meta.url));
  }
  await writeFile(`${dir}/recording.json`, JSON.stringify(results, null, 2));
  await b.close();
}
