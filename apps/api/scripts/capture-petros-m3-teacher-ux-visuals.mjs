import { chromium } from 'playwright-core';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
const out = resolve(import.meta.dirname, '../../../docs/verification/petros-v2/m3-teacher-ux-evidence/visual'); mkdirSync(out, { recursive: true });
const info = JSON.parse(readFileSync(resolve(out, '../demo-info.json'), 'utf8'));
const browser = await chromium.launch({ executablePath: '/Users/macbook/Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing', headless: true });
const page = await browser.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
await page.route('**/*', route => ['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort());
await page.goto(info.cloud + '#petros-lessons-preview', { waitUntil: 'networkidle', timeout: 120000 });
await page.getByLabel('Read-only activity preview').getByRole('table').waitFor();
const contrast = await page.evaluate(() => {
  const selectors = ['[aria-label="Petros Learn areas"] button[aria-current]', '[aria-label="Lesson preparation steps"] button[aria-current]', '[aria-label="Read-only activity preview"] h4', '[aria-label="Read-only activity preview"] td', '[aria-label="Read-only activity preview"] th', '[aria-label="Petros learning proposals"] footer button:last-child'];
  const rgb = color => color.match(/[\d.]+/g)?.slice(0, 3).map(Number);
  const lum = c => c.map(n => { const x = n / 255; return x <= .04045 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4; }).reduce((s, x, i) => s + x * [.2126, .7152, .0722][i], 0);
  return selectors.map(selector => {
    const element = document.querySelector(selector); if (!element) return { selector, missing: true };
    const style = getComputedStyle(element); let ancestor = element, background;
    while (ancestor) { const c = getComputedStyle(ancestor).backgroundColor; if (c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent') { background = c; break; } ancestor = ancestor.parentElement; }
    const foreground = style.color, a = lum(rgb(foreground)), b = lum(rgb(background ?? 'rgb(255,255,255)'));
    const ratio = (Math.max(a, b) + .05) / (Math.min(a, b) + .05), large = parseFloat(style.fontSize) >= 24 || (parseFloat(style.fontSize) >= 18.66 && Number(style.fontWeight) >= 700);
    return { selector, foreground, background, ratio, passed: ratio >= (large ? 3 : 4.5), fontSize: style.fontSize };
  });
});
async function show(element) { await element.evaluate(e => { e.scrollIntoView({ block: 'start' }); let parent = e.parentElement; while(parent) { if (parent.scrollHeight > parent.clientHeight && ['auto','scroll'].includes(getComputedStyle(parent).overflowY)) { parent.scrollTop -= 90 - e.getBoundingClientRect().top; break; } parent = parent.parentElement; } }); }
for (const width of [1440, 1280, 768, 390, 360]) {
  await page.setViewportSize({ width, height: width < 700 ? 844 : 1000 });
  await (width <= 640 ? page.getByLabel('Read-only activity preview').getByLabel('Source table rows') : page.getByLabel('Read-only activity preview').getByRole('table')).waitFor(); await show(page.getByLabel('Read-only activity preview'));
  if (!(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))) throw new Error(`Activity overflow at ${width}px`);
  await page.screenshot({ path: resolve(out, `cloud-activity-content-${width}px.png`) });
  await page.getByRole('button', { name: 'Review lesson', exact: true }).click();
  await show(page.getByRole('article', { name: 'Objective 1', exact: true }));
  await page.screenshot({ path: resolve(out, `cloud-objective-content-${width}px.png`) });
  await page.getByRole('button', { name: 'Preview activities', exact: true }).click();
}
writeFileSync(resolve(out, 'accessibility.json'), JSON.stringify({ contrast, errors, conclusion: 'Measured key visible text and action colours; keyboard, labelling, focus and responsive checks are in the browser results. Human assistive technology testing remains pending.' }, null, 2));
await browser.close(); console.log(JSON.stringify({ contrastChecks: contrast.length, failed: contrast.filter(c => !c.passed), errors }));
