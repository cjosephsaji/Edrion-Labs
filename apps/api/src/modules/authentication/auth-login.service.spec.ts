import { describe, expect, it, vi } from 'vitest';
import { UnauthorizedException } from '@nestjs/common';
import type { PlatformEmployee } from '@edrion/database';
import { AuthLoginService } from './auth-login.service';
import type { AuthService } from './auth.service';
import type { SessionService } from './session.service';
import type { SupabaseVerifier } from './supabase-verifier';

const REQ = {
  requestId: 'r1',
  correlationId: 'c1',
  ip: '127.0.0.1',
  userAgent: 'vitest',
  apiEndpoint: 'POST /auth/login',
};

function employee(over: Partial<PlatformEmployee> = {}): PlatformEmployee {
  return {
    id: 'e1',
    authUserId: 'sub-1',
    email: 'owner@edrion.dev',
    fullName: 'Owner',
    title: null,
    status: 'active',
    mfaEnrolled: true,
    lastLoginAt: null,
    lastAuthAt: null,
    failedLoginAttempts: 0,
    lockedUntil: null,
    avatarUrl: null,
    metadata: {},
    version: 0,
    createdBy: null,
    updatedBy: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  } as PlatformEmployee;
}

function build(opts: { devLogin?: boolean } = {}) {
  const audit = { logAudit: vi.fn(), logSecurity: vi.fn() };
  const auth = {
    isLocked: vi.fn().mockReturnValue(false),
    registerFailedLogin: vi.fn().mockResolvedValue(false),
    markLoginSuccess: vi.fn().mockResolvedValue(undefined),
    findActiveByEmail: vi.fn(),
    findActiveByAuthUserId: vi.fn(),
  };
  const sessions = { issue: vi.fn().mockResolvedValue({ token: 'tok', session: { id: 's1' } }) };
  const supabase = { verify: vi.fn() };
  const env = { AUTH_DEV_LOGIN: opts.devLogin ?? false, AUTH_MAX_FAILED_LOGINS: 5, AUTH_LOCKOUT_SECONDS: 900 };
  const service = new AuthLoginService(
    auth as unknown as AuthService,
    sessions as unknown as SessionService,
    supabase as unknown as SupabaseVerifier,
    audit as never,
    env as never,
  );
  return { service, auth, sessions, supabase, audit };
}

describe('AuthLoginService.login — token path', () => {
  it('issues a session + audits on a valid aal2 token for an MFA employee', async () => {
    const { service, auth, sessions, audit, supabase } = build();
    auth.findActiveByAuthUserId.mockResolvedValue(employee({ mfaEnrolled: true }));
    supabase.verify.mockReturnValue({ sub: 'sub-1', aal: 'aal2', session_id: 'idp1' });

    const out = await service.login({ accessToken: 'jwt' }, REQ);
    expect(out.token).toBe('tok');
    expect(sessions.issue).toHaveBeenCalledWith(expect.objectContaining({ employeeId: 'e1', aal: 'aal2' }));
    expect(auth.markLoginSuccess).toHaveBeenCalledWith('e1');
    expect(audit.logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'employee.login' }));
  });

  it('rejects an aal1 token for an MFA-enrolled employee and counts a failed login', async () => {
    const { service, auth, sessions, supabase } = build();
    auth.findActiveByAuthUserId.mockResolvedValue(employee({ mfaEnrolled: true, failedLoginAttempts: 1 }));
    supabase.verify.mockReturnValue({ sub: 'sub-1', aal: 'aal1' });

    await expect(service.login({ accessToken: 'jwt' }, REQ)).rejects.toMatchObject({
      response: { code: 'MFA_REQUIRED' },
    });
    expect(auth.registerFailedLogin).toHaveBeenCalledWith('e1', 1);
    expect(sessions.issue).not.toHaveBeenCalled();
  });

  it('refuses a locked account before checking credentials', async () => {
    const { service, auth, audit, supabase } = build();
    auth.isLocked.mockReturnValue(true);
    auth.findActiveByAuthUserId.mockResolvedValue(employee());
    supabase.verify.mockReturnValue({ sub: 'sub-1', aal: 'aal2' });

    await expect(service.login({ accessToken: 'jwt' }, REQ)).rejects.toMatchObject({
      response: { code: 'ACCOUNT_LOCKED' },
    });
    expect(audit.logSecurity).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'login_blocked_locked' }));
  });
});

describe('AuthLoginService.login — dev path', () => {
  it('is refused when AUTH_DEV_LOGIN is off', async () => {
    const { service } = build({ devLogin: false });
    await expect(service.login({ email: 'owner@edrion.dev' }, REQ)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('logs in by email when AUTH_DEV_LOGIN is on (simulating completed MFA)', async () => {
    const { service, auth, sessions } = build({ devLogin: true });
    auth.findActiveByEmail.mockResolvedValue(employee({ mfaEnrolled: true }));
    const out = await service.login({ email: 'owner@edrion.dev' }, REQ);
    expect(out.token).toBe('tok');
    expect(sessions.issue).toHaveBeenCalledWith(expect.objectContaining({ aal: 'aal2' }));
  });
});
