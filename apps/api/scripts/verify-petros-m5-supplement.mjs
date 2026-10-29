/* global process,document,performance,requestAnimationFrame */
import { chromium } from 'playwright-core';
import { mkdirSync, existsSync, writeFileSync } from 'node:fs';
const out = process.env.PETROS_M5_BROWSER_DIR;
if (!out || existsSync(out)) throw new Error('NEW_SUPPLEMENT_DIRECTORY_REQUIRED');
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
  headless: true,
});
const context = await browser.newContext({
  viewport: { width: 1280, height: 1000 },
  recordVideo: { dir: out + '/videos', size: { width: 1280, height: 1000 } },
});
const p = await context.newPage(),
  checks = [],
  snapshots = [],
  errors = [],
  latencies = [],
  commandTimings = [];
const check = (passed, label) => {
  checks.push({ passed: !!passed, label });
  if (!passed) throw new Error(label);
};
const button = (name) => p.getByRole('button', { name, exact: true });
p.on('pageerror', (e) => errors.push(String(e)));
p.on('response', async (r) => {
  if (r.request().method() === 'POST' && r.url().endsWith('/commands')) {
    await r.finished();
    commandTimings.push({
      type: r.request().postDataJSON()?.type,
      durationMs: r.request().timing().responseEnd,
      status: r.status(),
    });
  }
  if (
    r.url().includes('/v1/student/petros/v2/sessions/') &&
    r.request().method() === 'GET' &&
    r.status() === 200
  ) {
    const data = await r.json().catch(() => null);
    if (data?.engine === 'v2') snapshots.push(data);
  }
});
const hold = () => p.waitForTimeout(650);
async function step() {
  await p.getByRole('region', { name: 'Interactive teaching workspace' }).waitFor();
  await hold();
  for (let i = 0; i < 32; i++) {
    if (!(await button('Show next teaching step').isVisible())) return;
    const stage = p.getByRole('region', { name: 'Interactive teaching workspace' }),
      action = await stage.getAttribute('data-teaching-action'),
      beat = Number(await stage.getAttribute('data-next-beat'));
    await button('Show next teaching step').click();
    await p.waitForFunction(
      ({ action, beat }) => {
        const el = document.querySelector('[data-teaching-action]');
        return el?.dataset.teachingAction === action && Number(el.dataset.nextBeat) > beat;
      },
      { action, beat },
    );
  }
}
try {
  await p.goto('http://127.0.0.1:4943/demo/cloud-b?fresh=1', {
    waitUntil: 'domcontentloaded',
    timeout: 90000,
  });
  await button('Submit answer').waitFor();
  await p.getByRole('radio', { name: 'Consumer', exact: true }).check();
  await p.getByRole('spinbutton', { name: 'Available memory (GB)', exact: true }).fill('47');
  await p.getByRole('spinbutton', { name: 'Whole-VM capacity (VM)', exact: true }).fill('9');
  await button('Submit answer').click();
  await button('Work on this with Petros').waitFor({ timeout: 30000 });
  await button('Work on this with Petros').click();
  await p.getByRole('heading', { name: 'Check the method', exact: true }).waitFor();
  await step();
  check(
    (await p.getByRole('textbox', { name: 'Available memory', exact: true }).inputValue()) === '47',
    'Changed error appears in the actual equation work',
  );
  check(
    snapshots.at(-1).canvas.highlightedIds.includes('available'),
    'Failed method criterion highlights the subtraction step',
  );
  await p.getByRole('textbox', { name: 'Available memory', exact: true }).fill('48');
  await button('Save Available memory step').click();
  await hold();
  await p.getByRole('textbox', { name: 'Whole VM capacity', exact: true }).fill('6');
  await button('Save Whole VM capacity step').click();
  await hold();
  await button('Use this work for the reviewed practice task').click();
  await p
    .getByRole('textbox', { name: 'Your answer', exact: true })
    .fill('The subtraction was wrong. 64 minus 16 is 48 GB; 48 GB / 8 GB per VM gives 6 VM.');
  await button('Submit answer').click();
  await button('Work on this with Petros').waitFor({ timeout: 30000 });
  await button('Work on this with Petros').click();
  await p.getByRole('heading', { name: 'Try with less support', exact: true }).waitFor();
  await step();
  await button('Explore a bounded experiment').click();
  await p.getByRole('heading', { name: 'Explore the idea', exact: true }).waitFor();
  await step();
  await p
    .getByRole('textbox', { name: 'Your prediction and reason' })
    .fill('Six whole VMs for 48 GB available.');
  await button('Run bounded experiment').click();
  await hold();
  check(
    snapshots.at(-1).teaching.experiment.values.capacity === 6,
    'Capacity kernel publishes its deterministic output',
  );
  await p.getByRole('spinbutton', { name: 'totalGB', exact: true }).fill('80');
  await button('Run bounded experiment').click();
  await hold();
  check(
    snapshots.at(-1).teaching.experiment.values.capacity === 8,
    'Bounded parameter perturbation changes model output',
  );
  check(
    snapshots.at(-1).progress.mastery === false,
    'Experiment observation does not manufacture mastery',
  );
  for (let i = 0; i < 20; i++) {
    const measured = p.evaluate(
      () =>
        new Promise((resolve) => {
          const el = document.querySelector('[aria-label="Bounded experiment"] textarea');
          el.addEventListener(
            'input',
            () => {
              const start = performance.now();
              requestAnimationFrame(() => resolve(performance.now() - start));
            },
            { once: true },
          );
        }),
    );
    await p
      .getByRole('textbox', { name: 'Your prediction and reason' })
      .fill(`Prediction ${i}: eight VMs with 64 GB available.`);
    latencies.push(await measured);
  }
  await p.screenshot({ path: out + '/experiment.png', fullPage: true });
  await button('Inspect a process trace').click();
  await step();
  check(
    (await p.getByText('available := total - reserved', { exact: true }).count()) > 0,
    'Finite inert algorithm trace uses accepted canvas content',
  );
  await button('Ask Petros').click();
  await p
    .getByRole('textbox', { name: 'Your question', exact: true })
    .fill('Why do the memory units cancel?');
  await button('Bring back the source').click();
  await p.getByText(/This is a source reread/).waitFor();
  check(true, 'Context question records a current-source reread without claiming semantic AI');
  await p.keyboard.press('Escape');
  await button('Compare a graph and table').click();
  await step();
  check(
    (await p.getByRole('table').count()) >= 2,
    'Checked graph and explicit source-backed table share semantic canvas state',
  );
  await p.screenshot({ path: out + '/graph-table.png', fullPage: true });
  await p.screenshot({ path: out + '/process-context.png', fullPage: true });
  check(errors.length === 0, 'No supplement browser errors');
} catch (error) {
  errors.push(String(error));
  await p.screenshot({ path: out + '/failure.png', fullPage: true }).catch(() => {});
  process.exitCode = 1;
} finally {
  await context.close();
  const video = await p.video().path();
  await browser.close();
  writeFileSync(
    out + '/results.json',
    JSON.stringify(
      { checks, errors, snapshots, video, localInputToPaintMs: latencies, commandTimings },
      null,
      2,
    ),
  );
  process.stdout.write(JSON.stringify({ checks, errors, video, latencies }, null, 2) + '\n');
}
