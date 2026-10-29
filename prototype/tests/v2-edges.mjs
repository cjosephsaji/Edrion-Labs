import { chromium } from 'playwright-core';
import { fileURLToPath } from 'node:url';
import { writeFile } from 'node:fs/promises';
process.chdir(fileURLToPath(new URL('../', import.meta.url)));
const browser = await chromium.launch({
  executablePath:
    '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
  headless: true,
  args: ['--use-angle=metal'],
});
const base = process.env.SHOWCASE_TEST_URL ?? 'http://127.0.0.1:3021';
const results = { errors: [], checks: [] };
const check = (condition, name) => {
  if (!condition) throw Error(name);
  results.checks.push(name);
  console.log(name);
};
const enter = async (p) => {
  await p
    .getByRole('button', { name: 'Enter Petros World', exact: true })
    .click();
  await p
    .getByRole('dialog', { name: 'Entering Petros World' })
    .waitFor({ state: 'detached', timeout: 30000 });
};
try {
  const c = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const p = await c.newPage();
  p.on('pageerror', (e) => results.errors.push(e.message));
  let release;
  const gate = new Promise((r) => (release = r));
  let held = 0;
  await p.goto(base + '/prototype');
  await p
    .getByRole('button', { name: 'Learn AI_Module_3.pdf', exact: true })
    .click();
  await p.route('**/petros/states/*.png', async (route) => {
    held++;
    await gate;
    await route.continue();
  });
  await p
    .getByRole('button', { name: 'Enter Petros World', exact: true })
    .click();
  const portal = p.getByRole('dialog', { name: 'Entering Petros World' });
  await portal.getByRole('progressbar').waitFor();
  await p.waitForTimeout(2500);
  check(
    (await portal.getAttribute('data-phase')) === 'loading',
    'Slow assets retain loading state before teleport',
  );
  check(held > 0, 'Actual original artwork requests delayed');
  check(
    (await portal.locator('svg').count()) === 0,
    'No portal travel before destination ready',
  );
  check(
    await p
      .getByRole('button', { name: 'Enter Petros World', exact: true })
      .isDisabled(),
    'Duplicate entry blocked',
  );
  await p.screenshot({ path: 'evidence/v2/slow-loading.png' });
  release();
  await p.waitForFunction(() =>
    document.querySelector('[data-phase="entering"]'),
  );
  await portal
    .getByRole('button', { name: 'Skip transition', exact: true })
    .click();
  await portal.waitFor({ state: 'detached' });
  check(
    (await p
      .getByRole('main', { name: 'Petros World immersive study' })
      .count()) === 1,
    'Skip enters fully loaded World',
  );
  await p.getByRole('button', { name: 'Find my module', exact: true }).click();
  await p.waitForTimeout(1000);
  await p.getByRole('button', { name: /Retrieve this book/ }).click();
  await p.waitForFunction(() => window.__PETROS_WORLD_METRICS__.books.ai3);
  const before = await p.evaluate(
    () => window.__PETROS_WORLD_METRICS__.books.ai3,
  );
  await p.waitForTimeout(350);
  const midway = await p.evaluate(
    () => window.__PETROS_WORLD_METRICS__.books.ai3,
  );
  await p
    .getByRole('button', { name: 'Let me show you', exact: true })
    .waitFor();
  const after = await p.evaluate(
    () => window.__PETROS_WORLD_METRICS__.books.ai3,
  );
  check(
    before.x !== midway.x && Math.abs(after.x + 3.2) < 0.01,
    'Independent 3D book passes through real midpoint to stand',
  );
  results.book = {
    before,
    midway,
    after,
    animation: await p.evaluate(
      () => window.__PETROS_WORLD_METRICS__.bookAnimation,
    ),
  };
  await p.getByRole('button', { name: 'Let me show you', exact: true }).click();
  await p.waitForTimeout(220);
  await p
    .getByRole('button', { name: 'Ask Petros anything', exact: true })
    .click();
  const input = p.getByRole('textbox', {
    name: 'Ask Petros anything',
    exact: true,
  });
  await input.fill('A Roman empire question beyond the prepared context');
  await p.waitForTimeout(150);
  const cameraBefore = await p.evaluate(
    () => window.__PETROS_WORLD_METRICS__.camera,
  );
  await input.press('End');
  await input.type(' while I type', { delay: 50 });
  await p.waitForTimeout(700);
  const cameraAfter = await p.evaluate(
    () => window.__PETROS_WORLD_METRICS__.camera,
  );
  check(
    JSON.stringify(cameraBefore) === JSON.stringify(cameraAfter),
    'Actual camera transform stays fixed during typing',
  );
  const response = p.waitForResponse((r) =>
    r.url().endsWith('/prototype/api/ask'),
  );
  await p.getByRole('button', { name: 'Ask Petros', exact: true }).click();
  check(
    (await response).status() === 503,
    'Broader question honestly reports unavailable model',
  );
  await p.getByText('Model unavailable', { exact: true }).waitFor();
  await p
    .getByRole('button', {
      name: 'Continue lesson · same checkpoint',
      exact: true,
    })
    .click();
  await p.getByRole('button', { name: 'Skip explanation', exact: true }).click();
  await p
    .getByRole('group', { name: 'World practice choices' })
    .getByRole('button', {
      name: 'A',
      exact: true,
    })
    .click();
  await p
    .locator('canvas')
    .evaluate((canvas) =>
      canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true })),
    );
  await p
    .getByRole('button', { name: 'Try the room again', exact: true })
    .click();
  await p.locator('canvas').waitFor();
  await p.waitForTimeout(1200);
  check(
    (await p
      .getByRole('group', { name: 'World practice choices' })
      .getByRole('button', {
        name: 'A',
        exact: true,
      })
      .getAttribute('aria-pressed')) === 'true',
    'Graphics retry preserves in-progress answer',
  );
  await p
    .getByRole('button', { name: 'Exit Petros World', exact: true })
    .click();
  await p
    .getByRole('dialog', { name: 'Leaving Petros World' })
    .getByRole('button', { name: 'Skip transition', exact: true })
    .click();
  await p
    .getByRole('dialog', { name: 'Leaving Petros World' })
    .waitFor({ state: 'detached' });
  check(
    await p
      .getByRole('button', { name: 'Enter Petros World', exact: true })
      .isVisible(),
    'Exit skip restores Classic',
  );
  await c.close();
  const unsupported = await browser.newContext();
  await unsupported.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (kind, ...args) {
      return /webgl/.test(kind) ? null : original.call(this, kind, ...args);
    };
  });
  const u = await unsupported.newPage();
  await u.goto(base + '/prototype');
  await u
    .getByRole('button', { name: 'Learn AI_Module_4.pdf', exact: true })
    .click();
  await u
    .getByRole('button', { name: 'Enter Petros World', exact: true })
    .click();
  await u
    .getByText(
      'This device could not initialize the 3D study. Your lesson is still here.',
      { exact: false },
    )
    .waitFor();
  check(
    await u
      .getByRole('button', { name: 'Enter Petros World', exact: true })
      .isEnabled(),
    'Unsupported graphics automatically recover Classic and topic',
  );
  await u.screenshot({ path: 'evidence/v2/unsupported-device.png' });
  await unsupported.close();
  check(results.errors.length === 0, 'No page errors in edge scenarios');
  results.passed = true;
} finally {
  await writeFile(
    'evidence/v2/edge-results.json',
    JSON.stringify(results, null, 2),
  );
  await browser.close();
}
