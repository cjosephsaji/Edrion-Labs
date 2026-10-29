import { chromium } from 'playwright-core';
import { fileURLToPath } from 'node:url';
import { writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
process.chdir(fileURLToPath(new URL('../', import.meta.url)));
const browser = await chromium.launch({
  executablePath:
    '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
  headless: true,
  args: ['--use-angle=metal'],
});
const p = await browser.newPage({
  viewport: { width: 1440, height: 900 },
  reducedMotion: 'reduce',
});
const result: any = {};
async function samples() {
  return p.evaluate(() => {
    const panel = document.querySelector(
      '[aria-label="Student-paced teaching"]',
    )!;
    const family = getComputedStyle(panel).fontFamily;
    const elements = Array.from(
      panel.querySelectorAll('h2,p,span,button,input,textarea,small'),
    );
    const canvas = document.createElement('canvas'),
      ctx = canvas.getContext('2d')!;
    ctx.font = `500 48px ${family}`;
    const branded = ctx.measureText('MAX and MIN · A learning companion').width;
    ctx.font = '500 48px sans-serif';
    const fallback = ctx.measureText(
      'MAX and MIN · A learning companion',
    ).width;
    return {
      family,
      elements: elements.map((e) => ({
        tag: e.tagName,
        family: getComputedStyle(e).fontFamily,
      })),
      branded,
      fallback,
      loaded: [...document.fonts]
        .filter((f) => f.family.toLowerCase().includes('outfit'))
        .map((f) => ({ family: f.family, status: f.status, weight: f.weight })),
      board: (window as any).__PETROS_BOARD__?.layout.fontFamily,
    };
  });
}
try {
  await p.goto('http://127.0.0.1:3021/prototype');
  await p
    .getByRole('button', { name: 'Learn AI_Module_3.pdf', exact: true })
    .click();
  const approved = await p
    .getByRole('heading', { name: 'Minimax & Alpha–Beta Pruning', exact: true })
    .evaluate((e) => getComputedStyle(e).fontFamily);
  await p.getByRole('button', { name: 'Start lesson', exact: true }).click();
  await p
    .getByRole('button', { name: 'I understand, continue', exact: true })
    .click();
  await p.getByRole('button', { name: 'Show me', exact: true }).click();
  await p.getByRole('button', { name: 'Let me try', exact: true }).click();
  await p
    .getByRole('button', { name: 'I’m ready to answer', exact: true })
    .click();
  await p.evaluate(() => document.fonts.ready);
  result.approved = approved;
  result.classic = await samples();
  assert.equal(result.classic.family, approved);
  await p.screenshot({
    path: 'evidence/teaching-correction/font-classic.png',
    fullPage: true,
  });
  await p
    .getByRole('button', { name: 'Enter Petros World', exact: true })
    .click();
  await p
    .getByRole('dialog', { name: 'Entering Petros World' })
    .waitFor({ state: 'detached', timeout: 60000 });
  await p.waitForFunction(() => !!(window as any).__PETROS_BOARD__);
  result.world = await samples();
  assert.equal(result.world.board, approved);
  assert.equal(result.world.family, approved);
  for (const mode of [result.classic, result.world]) {
    assert.ok(mode.family.toLowerCase().includes('outfit'));
    assert.ok(mode.loaded.some((f: any) => f.status === 'loaded'));
    assert.ok(Math.abs(mode.branded - mode.fallback) > 1);
    for (const item of mode.elements)
      assert.equal(item.family, approved, `Mismatched font on ${item.tag}`);
  }
  await p.screenshot({ path: 'evidence/teaching-correction/font-world.png' });
  result.passed = true;
} catch (error) {
  result.failure = String(error);
  console.error(error);
  process.exitCode = 1;
} finally {
  await writeFile(
    'evidence/teaching-correction/typography-results.json',
    JSON.stringify(result, null, 2),
  );
  await browser.close();
}
