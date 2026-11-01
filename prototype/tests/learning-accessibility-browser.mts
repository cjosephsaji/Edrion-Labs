import { chromium } from 'playwright-core';
import { writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { browserExecutable } from './browser-executable';
const browser = await chromium.launch({
  executablePath: browserExecutable(),
  headless: true,
});
const context = await browser.newContext({ reducedMotion: 'reduce' }),
  p = await context.newPage();
p.setDefaultNavigationTimeout(120000);
const results: any[] = [];
const cycle = () =>
  p.getByRole('region', { name: 'Student-paced teaching', exact: true });
async function key(name: RegExp) {
  await cycle().getByRole('button', { name }).focus();
  await p.keyboard.press('Enter');
}
try {
  for (const [width, height] of [
    [1366, 768],
    [1440, 900],
    [390, 844],
    [360, 800],
  ]) {
    await p.setViewportSize({ width, height });
    await p.goto(
      `${process.env.SHOWCASE_TEST_URL ?? 'http://127.0.0.1:3022'}/prototype`,
      { waitUntil: 'networkidle' },
    );
    const shelf = p.getByRole('button', {
      name: 'Learning shelf',
      exact: true,
    });
    if (await shelf.isVisible()) await shelf.click();
    await p
      .getByRole('button', { name: 'Learn AI_Module_3.pdf', exact: true })
      .click();
    await p.evaluate(() => document.fonts.ready);
    const button = await cycle()
      .getByRole('button', { name: /Show me/ })
      .boundingBox();
    assert.ok(
      button && button.y + button.height <= height,
      `Opening action below fold at ${width}x${height}: ${JSON.stringify(button)}`,
    );
    await p.screenshot({
      path: `evidence/learning-redesign/opening-${width}x${height}.png`,
      fullPage: true,
    });
    await key(/Show me/);
    await key(/Your turn/);
    await key(/Opponent responds strategically/);
    await key(/Check my answer/);
    await key(/Continue/);
    await key(/Show me/);
    await key(/Your turn/);
    await p.getByRole('button', { name: 'example-1: 8', exact: true }).focus();
    await p.keyboard.press('Space');
    await key(/Check my answer/);
    assert.match(await cycle().innerText(), /highest available value/);
    const next = cycle().getByRole('button', { name: /Try a fresh example/ });
    await next.hover();
    const colors = await next.evaluate((el) => ({
      background: getComputedStyle(el).backgroundColor,
      foreground: getComputedStyle(el).color,
      font: getComputedStyle(el).fontFamily,
    }));
    assert.equal(colors.background, 'rgb(33, 78, 58)');
    assert.equal(colors.foreground, 'rgb(255, 255, 255)');
    assert.match(colors.font, /Outfit/);
    const boardBounds = () =>
      p.locator('#prototype-learning-tool').evaluate((el) => {
        const r = el.getBoundingClientRect();
        return {
          x: r.x + scrollX,
          y: r.y + scrollY,
          width: r.width,
          height: r.height,
        };
      });
    const before = await boardBounds();
    await key(/Need help/);
    await key(/Explain it more simply/);
    assert.deepEqual(await boardBounds(), before);
    await p
      .getByRole('region', { name: 'Lesson help' })
      .getByRole('button', { name: 'Close help and resume' })
      .focus();
    await p.keyboard.press('Escape');
    await p.waitForFunction(
      () =>
        document.activeElement?.getAttribute('aria-controls') === 'lesson-help',
    );
    assert.ok(
      await p.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await p.screenshot({
      path: `evidence/learning-redesign/feedback-${width}x${height}.png`,
      fullPage: true,
    });
    results.push({
      width,
      height,
      primaryAboveFold: true,
      keyboardValueSelection: true,
      hoverContrastColors: colors,
      helpPreservesDiagramBounds: true,
      escapeRestoresFocus: true,
      reducedMotion: true,
      noHorizontalOverflow: true,
    });
  }
} finally {
  await writeFile(
    'evidence/learning-redesign/accessibility-results.json',
    JSON.stringify(results, null, 2),
  );
  await context.close();
  await browser.close();
}
console.log(JSON.stringify(results, null, 2));
