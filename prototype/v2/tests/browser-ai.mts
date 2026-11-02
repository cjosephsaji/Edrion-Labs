import { chromium } from 'playwright-core';
import { browserExecutable } from './browser-executable';
import { writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const base = process.env.PETROS_V2_URL ?? 'http://127.0.0.1:3022';
const evidence = new URL('../evidence/', import.meta.url);
await mkdir(evidence, { recursive: true });
const browser = await chromium.launch({
  executablePath: browserExecutable(),
  headless: true,
});
const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  }),
  page = await context.newPage(),
  results: unknown[] = [];
page.setDefaultTimeout(30000);
try {
  await page.goto(base + '/prototype');
  await page.locator('#petros-observations').waitFor({ state: 'attached' });
  const read = () =>
    page
      .locator('#petros-observations')
      .textContent()
      .then((s) => JSON.parse(s!));
  const ask = async (q: string) => {
    console.log('LIVE ASK', q.slice(0, 75));
    const response = page.waitForResponse(
      (r) => r.url().endsWith('/teacher') && r.request().method() === 'POST',
      { timeout: 120000 },
    );
    await page.getByLabel('Ask Petros', { exact: true }).fill(q);
    await page.getByLabel('Ask Petros', { exact: true }).press('Enter');
    const r = await response,
      data = await r.json();
    assert.equal(r.status(), 200, JSON.stringify(data));
    await page.getByText(data.beats[0].say, { exact: true }).waitFor();
    for (let i = 1; i < data.beats.length; i++) {
      await page
        .getByRole('button', { name: 'Continue explanation →' })
        .click();
      await page.getByText(data.beats[i].say, { exact: true }).waitFor();
    }
    await page.waitForFunction(
      () =>
        !document.body.textContent?.includes('Thinking through your question'),
    );
    return data;
  };
  for (const [topic, label, question, field, expected] of [
    [
      'neural',
      'Neural learning',
      'What if the input becomes negative?',
      'x1',
      -1,
    ],
    [
      'rocket',
      'Rocket landing',
      'Double the mass and show how the landing changes.',
      'dryMass',
      2450,
    ],
    [
      'attention',
      'Attention',
      'Replace the noun cat with dog; what changed?',
      'tokens',
      'the dog chased the ball',
    ],
    [
      'traffic',
      'Traffic waves',
      'Brake one car and point to the jam front.',
      'count',
      20,
    ],
    [
      'relativity',
      'Time dilation',
      'At 0.99c, how much time passes?',
      'beta',
      0.99,
    ],
  ]) {
    await page.getByRole('button', { name: new RegExp(label) }).click();
    const result = await ask(question);
    await page.waitForFunction(
      () => {
        const s = JSON.parse(
          document.querySelector('#petros-observations')!.textContent!,
        ).scene;
        return !!s.focus || s.marks.length > 0;
      },
      undefined,
      { timeout: 30000 },
    );
    const state = await read();
    assert.equal(state.params[field], expected);
    assert.ok(
      result.events.some((e: { tool: string }) => e.tool !== 'sim_observe'),
      'Question must actually change the model',
    );
    assert.ok(
      state.scene.focus || state.scene.marks.length,
      'AI must change visual focus',
    );
    await page.waitForTimeout(250);
    await page.screenshot({
      path: fileURLToPath(new URL(`${topic}-ai-desktop.png`, evidence)),
      fullPage: true,
    });
    const wrong = await ask(
      {
        neural:
          'I predict the loss must always be zero, because a network cannot make errors. Is that correct?',
        rocket:
          'Doubling total mass while holding thrust fixed doubles upward acceleration. Is that correct?',
        attention:
          'With a causal mask the first token can attend to every future token. Is that correct?',
        traffic:
          'Braking one car cannot affect any following car in the IDM model. Is that correct?',
        relativity:
          'At 0.99c the ship proper interval must equal the Earth interval, because gamma is 1. Is that correct?',
      }[topic]!,
    );
    assert.equal(wrong.assessment, 'wrong');
    assert.ok(
      wrong.beats.some((b: { do: { op: string }[] }) =>
        b.do.some((c) => c.op === 'create_scene'),
      ),
    );
    assert.notEqual(wrong.followup, result.followup);
    const why = await ask(
      'Why did that change? Use our current experiment to explain.',
    );
    assert.ok(why.beats.length > 0);
    results.push({
      topic,
      question,
      result,
      wrongAnswer: wrong,
      followup: why,
      after: await read(),
    });
    console.log('LIVE PASS', topic);
    await writeFile(
      new URL('browser-ai-results.json', evidence),
      JSON.stringify(results, null, 2),
    );
  }
  // Pending response interruption must not commit after the student changes topics.
  await page
    .getByLabel('Ask Petros', { exact: true })
    .fill('Show another example and explain it.');
  await page
    .getByRole('button', { name: 'Send question', exact: true })
    .click();
  await page.getByRole('button', { name: /Neural learning/ }).click();
  await page.getByRole('button', { name: 'Interrupt Petros' }).click();
  await page.waitForTimeout(1000);
  assert.equal((await read()).topic, 'neural');
  console.log(
    'PASS live AI: all five unexpected questions → tools → simulation changes → graphics; wrong-answer repair and why followups.',
  );
} catch (error) {
  await writeFile(
    new URL('browser-ai-failure.json', evidence),
    JSON.stringify(
      {
        error: String(error),
        state: await page.locator('#petros-observations').textContent(),
        body: await page.locator('body').innerText(),
      },
      null,
      2,
    ),
  );
  throw error;
} finally {
  await context.close();
  await browser.close();
}
