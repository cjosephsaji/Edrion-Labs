import { chromium } from 'playwright-core';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
process.chdir(fileURLToPath(new URL('../', import.meta.url)));
const b = await chromium.launch({
  executablePath:
    '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
  headless: true,
  args: ['--use-angle=metal'],
});
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
try {
  await p.goto('http://127.0.0.1:3021/prototype');
  await p
    .getByRole('button', { name: 'Learn EHS_Module_3.pdf', exact: true })
    .click();
  await p
    .getByRole('button', { name: 'Enter Petros World', exact: true })
    .click();
  await p
    .getByRole('dialog', { name: 'Entering Petros World' })
    .waitFor({ state: 'detached', timeout: 30000 });
  await p.getByRole('button', { name: 'Find my module', exact: true }).click();
  await p.getByRole('button', { name: /Retrieve this book/ }).click();
  await p.waitForFunction(
    () =>
      document
        .querySelector('[data-world-phase]')
        ?.getAttribute('data-world-phase') === 'practice',
    null,
    { timeout: 35000 },
  );
  await p.getByRole('button', { name: 'Model tools', exact: true }).click();
  await p.waitForTimeout(1000);
  const toolsBounds = await p.evaluate(() => ({
    canvas: document
      .querySelector('[data-world-scene]')
      .getBoundingClientRect()
      .toJSON(),
    tools: document
      .querySelector('[aria-label="In-world activity controls"]')
      .getBoundingClientRect()
      .toJSON(),
  }));
  if (toolsBounds.canvas.right > toolsBounds.tools.x)
    throw Error('Inspector overlaps renderer');
  await p.screenshot({ path: 'evidence/v2/inspector-reserved-space.png' });
  await p
    .getByRole('button', { name: '1. Missing top guardrail', exact: true })
    .click();
  await p.waitForTimeout(1000);
  await p.screenshot({ path: 'evidence/v2/scaffold-before.png' });
  await p.getByRole('button', { name: 'Model tools', exact: true }).click();
  await p
    .getByRole('button', { name: 'Show safer setup', exact: true })
    .click();
  await p.waitForTimeout(1000);
  await p.screenshot({ path: 'evidence/v2/scaffold-after.png' });
  const cloudBounds = await p.evaluate(() => {
    const c = document.querySelector('[data-avatar-visible]'),
      r = c?.getBoundingClientRect(),
      scene = document
        .querySelector('[data-world-scene]')
        .getBoundingClientRect(),
      model = window.__PETROS_EXPERIMENT_RECT__;
    return {
      docked: c.dataset.docked,
      cloud: r.toJSON(),
      model: {
        x: model.x + scene.x,
        y: model.y + scene.y,
        w: model.w,
        h: model.h,
      },
    };
  });
  const { cloud: c, model: m } = cloudBounds;
  if (
    cloudBounds.docked !== 'true' &&
    c.x < m.x + m.w &&
    c.right > m.x &&
    c.y < m.y + m.h &&
    c.bottom > m.y
  )
    throw Error('Cloud covers model');
  await writeFile(
    'evidence/v2/final-capture-results.json',
    JSON.stringify(
      {
        toolsBounds,
        cloudBounds,
        inspectorOutsideRenderer: true,
        cloudAvoidsExperiment: true,
        passed: true,
      },
      null,
      2,
    ),
  );
} finally {
  await b.close();
}
