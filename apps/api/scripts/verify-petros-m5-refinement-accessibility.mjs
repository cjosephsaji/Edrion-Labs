/* Supplemental real-browser checks; synthetic long reader is clearly labelled. */
import { chromium } from 'playwright-core';
import { mkdirSync, existsSync, writeFileSync } from 'node:fs';
const out = process.env.PETROS_M5_A11Y_DIR;
if (!out || existsSync(out)) throw Error('NEW_DIRECTORY_REQUIRED'); mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser', headless: true });
const checks = [], errors = [];
const check = (passed, label) => { checks.push({ passed: !!passed, label }); if (!passed) throw Error(label); };
for (const width of [1440, 1280, 768, 390, 360]) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, ...(width <= 390 ? { isMobile: true, hasTouch: true } : {}), reducedMotion: 'reduce' });
  const p = await context.newPage(); p.on('pageerror', e => errors.push(e.message));
  try {
    await p.goto('http://127.0.0.1:4944/verification/petros-v2/feedback-gallery?reader=long');
    const opener = p.getByRole('button', { name: 'Long educational text alternative', exact: true });
    await opener.focus(); await p.keyboard.press('Enter'); const d = p.getByRole('dialog'); await d.waitFor();
    check((await d.innerText()).includes('Paragraph 80.'), `${width}px reader retains all 80 long-content paragraphs`);
    check((await d.innerText()).includes('Source: Synthetic CC0 reader fixture'), `${width}px reader retains source attribution`);
    for (let i = 0; i < 4; i++) await p.keyboard.press(i % 2 ? 'Shift+Tab' : 'Tab');
    check(await d.evaluate(el => el.contains(document.activeElement)), `${width}px native modal confines keyboard focus`);
    const selected = await d.evaluate(el => { const last = [...el.querySelectorAll('p')].at(-1); const range = document.createRange(); range.selectNodeContents(last); const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range); return selection.toString(); });
    check(selected === 'End of the complete educational reader.', `${width}px reader content is selectable through its end`);
    await p.evaluate(() => document.documentElement.style.fontSize = '200%');
    check(await d.evaluate(el => el.scrollWidth <= el.clientWidth + 1), `${width}px long reader reflows at 200% root text size`);
    await p.screenshot({ path: `${out}/long-reader-${width}.png`, fullPage: true });
    await p.keyboard.press('Escape'); await p.waitForTimeout(150);
    check(await opener.evaluate(el => el === document.activeElement), `${width}px long reader restores opening focus`);
    check(await p.evaluate(() => document.body.style.overflow !== 'hidden'), `${width}px closing reader restores page scrolling`);
    await p.getByRole('checkbox', { name: 'Use text as the main presentation', exact: true }).focus(); await p.keyboard.press('Space');
    check(await p.getByRole('region', { name: 'Long educational text alternative', exact: true }).count() === 1, `${width}px primary reader exposes all content in page flow`);
    check(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${width}px primary long reader has no horizontal overflow`);
    await p.screenshot({ path: `${out}/primary-reader-${width}.png`, fullPage: true });
  } catch (e) { errors.push({ width, error: String(e) }); }
  await context.close();
}
await browser.close(); writeFileSync(`${out}/results.json`, JSON.stringify({ checks, errors, qualification: 'Automated keyboard, emulated touch, text enlargement and focus checks. No human screen reader or physical device qualification.' }, null, 2));
process.stdout.write(JSON.stringify({ checks: checks.length, errors }, null, 2)); if (errors.length) process.exitCode = 1;
