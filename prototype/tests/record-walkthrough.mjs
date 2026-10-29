import { chromium } from 'playwright-core';
import { fileURLToPath } from 'node:url';
import { rename, writeFile } from 'node:fs/promises';
process.chdir(fileURLToPath(new URL('../', import.meta.url)));
const b = await chromium.launch({
  executablePath:
    '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
  headless: true,
  args: ['--use-angle=metal', '--window-size=1440,981'],
});
const c = await b.newContext({
  viewport: null,
  recordVideo: {
    dir: 'evidence/recordings',
    size: { width: 1440, height: 900 },
  },
});
const p = await c.newPage();
const errors = [];
p.on('pageerror', (e) => errors.push(e.message));
const start = Date.now();
const beats = [];
const pause = (ms) => p.waitForTimeout(ms * 1.55);
const mark = (t) => {
  beats.push({ seconds: Math.round((Date.now() - start) / 1000), action: t });
  console.log(beats.at(-1));
};
try {
  await p.goto('http://127.0.0.1:3021/prototype');
  await p
    .getByRole('heading', { name: 'What are we learning today?' })
    .waitFor();
  mark('Open the real application');
  await pause(5000);
  await p
    .locator('input[type=file]')
    .setInputFiles('assets/source-pdfs/AI_Module_3.pdf');
  await p.getByText(/recognized by content/).scrollIntoViewIfNeeded();
  mark('Real PDF extraction and SHA recognition');
  await pause(5000);
  await p
    .getByRole('button', { name: 'Learn AI_Module_3.pdf', exact: true })
    .click();
  await pause(2000);
  await p.getByRole('button', { name: 'Start lesson', exact: true }).click();
  await pause(2000);
  mark('Start Classic minimax');
  for (const answer of [
    'Opponent responds strategically',
    'Root MAX + children MIN',
  ]) {
    await p
      .getByRole('group', { name: 'Practice choices' })
      .getByRole('button', { name: `A ${answer}`, exact: true })
      .click();
    await p
      .getByRole('button', { name: 'Check practice answer', exact: true })
      .click();
    await pause(1700);
    await p.getByRole('button', { name: 'Continue', exact: true }).click();
  }
  await p.getByRole('button', { name: /^leaf-0-0:/ }).click();
  await p
    .getByRole('button', { name: 'Check practice answer', exact: true })
    .click();
  await pause(2000);
  await p.getByRole('button', { name: 'Continue', exact: true }).click();
  await p.getByRole('button', { name: /^leaf-1-0:/ }).click();
  await p
    .getByRole('button', { name: 'Check practice answer', exact: true })
    .click();
  mark('Real student node selections and practice feedback');
  await pause(2000);
  await p
    .getByRole('button', { name: 'Ask Petros A question', exact: false })
    .click();
  await p
    .getByRole('textbox', { name: 'Ask Petros a question' })
    .fill('Why did MIN choose 2 instead of 9?');
  await p.getByRole('button', { name: 'Ask Petros', exact: true }).click();
  await p
    .getByText('Model unavailable', { exact: true })
    .scrollIntoViewIfNeeded();
  mark('Contextual ask; truthful model-unavailable result');
  await pause(3500);
  await p
    .getByRole('button', { name: 'Resume explanation · same step' })
    .click();
  await p
    .getByRole('button', { name: 'Full explanation', exact: true })
    .click();
  await pause(4000);
  await p.getByRole('button', { name: 'Close reader' }).click();
  await p.getByRole('button', { name: 'Petros World', exact: true }).click();
  await p
    .getByRole('region', { name: 'Petros World learning room' })
    .scrollIntoViewIfNeeded();
  await p.waitForTimeout(1300);
  mark('Switch to real 3D while retaining checkpoint');
  await p.screenshot({ path: 'evidence/showcase-world.png', fullPage: false });
  await pause(4500);
  await p.getByRole('button', { name: 'Room overview', exact: true }).click();
  await pause(2200);
  await p
    .getByRole('navigation', { name: 'Room stations' })
    .getByRole('button', { name: /Whiteboard/ })
    .click();
  await pause(2200);
  await p.getByRole('button', { name: 'Try it', exact: true }).click();
  await pause(1000);
  await p.getByTestId('tree').scrollIntoViewIfNeeded();
  for (let i = 0; i < 6; i++) {
    await p.getByRole('button', { name: 'Step pruning', exact: true }).click();
    await pause(650);
  }
  mark('Four evaluated leaves and two actual skips');
  await p.screenshot({
    path: 'evidence/showcase-classic-tree.png',
    fullPage: false,
  });
  await pause(2500);
  await p
    .getByRole('navigation', { name: 'Room stations' })
    .getByRole('button', { name: /Bookshelf/ })
    .click();
  await p.getByRole('button', { name: 'EHS · M3', exact: true }).click();
  await pause(1800);
  await p
    .getByRole('button', { name: 'Open this module', exact: false })
    .click();
  await p.getByRole('button', { name: 'Start lesson', exact: true }).click();
  await p.getByRole('button', { name: 'Classic', exact: true }).click();
  mark('Open the real EHS module');
  for (const n of [1, 2, 5]) {
    await p
      .getByRole('button', { name: new RegExp('^Inspect hazard ' + n + ':') })
      .click();
    await pause(1900);
  }
  await p
    .getByRole('button', { name: 'Show safer setup', exact: true })
    .click();
  await p
    .getByRole('img', { name: /Safer illustration/ })
    .scrollIntoViewIfNeeded();
  mark('Inspect hazards and change actual scaffold features');
  await pause(3500);
  await p.screenshot({
    path: 'evidence/showcase-hazards.png',
    fullPage: false,
  });
  await p.getByRole('button', { name: 'Petros Showcase', exact: true }).click();
  await p
    .getByRole('button', { name: 'Is time travel possible?', exact: false })
    .click();
  await p.getByRole('button', { name: 'Start lesson', exact: true }).click();
  await p.getByRole('button', { name: 'Try 0.8c' }).click();
  await p
    .getByText('6.00 traveler years', { exact: true })
    .scrollIntoViewIfNeeded();
  mark('Prepared topic with tested relativity formula');
  await pause(5000);
  await p.screenshot({ path: 'evidence/showcase-topic.png', fullPage: false });
  if (errors.length) throw Error(errors.join('\n'));
} finally {
  const video = p.video();
  await c.close();
  if (video) {
    const path = await video.path();
    await rename(path, 'evidence/recordings/petros-showcase-walkthrough.webm');
  }
  await writeFile(
    'evidence/recording-results.json',
    JSON.stringify(
      {
        seconds: (Date.now() - start) / 1000,
        beats,
        errors,
        unedited: true,
        audio: false,
        application: 'http://127.0.0.1:3021/prototype',
      },
      null,
      2,
    ),
  );
  await b.close();
}
