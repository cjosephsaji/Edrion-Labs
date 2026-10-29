import { describe, expect, it, vi } from 'vitest';
import type { InstitutionUser } from '@edrion/database';
import type { ApiEnv } from '@edrion/config';
import type { EdrionRequestContext } from '../../common/request-context';
import { signHs256 } from '../../common/jwt';
import { hashPassword } from '../authentication/password.util';
import { PortalAuthLoginService } from './portal-auth-login.service';
import type { PortalAuthService } from './portal-auth.service';
import type { IssuePortalSessionInput, PortalSessionService } from './portal-session.service';
import type { SupabaseVerifier } from '../authentication/supabase-verifier';

const REQ: EdrionRequestContext = {
  requestId: 'r1',
  correlationId: 'c1',
  apiEndpoint: '/portal/auth/login',
};
const SECRET = 'test-session-secret';
const user = (id: string, overrides: Partial<InstitutionUser> = {}) =>
  ({
    id,
    institutionId: `institution-${id}`,
    email: 'admin@example.com',
    fullName: 'Admin',
    status: 'active',
    disabledAt: null,
    passwordHash: null,
    authUserId: null,
    mfaEnrolled: false,
    requireMfa: false,
    failedLoginAttempts: 0,
    lockedUntil: null,
    sessionsRevokedAt: null,
    ...overrides,
  }) as InstitutionUser;

function build(users: InstitutionUser[], devLogin = false) {
  const active = () => users.filter((u) => u.status === 'active' && !u.disabledAt);
  const auth = {
    loadAllActiveByEmail: vi.fn(async () => active()),
    loadAllActiveByAuthUserId: vi.fn(async (id: string) =>
      active().filter((u) => u.authUserId === id),
    ),
    loadActiveById: vi.fn(async (id: string) => active().find((u) => u.id === id)),
    institutionNames: vi.fn(
      async () => new Map(users.map((u) => [u.institutionId, `School ${u.id}`])),
    ),
    isLocked: vi.fn((u: InstitutionUser) => Boolean(u.lockedUntil && u.lockedUntil > new Date())),
    markLoginSuccess: vi.fn(),
    registerFailedLogin: vi.fn(),
  };
  const live = new Map<string, Record<string, unknown>>();
  const sessions = {
    cookieName: 'portal_session',
    issue: vi.fn(async (input: IssuePortalSessionInput) => {
      const id = `session-${live.size + 1}`;
      const session = {
        ...input,
        id,
        lastAuthAt: input.lastAuthAt ?? new Date(),
        expiresAt: input.expiresAt ?? new Date(Date.now() + 3_600_000),
      };
      const token = signHs256(
        { sid: id, uid: input.institutionUserId, membershipProofs: input.membershipProofs },
        SECRET,
        3600,
      );
      live.set(token, session);
      return { token, session };
    }),
    verify: vi.fn(async (token: string) => {
      const session = live.get(token);
      if (!session || session.revoked) throw new Error('Invalid session');
      return session;
    }),
    revoke: vi.fn(async (id: string) => {
      for (const session of live.values()) if (session.id === id) session.revoked = true;
    }),
    touchReauth: vi.fn(async (id: string, aal: string) => {
      for (const session of live.values())
        if (session.id === id) {
          session.aal = aal;
          session.lastAuthAt = new Date();
        }
    }),
  };
  const supabase = { verify: vi.fn(() => ({ sub: 'auth-1', aal: 'aal2', session_id: 'idp1' })) };
  const audit = { logAudit: vi.fn(), logSecurity: vi.fn() };
  const env = { SESSION_COOKIE_SECRET: SECRET, PORTAL_AUTH_DEV_LOGIN: devLogin } as ApiEnv;
  const service = new PortalAuthLoginService(
    auth as unknown as PortalAuthService,
    sessions as unknown as PortalSessionService,
    supabase as unknown as SupabaseVerifier,
    audit as never,
    env,
  );
  return { service, auth, sessions, audit, supabase, live };
}

async function pending(service: PortalAuthLoginService, password = 'secret') {
  const result = await service.login({ email: 'admin@example.com', password }, REQ);
  expect(result.selectionToken).toBeTypeOf('string');
  return result.selectionToken!;
}

