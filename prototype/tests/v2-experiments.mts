import { chromium, type Page } from 'playwright-core';
import { fileURLToPath } from 'node:url';
import { writeFile } from 'node:fs/promises';
import { lessons } from '../lessons';
process.chdir(fileURLToPath(new URL('../', import.meta.url)));
const b = await chromium.launch({
  executablePath:
    '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
  headless: true,
  args: ['--use-angle=metal'],
});
const results: any = { lessons: [], errors: [] };
async function start(p: Page, filename: string) {
  await p.goto('http://127.0.0.1:3021/prototype');
  await p
    .getByRole('button', { name: `Learn ${filename}`, exact: true })
    .click();
  await p
    .getByRole('button', { name: 'Enter Petros World', exact: true })
    .click();
  await p
    .getByRole('dialog', { name: 'Entering Petros World' })
    .waitFor({ state: 'detached', timeout: 30000 });
  await p.getByRole('button', { name: 'Find my module', exact: true }).click();
  await p.getByRole('button', { name: /Retrieve this book/ }).click();
}
async function followup(p: Page, text: string) {
  await p
    .getByRole('button', { name: 'Ask Petros anything', exact: true })
    .click();
  await p
    .getByRole('textbox', { name: 'Ask Petros anything', exact: true })
    .fill(text);
  await p.getByRole('button', { name: 'Ask Petros', exact: true }).click();
  await p
    .locator('[aria-label="World conversation"]')
    .getByText(/Prepared (source-linked|general-knowledge) explanation/)
    .waitFor();
  await p
    .getByRole('button', {
      name: 'Continue lesson · same checkpoint',
      exact: true,
    })
    .click();
}
try {
  const c = await b.newContext({ viewport: { width: 1440, height: 900 } }),
    p = await c.newPage();
  p.on('pageerror', (e) => results.errors.push(e.message));
  await start(p, 'EHS_Module_3.pdf');
  await p.waitForFunction(
    () =>
      document
        .querySelector('[data-world-phase]')
        ?.getAttribute('data-world-phase') === 'practice',
    { timeout: 35000 },
  );
  await p.getByRole('button', { name: 'Model tools', exact: true }).click();
  await p
    .getByRole('button', { name: '5. Overhead power line', exact: true })
    .click();
  await p
    .getByRole('heading', {
      name: 'Click the overhead electrical hazard.',
      exact: true,
    })
    .waitFor();
  await p.getByRole('button', { name: 'Model tools', exact: true }).click();
  await p
    .getByRole('button', { name: '1. Missing top guardrail', exact: true })
    .click();
  await p
    .getByRole('heading', {
      name: 'Click the missing guardrail location.',
      exact: true,
    })
    .waitFor();
  const caption = await p.locator('[data-avatar-visible]').innerText();
  if (caption.includes('overhead')) throw Error('Stale hazard text');
  await p.screenshot({ path: 'evidence/v2/scaffold-before.png' });
  await p.getByRole('button', { name: 'Model tools', exact: true }).click();
  await p
    .getByRole('button', { name: 'Show safer setup', exact: true })
    .click();
  await p.waitForTimeout(350);
  const midway = await p.evaluate(() => (window as any).__PETROS_MODEL__);
  await p.waitForTimeout(900);
  const after = await p.evaluate(() => (window as any).__PETROS_MODEL__);
  if (!(midway.railScale > 0 && midway.railScale < 1 && after.railScale === 1))
    throw Error('No actual guardrail animation');
  await p.screenshot({ path: 'evidence/v2/scaffold-after.png' });
  await followup(p, 'Explain this hazard more simply');
  results.scaffold = {
    hazardQuestionSynchronized: true,
    stalePowerCueCleared: true,
    actualGuardrail: { midway, after },
    followup: true,
  };
  for (const l of lessons.filter((l) =>
    ['ai4', 'ehs5', 'open-ai', 'time'].includes(l.id),
  )) {
    const nav = p.getByRole('button', {
      name: 'Choose a station',
      exact: true,
    });
    if (await nav.isVisible()) await nav.click();
    await p
      .getByRole('navigation', { name: 'World stations' })
      .getByRole('button', { name: /Library/ })
      .click();
    await p
      .locator('[aria-label="World library"]')
      .getByRole('button')
      .filter({ hasText: l.title })
      .first()
      .click();
    if (!l.general)
      await p.getByRole('button', { name: /Retrieve this book/ }).click();
    await p.waitForFunction(
      () =>
        document
          .querySelector('[data-world-phase]')
          ?.getAttribute('data-world-phase') === 'teaching',
    );
    const reveals = new Set<number>();
    const boundsErrors: string[] = [];
    for (let i = 0; i < 130; i++) {
      const data = await p.evaluate(() => ({
        phase: document
          .querySelector('[data-world-phase]')
          ?.getAttribute('data-world-phase'),
        reveal: (window as any).__PETROS_BOARD__?.reveal,
        errors: (window as any).__PETROS_BOARD__?.layout.errors ?? [],
      }));
      reveals.add(data.reveal);
      boundsErrors.push(...data.errors);
      if (data.phase === 'practice') break;
      await p.waitForTimeout(200);
    }
    await p
      .getByRole('button', { name: 'Check practice answer', exact: true })
      .waitFor();
    if (boundsErrors.length)
      throw Error(l.id + ' board bounds ' + boundsErrors.join(';'));
    if (reveals.size < 3) throw Error('No progressive changes ' + l.id);
    await p.screenshot({ path: `evidence/v2/demonstration-${l.id}.png` });
    await followup(
      p,
      l.id === 'ai4'
        ? 'Why is CanFly(Tweety) not supported?'
        : l.id === 'ehs5'
          ? 'Why is this pollution source unsafe?'
          : l.id === 'time'
            ? 'Explain this clock more simply'
            : 'Explain this weight more simply',
    );
    results.lessons.push({
      id: l.id,
      automaticIntro: true,
      revealStages: [...reveals],
      boardBoundsPassed: true,
      contextualFollowup: true,
    });
    console.log('Demonstration passed', l.id);
  }
  await c.close();
  const m = await b.newContext({
      viewport: { width: 390, height: 844 },
      reducedMotion: 'reduce',
    }),
    mp = await m.newPage();
  await start(mp, 'EHS_Module_3.pdf');
  await mp.waitForFunction(
    () =>
      document
        .querySelector('[data-world-phase]')
        ?.getAttribute('data-world-phase') === 'practice',
    { timeout: 35000 },
  );
  await mp.screenshot({ path: 'evidence/v2/scaffold-mobile.png' });
  if (
    await mp.evaluate(() => document.documentElement.scrollWidth > innerWidth)
  )
    throw Error('Mobile experiment overflow');
  results.mobileExperiment = true;
  await m.close();
  if (results.errors.length) throw Error(results.errors.join('\n'));
  results.passed = true;
} catch (error) {
  const page = b
    .contexts()
    .flatMap((c) => c.pages())
    .at(-1);
  if (page) {
    await page.screenshot({ path: 'evidence/v2/experiment-failure.png' });
    results.failureState = await page.evaluate(() => ({
      text: document.body.innerText,
      main: document
        .querySelector('[data-world-typeface]')
        ?.outerHTML.slice(0, 2500),
    }));
  }
  throw error;
} finally {
  await writeFile(
    'evidence/v2/experiment-results.json',
    JSON.stringify(results, null, 2),
  );
  await b.close();
}
