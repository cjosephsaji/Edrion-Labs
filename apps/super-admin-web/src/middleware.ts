import { NextResponse, type NextRequest } from 'next/server';

/**
 * Auth gate for the super-admin control plane. Now that auth is cookie-only (AUTH_DEV_HEADER off),
 * a request without a session cookie has no identity — so bounce it to /login instead of letting
 * the app shell render and 401 on every data call. Only checks cookie PRESENCE; the API still
 * verifies/expires the session on each request. /login and Next internals are always allowed.
 */
const SESSION_COOKIE = 'edrion_session';

export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  if (
    pathname === '/login' ||
    pathname === '/forgot-password' ||
    pathname === '/reset-password'
  ) {
    return NextResponse.next();
  }

  if (req.cookies.has(SESSION_COOKIE)) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = '/login';
  url.search = `?next=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(url);
}

// Run on everything except Next internals and static assets (favicon, images, etc.).
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)'],
};
