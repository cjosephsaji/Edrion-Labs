// Test-only browser harness: real S10/S11 components and clients; synthetic localhost HTTP only.
/* global URL, navigator, Blob, document, innerWidth, getComputedStyle, matchMedia */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const studentRequire = createRequire(join(root, 'apps/student-web/package.json'));
const viteRequire = createRequire(createRequire(studentRequire.resolve('vitest/package.json')).resolve('vite'));
const { build } = viteRequire('esbuild');
const { chromium } = createRequire(join(root, 'apps/api/package.json'))('playwright-core');
const directory = await mkdtemp(join(tmpdir(), 'petros-compatibility-browser-'));
const ids = Array.from({ length: 8 }, (_, index) => `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`);
const provenance = { method: 'manual', sourceRef: 'synthetic curriculum', sourceHash: 'a'.repeat(64), observedAt: '2026-09-20T00:00:00.000Z', licence: 'synthetic-only' };
const effective = { from: '2026-01-01T00:00:00.000Z', until: null };
const readyCurriculum = {
  schemaVersion: 'petros.curriculum-alignment.v1', revision: 3, evidence: 'not_assessed', status: 'ready',
  data: {
    schemaVersion: 'petros.curriculum-alignment.v1', evidence: 'not_assessed',
    objectives: [
      { id: ids[0], version: 1, provenance, descriptor: 'Explain elasticity.', effective },
      { id: ids[1], version: 1, provenance, descriptor: 'Explain scalability.', effective },
    ],
    frameworks: [{ id: ids[2], version: 1, provenance, title: 'Synthetic framework', jurisdiction: 'Test', subject: 'Computing', level: 'Intro', issuingBody: 'Test publisher', externalId: 'FW-1', uri: null }],
    releases: [{ id: ids[3], version: 1, provenance, framework: { id: ids[2], version: 1 }, publisherVersion: '2026', effective, supersedes: null }],
    items: [{ id: ids[4], version: 1, provenance, release: { id: ids[3], version: 1 }, externalId: 'STD-1', uri: null, descriptor: 'Explain elastic allocation.' }],
    relationships: [],
    alignments: [{ id: ids[5], version: 1, objective: { id: ids[0], version: 1 }, standard: { id: ids[4], version: 1 }, relation: 'addresses', rationale: 'Direct match.', gaps: [], confidence: 1, overrideReason: null, state: 'approved' }],
    moduleObjectives: [{ weekNo: 1, objectives: [{ id: ids[0], version: 1 }, { id: ids[1], version: 1 }] }],
    unmappedObjectives: [ids[1]],
  },
};
const modules = [{ weekNo: 1, title: 'Elastic systems', topics: ['Scaling'], covered: false, isCurrentWeek: true }];

await writeFile(join(directory, 'next-navigation.js'), `export const useRouter=()=>({push:()=>{}});export const useParams=()=>({id:'course-1'});export const usePathname=()=>'/courses/course-1';export const useSearchParams=()=>new URLSearchParams(location.pathname==='/voice'?'mode=voice':'');`);
await writeFile(join(directory, 'next-link.js'), `import React from ${JSON.stringify(studentRequire.resolve('react'))};export default function Link({href,children,...props}){return React.createElement('a',{href,...props},children)}`);
await writeFile(join(directory, 'next-image.js'), `import React from ${JSON.stringify(studentRequire.resolve('react'))};export default function Image(props){const {priority,unoptimized,...rest}=props;return React.createElement('img',rest)}`);

async function bundle(name, source, app) {
  const appRoot = join(root, `apps/${app}`);
  await build({
    stdin: { contents: source, resolveDir: appRoot, loader: 'tsx' },
    bundle: true,
    outfile: join(directory, `${name}.js`),
    platform: 'browser',
    jsx: 'automatic',
    alias: {
      '@': join(appRoot, 'src'),
      'next/navigation': join(directory, 'next-navigation.js'),
      'next/link': join(directory, 'next-link.js'),
      'next/image': join(directory, 'next-image.js'),
    },
    define: { 'process.env.NODE_ENV': '"test"' },
    logLevel: 'silent',
  });
}

