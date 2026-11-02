import {
  createHmac,
  timingSafeEqual,
  createHash,
  randomUUID,
} from 'node:crypto';
const cookieName = 'petros_v2';
const equal = (a: string, b: string) => {
  const x = Buffer.from(a),
    y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};
function secret() {
  return process.env.PETROS_V2_ACCESS_SECRET ?? '';
}
function sign(s: string) {
  return createHmac('sha256', secret())
    .update('petros-v2:' + s)
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
  if (secret().length < 32) return null;
  const token = h
    .get('cookie')
    ?.split(';')
    .map((s) => s.trim())
    .find((s) => s.startsWith(cookieName + '='))
    ?.slice(cookieName.length + 1);
  if (!token) return null;
  const [id, expires, mac] = token.split('.');
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
    ? createHash('sha256').update(id).digest('hex')
    : null;
}
export async function unlock(r: Request) {
  if (secret().length < 32)
    return new Response('Set PETROS_V2_ACCESS_SECRET on the server.', {
      status: 503,
    });
  if (
    !r.headers.get('origin') ||
    new URL(r.headers.get('origin')!).host !== r.headers.get('host')
  )
    return new Response(null, { status: 403 });
  const text = await r.text();
  if (text.length > 1024) return new Response(null, { status: 413 });
  const pass = new URLSearchParams(text).get('secret') ?? '';
  if (!equal(pass, secret()))
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
    if (typeof result[0]?.result !== 'number' || result[0].result > max)
      throw Error('Hourly usage limit reached.');
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