describe('portal multi-institution identity', () => {
  it('keeps single-institution login direct', async () => {
    const { service, sessions } = build([
      user('a', { passwordHash: await hashPassword('secret') }),
    ]);
    const result = await service.login({ email: 'admin@example.com', password: 'secret' }, REQ);
    expect(result.token).toBeTypeOf('string');
    expect(sessions.issue).toHaveBeenCalledWith(
      expect.objectContaining({ institutionUserId: 'a' }),
    );
  });

  it('authenticates independently salted passwords and waits for an explicit choice', async () => {
    const { service, sessions } = build([
      user('a', { passwordHash: await hashPassword('secret') }),
      user('b', { passwordHash: await hashPassword('secret') }),
    ]);
    const ticket = await pending(service);
    expect(sessions.issue).not.toHaveBeenCalled();
    const choices = await service.institutions(undefined, ticket);
    expect(choices.institutions).toHaveLength(2);
    expect(choices.institutions.every((choice) => !choice.requiresPassword)).toBe(true);
    await service.selectInstitution({ institutionUserId: 'b' }, REQ, undefined, ticket);
    expect(sessions.issue).toHaveBeenCalledWith(
      expect.objectContaining({ institutionUserId: 'b', institutionId: 'institution-b' }),
    );
  });

  it('requires the other institution password instead of granting access by email', async () => {
    const { service, sessions, auth } = build([
      user('a', { passwordHash: await hashPassword('secret') }),
      user('b', { passwordHash: await hashPassword('different') }),
    ]);
    const ticket = await pending(service);
    const choices = await service.institutions(undefined, ticket);
    expect(
      choices.institutions.find((choice) => choice.institutionUserId === 'b')?.requiresPassword,
    ).toBe(true);
    await expect(
      service.selectInstitution({ institutionUserId: 'b' }, REQ, undefined, ticket),
    ).rejects.toMatchObject({ response: { code: 'PASSWORD_REQUIRED' } });
    await expect(
      service.selectInstitution(
        { institutionUserId: 'b', password: 'wrong' },
        REQ,
        undefined,
        ticket,
      ),
    ).rejects.toMatchObject({ response: { code: 'UNAUTHENTICATED' } });
    expect(auth.registerFailedLogin).toHaveBeenCalledWith('b', 0);
    expect(sessions.issue).not.toHaveBeenCalled();
    await service.selectInstitution(
      { institutionUserId: 'b', password: 'different' },
      REQ,
      undefined,
      ticket,
    );
    expect(sessions.issue).toHaveBeenCalledWith(
      expect.objectContaining({ institutionUserId: 'b', aal: 'aal1' }),
    );
  });

  it('rotates and revokes the previous session, preserving expiry and authentication time', async () => {
    const { service, sessions, audit, live } = build([user('a'), user('b')], true);
    const login = await service.login({ email: 'admin@example.com' }, REQ);
    const first = await service.selectInstitution(
      { institutionUserId: 'a' },
      REQ,
      undefined,
      login.selectionToken,
    );
    const firstSession = live.get(first.token)!;
    const second = await service.selectInstitution({ institutionUserId: 'b' }, REQ, first.token);
    expect(second.token).not.toBe(first.token);
    expect(sessions.revoke).toHaveBeenCalledWith(firstSession.id, 'institution_switch');
    expect(sessions.issue).toHaveBeenLastCalledWith(
      expect.objectContaining({
        institutionUserId: 'b',
        expiresAt: firstSession.expiresAt,
        lastAuthAt: firstSession.lastAuthAt,
      }),
    );
    expect(audit.logAudit).toHaveBeenLastCalledWith(
      expect.objectContaining({
        action: 'user.institution_switch',
        institutionId: 'institution-b',
      }),
    );
    await expect(service.institutions(first.token)).rejects.toThrow('Invalid session');
  });

  it('rejects unlinked, disabled and locked memberships and invalidates reset credentials', async () => {
    const users = [
      user('a', { passwordHash: await hashPassword('secret') }),
      user('b', { passwordHash: await hashPassword('secret') }),
    ];
    const { service, sessions } = build(users);
    const ticket = await pending(service);
    await expect(
      service.selectInstitution({ institutionUserId: 'elsewhere' }, REQ, undefined, ticket),
    ).rejects.toMatchObject({ response: { code: 'UNAUTHENTICATED' } });
    users[1]!.status = 'disabled' as InstitutionUser['status'];
    expect((await service.institutions(undefined, ticket)).institutions).toHaveLength(1);
    await expect(
      service.selectInstitution({ institutionUserId: 'b' }, REQ, undefined, ticket),
    ).rejects.toMatchObject({ response: { code: 'UNAUTHENTICATED' } });
    users[1]!.status = 'active' as InstitutionUser['status'];
    users[1]!.lockedUntil = new Date(Date.now() + 60_000);
    await expect(
      service.selectInstitution({ institutionUserId: 'b' }, REQ, undefined, ticket),
    ).rejects.toMatchObject({ response: { code: 'ACCOUNT_LOCKED' } });
    users[1]!.lockedUntil = null;
    users[1]!.passwordHash = await hashPassword('reset');
    await expect(
      service.selectInstitution({ institutionUserId: 'b' }, REQ, undefined, ticket),
    ).rejects.toMatchObject({ response: { code: 'PASSWORD_REQUIRED' } });
    expect(sessions.issue).not.toHaveBeenCalled();
  });

  it('rejects unsigned, expired and wrong-purpose selection tickets', async () => {
    const { service } = build([user('a'), user('b')], true);
    const login = await service.login({ email: 'admin@example.com' }, REQ);
    await expect(service.institutions(undefined, `${login.selectionToken}x`)).rejects.toMatchObject(
      { response: { code: 'UNAUTHENTICATED' } },
    );
    await expect(service.institutions()).rejects.toMatchObject({
      response: { code: 'UNAUTHENTICATED' },
    });
    const expired = signHs256(
      { purpose: 'portal-institution-selection' },
      SECRET,
      1,
      new Date(Date.now() - 60_000),
    );
    await expect(service.institutions(undefined, expired)).rejects.toMatchObject({
      response: { code: 'UNAUTHENTICATED' },
    });
    const wrongPurpose = signHs256({ purpose: 'other', email: 'admin@example.com' }, SECRET, 300);
    await expect(service.institutions(undefined, wrongPurpose)).rejects.toMatchObject({
      response: { code: 'UNAUTHENTICATED' },
    });
  });

  it('enforces the selected membership MFA policy', async () => {
    const { service, sessions } = build([
      user('a', { passwordHash: await hashPassword('secret') }),
      user('b', { passwordHash: await hashPassword('secret'), mfaEnrolled: true }),
    ]);
    const ticket = await pending(service);
    await expect(
      service.selectInstitution({ institutionUserId: 'b' }, REQ, undefined, ticket),
    ).rejects.toMatchObject({ response: { code: 'MFA_REQUIRED' } });
    expect(sessions.issue).not.toHaveBeenCalled();
  });

  it('does not transfer a current membership re-authentication to other memberships', async () => {
    const { service, sessions, live } = build([
      user('a', { passwordHash: await hashPassword('secret'), authUserId: 'auth-1' }),
      user('b', { passwordHash: await hashPassword('secret'), mfaEnrolled: true }),
    ]);
    const ticket = await pending(service);
    const first = await service.selectInstitution(
      { institutionUserId: 'a' },
      REQ,
      undefined,
      ticket,
    );
    await service.reauth(
      { accessToken: 'jwt' },
      live.get(first.token)!.id as string,
      { id: 'a', institutionId: 'institution-a', fullName: 'Admin', mfaEnrolled: false },
      REQ,
    );
    await expect(
      service.selectInstitution({ institutionUserId: 'b' }, REQ, first.token),
    ).rejects.toMatchObject({ response: { code: 'MFA_REQUIRED' } });
    expect(sessions.revoke).not.toHaveBeenCalled();
  });

  it('supports a shared IdP identity and re-authenticates the selected membership', async () => {
    const { service, sessions } = build([
      user('a', { authUserId: 'auth-1' }),
      user('b', { authUserId: 'auth-1', mfaEnrolled: true }),
    ]);
    const login = await service.login({ accessToken: 'jwt' }, REQ);
    await service.selectInstitution(
      { institutionUserId: 'b' },
      REQ,
      undefined,
      login.selectionToken,
    );
    await service.reauth(
      { accessToken: 'jwt' },
      'session-1',
      { id: 'b', institutionId: 'institution-b', fullName: 'Admin', mfaEnrolled: true },
      REQ,
    );
    expect(sessions.touchReauth).toHaveBeenCalledWith('session-1', 'aal2');
  });

  it('keeps email-only login disabled without the development flag', async () => {
    const { service } = build([user('a'), user('b')]);
    await expect(service.login({ email: 'admin@example.com' }, REQ)).rejects.toMatchObject({
      response: { code: 'UNAUTHENTICATED' },
    });
  });
});
