import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { randomBytes, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { browserExecutable } from './browser-executable';
import { hashPreviewPassword } from '../server/preview-credentials';
const require = createRequire(import.meta.url),
  base = 'http://127.0.0.1:3023';
const parse = (text: string) =>
  Object.fromEntries(
    text.split('\n').flatMap((line) => {
      const m = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
      return m ? [[m[1], m[2].trim().replace(/^['"]|['"]$/g, '')]] : [];
    }),
  );
const local = parse(
  await readFile(new URL('../.env.local', import.meta.url), 'utf8').catch(
    () => '',
  ),
);
const password = randomBytes(20).toString('base64url'),
  username = 'yc-browser-test',
  secret = randomBytes(32).toString('hex');
const passwordHash = await hashPreviewPassword(password);
const actualRedis = !!(
  local.UPSTASH_REDIS_REST_URL && local.UPSTASH_REDIS_REST_TOKEN
);
const counts = new Map<string, number>();
const mock = createServer(async (req, res) => {
  const parts: Buffer[] = [];
  for await (const part of req) parts.push(Buffer.from(part));
  const commands = JSON.parse(Buffer.concat(parts).toString('utf8')) as [
    string,
    string,
    number?,
  ][];
  const results = commands.map(([op, key]) => {
    if (op === 'INCR') {
      const count = (counts.get(key) ?? 0) + 1;
      counts.set(key, count);
      return { result: count };
    }
    return { result: 1 };
  });
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(results));
});
if (!actualRedis)
  await new Promise<void>((resolve) => mock.listen(0, '127.0.0.1', resolve));
const redisUrl = actualRedis
  ? local.UPSTASH_REDIS_REST_URL
  : `http://127.0.0.1:${(mock.address() as { port: number }).port}`;
const proc = spawn(
  process.execPath,
  [
    require.resolve('next/dist/bin/next'),
    'start',
    '-H',
    '127.0.0.1',
    '-p',
    '3023',
  ],
  {
    cwd: new URL('..', import.meta.url),
    env: {
      ...process.env,
      NODE_ENV: 'production',
      OPENAI_API_KEY: '',
      PETROS_V2_LOCAL_ONLY: '0',
      PETROS_V2_ACCESS_SECRET: secret,
      PETROS_V2_YC_USERNAME: username,
      PETROS_V2_YC_PASSWORD_HASH: passwordHash,
      UPSTASH_REDIS_REST_URL: redisUrl,
      UPSTASH_REDIS_REST_TOKEN: actualRedis
        ? local.UPSTASH_REDIS_REST_TOKEN
        : 'test-only-token',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  },
);
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
const out = new URL('../evidence/yc-login/', import.meta.url);
await mkdir(out, { recursive: true });
try {
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(Error('Production server did not start.')),
      20000,
    );
    proc.stdout!.on('data', (data) => {
      if (String(data).includes('Ready')) {
        clearTimeout(timer);
        resolve();
      }
    });
    proc.on('error', reject);
    proc.once('exit', () => {
      clearTimeout(timer);
      reject(Error('Production server exited before testing.'));
    });
  });
  const privateHtml = await (await fetch(base + '/prototype')).text();
  assert.ok(
    privateHtml.includes('Username') && privateHtml.includes('Password'),
  );
  assert.ok(!privateHtml.includes('data-testid="regular-learning-model"'));
  assert.equal((await fetch(base + '/prototype/api/status')).status, 401);
  const crossOrigin = await fetch(base + '/prototype/api/login', {
    method: 'POST',
    headers: { origin: 'https://foreign.test' },
    body: '',
    redirect: 'manual',
  });
  assert.equal(crossOrigin.status, 403);
  browser = await chromium.launch({
    executablePath: browserExecutable(),
    headless: true,
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    extraHTTPHeaders: {
      'x-nf-client-connection-ip': `yc-fixture-${randomUUID()}`,
    },
  });
  const page = await context.newPage(),
    errors: string[] = [],
    aiRequests: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('request', (r) => {
    if (
      /\/api\/(teacher|speech|voice)(?:$|\?)/.test(r.url()) ||
      r.url().includes('api.openai.com')
    )
      aiRequests.push(r.url());
  });
  await page.goto(base + '/prototype');
  await page
    .getByRole('textbox', { name: 'Username', exact: true })
    .fill(username);
  await page
    .getByLabel('Password', { exact: true })
    .fill('Incorrect-test-password');
  await page
    .getByRole('button', { name: 'Enter the study', exact: false })
    .click();
  await page.locator('#login-error').waitFor();
  assert.match(
    (await page.locator('#login-error').textContent())!,
    /username or password didn’t match/,
  );
  assert.equal(
    (await context.cookies()).filter((c) => c.name === 'petros_v2').length,
    0,
  );
  await page.screenshot({
    path: fileURLToPath(new URL('desktop-login-dpr2.png', out)),
  });
  await page
    .getByRole('textbox', { name: 'Username', exact: true })
    .fill(username);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page
    .getByRole('button', { name: 'Enter the study', exact: false })
    .click();
  await page.getByRole('button', { name: 'Sign out', exact: true }).waitFor();
  const cookie = (await context.cookies()).find((c) => c.name === 'petros_v2')!;
  assert.ok(
    cookie.httpOnly &&
      cookie.sameSite === 'Strict' &&
      cookie.path === '/prototype',
  );
  assert.equal(
    await page.evaluate(() => document.cookie.includes('petros_v2')),
    false,
  );
  const status = await context.request.get(base + '/prototype/api/status');
  assert.equal(status.status(), 200);
  assert.deepEqual(await status.json(), {
    teacher: false,
    voice: false,
    provider: 'prepared',
    aiPaused: true,
  });
  for (const label of [
    'Neural learning',
    'Rocket landing',
    'Attention',
    'Traffic waves',
    'Time dilation',
  ]) {
    await page
      .getByRole('navigation', { name: 'Interactive topics' })
      .getByRole('button', { name: new RegExp(label) })
      .click();
    const questions = page
      .getByRole('region', { name: 'Prepared questions' })
      .getByRole('button');
    assert.equal(await questions.count(), 4);
    await questions.first().click();
    assert.ok(
      await page
        .getByRole('region', { name: 'Petros answer', exact: true })
        .isVisible(),
    );
  }
  await page.reload();
  await page.getByRole('button', { name: 'Sign out', exact: true }).waitFor();
  await page.screenshot({
    path: fileURLToPath(new URL('desktop-signed-in-dpr2.png', out)),
  });
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await page.getByRole('textbox', { name: 'Username', exact: true }).waitFor();
  assert.equal(
    (await context.cookies()).some((c) => c.name === 'petros_v2'),
    false,
  );
  assert.equal(
    (await context.request.get(base + '/prototype/api/status')).status(),
    401,
  );
  await page.reload();
  await page.getByRole('textbox', { name: 'Username', exact: true }).waitFor();
  const mobileContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    extraHTTPHeaders: {
      'x-nf-client-connection-ip': `yc-mobile-fixture-${randomUUID()}`,
    },
  });
  const mobile = await mobileContext.newPage();
  mobile.on('pageerror', (e) => errors.push(e.message));
  mobile.on('request', (r) => {
    if (
      /\/api\/(teacher|speech|voice)(?:$|\?)/.test(r.url()) ||
      r.url().includes('api.openai.com')
    )
      aiRequests.push(r.url());
  });
  await mobile.goto(base + '/prototype');
  await mobile
    .getByRole('textbox', { name: 'Username', exact: true })
    .waitFor();
  await mobile.waitForFunction(() =>
    Array.from(document.images).every((image) => image.complete),
  );
  assert.ok(
    await mobile.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  );
  await mobile.screenshot({
    path: fileURLToPath(new URL('mobile-login-dpr2.png', out)),
  });
  await mobile
    .getByRole('textbox', { name: 'Username', exact: true })
    .fill(username);
  await mobile.getByLabel('Password', { exact: true }).fill(password);
  await mobile
    .getByRole('button', { name: 'Enter the study', exact: false })
    .click();
  await mobile.getByRole('button', { name: 'Sign out', exact: true }).waitFor();
  assert.ok(
    await mobile.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  );
  await mobile.screenshot({
    path: fileURLToPath(new URL('mobile-signed-in-dpr2.png', out)),
  });
  await mobile.getByRole('button', { name: 'Sign out', exact: true }).click();
  await mobile
    .getByRole('textbox', { name: 'Username', exact: true })
    .waitFor();
  assert.deepEqual(errors, []);
  assert.deepEqual(aiRequests, []);
  let files = 0;
  const forbidden = [
    secret,
    password,
    passwordHash,
    ...Object.entries(local)
      .filter(
        ([key, value]) =>
          /SECRET|TOKEN|PASSWORD|OPENAI_API_KEY/.test(key) &&
          value.length >= 16,
      )
      .map(([, value]) => value),
  ];
  const walk = async (dir: URL) => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('._')) continue;
      const path = new URL(entry.name + (entry.isDirectory() ? '/' : ''), dir);
      if (entry.isDirectory()) await walk(path);
      else if (entry.name.endsWith('.js')) {
        const text = await readFile(path, 'utf8');
        assert.ok(
          forbidden.every((value) => !text.includes(value)),
          'A private credential leaked into client JavaScript.',
        );
        files++;
      }
    }
  };
  await walk(new URL('../.next/static/', import.meta.url));
  const result = {
    passed: true,
    productionBuild: true,
    usernamePasswordLogin: true,
    wrongPasswordRejected: true,
    sessionSurvivesReload: true,
    signedApi: 200,
    unsignedApi: 401,
    crossOrigin: crossOrigin.status,
    logoutClearsCookie: true,
    topics: 5,
    actualRedis,
    clientJavaScriptFilesScanned: files,
    secretsFound: 0,
    aiRequests,
    errors,
    desktop: '1440x900 @ DPR2',
    mobile: '390x844 @ DPR2',
    deployed: false,
  };
  await writeFile(
    new URL('results.json', out),
    JSON.stringify(result, null, 2),
  );
  await writeFile(
    new URL('../evidence/production-results.json', import.meta.url),
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result));
} finally {
  await browser?.close();
  proc.kill('SIGTERM');
  if (!actualRedis)
    await new Promise<void>((resolve) => mock.close(() => resolve()));
}
