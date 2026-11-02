import { chromium } from 'playwright-core';
import { browserExecutable } from './browser-executable';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const browser = await chromium.launch({
  executablePath: browserExecutable(),
  headless: true,
});
const results: any[] = [];
const cases = [
  [
    'neural',
    'Neural learning',
    'Set the input x1 to -1. Why does the weight now move the prediction in a different direction?',
    'x1',
    -1,
  ],
  [
    'rocket',
    'Rocket landing',
    'Double the total mass and compare the landing with the same thrust.',
    'dryMass',
    2450,
  ],
  [
    'attention',
    'Attention',
    'Replace cat with dog. Show why its attention shares change.',
    'tokens',
    'the dog chased the ball',
  ],
  [
    'traffic',
    'Traffic waves',
    'Set the following time to 2.4 seconds, brake a car, and show the computed change.',
    'headway',
    2.4,
  ],
  [
    'relativity',
    'Time dilation',
    'Try 0.95c for 10 Earth seconds. Why can both observers call the other clock slow?',
    'beta',
    0.95,
  ],
];
try {
  for (const mode of process.env.PETROS_MODE
    ? [process.env.PETROS_MODE]
    : ['classic', 'world']) {
    const context = await browser.newContext({
        viewport: { width: 1440, height: 900 },
      }),
      page = await context.newPage();
    page.setDefaultTimeout(30000);
    page.on('pageerror', (e) => console.log('PAGE ERROR', e.message));
    page.on('request', (r) => {
      if (r.url().endsWith('/teacher'))
        console.log('TEACHER REQUEST', r.method());
    });
    page.on('requestfailed', (r) =>
      console.log('REQUEST FAILED', r.url(), r.failure()?.errorText),
    );
    await page.goto('http://127.0.0.1:3022/prototype');
    await page.locator('#petros-observations').waitFor({ state: 'attached' });
    if (mode === 'world')
      await page
        .getByRole('button', { name: 'Explore World ↗', exact: true })
        .click();
    for (const [id, label, question, param, expected] of cases.filter(
      (c) => !process.env.PETROS_TOPIC || c[0] === process.env.PETROS_TOPIC,
    )) {
      await page
        .getByRole('button', { name: new RegExp(String(label)) })
        .click();
      await page
        .getByRole('button', {
          name: 'Start learning with captions',
          exact: true,
        })
        .click();
      await page
        .getByRole('button', { name: 'Explore freely', exact: true })
        .click();
      await page
        .getByLabel('Ask Petros', { exact: true })
        .fill(String(question));
      const pending = page.waitForResponse(
        (r) => r.url().endsWith('/teacher'),
        { timeout: 120000 },
      );
      await page
        .getByRole('button', { name: 'Send question', exact: true })
        .click();
      let response;
      try {
        response = await pending;
      } catch (e) {
        await writeFile(
          new URL(
            '../evidence/corrective/live-ui-failure.json',
            import.meta.url,
          ),
          JSON.stringify(
            {
              topic: id,
              body: await page.locator('body').innerText(),
              state: await page.locator('#petros-observations').textContent(),
            },
            null,
            2,
          ),
        );
        throw e;
      }
      const body = await response.json();
      await writeFile(
        new URL(
          '../evidence/corrective/last-live-response.json',
          import.meta.url,
        ),
        JSON.stringify(body, null, 2),
      );
      assert.equal(response.status(), 200, JSON.stringify(body));
      assert.equal(body.state.params[String(param)], expected);
      assert.ok(body.beats.length > 0);
      assert.ok(body.beats.some((b: any) => b.do.length > 0));
      for (let i = 0; i < 10; i++) {
        await page.waitForTimeout(100);
        const next = page.getByRole('button', {
          name: 'Continue explanation →',
          exact: true,
        });
        if (!(await next.isVisible())) break;
        await next.click();
      }
      const state = JSON.parse(
        (await page.locator('#petros-observations').textContent())!,
      );
      assert.equal(state.params[String(param)], expected);
      assert.equal(state.activeQuestion, question);
      assert.equal(state.guide.phase, 'EXPLORE');
      await page.screenshot({
        path: fileURLToPath(
          new URL(
            `../evidence/corrective/${id}-${mode}-live.png`,
            import.meta.url,
          ),
        ),
        fullPage: true,
      });
      results.push({
        topic: id,
        mode,
        question,
        passed: true,
        actualProvider: true,
        result: body,
      });
      await writeFile(
        new URL('../evidence/corrective/live-ai.json', import.meta.url),
        JSON.stringify(results, null, 2),
      );
      console.log('PASS live teacher', id, mode);
    }
    await context.close();
  }
} catch (e) {
  await writeFile(
    new URL('../evidence/corrective/live-ai-failure.json', import.meta.url),
    JSON.stringify(
      { error: String(e), completed: results.map((r) => [r.topic, r.mode]) },
      null,
      2,
    ),
  );
  throw e;
} finally {
  await browser.close();
}
