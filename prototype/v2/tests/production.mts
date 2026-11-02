import { spawn } from 'node:child_process';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { writeFile, readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url),
  secret = randomBytes(32).toString('hex'),
  base = 'http://127.0.0.1:3023';
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
      PETROS_V2_ACCESS_SECRET: secret,
      UPSTASH_REDIS_REST_URL: '',
      UPSTASH_REDIS_REST_TOKEN: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  },
);
try {
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(Error('Production server did not start.')),
      15000,
    );
    proc.stdout!.on('data', (data) => {
      if (String(data).includes('Ready')) {
        clearTimeout(timer);
        resolve();
      }
    });
    proc.on('error', reject);
  });
  const privatePage = await fetch(base + '/prototype');
  assert.ok((await privatePage.text()).includes('Preview passphrase'));
  const unsigned = await fetch(base + '/prototype/api/status');
  assert.equal(unsigned.status, 401);
  const token = randomUUID() + '.' + (Date.now() + 3600000),
    mac = createHmac('sha256', secret)
      .update('petros-v2:' + token)
      .digest('hex'),
    cookie = 'petros_v2=' + token + '.' + mac;
  const signed = await fetch(base + '/prototype/api/status', {
    headers: { cookie },
  });
  assert.equal(signed.status, 200);
  const noQuota = await fetch(base + '/prototype/api/teacher', {
    method: 'POST',
    headers: { cookie, origin: base, 'Content-Type': 'application/json' },
    body: '{}',
  });
  assert.equal(noQuota.status, 429);
  assert.match((await noQuota.json()).error, /shared usage accounting/);
  const crossOrigin = await fetch(base + '/prototype/api/teacher', {
    method: 'POST',
    headers: {
      cookie,
      origin: 'https://foreign.test',
      'Content-Type': 'application/json',
    },
    body: '{}',
  });
  assert.equal(crossOrigin.status, 403);
  const rootEnv = await readFile(
      new URL('../../../.env', import.meta.url),
      'utf8',
    ).catch(() => ''),
    key = rootEnv
      .split('\n')
      .find((x) => x.startsWith('OPENAI_API_KEY='))
      ?.split('=')
      .slice(1)
      .join('=')
      .trim()
      .replace(/^['"]|['"]$/g, '');
  let files = 0;
  const walk = async (dir: URL) => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('._')) continue;
      const path = new URL(entry.name + (entry.isDirectory() ? '/' : ''), dir);
      if (entry.isDirectory()) await walk(path);
      else if (entry.name.endsWith('.js')) {
        const text = await readFile(path, 'utf8');
        assert.ok(
          !key || !text.includes(key),
          'Server API key leaked into client bundle.',
        );
        assert.ok(
          !text.includes(secret),
          'Access secret leaked into client bundle.',
        );
        files++;
      }
    }
  };
  await walk(new URL('../.next/static/', import.meta.url));
  const result = {
    passed: true,
    productionBuild: true,
    privatePage: true,
    unsignedApi: unsigned.status,
    signedApi: signed.status,
    missingSharedBudget: noQuota.status,
    crossOrigin: crossOrigin.status,
    clientJavaScriptFilesScanned: files,
    secretsFound: 0,
    deployed: false,
  };
  await writeFile(
    new URL('../evidence/production-results.json', import.meta.url),
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result));
} finally {
  proc.kill('SIGTERM');
}
