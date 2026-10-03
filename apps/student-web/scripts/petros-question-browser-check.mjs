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
const directory = await mkdtemp(join(tmpdir(), 'petros-question-browser-'));
const sessionId = '11111111-1111-4111-8111-111111111111';
const key = '22222222-2222-4222-8222-222222222222';
let row = null;
let failNextRead = false;
const commands = [];
const input = `import React from 'react';
import {createRoot} from 'react-dom/client';
import {useDocumentQuestion} from ${JSON.stringify(join(root, 'apps/student-web/src/components/petros/use-document-question'))};
import {StudentApiClient} from ${JSON.stringify(join(root, 'apps/student-web/src/lib/api-client'))};
const client = new StudentApiClient(location.origin);
function App() {
  const [error, setError] = React.useState('');
  const question = useDocumentQuestion(client, '${sessionId}', () => {});
  return <><h1>Synthetic question execution test</h1><button onClick={() => question.ask({idempotencyKey:'${key}', question:'What is elasticity?', expectedSessionVersion:0}).catch(error => setError(error.message))}>Ask synthetic question</button>{question.status}<p>{error}</p></>;
}
createRoot(document.getElementById('app')).render(<App/>);`;
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
  if (req.url?.includes('/document-questions')) {
    if (req.method === 'POST') {
      let text = '';
      for await (const chunk of req) text += chunk;
      const body = JSON.parse(text);
      commands.push(body);
      if (body.action) {
        if (body.version !== row.version) {
          json({ code: 'PETROS_QUESTION_STALE' }, 409);
          return;
        }
        row = {
          ...row,
          state: body.action === 'cancel' ? 'cancelled' : 'queued',
          version: row.version + 1,
          retryable: false,
        };
      } else
        row = {
          schemaVersion: 'petros.document-question-execution.v1',
          id: key,
          sessionId,
          idempotencyKey: key,
          state: 'queued',
          version: 1,
          attempts: 0,
          processingEnabled: true,
          retryable: false,
          errorCode: null,
          result: null,
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
  await page.getByRole('button', { name: 'Ask synthetic question' }).waitFor();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Cancel question' }).waitFor();
  await page.getByRole('button', { name: 'Cancel question' }).focus();
  await page.keyboard.press('Enter');
  await page.getByText('Question cancelled.', { exact: true }).first().waitFor();
  assert.equal(await page.locator(':focus').getAttribute('aria-label'), 'Document question status');
  row = { ...row, state: 'failed', version: 3, attempts: 1, retryable: true };
  await page.reload();
  await page.getByRole('button', { name: 'Retry question' }).focus();
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Cancel question' }).waitFor();
  assert.equal(await page.locator(':focus').getAttribute('aria-label'), 'Document question status');
  row = { ...row, processingEnabled: false };
  await page.getByRole('button', { name: 'Refresh question status' }).click();
  await page
    .getByText('Question processing is currently disabled. You can cancel queued work.')
    .waitFor();
  failNextRead = true;
  await page.getByRole('button', { name: 'Refresh question status' }).click();
  await page.getByRole('alert').waitFor();
  await page.getByRole('button', { name: 'Refresh question status' }).click();
  await page.getByRole('alert').waitFor({ state: 'detached' });
  row = { ...row, state: 'failed', version: 5, attempts: 2, retryable: false,
    processingEnabled: true, errorCode: 'PETROS_QUESTION_BUDGET_LIMIT' };
  await page.reload();
  await page.getByText('The AI usage limit prevented another attempt. Your lesson remains available.').waitFor();
  assert.equal(await page.getByRole('button', { name: 'Retry question' }).count(), 0);
  assert.deepEqual(
    commands.map((body) => body.action ?? 'ask'),
    ['ask', 'cancel', 'retry'],
  );
  assert.deepEqual(
    commands.slice(1).map((body) => body.version),
    [1, 3],
  );
  assert.deepEqual(errors, []);
  row = { ...row, version: 6, errorCode: 'PETROS_KNOWLEDGE_POLICY_CHANGED',
    admission: { category: 'pedagogical_attempt_policy', code: 'PETROS_KNOWLEDGE_POLICY_CHANGED',
      correlationId: key, retry: 'new_question', message: 'The learning policy changed. Ask a new question.' },
    knowledgePolicy: { schemaVersion: 'petros.knowledge-policy.v1', mode: 'source_bound', requestedMode: null,
      policyVersionIds: [], authorityHash: 'a'.repeat(64), sourceId: key, sourceFingerprint: 'b'.repeat(64),
      pages: [1], subjectId: null, maximumDepth: 3, assignmentRestrictions: [], retrieval: { designatedSource: true, external: false },
      authority: 'designated_material_with_institution_restrictions', explanation: 'Source-bound: only the selected material is permitted.' } };
  await page.getByRole('button', { name: 'Refresh question status' }).focus();
  await page.keyboard.press('Enter');
  await page.getByText('The learning policy changed. Ask a new question.').waitFor();
  await page.getByText('Source-bound: only the selected material is permitted.').waitFor();
  await page.getByText(/Limit category: pedagogical attempt policy/).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Retry question' }).count(), 0);
  assert.equal(await page.locator(':focus').textContent(), 'Refresh question status');
  await page.screenshot({ path: '/tmp/petros-s9-browser.png' });
  process.stdout.write(
    'PASS: Chromium keyboard submit/cancel/retry, focus, reload recovery, disabled processing, budget denial, knowledge boundary, categorized policy denial and keyboard refresh recovery; no browser errors.\n',
  );
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
  await rm(directory, { recursive: true, force: true });
}
