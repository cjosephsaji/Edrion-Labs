/* Authentic rendering inspection, no edited media and no learning-state injection. */
/* global document, innerWidth, performance, requestAnimationFrame */
import process from 'node:process';
import { chromium } from 'playwright-core';
import { mkdirSync, existsSync, writeFileSync, copyFileSync } from 'node:fs';
import { resolve } from 'node:path';
const out = resolve(process.env.PETROS_M6_SAMPLER_DIR ?? '');
if (!process.env.PETROS_M6_SAMPLER_DIR || existsSync(out))
  throw Error('NEW_EVIDENCE_DIRECTORY_REQUIRED');
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
  headless: true,
});
const checks = [],
  errors = [],
  media = [];
const check = (yes, label) => {
  checks.push({ passed: !!yes, label });
  if (!yes) throw Error(label);
};
async function record(name, width, flow, extra = {}) {
  const context = await browser.newContext({
    viewport: { width, height: 1000 },
    recordVideo: { dir: `${out}/raw`, size: { width, height: 1000 } },
    ...extra,
  });
  const p = await context.newPage();
  p.setDefaultTimeout(90000);
  p.on('pageerror', (e) => errors.push({ name, error: e.message }));
  try {
    await p.goto('http://127.0.0.1:4984/verification/petros-v2/companion', {
      waitUntil: 'networkidle',
      timeout: 180000,
    });
    await p.locator('[data-layered-character]').first().waitFor();
    await flow(p);
    check(
      await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      `${name}: no horizontal overflow`,
    );
    await p.screenshot({ path: `${out}/${name}.png`, fullPage: true });
  } catch (e) {
    errors.push({ name, error: String(e) });
    await p.screenshot({ path: `${out}/${name}-failure.png`, fullPage: true }).catch(() => {});
  } finally {
    const v = p.video();
    await context.close();
    copyFileSync(await v.path(), `${out}/${name}.webm`);
    media.push(name);
    writeFileSync(`${out}/results.json`, JSON.stringify({ checks, errors, media }, null, 2));
  }
}
await record('A-character-showcase', 1440, async (p) => {
  for (const expression of ['neutral', 'attentive', 'thoughtful', 'pleased', 'uncertain']) {
    await p.getByLabel('Expression', { exact: true }).selectOption(expression);
    await p.waitForTimeout(800);
    check(
      (await p.locator('[data-layered-character]').first().getAttribute('data-expression')) ===
        expression,
      `Actual ${expression} expression`,
    );
    await p.screenshot({ path: `${out}/expression-${expression}.png`, fullPage: true });
  }
  for (const direction of ['left', 'right', 'up', 'down', 'rest']) {
    await p.getByLabel('Gaze', { exact: true }).selectOption(direction);
    await p.waitForTimeout(500);
  }
  await p.getByLabel('Expression',{exact:true}).selectOption('neutral');
  for (const gesture of ['open-hand', 'point', 'nod', 'acknowledge', 'lean']) {
    await p.getByRole('button', { name: gesture, exact: true }).click();
    await p.waitForTimeout(400);
    await p.screenshot({ path: `${out}/gesture-${gesture}.png`, fullPage: true });
    await p.getByRole('button', { name: 'Interrupt / settle', exact: true }).click();
  }
  for (const size of ['360', '280', '180', '102', '78', '48']) {
    await p.getByLabel('Size', { exact: true }).selectOption(size);
    await p.waitForTimeout(250);
  }
  await p.getByLabel('Size',{exact:true}).selectOption('360');
  for(const direction of ['left','right','up','down']){
    await p.getByLabel('Gaze',{exact:true}).selectOption(direction);
    await p.getByRole('button',{name:'point',exact:true}).click();
    await p.waitForTimeout(350);
    await p.screenshot({path:`${out}/point-${direction}.png`,fullPage:true});
    await p.getByRole('button',{name:'Interrupt / settle',exact:true}).click();
  }
  await p.getByLabel('Size', { exact: true }).selectOption('280');
  await p.getByLabel('Expression',{exact:true}).selectOption('neutral');
  await p.getByRole('button',{name:'Play existing narration',exact:true}).click();
  await p.locator('[data-layered-character]:not([data-mouth="closed"])').first().waitFor({timeout:15000});
  check(await p.locator('[data-layered-character]:not([data-mouth="closed"])').count()>0,'Actual decoded local narration opens amplitude mouth');
  await p.screenshot({path:`${out}/actual-amplitude-mouth.png`,fullPage:true});
  await p.getByRole('button',{name:'Stop playback',exact:true}).click();
  check(await p.locator('[data-layered-character]').first().getAttribute('data-mouth')==='closed','Stopping actual audio closes the mouth immediately');

  await p.waitForTimeout(12500); // Real 12-second blink cycle, not time acceleration.
  const timing = await p
    .locator('[data-layered-character]')
    .first()
    .evaluate(async (el) => {
      const frames = [];
      let previous = performance.now();
      for (let i = 0; i < 90; i++)
        await new Promise((r) =>
          requestAnimationFrame(() => {
            const n = performance.now();
            frames.push(n - previous);
            previous = n;
            r();
          }),
        );
      return {
        frames,
        svgElements: el.querySelectorAll('*').length,
        images: document.images.length,
      };
    });
  writeFileSync(`${out}/render-timing.json`, JSON.stringify(timing, null, 2));
  await p.getByLabel('Missing layered asset', { exact: true }).check();
  check(
    (await p.getByAltText('Petros, settled', { exact: true }).count()) === 1,
    'Missing layered art renders the neutral export',
  );
});
await record('G-mobile-rig-360', 360, async (p) => {
  await p.getByLabel('Size', { exact: true }).selectOption('180');
  for (const expression of ['attentive', 'thoughtful', 'uncertain']) {
    await p.getByLabel('Expression', { exact: true }).selectOption(expression);
    await p.waitForTimeout(550);
  }
  await p.getByRole('button', { name: 'open-hand', exact: true }).click();
  await p.waitForTimeout(500);
});
await record('H-reduced-motion-and-minimized', 1440, async (p) => {
  await p.getByLabel('Reduce motion', { exact: true }).check();
  await p.getByRole('button', { name: 'nod', exact: true }).click();
  check(
    (await p.locator('[data-layered-character]').first().getAttribute('data-blink')) === 'false',
    'Reduced motion stops eyelid cycles',
  );
  await p.getByLabel('Minimize', { exact: true }).check();
  check(
    (await p
      .getByText('This is an engineering animation sample. It does not evaluate student work.', {
        exact: true,
      })
      .count()) >= 2,
    'Minimized view retains the same public text',
  );
  const dismiss = p.getByRole('button', { name: 'Dismiss caption', exact: true }).last();
  await dismiss.focus();
  await dismiss.click();
  await p.getByRole('button', { name: 'Transcript', exact: true }).last().click();
  check(
    (await p.getByLabel('Current companion transcript').count()) === 1,
    'Dismissed caption remains available in transcript',
  );
});
await browser.close();
process.stdout.write(
  `${checks.filter((c) => c.passed).length}/${checks.length} checks, ${errors.length} errors\n`,
);
if (errors.length) process.exitCode = 1;
