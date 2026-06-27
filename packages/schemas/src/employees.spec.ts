import { describe, expect, it } from 'vitest';
import {
  assignRolesSchema,
  createEmployeeSchema,
  employeeStatusActionSchema,
  listEmployeesQuerySchema,
  updateEmployeeSchema,
} from './employees';

describe('employees schemas', () => {
  it('normalises + requires a valid email on create', () => {
    const c = createEmployeeSchema.parse({ email: '  Owner@Edrion.DEV ', fullName: 'Owner' });
    expect(c.email).toBe('owner@edrion.dev');
    expect(createEmployeeSchema.safeParse({ email: 'nope', fullName: 'x' }).success).toBe(false);
  });

  it('rejects empty full name on create', () => {
    expect(createEmployeeSchema.safeParse({ email: 'a@b.co', fullName: '' }).success).toBe(false);
  });

  it('requires a version on update and allows clearing the title', () => {
    expect(updateEmployeeSchema.safeParse({ fullName: 'X' }).success).toBe(false);
    expect(updateEmployeeSchema.safeParse({ title: null, version: 0 }).success).toBe(true);
  });

  it('requires a reason on status actions', () => {
    expect(employeeStatusActionSchema.safeParse({ version: 1 }).success).toBe(false);
    expect(employeeStatusActionSchema.safeParse({ reason: 'left the company', version: 1 }).success).toBe(true);
  });

  it('assignRoles takes uuid role ids + a reason', () => {
    expect(assignRolesSchema.safeParse({ roleIds: ['not-a-uuid'], reason: 'x grant' }).success).toBe(false);
    expect(
      assignRolesSchema.safeParse({
        roleIds: ['11111111-1111-1111-1111-111111111111'],
        reason: 'promote to admin',
      }).success,
    ).toBe(true);
    // empty set (revoke all) is valid
    expect(assignRolesSchema.safeParse({ roleIds: [], reason: 'revoke all roles' }).success).toBe(true);
  });

  it('list query coerces pagination + accepts a role filter', () => {
    const q = listEmployeesQuerySchema.parse({ page: '2', pageSize: '10', status: 'active' });
    expect(q.page).toBe(2);
    expect(q.pageSize).toBe(10);
    expect(q.status).toBe('active');
  });
});
