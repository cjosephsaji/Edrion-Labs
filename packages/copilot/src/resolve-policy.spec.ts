import { describe, expect, it } from 'vitest';
import { AiCapability, AiMode, FeatureScope } from '@edrion/shared-types';
import { resolveAiPolicy } from './resolve-policy';
import type { AiPolicyInput, AiResolutionContext } from './types';

function policy(overrides: Partial<AiPolicyInput>): AiPolicyInput {
  return {
    scope: FeatureScope.Global,
    scopeId: null,
    enabled: true,
    mode: AiMode.Full,
    ...overrides,
  };
}

const ctx: AiResolutionContext = {
  planId: 'plan-1',
  institutionId: 'inst-1',
  campusId: 'campus-1',
  institutionUserId: 'iu-1',
  employeeRoleKeys: ['finance_admin'],
};

describe('resolveAiPolicy — defaults', () => {
  it('defaults to disabled with no caps when nothing is set', () => {
    const r = resolveAiPolicy([], {});
    expect(r.mode).toBe(AiMode.Disabled);
    expect(r.maxFinancialImpactMinor).toBeNull();
    expect(r.maxAffectedUsers).toBeNull();
    expect(r.twoPersonThresholdMinor).toBeNull();
    expect(r.killSwitch).toBe(false);
    expect(r.secondApproverCapabilities).toEqual([]);
  });
});

describe('resolveAiPolicy — most specific layer wins per field', () => {
  it('employee-role mode beats user, campus, institution, plan and global', () => {
    const r = resolveAiPolicy(
      [
        policy({ scope: FeatureScope.Global, mode: AiMode.Disabled }),
        policy({ scope: FeatureScope.Plan, scopeId: 'plan-1', mode: AiMode.ReadOnly }),
        policy({ scope: FeatureScope.Institution, scopeId: 'inst-1', mode: AiMode.ReadOnly }),
        policy({ scope: FeatureScope.Campus, scopeId: 'campus-1', mode: AiMode.DraftOnly }),
        policy({ scope: FeatureScope.InstitutionUser, scopeId: 'iu-1', mode: AiMode.DraftOnly }),
        policy({ scope: FeatureScope.EmployeeRole, scopeId: 'finance_admin', mode: AiMode.Full }),
      ],
      ctx,
    );
    expect(r.mode).toBe(AiMode.Full);
    expect(r.modeScope).toBe(FeatureScope.EmployeeRole);
    expect(r.modeScopeId).toBe('finance_admin');
  });

  it('falls through to the institution layer when no more specific layer matches', () => {
    const r = resolveAiPolicy(
      [
        policy({ scope: FeatureScope.Global, mode: AiMode.Disabled }),
        policy({ scope: FeatureScope.Institution, scopeId: 'inst-1', mode: AiMode.ReadOnly }),
      ],
      { institutionId: 'inst-1' },
    );
    expect(r.mode).toBe(AiMode.ReadOnly);
    expect(r.modeScope).toBe(FeatureScope.Institution);
  });

  it('ignores a layer whose scopeId does not match the context', () => {
    const r = resolveAiPolicy(
      [policy({ scope: FeatureScope.Institution, scopeId: 'other', mode: AiMode.Full })],
      { institutionId: 'inst-1' },
    );
    expect(r.mode).toBe(AiMode.Disabled);
    expect(r.modeScope).toBe(FeatureScope.Global);
  });

  it('ignores a disabled policy row', () => {
    const r = resolveAiPolicy(
      [policy({ scope: FeatureScope.Global, mode: AiMode.Full, enabled: false })],
      {},
    );
    expect(r.mode).toBe(AiMode.Disabled);
  });

  it('takes caps from the most specific layer that defines them', () => {
    const r = resolveAiPolicy(
      [
        policy({ scope: FeatureScope.Global, mode: AiMode.Full, maxFinancialImpactMinor: 100000, maxAffectedUsers: 1000 }),
        policy({ scope: FeatureScope.Institution, scopeId: 'inst-1', mode: AiMode.Full, maxFinancialImpactMinor: 5000 }),
      ],
      { institutionId: 'inst-1' },
    );
    expect(r.maxFinancialImpactMinor).toBe(5000); // institution overrides
    expect(r.maxAffectedUsers).toBe(1000); // only global defines it → inherited
  });
});

describe('resolveAiPolicy — kill switch is OR across layers', () => {
  it('a kill switch at any enabled layer wins regardless of a more specific layer', () => {
    const r = resolveAiPolicy(
      [
        policy({ scope: FeatureScope.Global, mode: AiMode.Full, killSwitch: true, setByName: 'Platform Owner' }),
        policy({ scope: FeatureScope.EmployeeRole, scopeId: 'finance_admin', mode: AiMode.Full, killSwitch: false }),
      ],
      ctx,
    );
    expect(r.killSwitch).toBe(true);
    expect(r.killSwitchScope).toBe(FeatureScope.Global);
    expect(r.killSwitchSetByName).toBe('Platform Owner');
  });

  it('records the most specific firing layer when several kill switches are on', () => {
    const r = resolveAiPolicy(
      [
        policy({ scope: FeatureScope.Global, mode: AiMode.Full, killSwitch: true }),
        policy({ scope: FeatureScope.Institution, scopeId: 'inst-1', mode: AiMode.Full, killSwitch: true }),
      ],
      { institutionId: 'inst-1' },
    );
    expect(r.killSwitchScope).toBe(FeatureScope.Institution);
  });
});

describe('resolveAiPolicy — capabilities + second-approver merge', () => {
  it('merges capability maps with the most specific override standing', () => {
    const r = resolveAiPolicy(
      [
        policy({ scope: FeatureScope.Global, mode: AiMode.Full, capabilities: { [AiCapability.Billing]: true, [AiCapability.User]: true } }),
        policy({ scope: FeatureScope.Institution, scopeId: 'inst-1', mode: AiMode.Full, capabilities: { [AiCapability.Billing]: false } }),
      ],
      { institutionId: 'inst-1' },
    );
    expect(r.capabilities[AiCapability.Billing]).toBe(false); // institution override
    expect(r.capabilities[AiCapability.User]).toBe(true); // inherited from global
  });

  it('unions second-approver capabilities across layers', () => {
    const r = resolveAiPolicy(
      [
        policy({ scope: FeatureScope.Global, mode: AiMode.Full, secondApproverCapabilities: [AiCapability.Billing] }),
        policy({ scope: FeatureScope.Institution, scopeId: 'inst-1', mode: AiMode.Full, secondApproverCapabilities: [AiCapability.Permission] }),
      ],
      { institutionId: 'inst-1' },
    );
    expect(r.secondApproverCapabilities.sort()).toEqual([AiCapability.Billing, AiCapability.Permission].sort());
  });

  it('among same-scope policies the most recently set wins', () => {
    const r = resolveAiPolicy(
      [
        policy({ scope: FeatureScope.EmployeeRole, scopeId: 'a', mode: AiMode.ReadOnly, setAt: '2026-01-01' }),
        policy({ scope: FeatureScope.EmployeeRole, scopeId: 'b', mode: AiMode.Full, setAt: '2026-06-01' }),
      ],
      { employeeRoleKeys: ['a', 'b'] },
    );
    expect(r.mode).toBe(AiMode.Full);
  });
});
