import { describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import { schema, type InstitutionUser, type SQL } from '@edrion/database';
import { hashToken, verifyPassword } from '../authentication/password.util';
import { PortalCredentialService } from './portal-credential.service';

const SECRET = 'test-secret',
  EMAIL = 'admin@example.com',
  RAW = 'raw-reset-token';
const user = (id: string, overrides: Partial<InstitutionUser> = {}) =>
  ({
    id,
    institutionId: `school-${id}`,
    email: EMAIL,
    fullName: 'Alex',
    status: 'active',
    disabledAt: null,
    metadata: { portalCredentialGroupId: 'account-a' },
    passwordHash: 'previous-hash',
    passwordResetTokenHash: hashToken(RAW, SECRET),
    passwordResetExpiresAt: new Date(Date.now() + 600000),
    ...overrides,
  }) as InstitutionUser;

function harness(failRevocation = false) {
  let users = [
    user('a'),
    user('b'),
    user('disabled', { status: 'disabled' as InstitutionUser['status'], disabledAt: new Date() }),
    user('legacy', { metadata: {}, passwordResetTokenHash: null }),
  ];
  let sessions = users.map((member) => ({
    institutionUserId: member.id,
    revokedAt: null as Date | null,
    revokedReason: null as string | null,
  }));
  const dialect = new PgDialect();
  const db = {
    select: () => {
      let params: unknown[] = [];
      const query = {
        from: () => query,
        where: (condition: SQL) => {
          params = dialect.sqlToQuery(condition).params;
          return query;
        },
        orderBy: () => query,
        limit: async () =>
          users
            .filter(
              (u) =>
                u.status === 'active' &&
                !u.disabledAt &&
                u.passwordResetTokenHash === params[1] &&
                u.passwordResetExpiresAt! > new Date(),
            )
            .slice(0, 1),
        for: async () => users.filter((u) => u.email === params[0]),
      };
      return query;
    },
    update: (table: unknown) => ({
      set: (values: Record<string, unknown>) => ({
        where: async (condition: SQL) => {
          const ids = dialect.sqlToQuery(condition).params;
          if (table === schema.institutionUsers)
            users = users.map((u) =>
              ids.includes(u.id) ? ({ ...u, ...values } as InstitutionUser) : u,
            );
          if (table === schema.portalSessions) {
            if (failRevocation) throw new Error('revocation failed');
            sessions = sessions.map((s) =>
              ids.includes(s.institutionUserId) ? ({ ...s, ...values } as typeof s) : s,
            );
          }
        },
      }),
    }),
    transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
      const originalUsers = structuredClone(users),
        originalSessions = structuredClone(sessions);
      try {
        return await fn(db);
      } catch (err) {
        users = originalUsers;
        sessions = originalSessions;
        throw err;
      }
    }),
  };
  const audit = { logAudit: vi.fn() },
    emails = { sendPasswordReset: vi.fn() };
  const auth = {
    loadAllActiveByEmail: vi.fn(async () =>
      users.filter((u) => u.status === 'active' && !u.disabledAt),
    ),
    institutionNames: vi.fn(
      async () => new Map(users.map((u) => [u.institutionId, `School ${u.id}`])),
    ),
  };
  const service = new PortalCredentialService(
    db as never,
    audit as never,
    { SESSION_COOKIE_SECRET: SECRET, PORTAL_WEB_URL: 'https://portal.example.com' } as never,
    auth as never,
    {} as never,
    emails as never,
  );
  return { service, users: () => users, sessions: () => sessions, audit, emails, db };
}

describe('shared credentials for memberships linked during approval', () => {
  it('sends one reset email per linked account, retaining a separate link for legacy credentials', async () => {
    const h = harness();
    await h.service.forgotPassword({ email: EMAIL }, {} as never);
    expect(h.emails.sendPasswordReset).toHaveBeenCalledTimes(2);
    const calls = h.emails.sendPasswordReset.mock.calls as unknown as string[][];
    expect(calls[0]![3]).toBe('School a, School b');
    expect(calls[1]![3]).toBe('School legacy');
    expect(h.users()[0]!.passwordResetTokenHash).toBe(h.users()[1]!.passwordResetTokenHash);
    expect(h.users()[3]!.passwordResetTokenHash).not.toBe(h.users()[0]!.passwordResetTokenHash);
  });

  it('resets all explicitly linked credentials and revokes their sessions, without reactivating disabled memberships', async () => {
    const h = harness();
    await h.service.resetPassword({ token: RAW, password: 'NewPassword123!' }, {} as never);
    for (const member of h.users().filter((u) => u.id !== 'legacy')) {
      expect(await verifyPassword('NewPassword123!', member.passwordHash)).toBe(true);
      expect(member.passwordResetTokenHash).toBeNull();
    }
    expect(h.users()[2]!.status).toBe('disabled');
    expect(h.users()[2]!.disabledAt).toBeInstanceOf(Date);
    expect(h.users()[3]!.passwordHash).toBe('previous-hash');
    expect(
      h
        .sessions()
        .filter((s) => s.institutionUserId !== 'legacy')
        .every((s) => s.revokedReason === 'password_reset'),
    ).toBe(true);
    expect(h.sessions()[3]!.revokedAt).toBeNull();
    expect(h.audit.logAudit).toHaveBeenCalledTimes(3);
    await expect(
      h.service.resetPassword({ token: RAW, password: 'AnotherPassword123!' }, {} as never),
    ).rejects.toMatchObject({ response: { code: 'INVALID_TOKEN' } });
  });

  it('rolls back the password change if session revocation fails', async () => {
    const h = harness(true);
    await expect(
      h.service.resetPassword({ token: RAW, password: 'NewPassword123!' }, {} as never),
    ).rejects.toThrow('revocation failed');
    expect(h.users()[0]!.passwordHash).toBe('previous-hash');
    expect(h.users()[0]!.passwordResetTokenHash).toBe(hashToken(RAW, SECRET));
    expect(h.audit.logAudit).not.toHaveBeenCalled();
  });

  it('rejects an invalid token before changing any credentials', async () => {
    const h = harness();
    await expect(
      h.service.resetPassword({ token: 'wrong', password: 'NewPassword123!' }, {} as never),
    ).rejects.toMatchObject({ response: { code: 'INVALID_TOKEN' } });
    expect(h.users()[0]!.passwordHash).toBe('previous-hash');
  });
});
