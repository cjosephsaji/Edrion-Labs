import { describe, expect, it } from 'vitest';
import { INSTITUTION_DEFAULT_ROLES } from '@edrion/permissions/institution';
import {
  applyProposedChange,
  computeEffectiveAccess,
  institutionPermissionKeySchema,
  institutionRoleKeySchema,
  previewAccessChangeSchema,
} from './institution-users';

const teacherPerms = INSTITUTION_DEFAULT_ROLES.find((r) => r.key === 'teacher')!.permissions;

describe('computeEffectiveAccess (portal catalogue)', () => {
  it('unions the permissions of all assigned roles', () => {
    const eff = computeEffectiveAccess({ roleKeys: ['teacher', 'finance_manager'] });
    expect(eff.permissionKeys).toContain('gradebook.manage'); // teacher
    expect(eff.permissionKeys).toContain('fees.manage'); // finance
    expect(eff.grantedByRole).toEqual(eff.permissionKeys); // no overrides yet
  });

  it('ignores unknown role keys without throwing', () => {
    const eff = computeEffectiveAccess({ roleKeys: ['teacher', 'not_a_role'] });
    expect(eff.permissionKeys).toEqual([...teacherPerms].sort());
  });

  it('adds direct grants beyond the roles and reports them', () => {
    const eff = computeEffectiveAccess({ roleKeys: ['teacher'], directGrants: ['fees.view'] });
    expect(eff.permissionKeys).toContain('fees.view');
    expect(eff.addedByOverride).toEqual(['fees.view']);
  });

  it('does not double-count a grant the role already provides', () => {
    const eff = computeEffectiveAccess({ roleKeys: ['teacher'], directGrants: ['gradebook.manage'] });
    expect(eff.addedByOverride).toEqual([]);
  });

  it('deny always wins, even over a role-granted key, and is reported', () => {
    const eff = computeEffectiveAccess({ roleKeys: ['teacher'], directDenies: ['gradebook.manage'] });
    expect(eff.permissionKeys).not.toContain('gradebook.manage');
    expect(eff.removedByOverride).toEqual(['gradebook.manage']);
  });

  it('resolves custom roles when passed as extra roleDefs', () => {
    const eff = computeEffectiveAccess({ roleKeys: ['exam_officer'] }, [
      ...INSTITUTION_DEFAULT_ROLES,
      { key: 'exam_officer', permissions: ['exams.view', 'exams.manage'] },
    ]);
    expect(eff.permissionKeys).toEqual(['exams.manage', 'exams.view']);
  });

  it('carries campus access through and counts it', () => {
    const eff = computeEffectiveAccess({
      roleKeys: ['campus_admin'],
      campusAccess: [
        { campusId: 'c1', accessLevel: 'manage' },
        { campusId: 'c2', accessLevel: 'view' },
      ],
    });
    expect(eff.campusCount).toBe(2);
  });

  it('student and parent default roles no longer include ai.use (Petros deferral)', () => {
    for (const key of ['student', 'parent']) {
      const eff = computeEffectiveAccess({ roleKeys: [key] });
      expect(eff.permissionKeys).not.toContain('ai.use');
    }
  });
});

describe('applyProposedChange', () => {
  const current = {
    roleKeys: ['teacher'],
    directGrants: ['fees.view'],
    directDenies: ['timetable.manage'],
    campusAccess: [{ campusId: 'c1', accessLevel: 'manage' as const }],
  };

  it('replaces roles when provided, keeps current otherwise', () => {
    expect(applyProposedChange(current, { roleKeys: ['viewer'] }).roleKeys).toEqual(['viewer']);
    expect(applyProposedChange(current, {}).roleKeys).toEqual(['teacher']);
  });

  it('adding a grant clears a conflicting deny', () => {
    const merged = applyProposedChange(current, { addGrants: ['timetable.manage'] });
    expect(merged.directGrants).toContain('timetable.manage');
    expect(merged.directDenies).not.toContain('timetable.manage');
  });

  it('adding a deny clears a conflicting grant', () => {
    const merged = applyProposedChange(current, { addDenies: ['fees.view'] });
    expect(merged.directDenies).toContain('fees.view');
    expect(merged.directGrants).not.toContain('fees.view');
  });

  it('removeOverrides drops a key from both grants and denies', () => {
    const merged = applyProposedChange(current, { removeOverrides: ['fees.view', 'timetable.manage'] });
    expect(merged.directGrants).not.toContain('fees.view');
    expect(merged.directDenies).not.toContain('timetable.manage');
  });

  it('a previewed change recomputes to the expected effective set', () => {
    const merged = applyProposedChange(current, { roleKeys: ['institution_admin'] });
    const eff = computeEffectiveAccess(merged);
    // admin grants timetable, but the carried-over deny still wins
    expect(eff.permissionKeys).not.toContain('timetable.manage');
  });
});

describe('schemas', () => {
  it('defaults to an empty change', () => {
    expect(previewAccessChangeSchema.parse(undefined)).toEqual({});
  });

  it('rejects legacy inst.* permission keys', () => {
    expect(institutionPermissionKeySchema.safeParse('inst.students.view').success).toBe(false);
    expect(institutionPermissionKeySchema.safeParse('students.view').success).toBe(true);
  });

  it('role keys must be lower_snake_case', () => {
    expect(institutionRoleKeySchema.safeParse('Exam Officer').success).toBe(false);
    expect(institutionRoleKeySchema.safeParse('exam_officer').success).toBe(true);
  });
});
