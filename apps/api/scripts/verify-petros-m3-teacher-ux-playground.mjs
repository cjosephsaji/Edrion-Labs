/* global process, fetch, setTimeout, URL, localStorage, document, innerWidth, innerHeight, console, getComputedStyle */
/** Contained browser QA: existing Next route/layout against a disposable auth-metadata fixture API. */
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PETROS_PLAYWRIGHT_MODULE ?? 'playwright');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const output = resolve(root, 'docs/verification/petros-v2/m3-teacher-ux-evidence/playground');
await mkdir(output, { recursive: true });
const testerId = '00000000-0000-4000-8000-000000000001';
const webPort = Number(process.env.PETROS_QA_WEB_PORT ?? 3041), apiPort = Number(process.env.PETROS_QA_API_PORT ?? 3042);
const origin = `http://localhost:${webPort}`, requests = [], checks = [], errors = [];
const footerMeasurements = [];
async function assertFlushFooter(target, view) {
  const bounds = await target.evaluate(() => {
    const main = document.querySelector('.portal-main').getBoundingClientRect();
    const footer = document.querySelector('[aria-label="Playback controls"]').getBoundingClientRect();
    const nav = document.querySelector('[aria-label="Quick navigation"]').getBoundingClientRect();
    return { width: innerWidth, scrollTop: document.querySelector('.portal-main').scrollTop, left: footer.left-main.left, right: main.right-footer.right, bottom: (nav.height ? nav.top : main.bottom)-footer.bottom };
  });
  assert.ok(Math.abs(bounds.left)<1 && Math.abs(bounds.right)<1 && Math.abs(bounds.bottom)<1,`Footer must meet the UI edges without exposed content: ${view} ${JSON.stringify(bounds)}`);
  footerMeasurements.push({view,...bounds});
}
const me = { kind: 'institutional', fullName: 'Fixture Tester', email: null, studentId: testerId, institutionId: '00000000-0000-4000-8000-000000000002',
  campusId: null, programmeName: 'Fixture programme', className: null, sectionName: null, termName: null, academicYearName: null, permissions: ['student.learn.use'], surfaces: {} };