await bundle('federation', `
import React from 'react';import{createRoot}from'react-dom/client';import{QueryClient,QueryClientProvider}from'@tanstack/react-query';
import FederationSettingsPage from ${JSON.stringify(join(root, 'apps/institution-web/src/app/(app)/settings/federation/page.tsx'))};
import{PortalClientProvider}from ${JSON.stringify(join(root, 'apps/institution-web/src/lib/portal-client.tsx'))};
import{ScopeProvider}from ${JSON.stringify(join(root, 'apps/institution-web/src/lib/scope.tsx'))};
import{AcademicContextProvider}from ${JSON.stringify(join(root, 'apps/institution-web/src/lib/academic-context.tsx'))};
createRoot(document.getElementById('app')).render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}})}><PortalClientProvider baseUrl={location.origin} devUserEmail="owner@synthetic.test"><ScopeProvider><AcademicContextProvider><FederationSettingsPage/></AcademicContextProvider></ScopeProvider></PortalClientProvider></QueryClientProvider>);`, 'institution-web');

await bundle('portal-course', `
import React from 'react';import{createRoot}from'react-dom/client';import{QueryClient,QueryClientProvider}from'@tanstack/react-query';
import{CourseSyllabusPanel}from ${JSON.stringify(join(root, 'apps/institution-web/src/components/courses/course-syllabus-panel.tsx'))};
import{PortalClientProvider}from ${JSON.stringify(join(root, 'apps/institution-web/src/lib/portal-client.tsx'))};import{ScopeProvider}from ${JSON.stringify(join(root, 'apps/institution-web/src/lib/scope.tsx'))};
createRoot(document.getElementById('app')).render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}})}><PortalClientProvider baseUrl={location.origin} devUserEmail="assigned-instructor@synthetic.test"><ScopeProvider><CourseSyllabusPanel course={{id:'course-1',code:'CSE102',name:'Cloud Computing'}}/></ScopeProvider></PortalClientProvider></QueryClientProvider>);`, 'institution-web');

await bundle('student-course', `
import React from 'react';import{createRoot}from'react-dom/client';import{QueryClient,QueryClientProvider}from'@tanstack/react-query';
import CourseDetailPage from ${JSON.stringify(join(root, 'apps/student-web/src/app/(app)/courses/[id]/page.tsx'))};import{StudentApiProvider}from ${JSON.stringify(join(root, 'apps/student-web/src/lib/api-client.ts'))};import{PetrosCompanionProvider}from ${JSON.stringify(join(root, 'apps/student-web/src/components/petros/petros-companion-context.tsx'))};
createRoot(document.getElementById('app')).render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><StudentApiProvider baseUrl={location.origin} devStudentEmail="student@synthetic.test"><PetrosCompanionProvider><CourseDetailPage/></PetrosCompanionProvider></StudentApiProvider></QueryClientProvider>);`, 'student-web');

await bundle('voice', `
import React from 'react';import{createRoot}from'react-dom/client';import{StudentApiProvider}from ${JSON.stringify(join(root, 'apps/student-web/src/lib/api-client.ts'))};import{PetrosInputModes}from ${JSON.stringify(join(root, 'apps/student-web/src/components/petros/petros-input-modes.tsx'))};
createRoot(document.getElementById('app')).render(<StudentApiProvider baseUrl={location.origin} devStudentEmail="student@synthetic.test"><PetrosInputModes/></StudentApiProvider>);`, 'student-web');

