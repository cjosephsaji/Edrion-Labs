// Test-only browser harness: production component, client and providers; synthetic local HTTP.
// No application server, credentials, shared DB or external services are loaded.
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
const directory = await mkdtemp(join(tmpdir(), 'petros-preparation-browser-'));
const materialId = '11111111-1111-4111-8111-111111111111';
let row = {
  id: '22222222-2222-4222-8222-222222222222',
  materialId,
  materialVersion: 1,
  state: 'running',
  version: 2,
  attempts: 1,
  pagesDone: 2,
  errorCode: null,
  retryable: false,
  workerEnabled: true,
  updatedAt: '2026-09-16T00:00:00.000Z',
};
let failNextRead = false;
const commands = [];
const input = `import React from 'react';
import {createRoot} from 'react-dom/client';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {MaterialPreparationStatus} from ${JSON.stringify(join(root, 'apps/institution-web/src/components/materials/material-preparation-status'))};
import {PortalClientProvider} from ${JSON.stringify(join(root, 'apps/institution-web/src/lib/portal-client'))};
import {ScopeProvider} from ${JSON.stringify(join(root, 'apps/institution-web/src/lib/scope'))};
createRoot(document.getElementById('app')).render(<QueryClientProvider client={new QueryClient()}><PortalClientProvider baseUrl={location.origin}><ScopeProvider><h1>Synthetic PDF preparation test</h1><MaterialPreparationStatus materialId="${materialId}"/></ScopeProvider></PortalClientProvider></QueryClientProvider>);`;
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
  const json = (value, status = 200) => {
    res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(value));
  };
  if (req.url === '/app.js') {
    res.setHeader('Content-Type', 'text/javascript');
    res.end(await readFile(join(directory, 'app.js')));
    return;
  }
  if (req.url === '/v1/portal/me') {
    json({ institutionUserId: 'synthetic-staff', isInstitutionWide: true, campuses: [] });
    return;
  }
  if (req.url?.includes('/preparation')) {
    if (req.method === 'POST') {
      let text = '';
      for await (const chunk of req) text += chunk;
      const body = JSON.parse(text);
      commands.push({ url: req.url, body, scope: req.headers['x-institution-scope'] });
      if (body.version !== row.version) {
        json({ code: 'VERSION_CONFLICT' }, 409);
        return;
      }
      row = {
        ...row,
        state: req.url.endsWith('/cancel') ? 'cancelled' : 'queued',
        version: row.version + 1,
        retryable: req.url.endsWith('/cancel'),
      };
    } else if (failNextRead) {
      failNextRead = false;
      json({ code: 'UNAVAILABLE' }, 503);
      return;
    }
    json(row);
    return;
  }
  res.setHeader('Content-Type', 'text/html');
  res.end(
    '<!doctype html><html lang="en"><meta charset="utf-8"><title>Preparation interaction test</title><style>body{font:16px system-ui;margin:40px;max-width:700px}button{margin:8px;padding:10px}button:focus-visible{outline:3px solid blue}</style><main id="app"></main><script src="/app.js"></script></html>',
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
  const page = await browser.newPage({ viewport: { width: 900, height: 520 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.getByRole('button', { name: 'Cancel preparation' }).waitFor();
  await page.keyboard.press('Tab');
  assert.equal(await page.locator(':focus').textContent(), 'Cancel preparation');
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Retry preparation' }).waitFor();
  assert.match(await page.getByRole('status').textContent(), /cancelled/);
  assert.equal(await page.locator(':focus').textContent(), 'Retry preparation');
  await page.getByRole('button', { name: 'Retry preparation' }).focus();
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Cancel preparation' }).waitFor();
  assert.deepEqual(
    commands.map((command) => command.body.version),
    [2, 3],
  );
  assert(commands.every((command) => command.scope === 'institution'));
  row = { ...row, state: 'failed', retryable: true, workerEnabled: false };
  await page.getByRole('button', { name: 'Refresh status' }).click();
  await page.getByRole('button', { name: 'Retry preparation', disabled: true }).waitFor();
  failNextRead = true;
  await page.getByRole('button', { name: 'Refresh status' }).click();
  await page.getByRole('button', { name: 'Refresh preparation status' }).waitFor();
  row = { ...row, state: 'succeeded', retryable: false, workerEnabled: true };
  await page.getByRole('button', { name: 'Refresh preparation status' }).focus();
  await page.keyboard.press('Enter');
  await page
    .getByText('PDF text prepared. Readable coverage is checked when a lesson starts.')
    .waitFor();
  assert.deepEqual(errors, []);
  await page.screenshot({ path: '/tmp/petros-s3-browser.png' });
  process.stdout.write(
    'PASS: Chromium keyboard cancel/retry, expected versions, scope header, disabled worker, error recovery and honest completion; no browser errors.\n',
  );
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
  await rm(directory, { recursive: true, force: true });
}