const api = createServer((req, res) => {
  requests.push({ method: req.method, path: req.url });
  res.setHeader('access-control-allow-origin', origin); res.setHeader('access-control-allow-credentials', 'true');
  res.setHeader('content-type', 'application/json');
  const authorized = req.headers.cookie?.includes('petros_fixture_auth=allowed');
  if (req.method === 'GET' && req.url === '/v1/student/me' && authorized) { res.end(JSON.stringify(me)); return; }
  res.statusCode = req.url === '/v1/student/me' ? 401 : 403; res.end(JSON.stringify({ code: 'FIXTURE_ONLY', message: 'Only disposable authentication metadata is available.' }));
});
await new Promise(resolve => api.listen(apiPort, '127.0.0.1', resolve));
const next = spawn(process.execPath, [require.resolve('next/dist/bin/next', { paths: [resolve(root, 'apps/student-web')] }), 'dev', '-H', '127.0.0.1', '-p', String(webPort)], {
  cwd: resolve(root, 'apps/student-web'), env: { PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR, NODE_ENV: 'development',
    NEXT_TELEMETRY_DISABLED: '1', PETROS_ISOLATED_VERIFICATION: '1', PETROS_M0P_VERIFICATION: '1', PETROS_V2_COMPANION_PLAYGROUND_ENABLED: 'true',
    PETROS_V2_COMPANION_PLAYGROUND_TESTER_IDS: testerId, NEXT_PUBLIC_API_BASE_URL: `http://localhost:${apiPort}`, NEXT_PUBLIC_DEV_STUDENT_EMAIL: '', NEXT_PUBLIC_DEV_STUDENT_USER: '' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let serverLog = ''; next.stdout.on('data', b => { serverLog += b; }); next.stderr.on('data', b => { serverLog += b; });
let browser;
try {
  for (let i = 0; i < 120; i++) {
    try { await fetch(origin); break; } catch { await new Promise(r => setTimeout(r, 500)); }
    if (i === 119) throw new Error('Isolated Next server did not start');
  }
  const unauthenticated = await fetch(`${origin}/petros/companion-playground`, { redirect: 'manual' });
  const unauthenticatedBody = await unauthenticated.text();
  assert.ok((unauthenticated.status === 307 && /login/.test(unauthenticated.headers.get('location'))) || unauthenticatedBody.includes('NEXT_REDIRECT;replace;/login;307;'));
  assert.ok(!unauthenticatedBody.includes('Learning together')); checks.push('No cookie redirects to login (including Next streamed redirect)');
  const denied = await fetch(`${origin}/petros/companion-playground`, { headers: { cookie: 'petros_fixture_auth=denied' } });
  const deniedBody = await denied.text(); assert.ok(denied.status === 404 || deniedBody.includes('NEXT_NOT_FOUND')); assert.ok(!deniedBody.includes('Learning together')); checks.push('Invalid authenticated metadata fails closed');
  browser = await chromium.launch({ headless: true, ...(process.env.PETROS_CHROMIUM_PATH ? { executablePath: process.env.PETROS_CHROMIUM_PATH } : {}) });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'no-preference' });
  await context.addCookies([{ name: 'petros_fixture_auth', value: 'allowed', url: origin, httpOnly: true, sameSite: 'Lax' }]);
  const page = await context.newPage(); page.setDefaultTimeout(15000); page.on('pageerror', e => errors.push(e.message));
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') { errors.push(`Blocked external browser request: ${url.origin}`); await route.abort(); }
    else await route.continue();
  });
  await page.goto(`${origin}/petros/companion-playground`);
  await page.getByRole('heading', { name: 'Learning together' }).waitFor();
  const button=name=>page.getByRole('button',{name,exact:true});
  let selectedFixture='argument-reading';
  const key=()=>`petros.m0p.fixture.v1:${testerId}:${selectedFixture}`;
  const checkpoint=()=>page.evaluate(k=>JSON.parse(localStorage.getItem(k)),key());
  const diagram=page.getByRole('group',{name:'Editable service relationship diagram'});
  const pause=()=>button('Pause').click();
  await button('Play').click();
  await page.waitForFunction(()=>document.querySelector('[aria-label="Read a claim together"] h2') && document.querySelector('[data-element-id="library-passage"]'));
  await pause(); const first=await checkpoint(); await page.waitForTimeout(300); assert.deepEqual((await checkpoint()).events,first.events);
  for(let i=0;i<3;i++) { await button('Continue').click(); await page.waitForTimeout(90); await pause(); }
  assert.equal((await checkpoint()).events.length,1); checks.push('Play / Pause / Continue cycles freeze and resume the same partial beat');
  const pausedForReload=await checkpoint(); await page.reload(); await button('Continue').waitFor(); assert.deepEqual((await checkpoint()).events,first.events); assert.equal((await checkpoint()).progress,pausedForReload.progress); checks.push('Paused refresh restores the semantic prefix without autoplay');
  await button('Continue').click();
  await page.waitForFunction(()=>document.querySelector('[data-element-id="library-claim"]'));
  await pause(); assert.equal((await checkpoint()).index,1); checks.push('Automatic progression advances beyond the first beat');
  await button('Continue').click(); await page.waitForTimeout(100); await page.getByRole('button',{name:'Ask Petros about this',exact:true}).first().click();
  const interrupted=await checkpoint(); await page.waitForTimeout(300); assert.equal((await checkpoint()).progress,interrupted.progress);
  await page.waitForFunction(()=>document.querySelector('textarea[id^="question-"]')===document.activeElement);
  await page.getByLabel('Your question',{exact:true}).fill('Why is this the claim?'); await button('Send question').click();
  assert.equal((await checkpoint()).index,interrupted.index); await button('Continue lesson').click(); assert.deepEqual((await checkpoint()).events,interrupted.events);
  checks.push('Ask Petros pauses during reveal, focuses the existing input and continues the exact checkpoint');
  await button('Replay').waitFor({timeout:20000}); assert.equal((await checkpoint()).events.filter(e=>e.kind==='action').length,4);
  await page.reload(); await button('Replay').waitFor(); await button('Replay').click(); await button('Pause').waitFor(); await pause(); assert.equal((await checkpoint()).events.filter(e=>e.kind==='action').length,1);
  checks.push('Completed reload retains Replay; Replay clears the old prefix and starts playback');
  await button('Restart fixture').click(); await button('Play').waitFor(); await page.waitForTimeout(800); assert.equal((await checkpoint())?.events.length??0,0); checks.push('Restart cancels old reveal/progression callbacks and clears checkpoint work');
  await button('Build a diagram').click(); selectedFixture='cloud-drawing'; await page.getByLabel(/Reduce motion/).check(); await button('Finish step').click();
  await page.waitForTimeout(300); await page.screenshot({path:resolve(output,'after-desktop-step1.png')});
  const stage=page.getByLabel('Diagram editing surface',{exact:true});
  const learner=diagram.getByRole('button',{name:'Learner',exact:true});
  await learner.click(); assert.equal(await learner.getAttribute('aria-pressed'),'true'); assert.equal(await page.locator('[data-selected-id="cloud-learner"]').count(),1);
  assert.equal(await page.locator('[data-connect-handle]').count(),0); await learner.dblclick(); assert.equal(await page.getByLabel('Rename Learner',{exact:true}).count(),0);
  const protectedEvents=(await checkpoint()).events.length; await learner.focus(); await page.keyboard.press('ArrowDown'); assert.equal((await checkpoint()).events.length,protectedEvents);
  await button('Ask Petros about selected element').click(); await page.waitForFunction(()=>document.querySelector('textarea[id^="question-"]')===document.activeElement); assert.ok(await learner.isVisible());
  assert.ok((await page.locator('[data-selected-id="cloud-learner"]').textContent()).includes('Asking about: Learner'));
  await button('Clear selected teaching element').click(); await page.waitForFunction(()=>document.querySelector('[data-selected-id]')?.getAttribute('data-selected-id')===''); assert.equal(await learner.getAttribute('aria-pressed'),'false');
  checks.push('Protected main node surfaces select visibly, announce context, support Ask and Clear, and reject editing');
  for(const width of [1440,360]) {await page.setViewportSize({width,height:900});await page.screenshot({path:resolve(output,`m3-smoke-${width}.png`)});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);checks.push(`${width}px Playground containment`);}
  assert.equal(errors.length,0);checks.push('No browser runtime errors');
  assert.ok(requests.every(r=>r.method==='GET'&&['/v1/student/me','/v1/student/petros/companion/voice-preview/status'].includes(r.path)));checks.push('Only authentication metadata and denied read-only voice status requested; no session, provider dispatch or evidence writes');
  await writeFile(resolve(output,'browser-results.json'),JSON.stringify({status:'PASS',scope:'Selected M0-P browser smoke regression; historical Your turn selector is excluded and documented separately',date:'2026-10-14',runtime:process.version,checks,errors,requests},null,2));
  console.log(JSON.stringify({status:'PASS',checks,output},null,2));
} catch(error) {
  if(browser) { const pages=browser.contexts().flatMap(c=>c.pages()); if(pages[0]) await pages[0].screenshot({path:resolve(output,'browser-failure.png')}).catch(()=>{}); }
  await writeFile(resolve(output,'browser-results.json'),JSON.stringify({status:'FAIL',checks,errors,error:String(error),requests},null,2)); throw error;
} finally { if(browser) await browser.close(); next.kill('SIGTERM'); await new Promise(r=>api.close(r)); await writeFile(resolve(output,'next-server.log'),serverLog); }
