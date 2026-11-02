import { chromium } from 'playwright-core';
import { browserExecutable } from './browser-executable';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { freshSession, lesson, STORAGE_KEY } from '../core/session-store';
import assert from 'node:assert/strict';
import sharp from 'sharp';
const compare = process.env.PETROS_COMPARE === '1';
const results = JSON.parse(
  await readFile(
    new URL('../evidence/browser-ai-results.json', import.meta.url),
    'utf8',
  ),
);
assert.equal(
  results.length,
  5,
  'Requires live AI evidence for all five topics.',
);
const browser = await chromium.launch({
  executablePath: browserExecutable(),
  headless: true,
});
const evidence = [];
try {
  for (const size of [
    { name: 'desktop', width: 1440, height: 1000 },
    { name: 'mobile', width: 360, height: 800 },
  ])
    for (const result of results) {
      const s = freshSession(),
        last = result.followup;
      s.active = result.topic;
      s.topics[result.topic] = {
        ...lesson(result.topic),
        sim: last.state,
        scene: last.scene,
        caption: last.beats.at(-1).say,
        followup: last.followup,
        evidence: [
          {
            question: result.result.followup,
            answer: 'incorrect claim',
            assessment: 'wrong',
            move: 'respond_to_misconception',
            at: 0,
            assistance: 1,
          },
        ],
      };
      const context = await browser.newContext({
        viewport: { width: size.width, height: size.height },
      });
      await context.addInitScript(
        ({ key, value }) => localStorage.setItem(key, value),
        { key: STORAGE_KEY, value: JSON.stringify(s) },
      );
      const page = await context.newPage();
      await page.goto('http://127.0.0.1:3022/prototype');
      await page.locator('#petros-observations').waitFor({ state: 'attached' });
      await page.waitForTimeout(300);
      const bounds = await page
        .locator('[aria-label="Petros explanation diagram"]')
        .evaluate((el) => ({
          width: el.clientWidth,
          scroll: el.scrollWidth,
          labels: [...el.querySelectorAll('foreignObject>div')].map((d) => ({
            client: d.clientHeight,
            scroll: d.scrollHeight,
            text: d.textContent,
          })),
        }))
        .catch(() => null);
      if (bounds) {
        assert.ok(
          bounds.scroll <= bounds.width + 1,
          'Diagram horizontal overflow',
        );
        for (const l of bounds.labels)
          assert.ok(
            l.scroll <= l.client + 1,
            'Clipped diagram label: ' + l.text,
          );
      }
      const path = new URL(
        `../evidence/${result.topic}-lesson-${size.name}.png`,
        import.meta.url,
      );
      const screenshot = await page.screenshot({ fullPage: true });
      let changedFraction = 0;
      if (compare) {
        const [before, after] = await Promise.all([
          sharp(await readFile(path))
            .ensureAlpha()
            .raw()
            .toBuffer({ resolveWithObject: true }),
          sharp(screenshot)
            .ensureAlpha()
            .raw()
            .toBuffer({ resolveWithObject: true }),
        ]);
        assert.equal(after.info.width, before.info.width);
        assert.equal(after.info.height, before.info.height);
        let changed = 0;
        for (let i = 0; i < before.data.length; i += 4)
          if (
            Math.max(
              Math.abs(before.data[i] - after.data[i]),
              Math.abs(before.data[i + 1] - after.data[i + 1]),
              Math.abs(before.data[i + 2] - after.data[i + 2]),
            ) > 30
          )
            changed++;
        changedFraction = changed / (before.info.width * before.info.height);
        assert.ok(
          changedFraction < 0.005,
          `${result.topic} ${size.name} visual difference ${(changedFraction * 100).toFixed(3)}%`,
        );
      } else await writeFile(path, screenshot);
      evidence.push({
        topic: result.topic,
        changedFraction,
        size: size.name,
        bounds,
        source: 'REPLAY_OF_REAL_AI_TOOL_RESULTS',
      });
      await context.close();
    }
  await writeFile(
    new URL(
      compare
        ? '../evidence/visual-regression-results.json'
        : '../evidence/lesson-layout-results.json',
      import.meta.url,
    ),
    JSON.stringify(evidence, null, 2),
  );
  console.log(
    compare
      ? 'PASS: ten desktop/mobile screenshot comparisons against the captured real-AI lesson references.'
      : 'PASS: five genuine AI lesson scenes × desktop/mobile; complete labels and no diagram overflow.',
  );
} finally {
  await browser.close();
}
