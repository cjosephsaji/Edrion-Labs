import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InstitutionUsersService } from './institution-users.service';
import type { ActionContext } from '../../common/action-context';

const INSTITUTION_ID = '11111111-1111-1111-1111-111111111111';
const USER_ID = '22222222-2222-2222-2222-222222222222';
const CAMPUS_IN = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const CAMPUS_OUT = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const EMPLOYEE_ID = '33333333-3333-3333-3333-333333333333';

function makeCtx(): ActionContext {
  return {
    principalContext: {
      principal: {
        employeeId: EMPLOYEE_ID,
        email: 'owner@edrion.dev',
        fullName: 'Owner',
        roleKeys: ['super_administrator'],
        permissions: { keys: new Set<string>(), hasWildcard: false },
        mfaEnrolled: true,
        lastAuthAt: new Date(),
      },
    },
    request: {
      requestId: 'req-1',
      correlationId: 'corr-1',
      ip: '127.0.0.1',
      userAgent: 'vitest',
      apiEndpoint: 'POST /institution-users',
    },
  } as ActionContext;
}

function baseUser(overrides: Record<string, unknown> = {}) {
  const now = new Date();
  return {
    id: USER_ID,
    institutionId: INSTITUTION_ID,
    email: 'jane@school.test',
    fullName: 'Jane Doe',
    phone: null,
    status: 'active',
    mfaEnrolled: false,
    requireMfa: false,
    invitedAt: now,
    lastLoginAt: null,
    passwordResetRequiredAt: null,
    sessionsRevokedAt: null,
    lockedAt: null,
    disabledAt: null,
    disabledReason: null,
    directGrants: [] as string[],
    directDenies: [] as string[],
    metadata: {},
    version: 3,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makeService() {
  const repo = {
    list: vi.fn(),
    summaryByStatus: vi.fn(),
    rolesForUsers: vi.fn(),
    findById: vi.fn(),
    rolesForUser: vi.fn().mockResolvedValue(['teacher']),
    campusAccessForUser: vi.fn().mockResolvedValue([]),
    findInstitution: vi.fn(),
    findByEmail: vi.fn(),
    campusIdsForInstitution: vi.fn().mockResolvedValue(new Set([CAMPUS_IN])),
    insert: vi.fn(),
    updateWithVersion: vi.fn(),
    stamp: vi.fn(),
    replaceRoles: vi.fn().mockResolvedValue(undefined),
    replaceCampusAccess: vi.fn().mockResolvedValue(undefined),
    insertRoles: vi.fn().mockResolvedValue(undefined),
    customRolesForInstitution: vi.fn().mockResolvedValue([]),
  };
  repo.findInstitution.mockResolvedValue(ACTIVE_INSTITUTION);
  const audit = { logAudit: vi.fn().mockResolvedValue(undefined) };
  const service = new InstitutionUsersService(repo as never, audit as never);
  return { service, repo, audit };
}

const ACTIVE_INSTITUTION = { id: INSTITUTION_ID, displayName: 'Riverside School', status: 'active', type: 'school' };

describe('InstitutionUsersService.invite', () => {
  let h: ReturnType<typeof makeService>;
  beforeEach(() => {
    h = makeService();
    h.repo.findInstitution.mockResolvedValue(ACTIVE_INSTITUTION);
    h.repo.findByEmail.mockResolvedValue(undefined);
    h.repo.insert.mockImplementation(async (v: Record<string, unknown>) => baseUser({ ...v, status: 'invited' }));
  });

  it('creates an invited user, assigns roles and writes an audit event', async () => {
    const detail = await h.service.invite(
      { institutionId: INSTITUTION_ID, email: 'jane@school.test', fullName: 'Jane Doe', roleKeys: ['teacher'], campusAccess: [] },
      makeCtx(),
    );
    expect(h.repo.insert).toHaveBeenCalled();
    expect(h.repo.insertRoles).toHaveBeenCalledWith(USER_ID, ['teacher']);
    expect(h.audit.logAudit.mock.calls.at(-1)?.[0].action).toBe('institution_user.invite');
    expect(detail.roleKeys).toEqual(['teacher']);
  });

  it('rejects a duplicate email within the institution', async () => {
    h.repo.findByEmail.mockResolvedValue(baseUser());
    await expect(
      h.service.invite(
        { institutionId: INSTITUTION_ID, email: 'jane@school.test', fullName: 'Jane', roleKeys: ['teacher'], campusAccess: [] },
        makeCtx(),
      ),
    ).rejects.toMatchObject({ response: { code: 'EMAIL_IN_USE' } });
    expect(h.repo.insert).not.toHaveBeenCalled();
  });

  it('refuses to invite into an archived institution', async () => {
    h.repo.findInstitution.mockResolvedValue({ ...ACTIVE_INSTITUTION, status: 'archived' });
    await expect(
      h.service.invite(
        { institutionId: INSTITUTION_ID, email: 'x@school.test', fullName: 'X', roleKeys: ['teacher'], campusAccess: [] },
        makeCtx(),
      ),
    ).rejects.toThrow();
  });

  it('INVARIANT: rejects a campus grant outside the institution', async () => {
    await expect(
      h.service.invite(
        {
          institutionId: INSTITUTION_ID,
          email: 'x@school.test',
          fullName: 'X',
          roleKeys: ['teacher'],
          campusAccess: [{ campusId: CAMPUS_OUT, accessLevel: 'manage' }],
        },
        makeCtx(),
      ),
    ).rejects.toMatchObject({ response: { code: 'CROSS_INSTITUTION_CAMPUS' } });
    expect(h.repo.insert).not.toHaveBeenCalled();
  });
});

describe('InstitutionUsersService.changeCampusAccess', () => {
  let h: ReturnType<typeof makeService>;
  beforeEach(() => {
    h = makeService();
    h.repo.findById.mockResolvedValue(baseUser());
    h.repo.updateWithVersion.mockImplementation(async (_id, v, patch) => baseUser({ version: v + 1, ...patch }));
  });

  it('replaces grants that all live inside the institution', async () => {
    await h.service.changeCampusAccess(
      USER_ID,
      { campusAccess: [{ campusId: CAMPUS_IN, accessLevel: 'manage' }], reason: 'assign campus', version: 3 },
      makeCtx(),
    );
    expect(h.repo.replaceCampusAccess).toHaveBeenCalledWith(USER_ID, [{ campusId: CAMPUS_IN, accessLevel: 'manage' }], EMPLOYEE_ID);
    expect(h.audit.logAudit.mock.calls.at(-1)?.[0].action).toBe('institution_user.change_campus_access');
  });

  it('INVARIANT: rejects a grant pointing at another institution’s campus', async () => {
    await expect(
      h.service.changeCampusAccess(
        USER_ID,
        { campusAccess: [{ campusId: CAMPUS_OUT, accessLevel: 'manage' }], reason: 'assign campus', version: 3 },
        makeCtx(),
      ),
    ).rejects.toMatchObject({ response: { code: 'CROSS_INSTITUTION_CAMPUS' } });
    expect(h.repo.replaceCampusAccess).not.toHaveBeenCalled();
  });

  it('surfaces a 409 on a version mismatch', async () => {
    h.repo.updateWithVersion.mockResolvedValue(undefined);
    await expect(
      h.service.changeCampusAccess(
        USER_ID,
        { campusAccess: [{ campusId: CAMPUS_IN, accessLevel: 'manage' }], reason: 'assign campus', version: 1 },
        makeCtx(),
      ),
    ).rejects.toMatchObject({ response: { code: 'VERSION_CONFLICT' } });
  });
});

describe('InstitutionUsersService.addPermissionOverride', () => {
  it('a grant clears a conflicting deny and audits the override', async () => {
    const h = makeService();
    h.repo.findById.mockResolvedValue(baseUser({ directDenies: ['fees.view'] }));
    h.repo.updateWithVersion.mockImplementation(async (_id, v, patch) => baseUser({ version: v + 1, ...patch }));

    const detail = await h.service.addPermissionOverride(
      USER_ID,
      { key: 'fees.view', effect: 'grant', reason: 'finance cover', version: 3 },
      makeCtx(),
    );
    const patch = h.repo.updateWithVersion.mock.calls.at(-1)?.[2];
    expect(patch.directGrants).toContain('fees.view');
    expect(patch.directDenies).not.toContain('fees.view');
    expect(detail.directGrants).toContain('fees.view');
    expect(h.audit.logAudit.mock.calls.at(-1)?.[0].action).toBe('institution_user.add_permission_override');
  });
});

describe('InstitutionUsersService.previewAccess', () => {
  it('returns before/after effective access for a proposed role change', async () => {
    const h = makeService();
    h.repo.findById.mockResolvedValue(baseUser());
    h.repo.rolesForUser.mockResolvedValue(['teacher']);
    h.repo.campusAccessForUser.mockResolvedValue([]);

    const { before, after } = await h.service.previewAccess(USER_ID, { roleKeys: ['institution_admin'] });
    expect(before.roleKeys).toEqual(['teacher']);
    expect(after.roleKeys).toEqual(['institution_admin']);
    expect(after.permissionKeys.length).toBeGreaterThan(before.permissionKeys.length);
    // preview never writes
    expect(h.repo.updateWithVersion).not.toHaveBeenCalled();
  });

  it('INVARIANT: rejects a previewed campus grant outside the institution', async () => {
    const h = makeService();
    h.repo.findById.mockResolvedValue(baseUser());
    await expect(
      h.service.previewAccess(USER_ID, { campusAccess: [{ campusId: CAMPUS_OUT, accessLevel: 'manage' }] }),
    ).rejects.toMatchObject({ response: { code: 'CROSS_INSTITUTION_CAMPUS' } });
  });
});

describe('InstitutionUsersService.disable / forcePasswordReset', () => {
  it('disable stamps the reason and audits', async () => {
    const h = makeService();
    h.repo.findById.mockResolvedValue(baseUser());
    h.repo.updateWithVersion.mockImplementation(async (_id, v, patch) => baseUser({ version: v + 1, ...patch }));
    await h.service.disable(USER_ID, { reason: 'left the school', version: 3 }, makeCtx());
    const patch = h.repo.updateWithVersion.mock.calls.at(-1)?.[2];
    expect(patch.status).toBe('disabled');
    expect(patch.disabledReason).toBe('left the school');
    expect(h.audit.logAudit.mock.calls.at(-1)?.[0].action).toBe('institution_user.disable');
  });

  it('forcePasswordReset stamps without a version and audits reset_security', async () => {
    const h = makeService();
    h.repo.findById.mockResolvedValue(baseUser());
    h.repo.stamp.mockImplementation(async (_id, patch) => baseUser({ ...patch }));
    await h.service.forcePasswordReset(USER_ID, { reason: 'compromised credentials' }, makeCtx());
    expect(h.repo.stamp).toHaveBeenCalled();
    expect(h.audit.logAudit.mock.calls.at(-1)?.[0].action).toBe('institution_user.force_password_reset');
  });
});
