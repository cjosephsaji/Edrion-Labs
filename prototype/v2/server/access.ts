import {
  createHmac,
  timingSafeEqual,
  createHash,
  randomUUID,
} from 'node:crypto';
import {
  validPasswordHash,
  verifyPreviewPassword,
} from './preview-credentials';
const cookieName = 'petros_v2';
const equal = (a: string, b: string) => {
  const x = Buffer.from(a),
    y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};
function secret() {
  return process.env.PETROS_V2_ACCESS_SECRET ?? '';
}
export function previewAccount() {
  const username =
    process.env.PETROS_V2_YC_USERNAME?.trim().toLowerCase() ?? '';
  const passwordHash = process.env.PETROS_V2_YC_PASSWORD_HASH ?? '';
  const requested = !!(username || passwordHash);
  return {
    username,
    passwordHash,
    requested,
    valid:
      /^[a-z0-9][a-z0-9._-]{2,63}$/.test(username) &&
      validPasswordHash(passwordHash),
  };
}
export function accessReady() {
  const account = previewAccount();
  return secret().length >= 32 && (!account.requested || account.valid);
}
function sign(s: string) {
  const account = previewAccount();
  return createHmac('sha256', secret())
    .update(
      account.requested
        ? `petros-v2:yc:${account.username}:${account.passwordHash}:${s}`
        : 'petros-v2:' + s,
    )
    .digest('hex');
}
export function localAccess(h: Headers) {
  return (
    process.env.NODE_ENV === 'development' &&
    process.env.PETROS_V2_LOCAL_ONLY === '1' &&
    /^(127\.0\.0\.1|localhost)(:\d+)?$/.test(h.get('host') ?? '') &&
    (!h.has('x-forwarded-host') ||
      /^(127\.0\.0\.1|localhost)(:\d+)?$/.test(h.get('x-forwarded-host') ?? ''))
  );
}
export function identity(h: Headers): string | null {
  if (localAccess(h)) return 'local-development';
  if (!accessReady()) return null;
  const token = h
    .get('cookie')
    ?.split(';')
    .map((s) => s.trim())
    .find((s) => s.startsWith(cookieName + '='))
    ?.slice(cookieName.length + 1);
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [id, expires, mac] = parts;
  if (
    !/^[a-f0-9-]{36}$/.test(id ?? '') ||
    !/^\d{13}$/.test(expires ?? '') ||
    !mac ||
    !Number.isFinite(+expires) ||
    +expires < Date.now() ||
    +expires > Date.now() + 8 * 3600_000
  )
    return null;
  return equal(mac, sign(`${id}.${expires}`))
    ? createHash('sha256')
        .update(
          previewAccount().requested ? `yc:${previewAccount().username}` : id,
        )
        .digest('hex')
    : null;
}
export async function unlock(r: Request) {
  if (!accessReady())
    return new Response('Preview access is not configured on the server.', {
      status: 503,
    });
  if (!sameOrigin(r)) return new Response(null, { status: 403 });
  const text = await r.text();
  if (text.length > 1024) return new Response(null, { status: 413 });
  const form = new URLSearchParams(text),
    account = previewAccount();
  let valid: boolean;
  if (account.requested) {
    const username = (form.get('username') ?? '').trim().toLowerCase();
    const password = form.get('password') ?? '';
    // Check the password even when the username differs; failure messages are identical.
    const passwordMatches = await verifyPreviewPassword(
      password,
      account.passwordHash,
    );
    valid =
      equal(
        createHash('sha256').update(username).digest('hex'),
        createHash('sha256').update(account.username).digest('hex'),
      ) && passwordMatches;
  } else valid = equal(form.get('secret') ?? '', secret());
  if (!valid)
    return new Response(null, {
      status: 303,
      headers: { Location: '/prototype?retry=1' },
    });
  const id = randomUUID(),
    expires = Date.now() + 8 * 3600_000,
    token = `${id}.${expires}`;
  return new Response(null, {
    status: 303,
    headers: {
      Location: '/prototype',
      'Set-Cookie': `${cookieName}=${token}.${sign(token)}; Path=/prototype; HttpOnly; SameSite=Strict; Max-Age=28800${new URL(r.url).protocol === 'https:' ? '; Secure' : ''}`,
      'Cache-Control': 'no-store',
    },
  });
}
export function sameOrigin(r: Request) {
  const origin = r.headers.get('origin');
  if (!origin) return false;
  try {
    return new URL(origin).host === r.headers.get('host');
  } catch {
    return false;
  }
}
export function logout(r: Request) {
  if (!sameOrigin(r)) return new Response(null, { status: 403 });
  return new Response(null, {
    status: 303,
    headers: {
      Location: '/prototype',
      'Set-Cookie': `${cookieName}=; Path=/prototype; HttpOnly; SameSite=Strict; Max-Age=0${new URL(r.url).protocol === 'https:' ? '; Secure' : ''}`,
      'Cache-Control': 'no-store',
    },
  });
}
const counters = new Map<string, { count: number; expires: number }>();
/** Production fails closed without a shared Redis counter: instance-local limits are insufficient on Vercel. */
export async function consume(
  user: string,
  kind: 'teacher' | 'voice' | 'unlock' | 'speech',
) {
  const max =
      kind === 'voice'
        ? 3
        : kind === 'unlock'
          ? 15
          : kind === 'speech'
            ? 120
            : 40,
    key = `petros:v2:${kind}:${user}:${Math.floor(Date.now() / 3600000)}`;
  const url = process.env.UPSTASH_REDIS_REST_URL,
    token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) {
    const r = await fetch(`${url}/pipeline`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify([
        ['INCR', key],
        ['EXPIRE', key, 3600],
      ]),
      signal: AbortSignal.timeout(5000),
      cache: 'no-store',
    });
    if (!r.ok) throw Error('Usage accounting unavailable.');
    const result = await r.json();
    if (
      !Array.isArray(result) ||
      !Number.isInteger(result[0]?.result) ||
      result[0].result < 1 ||
      result[1]?.result !== 1
    )
      throw Error('Usage accounting unavailable.');
    if (result[0].result > max) throw Error('Hourly usage limit reached.');
    return;
  }
  if (process.env.NODE_ENV === 'production')
    throw Error('Production requires shared usage accounting (Upstash Redis).');
  for (const [k, v] of counters) if (v.expires < Date.now()) counters.delete(k);
  const counter = counters.get(key) ?? {
    count: 0,
    expires: Date.now() + 3600000,
  };
  counter.count++;
  counters.set(key, counter);
  if (counter.count > max) throw Error('Hourly usage limit reached.');
}