let previewMode = 'ok';
let studentMode = 'ready';
let portalMode = 'ready';
let voiceMode = 'deny';
const requests = [];
const json = (res, value, status = 200) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); };
const curriculumFor = (mode) => mode === 'ready' ? readyCurriculum : { schemaVersion: 'petros.curriculum-alignment.v1', revision: 4, evidence: 'not_assessed', status: mode };
const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  let body = '';
  for await (const chunk of req) body += chunk;
  requests.push({ path: url.pathname, method: req.method, headers: req.headers, body });
  if (url.pathname.endsWith('.js')) { res.setHeader('Content-Type', 'text/javascript'); res.end(await readFile(join(directory, url.pathname.slice(1)))); return; }
  if (url.pathname === '/v1/portal/me') { json(res, { institutionUserId: ids[6], isInstitutionWide: true, campuses: [], permissions: [], roleKeys: [] }); return; }
  if (url.pathname === '/v1/portal/federation/identity-providers') { json(res, [{ id: ids[7], name: 'Synthetic SIS', kind: 'oidc', issuer: 'https://issuer.invalid', enabled: true }]); return; }
  if (url.pathname === '/v1/portal/federation/roster/jobs') { json(res, []); return; }
  if (url.pathname === '/v1/portal/federation/roster/oneroster/import') {
    if (previewMode === 'denied') json(res, { code: 'FORBIDDEN', message: 'Institution owner permission required.' }, 403);
    else json(res, { schemaVersion: 'petros.roster-preview.v1', mode: 'preview', applied: 0, mapped: 0, unresolved: 1, rows: [{ status: 'missing', externalId: 'student-1', upstreamHash: 'b'.repeat(64) }] });
    return;
  }
  if (url.pathname === '/v1/portal/courses/course-1/syllabus') {
    const curriculum = curriculumFor(portalMode);
    json(res, portalMode === 'legacy' ? modules : { modules, curriculum, history: [{ revision: 3, reason: 'Synthetic review', recordedAt: '2026-09-20T00:00:00.000Z' }] }); return;
  }
  if (url.pathname === '/v1/student/courses') { json(res, { items: [{ id: 'course-1', code: 'CSE102', name: 'Cloud Computing', credits: 4, professorName: 'Mary Saji' }] }); return; }
  if (url.pathname === '/v1/student/courses/course-1/syllabus') {
    if (studentMode === 'denied') { json(res, { code: 'FORBIDDEN', message: 'You do not have access to this course plan.' }, 403); return; }
    if (studentMode === 'network') { json(res, { code: 'UNAVAILABLE', message: 'Course plan unavailable.' }, 503); return; }
    json(res, studentMode === 'legacy' ? { modules } : { modules, curriculum: curriculumFor(studentMode) }); return;
  }
  if (url.pathname.endsWith('/announcements') || url.pathname.endsWith('/materials') || url.pathname.endsWith('/projects')) { json(res, { items: [] }); return; }
  if (url.pathname.endsWith('/about')) { json(res, { officeHours: null, gradingScheme: [], attendance: { present: 0, total: 0, requiredPct: 75, belowThreshold: false, warningLine: null } }); return; }
  if (url.pathname === '/v1/student/petros/voice/sessions') { json(res, { session: { id: ids[0], topic: 'Elasticity', blocks: [], maxMoves: 4 } }); return; }
  if (url.pathname === '/v1/student/petros/modality-events') { json(res, {}); return; }
  if (url.pathname === '/v1/student/petros/media/intents') { json(res, { media: { id: ids[1] }, upload: { url: '/student/petros/media/upload' } }); return; }
  if (url.pathname === '/v1/student/petros/media/upload') { json(res, { id: ids[1] }); return; }
  if (url.pathname === `/v1/student/petros/media/${ids[1]}/process`) { json(res, { media: { id: ids[1] }, imageUnderstanding: null, questionExtraction: null, handwritingRecognition: null, handwritingEvaluation: null, transcription: { text: 'Explain this document.', uncertainSegments: [] } }); return; }
  if (url.pathname === '/v1/student/petros/voice/turns') {
    if (voiceMode === 'deny') json(res, { code: 'PETROS_QUESTION_EXECUTION_REQUIRED', message: 'Use the durable document question path for this source.' }, 409);
    else if (voiceMode === 'network') { req.socket.destroy(); }
    else json(res, { session: { id: ids[0], topic: 'Elasticity', blocks: [], maxMoves: 4 }, transcript: { text: 'Explain this document.', uncertainSegments: [], corrected: false }, spoken: { transcript: 'Recovered synthetic response.', audio: null, degradation: null } });
    return;
  }
  const app = url.pathname === '/federation' ? 'federation' : url.pathname === '/portal-course' ? 'portal-course' : url.pathname === '/voice' ? 'voice' : 'student-course';
  res.setHeader('Content-Type', 'text/html');
  res.end(`<!doctype html><html lang="en"><meta charset="utf-8"><style>body{font:16px system-ui;margin:24px}button,input,textarea,select,summary{margin:4px;padding:8px}button:focus-visible,input:focus-visible,textarea:focus-visible,select:focus-visible,summary:focus-visible{outline:3px solid blue}</style><main id="app"></main><script src="/${app}.js"></script></html>`);
});
await new Promise((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: process.env.PETROS_TEST_CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });

