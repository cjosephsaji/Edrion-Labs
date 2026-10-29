import { describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import { schema, type InstitutionUser, type SQL } from '@edrion/database';
import type * as DatabaseModule from '@edrion/database';
import type { ApproveRegistrationInput } from '@edrion/schemas';
import type { ActionContext } from '../../common/action-context';
import { hashPassword, verifyPassword } from '../authentication/password.util';
import { RegistrationApprovalService } from './registration-approval.service';

vi.mock('@edrion/database', async (original) => ({
  ...(await original<typeof DatabaseModule>()),
  seedInstitutionScheduleDefaults: vi.fn(),
}));

const EMAIL = 'admin@example.com';
const ctx = {
  principalContext: { principal: { employeeId: 'reviewer', fullName: 'Reviewer', roleKeys: [] } },
  request: { requestId: 'r1', correlationId: 'c1', apiEndpoint: '/registration-requests/approve' },
} as unknown as ActionContext;
const input: ApproveRegistrationInput = {
  version: 1,
  supportTier: 'standard',
  campus: { name: 'Main Campus' },
  admin: {
    email: EMAIL,
    fullName: 'Alex Admin',
    roleKeys: ['institution_owner'],
    credentialDelivery: 'activation',
  },
};
const existing = (overrides: Partial<InstitutionUser> = {}) =>
  ({
    id: 'existing-user',
    institutionId: 'existing-school',
    email: EMAIL,
    fullName: 'Alex',
    status: 'active',
    disabledAt: null,
    passwordHash: null,
    authUserId: null,
    metadata: { existingPreference: 'keep' },
    version: 0,
    mfaEnrolled: false,
    requireMfa: false,
    failedLoginAttempts: 0,
    lockedUntil: null,
    lockedAt: null,
    passwordResetRequiredAt: null,
    activatedAt: new Date('2026-01-01'),
    lastLoginAt: new Date('2026-09-01'),
    directGrants: ['sensitive.permission'],
    directDenies: ['other.permission'],
    ...overrides,
  }) as InstitutionUser;

function harness(users: InstitutionUser[] = [], contactEmail = EMAIL, versionMatches = true) {
  const request = {
    id: 'request',
    status: 'under_review',
    version: 1,
    contactEmail,
    publicRef: 'EDR-REG-2026-000001',
    institutionInfo: { legalName: 'New School', displayName: 'New School', type: 'school' },
    location: { country: 'KW', address: 'School Road', city: 'Kuwait', timezone: 'Asia/Kuwait' },
    primaryContact: { fullName: 'Alex Admin', email: contactEmail },
  };
  const writes: Array<{
    table: unknown;
    values: Record<string, unknown> | Record<string, unknown>[];
  }> = [];
  const dialect = new PgDialect();
  let currentUsers = structuredClone(users);
  const tx = {
    select: () => {
      let table: unknown,
        params: unknown[] = [];
      const query = {
        from: (value: unknown) => {
          table = value;
          return query;
        },
        where: (value: SQL) => {
          params = dialect.sqlToQuery(value).params;
          return query;
        },
        orderBy: () => query,
        for: async () =>
          table === schema.institutionUsers
            ? currentUsers.filter((user) => user.email === params[0])
            : [],
        limit: async () => [],
      };
      return query;
    },
    insert: (table: unknown) => ({
      values: (values: Record<string, unknown> | Record<string, unknown>[]) => {
        writes.push({ table, values });
        return {
          returning: async () => [
            {
              id:
                table === schema.institutions
                  ? 'new-school'
                  : table === schema.campuses
                    ? 'new-campus'
                    : 'new-admin',
              ...values,
            },
          ],
        };
      },
    }),
    update: (table: unknown) => ({
      set: (values: Record<string, unknown>) => ({
        where: (condition: SQL) => {
          const id = dialect.sqlToQuery(condition).params[0];
          writes.push({ table, values });
          if (table === schema.institutionUsers)
            currentUsers = currentUsers.map((user) =>
              user.id === id ? ({ ...user, ...values } as InstitutionUser) : user,
            );
          return { returning: async () => (versionMatches ? [{ ...request, ...values }] : []) };
        },
      }),
    }),
  };
  const db = {
    transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
      const before = structuredClone(currentUsers),
        count = writes.length;
      try {
        return await fn(tx);
      } catch (err) {
        currentUsers = before;
        writes.splice(count);
        throw err;
      }
    }),
  };
  const emails = {
    sendApproved: vi.fn(async () => ({ messageId: 'approval-email' })),
    sendExistingAccountApproved: vi.fn(async () => ({ messageId: 'linked-email' })),
    sendAdminInvitation: vi.fn(async () => ({ messageId: 'invite-email' })),
    sendWelcome: vi.fn(async () => ({ messageId: 'welcome-email' })),
  };
  const audit = { logAudit: vi.fn() };
  const service = new RegistrationApprovalService(
    db as never,
    audit as never,
    { SESSION_COOKIE_SECRET: 'secret', PORTAL_WEB_URL: 'https://portal.example.com/' } as never,
    { findById: vi.fn(async () => request) } as never,
    emails as never,
  );
  return {
    service,
    writes,
    emails,
    audit,
    users: () => currentUsers,
    admin: () =>
      writes.find(
        (write) => write.table === schema.institutionUsers && 'institutionId' in write.values,
      )?.values as Record<string, unknown>,
  };
}

