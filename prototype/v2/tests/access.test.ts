import { it, expect, vi, afterEach } from 'vitest';
import { identity, unlock, consume } from '../server/access';
import { handleV2 } from '../server/handler';
afterEach(() => vi.unstubAllEnvs());
it('private API rejects missing authentication before provider work', async () => {
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('PETROS_V2_ACCESS_SECRET', 'a'.repeat(32));
  const r = await handleV2(
    new Request('https://petros.test/prototype/api/teacher', {
      method: 'POST',
      body: '{}',
    }),
    ['teacher'],
  );
  expect(r.status).toBe(401);
});
it('signed access cookie expires and cannot be forged', async () => {
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('PETROS_V2_ACCESS_SECRET', 'a'.repeat(32));
  const r = await unlock(
    new Request('https://petros.test/prototype/api/unlock', {
      method: 'POST',
      headers: { host: 'petros.test', origin: 'https://petros.test' },
      body: new URLSearchParams({ secret: 'a'.repeat(32) }),
    }),
  );
  expect(r.status).toBe(303);
  const cookie = r.headers.get('set-cookie')!;
  expect(cookie).toContain('HttpOnly');
  expect(cookie).toContain('Secure');
  expect(identity(new Headers({ cookie }))).toBeTruthy();
  expect(
    identity(
      new Headers({ cookie: cookie.replace('petros_v2=', 'petros_v2=forged') }),
    ),
  ).toBeNull();
});
it('Unicode passphrase mismatches cannot crash constant-time comparison', async () => {
  vi.stubEnv('PETROS_V2_ACCESS_SECRET', 'a'.repeat(32));
  const r = await unlock(
    new Request('https://petros.test/prototype/api/unlock', {
      method: 'POST',
      headers: { host: 'petros.test', origin: 'https://petros.test' },
      body: new URLSearchParams({ secret: 'é'.repeat(32) }),
    }),
  );
  expect(r.status).toBe(303);
  expect(r.headers.get('set-cookie')).toBeNull();
});
it('production requires distributed budgets', async () => {
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('UPSTASH_REDIS_REST_URL', '');
  vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '');
  await expect(consume('test', 'teacher')).rejects.toThrow(
    'shared usage accounting',
  );
});
it('cross-origin state-changing requests fail closed', async () => {
  vi.stubEnv('NODE_ENV', 'development');
  vi.stubEnv('PETROS_V2_LOCAL_ONLY', '1');
  const r = await handleV2(
    new Request('http://127.0.0.1:3022/prototype/api/teacher', {
      method: 'POST',
      headers: { host: '127.0.0.1:3022', origin: 'https://foreign.test' },
      body: '{}',
    }),
    ['teacher'],
  );
  expect(r.status).toBe(403);
});
it('local bypass is disabled in production and rejects forwarded hosts', () => {
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('PETROS_V2_LOCAL_ONLY', '1');
  expect(identity(new Headers({ host: 'localhost:3022' }))).toBeNull();
  vi.stubEnv('NODE_ENV', 'development');
  expect(
    identity(
      new Headers({
        host: 'localhost:3022',
        'x-forwarded-host': 'foreign.test',
      }),
    ),
  ).toBeNull();
});
