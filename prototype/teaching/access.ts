/** Showcase access never relaxes the student API's authentication. Local mode requires a loopback-bound server. */
export async function showcaseAccess(headers: Headers): Promise<boolean> {
  if (process.env.PETROS_SHOWCASE_ENABLED !== '1') return false;
  if (
    process.env.PETROS_SHOWCASE_LOCAL_ONLY === '1' &&
    process.env.NODE_ENV !== 'production'
  ) {
    return (
      /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(headers.get('host') ?? '') &&
      (!headers.has('x-forwarded-host') ||
        /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(
          headers.get('x-forwarded-host') ?? '',
        ))
    );
  }
  const cookie = headers.get('cookie');
  if (!cookie) return false;
  try {
    const base =
      process.env.NEXT_PUBLIC_API_BASE_URL ??
      process.env.NEXT_PUBLIC_API_URL ??
      'http://localhost:3007';
    const r = await fetch(`${base.replace(/\/$/, '')}/v1/student/me`, {
      headers: { cookie },
      cache: 'no-store',
      signal: AbortSignal.timeout(4000),
    });
    return r.ok;
  } catch {
    return false;
  }
}