describe('registration approval reuses existing institution credentials', () => {
  it('creates an active second membership using the current password and sends one approval email', async () => {
    const passwordHash = await hashPassword('CurrentPassword123!');
    const h = harness([existing({ passwordHash })]);
    const result = await h.service.approve('request', input, ctx);
    expect(result.adminAccess).toBe('existing_account');
    expect(h.admin()).toMatchObject({
      status: 'active',
      passwordHash,
      activatedAt: expect.any(Date),
      activationTokenHash: null,
      activationTokenExpiresAt: null,
      metadata: { portalCredentialGroupId: 'existing-user' },
    });
    expect(await verifyPassword('CurrentPassword123!', h.admin().passwordHash as string)).toBe(
      true,
    );
    expect(h.admin()).not.toHaveProperty('directGrants');
    expect(h.admin()).not.toHaveProperty('directDenies');
    expect(h.users()[0]!.metadata).toEqual({
      existingPreference: 'keep',
      portalCredentialGroupId: 'existing-user',
    });
    expect(h.emails.sendExistingAccountApproved).toHaveBeenCalledWith(
      EMAIL,
      'Alex Admin',
      'New School',
      'https://portal.example.com/login',
      true,
    );
    expect(h.emails.sendApproved).not.toHaveBeenCalled();
    expect(h.emails.sendAdminInvitation).not.toHaveBeenCalled();
    expect(h.emails.sendWelcome).not.toHaveBeenCalled();
    expect(h.writes.find((w) => w.table === schema.institutions)?.values).toMatchObject({
      status: 'onboarding',
      activatedAt: null,
    });
    expect(h.audit.logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'institution_user.link',
        newState: expect.objectContaining({ adminAccess: 'existing_account' }),
      }),
    );
  });

  it('overrides temporary-password delivery for an existing account and retains MFA/lockout requirements', async () => {
    const lockedUntil = new Date(Date.now() + 600000),
      resetRequired = new Date();
    const h = harness([
      existing({
        passwordHash: await hashPassword('CurrentPassword123!'),
        authUserId: 'auth-user',
        mfaEnrolled: true,
        requireMfa: true,
        failedLoginAttempts: 5,
        lockedUntil,
        passwordResetRequiredAt: resetRequired,
      }),
    ]);
    await h.service.approve(
      'request',
      { ...input, admin: { ...input.admin, credentialDelivery: 'temporary_password' } },
      ctx,
    );
    expect(h.admin()).toMatchObject({
      authUserId: 'auth-user',
      mfaEnrolled: true,
      requireMfa: true,
      failedLoginAttempts: 5,
      lockedUntil,
      passwordResetRequiredAt: resetRequired,
    });
    expect(h.emails.sendAdminInvitation).not.toHaveBeenCalled();
    expect(h.emails.sendExistingAccountApproved).toHaveBeenCalledTimes(1);
  });

  it('notifies a separate applicant without telling them to activate the returning administrator', async () => {
    const h = harness(
      [existing({ passwordHash: await hashPassword('CurrentPassword123!') })],
      'contact@example.com',
    );
    await h.service.approve('request', input, ctx);
    expect(h.emails.sendApproved).toHaveBeenCalledWith('contact@example.com', 'New School', true);
    expect(h.emails.sendExistingAccountApproved).toHaveBeenCalledWith(
      EMAIL,
      'Alex Admin',
      'New School',
      expect.any(String),
      true,
    );
    expect(h.emails.sendAdminInvitation).not.toHaveBeenCalled();
  });

  it.each(['missing', 'invited', 'disabled', 'disabledAt', 'no-credentials', 'different-email'])(
    'keeps activation for %s accounts',
    async (kind) => {
      const overrides: Partial<InstitutionUser> =
        kind === 'invited'
          ? { status: 'invited' as InstitutionUser['status'] }
          : kind === 'disabled'
            ? { status: 'disabled' as InstitutionUser['status'] }
            : kind === 'disabledAt'
              ? { disabledAt: new Date() }
              : kind === 'different-email'
                ? { email: 'someone-else@example.com' }
                : kind === 'no-credentials'
                  ? { passwordHash: null }
                  : {};
      const users =
        kind === 'missing'
          ? []
          : [existing({ passwordHash: await hashPassword('CurrentPassword123!'), ...overrides })];
      const h = harness(users);
      const result = await h.service.approve('request', input, ctx);
      expect(result.adminAccess).toBe('activation');
      expect(h.admin()).toMatchObject({
        status: 'invited',
        passwordHash: null,
        activationTokenHash: expect.any(String),
        activationTokenExpiresAt: expect.any(Date),
      });
      expect(h.emails.sendAdminInvitation).toHaveBeenCalledWith(
        EMAIL,
        'Alex Admin',
        'New School',
        expect.stringContaining('/activate?token='),
        undefined,
      );
      expect(h.emails.sendExistingAccountApproved).not.toHaveBeenCalled();
    },
  );

  it('preserves temporary-password delivery for first-time accounts', async () => {
    const h = harness();
    expect(
      (
        await h.service.approve(
          'request',
          { ...input, admin: { ...input.admin, credentialDelivery: 'temporary_password' } },
          ctx,
        )
      ).adminAccess,
    ).toBe('temporary_password');
    expect(h.admin()).toMatchObject({
      status: 'active',
      activationTokenHash: null,
      passwordHash: expect.any(String),
    });
    expect(h.emails.sendAdminInvitation).toHaveBeenCalledWith(
      EMAIL,
      'Alex Admin',
      'New School',
      'https://portal.example.com/login',
      expect.any(String),
    );
    expect(h.emails.sendExistingAccountApproved).not.toHaveBeenCalled();
  });

  it('reuses IdP-only accounts without promising a password sign-in', async () => {
    const h = harness([existing({ authUserId: 'auth-user' })]);
    await h.service.approve('request', input, ctx);
    expect(h.admin()).toMatchObject({
      status: 'active',
      passwordHash: null,
      authUserId: 'auth-user',
    });
    expect(h.emails.sendExistingAccountApproved).toHaveBeenCalledWith(
      EMAIL,
      'Alex Admin',
      'New School',
      expect.any(String),
      false,
    );
  });

  it('rolls back account linkage and sends no email if approval loses the version check', async () => {
    const source = existing({ passwordHash: await hashPassword('CurrentPassword123!') });
    const h = harness([source], EMAIL, false);
    await expect(h.service.approve('request', input, ctx)).rejects.toMatchObject({
      response: { code: 'VERSION_CONFLICT' },
    });
    expect(h.users()[0]!.metadata).toEqual(source.metadata);
    expect(h.writes).toHaveLength(0);
    expect(h.emails.sendExistingAccountApproved).not.toHaveBeenCalled();
    expect(h.emails.sendAdminInvitation).not.toHaveBeenCalled();
  });
});
