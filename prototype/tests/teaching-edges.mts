import { chromium } from 'playwright-core';
import { fileURLToPath } from 'node:url';
import { writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { lessons } from '../lessons';
process.chdir(fileURLToPath(new URL('../', import.meta.url)));
const b = await chromium.launch({
  executablePath:
    '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
  headless: true,
  args: ['--use-angle=metal'],
});
const c = await b.newContext({
    viewport: { width: 1440, height: 900 },
    reducedMotion: 'reduce',
  }),
  p = await c.newPage();
const out: any = { cases: [], errors: [] };
p.on('pageerror', (e) => out.errors.push(e.message));
const btn = (name: string) => p.getByRole('button', { name, exact: true });
const surface = () =>
  p.getByRole('region', { name: 'Student-paced teaching', exact: true });
async function open(id: string, index: number, world = false) {
  await p.goto('http://127.0.0.1:3021/prototype');
  const l = lessons.find((l) => l.id === id)!;
  await btn(l.filename ? `Learn ${l.filename}` : l.title).click();
  await btn('Start lesson').click();
  for (let i = 0; i < index; i++) await btn('Skip this concept').click();
  if (world) {
    await btn('Enter Petros World').click();
    await p
      .getByRole('dialog', { name: 'Entering Petros World' })
      .waitFor({ state: 'detached', timeout: 60000 });
  }
}
async function checkStage() {
  const s = await surface().getAttribute('data-teaching-state');
  if (s === 'INTRODUCING') await btn('Show me').click();
  if (s === 'RETEACHING') await btn('Try a follow-up').click();
  else await btn('Let me try').click();
  await btn('I’m ready to answer').click();
}
async function submit(value: string, number = false) {
  if (number)
    await p
      .getByRole('textbox', { name: 'Practice value', exact: true })
      .fill(value);
  else
    await surface()
      .getByRole('group', { name: 'Practice choices', exact: true })
      .getByRole('button', { name: value, exact: true })
      .click();
  await btn('Check practice answer').click();
}
try {
  const cases = [
    {
      id: 'ai4',
      index: 6,
      wrong: 'Definitely false',
      right: 'No; it is not established',
      concept: 'Unknown is not false',
    },
    {
      id: 'ehs3',
      index: 2,
      wrong: 'They improve the platform balance',
      right: 'Falling onto someone below',
      concept: 'Falling objects',
    },
    {
      id: 'ehs5',
      index: 4,
      wrong: 'Add more chemicals before rain',
      right: 'No',
      concept: 'Runoff prevention',
    },
    {
      id: 'open-ai',
      index: 3,
      wrong: '2',
      right: '2',
      number: true,
      concept: 'Deterministic prediction',
    },
    {
      id: 'time',
      index: 4,
      wrong: '10',
      right: '3',
      number: true,
      concept: 'Relativity calculation',
    },
  ];
  for (const item of cases) {
    await open(item.id, item.index, true);
    await checkStage();
    await submit(item.wrong, item.number);
    assert.equal(
      await surface().getAttribute('data-teaching-state'),
      'RETEACHING',
    );
    const checkpoint = await surface().getAttribute('data-question');
    assert.ok((await surface().innerText()).includes(item.concept));
    await p.screenshot({
      path: `evidence/teaching-correction/struggle-${item.id}.png`,
    });
    await checkStage();
    await submit(item.right);
    assert.equal(
      await surface().getAttribute('data-teaching-state'),
      'READY_TO_CONTINUE',
    );
    assert.equal(await surface().getAttribute('data-question'), checkpoint);
    assert.equal(
      await surface().getAttribute('data-last-validation'),
      'correct',
    );
    out.cases.push({
      id: item.id,
      heldCheckpoint: checkpoint,
      wrongThenCorrect: true,
    });
  }
  await open('ai3', 1);
  await checkStage();
  await submit('7');
  await btn('More practice').click();
  await checkStage();
  await submit('3');
  assert.equal(await surface().getAttribute('data-last-validation'), 'correct');
  out.morePractice = { newPair: [0, 3], correct: true };
  // Closing a conversation via Escape leaves a clear, working Resume action in both modes.
  for (const world of [false, true]) {
    await open('ai3', 3, world);
    await btn('Show me').click();
    if (world) await btn('Ask Petros anything').click();
    else
      await p
        .getByRole('button', { name: /Ask Petros A question can change/ })
        .click();
    await p
      .getByRole('textbox', {
        name: world ? 'Ask Petros anything' : 'Ask Petros a question',
        exact: true,
      })
      .fill('Why did you choose that number?');
    await btn('Ask Petros').click();
    await p
      .getByText(/min\(2, 9\) = 2/)
      .last()
      .waitFor();
    if (world) await p.keyboard.press('Escape');
    await btn('Resume').click();
    assert.equal(
      await surface().getAttribute('data-teaching-state'),
      'DEMONSTRATING',
    );
    assert.equal(await surface().getAttribute('data-question'), 'AI3-Q04');
    out.cases.push({ mode: world ? 'world' : 'classic', footerResume: true });
  }
  // Natural previous-step command restores the corresponding source context too.
  await open('ai3', 7, true);
  await btn('Show me').click();
  await btn('Ask Petros anything').click();
  await p
    .getByRole('textbox', { name: 'Ask Petros anything', exact: true })
    .fill('Go back to the previous step.');
  await btn('Ask Petros').click();
  await p
    .getByRole('region', { name: 'World conversation', exact: true })
    .getByText(/We can revisit the previous checkpoint/)
    .waitFor();
  await btn('Continue lesson · same checkpoint').click();
  assert.equal(await surface().getAttribute('data-question'), 'AI3-Q07');
  assert.ok(
    (
      await p
        .getByRole('button', { name: 'Read source', exact: true })
        .innerText()
    ).includes('4, 5'),
  );
  out.previous = { checkpoint: 'AI3-Q07', sourcePages: [4, 5], restored: true };
  // New transfer application leaves the calculation to the student.
  await open('ai3', 11, true);
  await checkStage();
  const transfer = await p.evaluate(
    () => (window as any).__PETROS_BOARD__.layout.text,
  );
  assert.ok(
    !transfer.some(
      (text: string) => text.includes('MAX =') || text.includes('MIN A ='),
    ),
  );
  out.transfer = { guaranteesConcealed: true };
  // An arbitrary topic/answer has no qualified read-only model; never substitute a fabricated judgment.
  await p.goto('http://127.0.0.1:3021/prototype');
  await p
    .getByRole('textbox', { name: 'Explore any topic', exact: true })
    .fill('Ancient music notation');
  await p
    .getByRole('textbox', { name: 'Explore any topic', exact: true })
    .press('Enter');
  await p.getByText(/No qualified read-only model connector/).waitFor();
  out.arbitraryTopic = { honestUnavailable: true };
  await open('ehs3', 5);
  const excavation = p
    .locator('details')
    .filter({
      has: p.locator('summary', { hasText: 'Second scene · excavation' }),
    });
  assert.equal(
    await excavation.evaluate((el) => (el as HTMLDetailsElement).open),
    false,
  );
  for (let i = 0; i < 5; i++) await btn('Skip this concept').click();
  assert.equal(
    await excavation.evaluate((el) => (el as HTMLDetailsElement).open),
    true,
  );
  out.conceptFocus = {
    scaffoldCheckKeepsExcavationClosed: true,
    excavationOpensAtItsCheckpoint: true,
  };
  assert.deepEqual(out.errors, []);
  out.passed = true;
} catch (error) {
  out.failure = String(error);
  await p.screenshot({
    path: 'evidence/teaching-correction/edges-failure.png',
  });
  process.exitCode = 1;
  console.error(error);
} finally {
  await writeFile(
    'evidence/teaching-correction/edges-results.json',
    JSON.stringify(out, null, 2),
  );
  await b.close();
}
