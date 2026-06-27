import { describe, expect, it } from 'vitest';
import {
  applyProposedChange,
  computeEffectiveAccess,
  INSTITUTION_ROLES,
  previewAccessChangeSchema,
} from './institution-users';

const adminPerms = INSTITUTION_ROLES.find((r) => r.key === 'institution_admin')!.permissions;
const teacherPerms = INSTITUTION_ROLES.find((r) => r.key === 'teacher')!.permissions;

describe('computeEffectiveAccess', () => {
  it('unions the permissions of all assigned roles', () => {
    const eff = computeEffectiveAccess({ roleKeys: ['teacher', 'finance_manager'] });
    expect(eff.permissionKeys).toContain('inst.grades.manage'); // teacher
    expect(eff.permissionKeys).toContain('inst.fees.manage'); // finance
    expect(eff.grantedByRole).toEqual(eff.permissionKeys); // no overrides yet
  });

  it('ignores unknown role keys without throwing', () => {
    const eff = computeEffectiveAccess({ roleKeys: ['teacher', 'not_a_role'] });
    expect(eff.permissionKeys).toEqual([...teacherPerms].sort());
  });

  it('adds direct grants beyond the roles and reports them', () => {
    const eff = computeEffectiveAccess({ roleKeys: ['teacher'], directGrants: ['inst.fees.view'] });
    expect(eff.permissionKeys).toContain('inst.fees.view');
    expect(eff.addedByOverride).toEqual(['inst.fees.view']);
  });

  it('does not double-count a grant the role already provides', () => {
    const eff = computeEffectiveAccess({ roleKeys: ['teacher'], directGrants: ['inst.grades.manage'] });
    expect(eff.addedByOverride).toEqual([]);
  });

  it('deny always wins, even over a role-granted key, and is reported', () => {
    const eff = computeEffectiveAccess({ roleKeys: ['teacher'], directDenies: ['inst.grades.manage'] });
    expect(eff.permissionKeys).not.toContain('inst.grades.manage');
    expect(eff.removedByOverride).toEqual(['inst.grades.manage']);
  });

  it('admin role grants every institution permission', () => {
    const eff = computeEffectiveAccess({ roleKeys: ['institution_admin'] });
    expect(eff.permissionKeys).toEqual([...adminPerms].sort());
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
});

describe('applyProposedChange', () => {
  const current = {
    roleKeys: ['teacher'],
    directGrants: ['inst.fees.view'],
    directDenies: ['inst.timetable.manage'],
    campusAccess: [{ campusId: 'c1', accessLevel: 'manage' as const }],
  };

  it('replaces roles when provided, keeps current otherwise', () => {
    expect(applyProposedChange(current, { roleKeys: ['viewer'] }).roleKeys).toEqual(['viewer']);
    expect(applyProposedChange(current, {}).roleKeys).toEqual(['teacher']);
  });

  it('adding a grant clears a conflicting deny', () => {
    const merged = applyProposedChange(current, { addGrants: ['inst.timetable.manage'] });
    expect(merged.directGrants).toContain('inst.timetable.manage');
    expect(merged.directDenies).not.toContain('inst.timetable.manage');
  });

  it('adding a deny clears a conflicting grant', () => {
    const merged = applyProposedChange(current, { addDenies: ['inst.fees.view'] });
    expect(merged.directDenies).toContain('inst.fees.view');
    expect(merged.directGrants).not.toContain('inst.fees.view');
  });

  it('removeOverrides drops a key from both grants and denies', () => {
    const merged = applyProposedChange(current, { removeOverrides: ['inst.fees.view', 'inst.timetable.manage'] });
    expect(merged.directGrants).not.toContain('inst.fees.view');
    expect(merged.directDenies).not.toContain('inst.timetable.manage');
  });

  it('a previewed change recomputes to the expected effective set', () => {
    const merged = applyProposedChange(current, { roleKeys: ['institution_admin'] });
    const eff = computeEffectiveAccess(merged);
    // admin grants timetable, but the carried-over deny still wins
    expect(eff.permissionKeys).not.toContain('inst.timetable.manage');
  });
});

describe('previewAccessChangeSchema', () => {
  it('defaults to an empty change', () => {
    expect(previewAccessChangeSchema.parse(undefined)).toEqual({});
  });
});
