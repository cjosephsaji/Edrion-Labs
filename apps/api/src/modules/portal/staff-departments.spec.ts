import { describe, expect, it, vi } from 'vitest';
import type { PortalActionContext } from './portal-action-context';
import { createStaffSchema } from '@edrion/schemas';
import { PeopleService } from './people.service';

const ctx = {
  principal: {
    institutionId: 'institution',
    institutionUserId: 'admin',
    isInstitutionWide: true,
    allowedCampusIds: [],
    roleKeys: ['institution_admin'],
  },
  scope: { mode: 'institution' },
  request: {},
} as unknown as PortalActionContext;
const staff = {
  id: 'staff',
  campusId: null,
  departmentId: null,
  institutionUserId: null,
  firstName: 'Sam',
  lastName: 'Teacher',
  version: 0,
};
const createBody = createStaffSchema.parse({
  firstName: 'Sam',
  lastName: 'Teacher',
  employmentType: 'full_time',
  status: 'active',
  departmentId: '11111111-1111-4111-8111-111111111111',
});

function fixture(unitKind: 'department' | 'programme', campusId: string | null = null) {
  const repo = {
    findStaffDepartment: vi.fn().mockResolvedValue({ id: '11111111-1111-4111-8111-111111111111', campusId, unitKind }),
    findStaff: vi.fn().mockResolvedValue(staff),
    insertStaff: vi.fn().mockImplementation(async (input) => ({ ...staff, ...input })),
    updateStaff: vi
      .fn()
      .mockImplementation(async (_id, _version, input) => ({ ...staff, ...input })),
  };
  const users = { invite: vi.fn() };
  const db = { select: () => ({ from: () => ({ where: () => ({ limit: async () => [] }) }) }) };
  const service = new PeopleService(
    repo as never,
    users as never,
    {} as never,
    {} as never,
    db as never,
    { logAudit: vi.fn() } as never,
  );
  return { service, repo, users };
}

describe('staff departments independent of student courses', () => {
  it('accepts an organisational department when creating staff', async () => {
    const { service, repo } = fixture('department');
    await service.createStaff(ctx, createBody);
    expect(repo.insertStaff).toHaveBeenCalledWith(
      expect.objectContaining({ departmentId: '11111111-1111-4111-8111-111111111111' }),
    );
  });
  it('rejects assigning a course/stream before creating staff or a portal login', async () => {
    const { service, repo, users } = fixture('programme');
    await expect(
      service.createStaff(ctx, { ...createBody, createLogin: true }),
    ).rejects.toMatchObject({ response: { code: 'INVALID_STAFF_DEPARTMENT' } });
    expect(repo.insertStaff).not.toHaveBeenCalled();
    expect(users.invite).not.toHaveBeenCalled();
  });
  it('rejects reassigning existing staff to a course/stream', async () => {
    const { service, repo } = fixture('programme');
    await expect(
      service.updateStaff(ctx, 'staff', { departmentId: '11111111-1111-4111-8111-111111111111', version: 0 }),
    ).rejects.toMatchObject({ response: { code: 'INVALID_STAFF_DEPARTMENT' } });
    expect(repo.updateStaff).not.toHaveBeenCalled();
  });
  it('preserves an existing course link when editing unrelated profile details', async () => {
    const { service, repo } = fixture('programme');
    repo.findStaff.mockResolvedValue({ ...staff, departmentId: '11111111-1111-4111-8111-111111111111' } as never);
    await service.updateStaff(ctx, 'staff', {
      departmentId: '11111111-1111-4111-8111-111111111111',
      designation: 'Teacher',
      version: 0,
    });
    expect(repo.findStaffDepartment).not.toHaveBeenCalled();
    expect(repo.updateStaff).toHaveBeenCalledWith(
      'staff',
      0,
      expect.objectContaining({ departmentId: '11111111-1111-4111-8111-111111111111' }),
    );
  });
  it('allows clearing a previous course link', async () => {
    const { service, repo } = fixture('programme');
    repo.findStaff.mockResolvedValue({ ...staff, departmentId: '11111111-1111-4111-8111-111111111111' } as never);
    await service.updateStaff(ctx, 'staff', { departmentId: null, version: 0 });
    expect(repo.updateStaff).toHaveBeenCalledWith(
      'staff',
      0,
      expect.objectContaining({ departmentId: null }),
    );
  });
  it('rejects a department outside the current campus scope', async () => {
    const { service, repo } = fixture('department', 'other-campus');
    const scoped = { ...ctx, scope: { mode: 'campus', campusId: 'campus' } } as PortalActionContext;
    await expect(service.createStaff(scoped, createBody)).rejects.toMatchObject({
      response: { code: 'NOT_FOUND' },
    });
    expect(repo.insertStaff).not.toHaveBeenCalled();
  });
  it('rejects a department from another institution', async () => {
    const { service, repo } = fixture('department');
    repo.findStaffDepartment.mockResolvedValue(undefined as never);
    await expect(service.createStaff(ctx, createBody)).rejects.toMatchObject({
      response: { code: 'INVALID_REFERENCE' },
    });
    expect(repo.findStaffDepartment).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111', 'institution');
  });
});
