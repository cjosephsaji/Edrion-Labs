import { describe, expect, it, vi } from 'vitest';
import { createStudentSchema } from '@edrion/schemas';
import { schema } from '@edrion/database';
import { verifyPassword } from '../authentication/password.util';
import { PeopleService } from './people.service';
import type { PortalActionContext } from './portal-action-context';

const ctx = { principal: { institutionId: 'institution', institutionUserId: 'admin',
  isInstitutionWide: true, allowedCampusIds: [], roleKeys: ['institution_admin'] },
  scope: { mode: 'institution' }, request: {} } as unknown as PortalActionContext;
const body = { admissionNo: 'ADM-1024', firstName: 'Alex', lastName: 'Student' };

function fixture(failRoles = false) {
  const writes: Array<{ table: unknown; values: Record<string, unknown> }> = [];
  const committed: typeof writes = [];
  const tx = {
    select: () => ({ from: () => ({ where: () => ({ limit: async () => [] }) }) }),
    insert: (table: unknown) => ({ values: (values: Record<string, unknown>) => {
      if (failRoles && table === schema.institutionUserRoles) throw new Error('role write failed');
      writes.push({ table, values });
      return { returning: async () => [{ id: 'user', ...values }] };
    } }),
    update: (table: unknown) => ({ set: (values: Record<string, unknown>) => ({ where: async () => {
      writes.push({ table, values });
    } }) }),
  };
  const db = { transaction: vi.fn(async (work) => {
    const result = await work(tx);
    committed.push(...writes);
    return result;
  }) };
  const repo = { insertStudent: vi.fn(async (values, executor) => {
    expect(executor).toBe(tx);
    writes.push({ table: schema.students, values });
    return { id: 'student', institutionUserId: null, ...values };
  }) };
  const audit = { logAudit: vi.fn() };
  const service = new PeopleService(repo as never, {} as never, {} as never, {} as never, db as never, audit as never);
  return { service, writes, committed, audit };
}

describe('student portal account creation', () => {
  it('creates a linked active student account by default, without email', async () => {
    const { service, writes } = fixture();
    const student = await service.createStudent(ctx, createStudentSchema.parse(body));
    expect(student.institutionUserId).toBe('user');
    const user = writes.find((write) => write.table === schema.institutionUsers)!.values;
    expect(user).toMatchObject({ institutionId: 'institution', status: 'active',
      passwordResetRequiredAt: expect.any(Date), email: 'stu-student@institution.edrion.local' });
    expect(await verifyPassword(body.admissionNo, user.passwordHash as string)).toBe(true);
    expect(user.passwordHash).not.toBe(body.admissionNo);
    expect(writes.find((write) => write.table === schema.institutionUserRoles)?.values)
      .toEqual({ institutionUserId: 'user', roleKey: 'student' });
  });
  it('creates only the student record when the option is unchecked', async () => {
    const { service, writes } = fixture();
    const student = await service.createStudent(ctx, createStudentSchema.parse({ ...body, createPortalAccount: false }));
    expect(student.institutionUserId).toBeNull();
    expect(writes).toHaveLength(1);
    expect(writes[0]!.table).toBe(schema.students);
  });
  it('commits neither student nor account when account setup fails', async () => {
    const { service, committed, audit } = fixture(true);
    await expect(service.createStudent(ctx, createStudentSchema.parse(body))).rejects.toThrow('role write failed');
    expect(committed).toEqual([]);
    expect(audit.logAudit).not.toHaveBeenCalled();
  });
});
