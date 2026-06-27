import { describe, expect, it } from 'vitest';
import { ALL_PERMISSION_KEYS } from './catalogue';
import { DEFAULT_ROLES, getDefaultRole } from './roles';
import { can, canAll, evaluatePermissions, expandEffectiveKeys } from './evaluate';

describe('evaluatePermissions', () => {
  it('unions permissions across multiple roles', () => {
    const e = evaluatePermissions(
      { roleKeys: ['onboarding_specialist', 'finance_administrator'] },
      DEFAULT_ROLES,
    );
    expect(can(e, 'institutions.create')).toBe(true); // from onboarding
    expect(can(e, 'subscriptions.override_pricing')).toBe(true); // from finance
  });

  it('grants everything for the Platform Owner wildcard', () => {
    const e = evaluatePermissions({ roleKeys: ['platform_owner'] }, DEFAULT_ROLES);
    expect(e.hasWildcard).toBe(true);
    for (const key of ALL_PERMISSION_KEYS) expect(can(e, key)).toBe(true);
    expect(can(e, 'some.future.permission')).toBe(true);
  });

  it('applies direct grants on top of roles', () => {
    const e = evaluatePermissions(
      { roleKeys: ['read_only_auditor'], directGrants: ['institutions.suspend'] },
      DEFAULT_ROLES,
    );
    expect(can(e, 'institutions.suspend')).toBe(true);
  });

  it('denies always win, even over a role grant', () => {
    const e = evaluatePermissions(
      { roleKeys: ['super_administrator'], directDenies: ['institutions.suspend'] },
      DEFAULT_ROLES,
    );
    expect(can(e, 'institutions.suspend')).toBe(false);
    expect(can(e, 'institutions.view')).toBe(true);
  });

  it('deny does NOT override the wildcard owner (wildcard is absolute)', () => {
    // Product decision: a deny on the owner is meaningless; owner is unrestricted.
    const e = evaluatePermissions(
      { roleKeys: ['platform_owner'], directDenies: ['institutions.suspend'] },
      DEFAULT_ROLES,
    );
    expect(can(e, 'institutions.suspend')).toBe(true);
  });

  it('read-only auditor cannot mutate anything', () => {
    const e = evaluatePermissions({ roleKeys: ['read_only_auditor'] }, DEFAULT_ROLES);
    expect(can(e, 'audit.view')).toBe(true);
    expect(can(e, 'institutions.suspend')).toBe(false);
    expect(can(e, 'subscriptions.update')).toBe(false);
    expect(can(e, 'employees.create')).toBe(false);
  });

  it('ignores unknown role keys gracefully', () => {
    const e = evaluatePermissions({ roleKeys: ['does_not_exist'] }, DEFAULT_ROLES);
    expect(e.keys.size).toBe(0);
  });

  it('canAll requires every key', () => {
    const e = evaluatePermissions({ roleKeys: ['finance_administrator'] }, DEFAULT_ROLES);
    expect(canAll(e, ['plans.view', 'plans.publish'])).toBe(true);
    expect(canAll(e, ['plans.view', 'employees.create'])).toBe(false);
  });

  it('expandEffectiveKeys expands the wildcard to the full catalogue', () => {
    const e = evaluatePermissions({ roleKeys: ['platform_owner'] }, DEFAULT_ROLES);
    expect(expandEffectiveKeys(e, ALL_PERMISSION_KEYS)).toHaveLength(ALL_PERMISSION_KEYS.length);
  });
});

describe('DEFAULT_ROLES integrity', () => {
  it('every default role references only real permission keys (or wildcard)', () => {
    const valid = new Set<string>([...ALL_PERMISSION_KEYS, '*']);
    for (const role of DEFAULT_ROLES) {
      for (const p of role.permissions) {
        expect(valid.has(p), `${role.key} → ${p}`).toBe(true);
      }
    }
  });

  it('getDefaultRole resolves known roles', () => {
    expect(getDefaultRole('ai_safety')?.name).toBe('AI Safety Administrator');
    expect(getDefaultRole('nope')).toBeUndefined();
  });
});
