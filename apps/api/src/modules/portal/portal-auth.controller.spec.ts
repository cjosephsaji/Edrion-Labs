import { describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';
import { PortalAuthController } from './portal-auth.controller';

function build(result: Record<string, unknown> = { token: 'session-token' }) {
  const login = {
    login: vi.fn(async () => result),
    selectionCookieName: 'portal_selection',
    institutions: vi.fn(),
    selectInstitution: vi.fn(async () => ({ token: 'new-session' })),
    logout: vi.fn(),
  };
  const sessions = {
    cookieName: 'portal_session',
    cookieOptions: () => ({ httpOnly: true, sameSite: 'lax', path: '/', maxAge: 3600000 }),
    clearCookieOptions: () => ({ httpOnly: true, sameSite: 'lax', path: '/' }),
  };
  const res = { cookie: vi.fn(), clearCookie: vi.fn() };
  const controller = new PortalAuthController(
    login as never,
    {} as never,
    sessions as never,
    {} as never,
    {} as never,
  );
  return {
    controller,
    login,
    res: res as unknown as Response,
    cookie: res.cookie,
    clearCookie: res.clearCookie,
  };
}

describe('portal institution selection cookies', () => {
  it('returns a chooser requirement and a short-lived HTTP-only ticket instead of a tenant session', async () => {
    const { controller, cookie, clearCookie, res } = build({ selectionToken: 'pending-ticket' });
    expect(
      await controller.loginHandler(
        { email: 'admin@example.com', password: 'secret' },
        {} as never,
        res,
      ),
    ).toEqual({ authenticated: false, requiresInstitutionSelection: true });
    expect(clearCookie).toHaveBeenCalledWith('portal_session', expect.anything());
    expect(cookie).toHaveBeenCalledTimes(1);
    expect(cookie).toHaveBeenCalledWith(
      'portal_selection',
      'pending-ticket',
      expect.objectContaining({ httpOnly: true, maxAge: 300000 }),
    );
  });

  it('clears any pending ticket on direct login', async () => {
    const { controller, cookie, clearCookie, res } = build();
    expect(
      await controller.loginHandler(
        { email: 'admin@example.com', password: 'secret' },
        {} as never,
        res,
      ),
    ).toEqual({ authenticated: true });
    expect(cookie).toHaveBeenCalledWith(
      'portal_session',
      'session-token',
      expect.objectContaining({ httpOnly: true }),
    );
    expect(clearCookie).toHaveBeenCalledWith('portal_selection', expect.anything());
  });

  it('passes cookie credentials to discovery and replaces the session after selection', async () => {
    const { controller, login, cookie, clearCookie, res } = build();
    const req = {
      headers: { cookie: 'other=value; portal_session=current; portal_selection=pending' },
    } as Request;
    await controller.institutionsHandler(req);
    expect(login.institutions).toHaveBeenCalledWith('current', 'pending');
    const body = { institutionUserId: '00000000-0000-4000-8000-000000000001' };
    await controller.selectInstitutionHandler(body, req, {} as never, res);
    expect(login.selectInstitution).toHaveBeenCalledWith(body, {}, 'current', 'pending');
    expect(cookie).toHaveBeenCalledWith('portal_session', 'new-session', expect.anything());
    expect(clearCookie).toHaveBeenCalledWith('portal_selection', expect.anything());
  });
});
