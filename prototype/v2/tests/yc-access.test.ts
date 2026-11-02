import { beforeAll, beforeEach, afterEach, expect, it, vi } from 'vitest';
import { createHmac } from 'node:crypto';
import {
  hashPreviewPassword,
  verifyPreviewPassword,
} from '../server/preview-credentials';
import {
  identity,
  unlock,
  logout,
  accessReady,
  consume,
} from '../server/access';
import { handleV2 } from '../server/handler';

const username = 'yc-reviewer',
  password = 'A-test-only-reviewer-password',
  signingKey = 'test-session-key-'.repeat(4);
let hash: string, replacementHash: string;
beforeAll(async () => {
  hash = await hashPreviewPassword(password);
  replacementHash = await hashPreviewPassword('A-different-test-password');
});
beforeEach(() => {
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('PETROS_V2_ACCESS_SECRET', signingKey);
  vi.stubEnv('PETROS_V2_YC_USERNAME', username);
  vi.stubEnv('PETROS_V2_YC_PASSWORD_HASH', hash);
  vi.stubEnv('UPSTASH_REDIS_REST_URL', '');
  vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '');
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
const request = (
  user = username,
  pass = password,
  origin = 'https://petros.test',
) =>
  new Request('https://petros.test/prototype/api/login', {
    method: 'POST',
    headers: {
      host: 'petros.test',
      origin,
      'Content-Type': 'application/x-www-form-urlencoded',
      'x-nf-client-connection-ip': '203.0.113.25',
    },
    body: new URLSearchParams({ username: user, password: pass }),
  });
const cookie = (response: Response) =>
  response.headers.get('set-cookie')!.split(';')[0];
it('verifies a salted password hash and rejects malformed hashes', async () => {
  expect(hash).not.toContain(password);
  expect(await verifyPreviewPassword(password, hash)).toBe(true);
  expect(await verifyPreviewPassword('a-wrong-test-password', hash)).toBe(
    false,
  );
  expect(await verifyPreviewPassword(password, 'pbkdf2-sha256:1:bad')).toBe(
    false,
  );
});
it('logs in with a username and creates private, eight-hour HTTPS cookies', async () => {
  const response = await unlock(request('YC-Reviewer'));
  expect(response.status).toBe(303);
  expect(response.headers.get('Location')).toBe('/prototype');
  const value = response.headers.get('set-cookie')!;
  expect(value).toMatch(/HttpOnly; SameSite=Strict; Max-Age=28800; Secure/);
  expect(value).not.toContain(password);
  expect(value).not.toContain(username);
  expect(identity(new Headers({ cookie: cookie(response) }))).toBeTruthy();
});
it.each([
  [username, 'incorrect-test-password'],
  ['different-user', password],
  [username, signingKey],
  [username, 'é'.repeat(40)],
])(
  'rejects mismatched credentials with the same response: %s',
  async (user, pass) => {
    const response = await unlock(request(user, pass));
    expect(response.headers.get('Location')).toBe('/prototype?retry=1');
    expect(response.headers.get('set-cookie')).toBeNull();
  },
);
it('cannot use the legacy passphrase as a bypass once the YC account is configured', async () => {
  const r = request();
  const response = await unlock(
    new Request(r.url, {
      method: 'POST',
      headers: r.headers,
      body: new URLSearchParams({ secret: signingKey }),
    }),
  );
  expect(response.headers.get('set-cookie')).toBeNull();
});
it('uses the same account budget across different sessions', async () => {
  const a = cookie(await unlock(request())),
    b = cookie(await unlock(request()));
  expect(a).not.toBe(b);
  expect(identity(new Headers({ cookie: a }))).toBe(
    identity(new Headers({ cookie: b })),
  );
});
it('password rotation and session expiry invalidate cookies', async () => {
  const value = cookie(await unlock(request()));
  vi.stubEnv('PETROS_V2_YC_PASSWORD_HASH', replacementHash);
  expect(identity(new Headers({ cookie: value }))).toBeNull();
  vi.stubEnv('PETROS_V2_YC_PASSWORD_HASH', hash);
  vi.useFakeTimers();
  vi.setSystemTime(Date.now() + 9 * 3600_000);
  expect(identity(new Headers({ cookie: value }))).toBeNull();
});
it('rejects old-format cookie signatures and partial YC configuration', async () => {
  const parts = cookie(await unlock(request()))
    .split('=')[1]
    .split('.');
  const oldMac = createHmac('sha256', signingKey)
    .update(`petros-v2:${parts[0]}.${parts[1]}`)
    .digest('hex');
  expect(
    identity(
      new Headers({ cookie: `petros_v2=${parts[0]}.${parts[1]}.${oldMac}` }),
    ),
  ).toBeNull();
  vi.stubEnv('PETROS_V2_YC_PASSWORD_HASH', '');
  expect(accessReady()).toBe(false);
  expect((await unlock(request())).status).toBe(503);
});
it('checks origin before consuming a login budget or verifying a password', async () => {
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  expect(
    (
      await handleV2(request(username, password, 'https://foreign.test'), [
        'login',
      ])
    ).status,
  ).toBe(403);
  expect(fetch).not.toHaveBeenCalled();
});
it('fails closed when Redis is missing and shows a usable login error', async () => {
  const response = await handleV2(request(), ['login']);
  expect(response.headers.get('Location')).toBe('/prototype?retry=unavailable');
  expect(response.headers.get('set-cookie')).toBeNull();
});
it('uses Redis login budgets and rejects exhausted or malformed results', async () => {
  vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://example.upstash.io');
  vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'test-only-token');
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(Response.json([{ result: 1 }, { result: 1 }]))
    .mockResolvedValueOnce(Response.json([{ result: 16 }, { result: 1 }]))
    .mockResolvedValueOnce(
      Response.json([{ error: 'unavailable' }, { result: 1 }]),
    );
  vi.stubGlobal('fetch', fetch);
  expect(
    (await handleV2(request(), ['login'])).headers.get('set-cookie'),
  ).toBeTruthy();
  expect((await handleV2(request(), ['login'])).headers.get('Location')).toBe(
    '/prototype?retry=rate-limit',
  );
  await expect(consume('test', 'unlock')).rejects.toThrow(
    'Usage accounting unavailable',
  );
});
it('sign out expires the cookie and rejects cross-origin requests', () => {
  const response = logout(request());
  expect(response.status).toBe(303);
  expect(response.headers.get('set-cookie')).toContain(
    'petros_v2=; Path=/prototype; HttpOnly; SameSite=Strict; Max-Age=0; Secure',
  );
  expect(
    logout(request(username, password, 'https://foreign.test')).status,
  ).toBe(403);
});
