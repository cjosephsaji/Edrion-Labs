// Test-only harness: it bundles the production React components and points their real client
// at a synthetic localhost endpoint. It uses no application server, credentials, data, or provider.
/* global document, innerWidth */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const studentRequire = createRequire(join(root, 'apps/student-web/package.json'));
const viteRequire = createRequire(createRequire(studentRequire.resolve('vitest/package.json')).resolve('vite'));
const { build } = viteRequire('esbuild');
const { chromium } = createRequire(join(root, 'apps/api/package.json'))('playwright-core');
const directory = await mkdtemp(join(tmpdir(), 'petros-phase2-browser-'));
const evidenceDirectory = join(root, 'docs/verification/petros-phase2-20260922');
const screenshot = join(evidenceDirectory, 'petros-phase2-browser-20260925.png');
const evidence = join(evidenceDirectory, 'petros-phase2-browser-20260925.json');
const sessionId = '11111111-1111-4111-8111-111111111111';
const packId = '22222222-2222-4222-8222-222222222222';
const objectiveId = '33333333-3333-4333-8333-333333333333';
const receiptId = '44444444-4444-4444-8444-444444444444';

await build({
  stdin: {
    contents: `export * from ${JSON.stringify(join(root, 'packages/schemas/src/petros-projectile-model.ts'))};
      export * from ${JSON.stringify(join(root, 'packages/schemas/src/petros-projectile-command.ts'))};
      export * from ${JSON.stringify(join(root, 'packages/schemas/src/petros-projectile-binding.ts'))};
      export * from ${JSON.stringify(join(root, 'packages/schemas/src/__fixtures__/petros-phase2-projectile.ts'))};`,
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

const defaultInput = {
  schemaVersion: 'petros.projectile-input.v1',
  capability: model.PETROS_PROJECTILE_CAPABILITY,
  assumptions: model.PETROS_PROJECTILE_ASSUMPTIONS,
  launchVelocity: { x: 12, y: 18, unit: 'm/s' },
  gravity: { value: 9.8, unit: 'm/s^2' },
  elapsedTime: { value: 0, unit: 's' },
};
let snapshot = model.petrosProjectileSnapshotSchema.parse({
  schemaVersion: 'petros.projectile-snapshot.v1',
  version: 0,
  binding: model.projectileBinding,
  state: model.evaluatePetrosProjectile(defaultInput),
  policy: {
    schemaVersion: 'petros.knowledge-policy.v1',
    mode: 'source_bound', requestedMode: null, policyVersionIds: [], authorityHash: 'c'.repeat(64),
    sourceId: model.projectileIds.object, sourceFingerprint: model.projectileSourceVersion, pages: [2],
    subjectId: null, maximumDepth: 0, assignmentRestrictions: [],
    retrieval: { designatedSource: true, external: false },
    authority: 'designated_material_with_institution_restrictions',
    explanation: 'Synthetic source-bound fixture.',
  },
  operationId: '55555555-5555-4555-8555-555555555555',
  commandHash: 'd'.repeat(64),
});

const adaptiveCommands = [];
const projectileCommands = [];
const requestUrls = [];
let adaptiveBound = false;
let loseAdaptiveResponse = true;
let projectileState = 'ready';
let resumeStale = false;

const input = `import React from 'react';
  import {createRoot} from 'react-dom/client';
  import {StudentApiProvider} from ${JSON.stringify(join(root, 'apps/student-web/src/lib/api-client'))};
  import {PetrosReviewedObjectivePicker} from ${JSON.stringify(join(root, 'apps/student-web/src/components/petros/petros-reviewed-objective-picker'))};
  import {PetrosProjectileExplorer} from ${JSON.stringify(join(root, 'apps/student-web/src/components/petros/petros-projectile-explorer'))};
  import {PetrosLearningResume} from ${JSON.stringify(join(root, 'apps/student-web/src/components/petros/petros-learning-resume'))};
  function App() {
    const [bound, setBound] = React.useState(0);
    return <StudentApiProvider baseUrl={location.origin}>
      <main><h1>Synthetic Phase 2 interaction test</h1>
      <p aria-live="polite">Bound callbacks: {bound}</p>
      <PetrosReviewedObjectivePicker key={bound} sessionId="${sessionId}" beforeLesson onBound={() => setBound((value) => value + 1)} />
      <PetrosProjectileExplorer sessionId="${sessionId}" blockId="${model.projectileIds.diagram}" />
      <PetrosLearningResume artifactId="synthetic-artifact" revision={1} />
      </main>
    </StudentApiProvider>;
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
  requestUrls.push(req.url ?? '');
  const json = (value, status = 200) => {
    res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(value));
  };
  if (req.url === '/app.js' || req.url === '/app.css') {
    const file = join(directory, req.url.slice(1));
    try {
      res.setHeader('Content-Type', req.url.endsWith('.css') ? 'text/css' : 'text/javascript');
      res.end(await readFile(file));
    } catch {
      res.writeHead(404).end();
    }
    return;
  }
  // StudentApiClient deliberately prefixes every production-client request with /v1.
  // Keep the mock at that exact boundary so this harness catches client URL regressions.
  if (req.url === '/v1/student/petros/artifacts/synthetic-artifact/learning-resume') {
    json(resumeStale ? {code:'PETROS_ARTIFACT_LEARNING_STALE',message:'Reviewed source changed.'} : {
      status:'available',objectiveStatement:'Distinguish horizontal and vertical velocity.',
      objective:{id:objectiveId,version:2},pack:{id:packId,version:3},
      currentEvidence:{observedResponses:3,demonstratedApplications:1,assistedResponses:1,
        uncertainResponses:1,declaredExternalAssistanceResponses:0},
    },resumeStale ? 409 : 200);
    return;
  }
  if (req.url === `/v1/student/petros/sessions/${sessionId}/adaptive`) {
    if (req.method === 'GET') {
      if (adaptiveBound) {
        json({ status: 'bound', pack: { id: packId, version: 3 }, objective: { id: objectiveId, version: 2, statement: 'Explain energy storage in plants.' } });
      } else {
        json({
          status: 'available',
          packs: [{
            pack: { id: packId, version: 3 },
            objective: { id: objectiveId, version: 2, statement: 'Explain energy storage in plants.' },
            concepts: [{ id: 'energy-storage', label: 'Energy storage' }],
            review: { receiptId, version: 4, reviewedAt: '2026-09-20T00:00:00.000Z' },
          }],
        });
      }
      return;
    }
    let text = '';
    for await (const chunk of req) text += chunk;
    const command = JSON.parse(text);
    adaptiveCommands.push(command);
    if (command.pack?.id !== packId || command.pack?.version !== 3) return json({ code: 'PETROS_ADAPTIVE_PACK_UNKNOWN' }, 409);
    adaptiveBound = true; // The command reaches the synthetic durable owner before its first response is lost.
    if (loseAdaptiveResponse) {
      loseAdaptiveResponse = false;
      // Model an ambiguous transport outcome after the owner commits. A short 503 lets
      // Chromium release the pending control promptly while preserving the exact command
      // for its idempotent retry; a destroyed keep-alive socket can remain pending for the
      // browser's long network timeout and makes the recovery assertion nondeterministic.
      res.writeHead(503, { 'Content-Type': 'application/json', 'Connection': 'close' });
      res.end(JSON.stringify({ code: 'SYNTHETIC_RESPONSE_LOST', message: 'Response was not confirmed.' }));
      return;
    }
    json({ status: 'bound', pack: command.pack, replayed: true });
    return;
  }
  const projectilePath = `/v1/student/petros/sessions/${sessionId}/blocks/${model.projectileIds.diagram}/projectile`;
  if (req.url === projectilePath) {
    if (req.method === 'GET') {
      if (projectileState === 'ready') json({ status: 'ready', binding: model.projectileBinding, defaultInput });
      else if (projectileState === 'unavailable') json({ status: 'unavailable', recovery: 'original_source', reason: 'The reviewed binding is stale. Continue with the original diagram.' });
      else json({ status: 'available', snapshot, replayed: false });
      return;
    }
    let text = '';
    for await (const chunk of req) text += chunk;
    const command = JSON.parse(text);
    projectileCommands.push(command);
    const state = command.action.kind === 'initialise'
      ? model.evaluatePetrosProjectile(command.action.input)
      : model.updatePetrosProjectileParameter(snapshot.state, command.action.change);
    snapshot = model.petrosProjectileSnapshotSchema.parse({
      ...snapshot,
      version: command.expectedVersion + 1,
      state,
      operationId: command.operationId,
      commandHash: 'e'.repeat(64),
    });
    projectileState = 'available';
    json({ status: 'available', snapshot, replayed: false });
    return;
  }
  res.setHeader('Content-Type', 'text/html');
  res.end('<!doctype html><html lang="en"><meta charset="utf-8"><title>Phase 2 browser check</title><link rel="stylesheet" href="/app.css"><style>body{font:16px system-ui;margin:24px;max-width:920px;color:#15323c;background:#f9fbfc}button,input,summary{font:inherit}button:focus-visible,input:focus-visible,summary:focus-visible{outline:3px solid #005a9c;outline-offset:3px}</style><div id="app"></div><script src="/app.js"></script></html>');
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({
  executablePath: process.env.PETROS_TEST_CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
});
try {
  const page = await browser.newPage({ viewport: { width: 920, height: 1000 }, reducedMotion: 'reduce' });
  const errors = [];
  const resources = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => resources.push(request.url()));
  await page.goto(`http://127.0.0.1:${server.address().port}`);

  const objectives = page.getByText('Reviewed objectives (1)');
  await objectives.waitFor();
  await objectives.focus();
  await page.keyboard.press('Enter');
  await page.getByText('Explain energy storage in plants.').waitFor();
  await page.getByRole('button', { name: 'Choose reviewed objective' }).focus();
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Retry choosing reviewed objective' }).waitFor();
  await page.getByRole('button', { name: 'Retry choosing reviewed objective' }).focus();
  await page.keyboard.press('Enter');
  await page.getByText('Bound callbacks: 1').waitFor();
  await page.getByText('This session uses a reviewed teaching objective.').waitFor();
  assert.deepEqual(adaptiveCommands[1], adaptiveCommands[0]);
  assert.match(await page.getByLabel('Reviewed teaching objective').textContent(), /not record a demonstration/i);

  const start = page.getByRole('button', { name: 'Start simulation' });
  await start.waitFor();
  await start.focus();
  await page.keyboard.press('Enter');
  const summary = page.getByText('Explore the reviewed projectile model');
  await summary.waitFor();
  await summary.focus();
  await page.keyboard.press('Enter');
  const velocity = page.getByRole('spinbutton', { name: 'Horizontal launch velocity (m/s)' });
  await velocity.focus();
  await page.keyboard.press('Meta+A');
  await page.keyboard.type('0');
  await page.getByText('Saved simulation version 2').waitFor();
  assert.equal(await velocity.inputValue(), '0');
  assert.deepEqual(projectileCommands[1].action, {
    kind: 'parameter', change: { parameter: 'launch_velocity_x', value: 0, unit: 'm/s' },
  });
  await page.getByRole('img', { name: 'Motion' }).waitFor();
  await page.getByRole('img', { name: 'Velocity and acceleration' }).waitFor();
  const fullText = page.getByText('Full text for Readouts and equations');
  await fullText.focus();
  await page.keyboard.press('Enter');
  await page.getByText('Time: 0 s. Elapsed time').waitFor();
  await page.getByRole('button',{name:'View current objective and evidence'}).click();
  await page.getByText('Distinguish horizontal and vertical velocity.').waitFor();
  await page.getByText('3 recorded responses · 1 demonstrated applications').waitFor();
  await page.getByText(/Other external help is unknown/).waitFor();
  await mkdir(evidenceDirectory, { recursive: true });
  await page.screenshot({ path: screenshot, fullPage: true });
  resumeStale=true;
  await page.getByRole('button',{name:'View current objective and evidence'}).click();
  await page.getByRole('button',{name:'Retry learning context'}).waitFor();
  assert.equal(await page.getByText('Distinguish horizontal and vertical velocity.').count(),0);

  projectileState = 'unavailable';
  await page.getByRole('button', { name: 'Refresh simulation' }).focus();
  await page.keyboard.press('Enter');
  await page.getByText('The reviewed binding is stale. Continue with the original diagram.').waitFor();
  assert.equal(await page.getByRole('spinbutton').count(), 0);
  projectileState = 'available';
  await page.getByRole('button', { name: 'Check simulation' }).focus();
  await page.keyboard.press('Enter');
  await summary.focus();
  await page.keyboard.press('Enter');
  await page.getByRole('spinbutton', { name: 'Horizontal launch velocity (m/s)' }).waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  assert.deepEqual(errors, []);
  assert.equal(resources.every((url) => url.startsWith('http://127.0.0.1:')), true);
  assert.equal(requestUrls.every((url) => !url.startsWith('http')), true);
  await mkdir(evidenceDirectory, { recursive: true });
  await writeFile(evidence, JSON.stringify({
    kind: 'controlled-localhost-chromium',
    components: ['PetrosReviewedObjectivePicker', 'PetrosProjectileExplorer','PetrosLearningResume'],
    assertions: ['explicit-reviewed-pack-choice', 'same-command-lost-response-retry', 'bound-objective-language', 'SI-zero-parameter', 'linked-svg-and-nonvisual-view', 'stale-binding-original-diagram-recovery', 'keyboard-focus', 'mobile-width', 'no-external-resources','resume-evidence-distinctions','stale-resume-clears-context'],
    adaptiveCommandCount: adaptiveCommands.length,
    projectileCommandCount: projectileCommands.length,
    screenshot: 'petros-phase2-browser-20260925.png',
  }, null, 2));
  process.stdout.write(`PASS: controlled Chromium exercised real picker and projectile components; screenshot ${screenshot}; no browser errors or non-local resources.\n`);
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
  await rm(directory, { recursive: true, force: true });
}