try {
  const page = await browser.newPage({ viewport: { width: 960, height: 900 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: 'reduce' });

  await page.goto(`${origin}/federation`);
  await page.getByText('OneRoster CSV', { exact: true }).waitFor();
  assert.equal(await page.getByText(/External roster synchronization is disabled/).count(), 3);
  assert.equal(await page.getByRole('button', { name: /sync/i }).count(), 0);
  for (const provider of ['OneRoster REST', 'Clever', 'ClassLink']) {
    const panel = page.getByText(provider, { exact: true }).locator('xpath=..');
    assert.equal(await panel.locator('input,textarea,select,button').count(), 0);
  }
  const csvInput = page.getByLabel('OneRoster users CSV');
  const previewButton = page.getByRole('button', { name: 'Preview' });
  await csvInput.fill('sourcedId,role\nstudent-1,student');
  await csvInput.focus();
  await page.keyboard.press('Tab');
  assert.equal(await previewButton.evaluate((element) => element === document.activeElement), true);
  assert.notEqual(await previewButton.evaluate((element) => getComputedStyle(element).outlineStyle), 'none');
  await page.keyboard.press('Enter');
  await page.getByText(/"applied": 0/).waitFor();
  const preview = requests.find((request) => request.path.endsWith('/oneroster/import'));
  assert.equal(preview.headers['x-petros-provider-mapping'], 'petros.provider-mapping.v1');
  assert.equal(preview.headers['x-institution-scope'], 'institution');
  assert.equal(JSON.parse(preview.body).csv, 'sourcedId,role\nstudent-1,student');
  previewMode = 'denied';
  await previewButton.click();
  await page.getByRole('alert').waitFor();
  assert.match(await page.getByRole('alert').textContent(), /owner permission required/i);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await page.getByText('OneRoster REST').waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  assert.equal(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches), true);
  assert.equal(requests.filter((request) => /clever|classlink|oneroster\/sync|oneroster\/rest/.test(request.path)).length, 0);

  await page.setViewportSize({ width: 960, height: 900 });
  await page.goto(`${origin}/portal-course`);
  const portalSummary = page.getByText('Standard alignment · revision 3');
  await portalSummary.waitFor();
  await portalSummary.focus();
  await page.keyboard.press('Enter');
  await page.getByText('Explain elasticity.').waitFor();
  const portalRequest = requests.find((request) => request.path === '/v1/portal/courses/course-1/syllabus');
  assert.equal(portalRequest.headers['x-petros-curriculum-alignment'], 'petros.curriculum-alignment.v1');
  assert.equal(portalRequest.headers['x-institution-user-email'], 'assigned-instructor@synthetic.test');
  assert.equal(portalRequest.headers['x-institution-scope'], 'institution');

  await page.goto(`${origin}/student-course`);
  const studentSummary = page.getByText('Course objectives and standards');
  await studentSummary.waitFor();
  await studentSummary.focus();
  await page.keyboard.press('Enter');
  await page.getByText(/STD-1: Explain elastic allocation/).waitFor();
  assert.equal(await page.getByText(/not evidence of your learning/i).count(), 1);
  const studentRequest = requests.find((request) => request.path === '/v1/student/courses/course-1/syllabus');
  assert.equal(studentRequest.headers['x-petros-curriculum-alignment'], 'petros.curriculum-alignment.v1');
  studentMode = 'stale';
  await page.reload(); await page.getByText('Course objectives and standards').click(); await page.getByText(/course plan changed/).waitFor();
  studentMode = 'unsupported_version';
  await page.reload(); await page.getByText('Course objectives and standards').click(); await page.getByText('Standard mappings are currently unavailable.').waitFor();
  studentMode = 'unmapped';
  await page.reload(); await page.getByText('Course objectives and standards').click(); await page.getByText('No standard mappings are published.').waitFor();
  studentMode = 'legacy';
  await page.reload(); await page.getByText('Elastic systems').waitFor(); assert.equal(await page.getByText('Course objectives and standards').count(), 0);
  studentMode = 'denied';
  await page.reload(); await page.getByText('You do not have access to this course plan.').waitFor();
  studentMode = 'ready';
  await page.getByRole('button', { name: /try again/i }).click();
  await page.getByText('Course objectives and standards').waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await page.getByText('Course objectives and standards').waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  assert.equal(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches), true);

  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: async () => ({ getTracks: () => [{ stop() {} }] }) } });
    class FakeMediaRecorder {
      static isTypeSupported() { return true; }
      constructor() { this.state = 'inactive'; this.mimeType = 'audio/webm'; }
      start() { this.state = 'recording'; }
      stop() { this.state = 'inactive'; this.ondataavailable?.({ data: new Blob(['voice'], { type: this.mimeType }) }); this.onstop?.(); }
    }
    globalThis.MediaRecorder = FakeMediaRecorder;
  });
  await page.setViewportSize({ width: 960, height: 900 });
  await page.goto(`${origin}/voice`);
  await page.getByLabel('Concept or goal').fill('Elasticity from my document');
  await page.getByRole('button', { name: 'Start voice session' }).click();
  await page.getByRole('button', { name: 'Talk' }).click();
  await page.getByRole('button', { name: /Stop/ }).click();
  await page.getByLabel(/Transcript — correct/).waitFor();
  const confirm = page.getByRole('button', { name: 'Use confirmed transcript' });
  await confirm.focus(); await page.keyboard.press('Enter');
  await page.getByRole('alert').waitFor();
  assert.match(await page.getByRole('alert').textContent(), /durable document question path/i);
  assert.equal(await page.getByLabel(/Transcript — correct/).inputValue(), 'Explain this document.');
  assert.equal(await page.getByText('Petros transcript').count(), 0);
  voiceMode = 'network';
  await confirm.click(); await page.getByRole('alert').waitFor();
  voiceMode = 'ok';
  await confirm.click(); await page.getByText('Recovered synthetic response.').waitFor();
  assert.deepEqual(errors, []);
  await page.screenshot({ path: '/tmp/petros-s10-s11-browser.png', fullPage: true });
  process.stdout.write('PASS: Chromium S10/S11 federation preview/gates, portal/student curriculum compatibility, permissions/reload/recovery, keyboard focus-visible, mobile reload, reduced motion, and typed voice denial/network recovery; no browser errors.\n');
} finally {
  await browser.close();
  await new Promise((resolveClose) => server.close(resolveClose));
  await rm(directory, { recursive: true, force: true });
}
