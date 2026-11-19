import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { browserExecutable } from './browser-executable';
import { PROJECT_STORAGE } from '../core/maker-project';

const out = new URL('../evidence/maker-workshop/', import.meta.url);
await mkdir(out, { recursive: true });
const browser = await chromium.launch({
    executablePath: browserExecutable(),
    headless: true,
  }),
  errors: string[] = [];
try {
  const context = await browser.newContext({
      viewport: { width: 1440, height: 1100 },
      reducedMotion: 'reduce',
    }),
    page = await context.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  const ready = () =>
    page.locator('[data-testid="maker-studio"][data-ready="true"]').waitFor();
  const pick = (id: string) =>
    page
      .getByRole('group', { name: 'Assembly parts' })
      .getByRole('button')
      .filter({
        has: page.locator('strong').filter({ hasText: new RegExp(`^${id}$`) }),
      })
      .click();
  const capture = (name: string) =>
    page.screenshot({
      path: fileURLToPath(new URL(name + '.png', out)),
      fullPage: true,
    });
  await page.goto('http://127.0.0.1:3022/prototype?view=3d', {
    waitUntil: 'domcontentloaded',
    timeout: 120000,
  });
  await ready();
  await page.locator('canvas').waitFor();
  await page.waitForTimeout(1200);
  await capture('workshop-desktop');
  await page.getByRole('button', { name: 'front', exact: true }).click();
  await page.getByRole('button', { name: 'Move', exact: true }).click();
  await page.waitForTimeout(250);
  await page.mouse.move(724, 333);
  await page.mouse.down();
  await page.mouse.move(779, 333, { steps: 14 });
  await page.mouse.up();
  assert(
    Number(
      await page
        .getByRole('spinbutton', { name: 'rotor position x' })
        .inputValue(),
    ) > 20,
    'Dragging the X handle must edit the project',
  );
  await page.getByRole('button', { name: 'Undo', exact: false }).click();
  assert.equal(
    await page
      .getByRole('spinbutton', { name: 'rotor position x' })
      .inputValue(),
    '0',
  );
  await page.getByRole('button', { name: '3D', exact: true }).click();
  await page.getByRole('button', { name: 'Select', exact: true }).click();
  await pick('base');
  await page.getByRole('spinbutton', { name: 'base size x' }).fill('145');
  await page.getByRole('spinbutton', { name: 'base size x' }).press('Enter');
  assert.equal(
    await page.getByRole('spinbutton', { name: 'base size x' }).inputValue(),
    '145',
  );
  await page.getByRole('button', { name: 'Undo', exact: false }).click();
  assert.equal(
    await page.getByRole('spinbutton', { name: 'base size x' }).inputValue(),
    '110',
  );
  await page.getByRole('button', { name: 'Redo', exact: false }).click();
  assert.equal(
    await page.getByRole('spinbutton', { name: 'base size x' }).inputValue(),
    '145',
  );
  await page
    .getByRole('textbox', { name: 'Describe a change', exact: true })
    .fill('Make base wider by 20 mm');
  await page.getByRole('button', { name: 'Preview change' }).click();
  await page.getByText('PROPOSAL PREVIEW', { exact: true }).waitFor();
  assert.equal(
    await page.getByRole('spinbutton', { name: 'base size x' }).inputValue(),
    '165',
  );
  assert(
    await page.getByRole('spinbutton', { name: 'base size x' }).isDisabled(),
  );
  await page.getByRole('button', { name: 'Discard', exact: true }).click();
  assert.equal(
    await page.getByRole('spinbutton', { name: 'base size x' }).inputValue(),
    '145',
  );
  await page.getByRole('button', { name: 'Preview change' }).click();
  await page
    .getByRole('button', { name: 'Apply changes', exact: true })
    .click();
  assert.equal(
    await page.getByRole('spinbutton', { name: 'base size x' }).inputValue(),
    '165',
  );
  await page
    .getByRole('textbox', { name: 'Describe a change', exact: true })
    .fill('Add a cylinder named axle 12 x 80 x 12 mm');
  await page.getByRole('button', { name: 'Preview change' }).click();
  await page
    .getByRole('button', { name: 'Apply changes', exact: true })
    .click();
  await pick('axle');
  assert.equal(
    await page.getByRole('spinbutton', { name: 'axle size y' }).inputValue(),
    '80',
  );
  await page
    .getByRole('combobox', { name: 'Attach selected part' })
    .selectOption('rotor');
  assert.equal(
    await page
      .getByRole('combobox', { name: 'Attach selected part' })
      .inputValue(),
    'rotor',
  );
  await page.getByRole('button', { name: 'Duplicate', exact: true }).click();
  await pick('axle_copy');
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  assert.equal(
    await page
      .getByRole('group', { name: 'Assembly parts' })
      .getByText('axle_copy', { exact: true })
      .count(),
    0,
  );
  await page.getByRole('button', { name: 'Undo', exact: false }).click();
  await pick('axle_copy');
  await pick('rotor');
  const before = await page.locator('canvas').screenshot();
  await page
    .getByRole('button', { name: 'Run mechanism', exact: true })
    .click();
  await page.waitForTimeout(700);
  await page
    .getByRole('button', { name: 'Pause mechanism', exact: true })
    .click();
  const after = await page.locator('canvas').screenshot();
  assert(!before.equals(after), 'Driven mechanism must visibly move');
  assert(
    Number(
      await page.getByRole('slider', { name: 'Mechanism time' }).inputValue(),
    ) > 0,
  );
  await page.getByRole('slider', { name: 'Mechanism time' }).fill('1.25');
  await page.getByRole('button', { name: 'Mesh', exact: true }).click();
  await page.getByRole('button', { name: 'Section', exact: true }).click();
  await capture('motion-section');
  await page.getByRole('button', { name: 'Mesh', exact: true }).click();
  await page.getByRole('button', { name: 'Section', exact: true }).click();
  await page
    .getByRole('button', { name: 'Build with code', exact: true })
    .click();
  const script = page.getByRole('textbox', {
      name: 'Build script',
      exact: true,
    }),
    original = await script.inputValue();
  await script.fill('box invalid size -1 10 10');
  await page.getByRole('button', { name: 'Preview script' }).click();
  assert.match(await page.locator('p[role=status]').innerText(), /Line|size/);
  assert.equal(
    await page.getByText('PROPOSAL PREVIEW', { exact: true }).count(),
    0,
  );
  await script.fill(
    'let reach = 55\ncylinder pivot size 20 20 20 at 0 80 0\nbox petal size 50 8 12 at 0 0 0\nradial petal 5 around pivot y $reach\nspin pivot y 15',
  );
  await page.getByRole('button', { name: 'Preview script' }).click();
  await page
    .getByRole('button', { name: 'Apply changes', exact: true })
    .click();
  assert.equal(
    await page
      .getByRole('group', { name: 'Assembly parts' })
      .getByRole('button')
      .count(),
    6,
  );
  await pick('petal');
  await capture('authored-assembly');
  const objPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export OBJ' }).click();
  const obj = await objPromise;
  assert.match(await readFile((await obj.path())!, 'utf8'), /o petal/);
  const jsonPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save project' }).click();
  const json = JSON.parse(
    await readFile((await (await jsonPromise).path())!, 'utf8'),
  );
  assert.equal(json.parts.length, 6);
  await page
    .getByRole('button', { name: 'Experiment record', exact: true })
    .click();
  await page.getByRole('button', { name: 'Pin current as reference' }).click();
  await page
    .getByRole('textbox', { name: 'Experiment prediction' })
    .fill('Doubling a petal width should double its volume.');
  await page.getByRole('spinbutton', { name: 'petal size x' }).fill('100');
  await page.getByRole('spinbutton', { name: 'petal size x' }).press('Enter');
  await page
    .getByRole('textbox', { name: 'Experiment observation' })
    .fill(
      'The selected petal mass increased with its volume; the other parts did not change.',
    );
  await page.getByRole('button', { name: 'Save editable experiment' }).click();
  await page.waitForTimeout(350);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await ready();
  await pick('petal');
  assert.equal(
    await page.getByRole('spinbutton', { name: 'petal size x' }).inputValue(),
    '100',
  );
  await page
    .getByRole('button', { name: 'Experiment record', exact: true })
    .click();
  await page.getByText(/revision 1/).click();
  await page
    .getByRole('button', { name: 'Reopen assembly', exact: true })
    .click();
  // User-authored project import uses the same validation path as direct editing.
  await page
    .locator('input[type=file]')
    .setInputFiles({
      name: 'assembly.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(json)),
    });
  await pick('petal');
  assert.equal(
    await page.getByRole('spinbutton', { name: 'petal size x' }).inputValue(),
    '50',
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(400);
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
    'Mobile overflow',
  );
  await capture('workshop-mobile');
  // Without credentials, an unsupported prompt must not be disguised as generated work.
  await page
    .getByRole('button', { name: 'Describe a change', exact: true })
    .click();
  await page
    .getByRole('textbox', { name: 'Describe a change', exact: true })
    .fill('Build an entirely new articulated desk lamp');
  await page.getByRole('button', { name: 'Preview change' }).click();
  await page.waitForTimeout(200);
  const status = await page.request.get(
    'http://127.0.0.1:3022/prototype/api/status',
  );
  if (!(await status.json()).maker)
    assert.match(
      await page.locator('p[role=status]').innerText(),
      /unavailable/,
    );
  await page
    .locator('canvas')
    .evaluate((c) =>
      c.dispatchEvent(new Event('webglcontextlost', { cancelable: true })),
    );
  await page
    .getByRole('heading', { name: 'The 3D renderer is unavailable.' })
    .waitFor();
  await page.getByRole('button', { name: 'Retry 3D' }).click();
  await page.locator('canvas').waitFor();
  const saved = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)!),
    PROJECT_STORAGE,
  );
  assert(saved.checkpoints.length === 1);
  assert(saved.reference);
  assert.deepEqual(errors, []);
  await writeFile(
    new URL('results.json', out),
    JSON.stringify(
      {
        directEdits: true,
        undoRedo: true,
        localPromptCreateAndEdit: true,
        proposalDiscardAndApply: true,
        attachment: true,
        duplicateDelete: true,
        visibleMotion: true,
        section: true,
        parametricCode: true,
        invalidCodeAtomic: true,
        objExport: true,
        jsonRoundtrip: true,
        experimentSnapshots: true,
        reload: true,
        mobile: true,
        contextRecovery: true,
        liveAI: false,
        errors,
      },
      null,
      2,
    ),
  );
  console.log(
    'Maker checks passed: editing, prompts, attachments, motion, code, undo, export/import, saved experiments, mobile and context recovery. Live AI not tested.',
  );
} finally {
  await browser.close();
}
