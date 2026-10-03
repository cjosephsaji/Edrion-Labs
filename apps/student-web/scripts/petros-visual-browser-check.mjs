// Test-only harness, production component/client/validator, synthetic localhost HTTP. No app server or credentials.
/* global document, innerWidth */
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import process from 'node:process';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const studentRequire = createRequire(join(root, 'apps/student-web/package.json'));
const viteRequire = createRequire(
  createRequire(studentRequire.resolve('vitest/package.json')).resolve('vite'),
);
const { build } = viteRequire('esbuild');
const { chromium } = createRequire(join(root, 'apps/api/package.json'))('playwright-core');
const directory = await mkdtemp(join(tmpdir(), 'petros-visual-browser-'));
await build({
  stdin: {
    contents: `export * from ${JSON.stringify(join(root, 'packages/schemas/src/petros-visual-program.ts'))}; export * from ${JSON.stringify(join(root, 'packages/schemas/src/__fixtures__/petros-visual.ts'))};`,
    resolveDir: root,
    loader: 'ts',
  },
  bundle: true,
  outfile: join(directory, 'fixture.cjs'),
  platform: 'node',
  format: 'cjs',
  logLevel: 'silent',
});
const model = createRequire(import.meta.url)(join(directory, 'fixture.cjs'));
const program = model.visualCompositionFixture();
let snapshot = model.petrosVisualSnapshotSchema.parse({
  program,
  checkpoint: model.initialPetrosVisualCheckpoint(program),
  validatorVersion: 'petros.visual-validator.v1',
  lastOperation: null,
});
const commands = [];
let failNext = false;
let disabled = false;
const input = `import React from 'react';
import {createRoot} from 'react-dom/client';
import {PetrosVisualExplorer} from ${JSON.stringify(join(root, 'apps/student-web/src/components/petros/petros-visual-explorer'))};
import {StudentApiProvider} from ${JSON.stringify(join(root, 'apps/student-web/src/lib/api-client'))};
createRoot(document.getElementById('app')).render(<StudentApiProvider baseUrl={location.origin}><h1>Synthetic visual interaction test</h1><PetrosVisualExplorer sessionId="11111111-1111-4111-8111-111111111111" blockId="${model.visualFixtureId}"/></StudentApiProvider>);`;
await build({
  stdin: { contents: input, resolveDir: join(root, 'apps/student-web'), loader: 'tsx' },
  bundle: true,
  outfile: join(directory, 'app.js'),
  platform: 'browser',
  jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"test"' },
  logLevel: 'silent',
});
const server = createServer(async (req, res) => {
  if (req.url === '/app.js' || req.url === '/app.css') {
    res.setHeader('Content-Type', req.url.endsWith('.css') ? 'text/css' : 'text/javascript');
    res.end(await readFile(join(directory, req.url.slice(1))));
    return;
  }
  if (req.url?.endsWith('/projectile')) {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({status:'disabled'}));
    return;
  }
  if (req.url?.endsWith('/visual')) {
    if (req.method === 'PUT') {
      let text = '';
      for await (const chunk of req) text += chunk;
      const command = JSON.parse(text);
      commands.push(command);
      if (snapshot.lastOperation?.id !== command.operationId)
        snapshot = {
          ...snapshot,
          checkpoint: model.applyPetrosVisualCommand(program, snapshot.checkpoint, command),
          lastOperation: { id: command.operationId, hash: 'a'.repeat(64) },
        };
      if (failNext) {
        failNext = false;
        res.writeHead(503);
        res.end();
        return;
      }
    }
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify(
        disabled
          ? { status: 'disabled', reason: 'Exploration disabled' }
          : { status: 'available', snapshot },
      ),
    );
    return;
  }
  res.setHeader('Content-Type', 'text/html');
  res.end(
    '<!doctype html><html lang="en"><meta charset="utf-8"><title>Visual interaction test</title><link rel="stylesheet" href="/app.css"><style>body{font:16px system-ui;margin:24px;max-width:800px;color:#15323c;background:#f9fbfc}</style><main id="app"></main><script src="/app.js"></script></html>',
  );
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({
  executablePath:
    process.env.PETROS_TEST_CHROME ??
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
});
try {
  const page = await browser.newPage({
    viewport: { width: 920, height: 1000 },
    reducedMotion: 'reduce',
  });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.getByText('Explore the original representation').waitFor();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  const length = page.getByRole('spinbutton', { name: 'Length (m)' });
  await length.focus();
  await page.keyboard.press('ArrowUp');
  await page.getByText('Saved view 1', { exact: true }).waitFor();
  assert.equal(await length.inputValue(), '3');
  assert.equal(await length.evaluate((e) => e === document.activeElement), true);
  assert.match(
    await page.getByRole('img', { name: 'Centimetres' }).textContent(),
    /Distance: 300 cm/,
  );
  const checkbox = page.getByRole('checkbox', { name: 'Show values' });
  await checkbox.focus();
  await page.keyboard.press('Space');
  await page.getByText('Saved view 2', { exact: true }).waitFor();
  assert.equal(await checkbox.isChecked(), false);
  assert.equal(await checkbox.evaluate((e) => e === document.activeElement), true);
  assert.doesNotMatch(
    await page.getByRole('img', { name: 'Metres', exact: true }).textContent(),
    /Distance:/,
  );
  await checkbox.focus();
  await page.keyboard.press('Space');
  await page.getByText('Saved view 3', { exact: true }).waitFor();
  failNext = true;
  await page.getByRole('button', { name: 'Next explanation' }).focus();
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Retry change' }).waitFor();
  await page.getByRole('button', { name: 'Retry change' }).focus();
  await page.keyboard.press('Enter');
  await page.getByText('Saved view 4', { exact: true }).waitFor();
  assert.deepEqual(commands[3], commands[4]);
  await page.reload();
  await page.getByText('Explore the original representation').focus();
  await page.keyboard.press('Enter');
  await page.getByText('Inspect it in centimetres.', { exact: true }).waitFor();
  assert.equal(await length.inputValue(), '3');
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: '/tmp/petros-s7-browser.png', fullPage: true });
  disabled = true;
  await page.reload();
  await page.waitForLoadState('networkidle');
  assert.equal(await page.getByText('Explore the original representation').count(), 0);
  assert.deepEqual(errors, []);
  process.stdout.write(
    'PASS: Chromium keyboard number/toggle/step controls, linked values, lost-response retry, reload, reduced motion, mobile width and default-off rendering; no browser errors.\n',
  );
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
  await rm(directory, { recursive: true, force: true });
}
