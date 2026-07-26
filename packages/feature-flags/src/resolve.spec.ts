import { describe, expect, it } from 'vitest';
import {
  FeatureDefinitionStatus,
  FeatureResolutionLayer,
  FeatureRolloutType,
  FeatureScope,
} from '@edrion/shared-types';
import { bucketOf, resolveFeature } from './resolve';
import type {
  FeatureAssignmentInput,
  FeatureResolutionContext,
  FeatureRolloutInput,
  ResolveFeatureInput,
} from './types';

const KEY = 'copilot_actions';

function def(overrides: Partial<ResolveFeatureInput['definition']> = {}) {
  return {
    key: KEY,
    defaultValue: false,
    status: FeatureDefinitionStatus.Active,
    ...overrides,
  };
}

function assign(overrides: Partial<FeatureAssignmentInput>): FeatureAssignmentInput {
  return {
    scope: FeatureScope.Global,
    scopeId: null,
    value: true,
    enabled: true,
    ...overrides,
  };
}

function resolve(
  parts: {
    definition?: Partial<ResolveFeatureInput['definition']>;
    assignments?: FeatureAssignmentInput[];
    rollouts?: FeatureRolloutInput[];
    context?: FeatureResolutionContext;
  } = {},
) {
  return resolveFeature({
    definition: def(parts.definition),
    assignments: parts.assignments ?? [],
    rollouts: parts.rollouts ?? [],
    context: parts.context ?? {},
  });
}

const NOW = '2026-06-26T00:00:00.000Z';

describe('resolveFeature — default layer', () => {
  it('returns the global default when nothing else applies', () => {
    const onByDefault = resolve({ definition: { defaultValue: true } });
    expect(onByDefault.value).toBe(true);
    expect(onByDefault.layer).toBe(FeatureResolutionLayer.Default);
    expect(onByDefault.reason).toBe('ON — global default');

    const offByDefault = resolve({ definition: { defaultValue: false } });
    expect(offByDefault.value).toBe(false);
    expect(offByDefault.layer).toBe(FeatureResolutionLayer.Default);
  });
});

describe('resolveFeature — scope hierarchy (most specific wins)', () => {
  const ctx: FeatureResolutionContext = {
    planId: 'plan-1',
    institutionId: 'inst-1',
    campusId: 'campus-1',
    institutionUserId: 'iu-1',
    now: NOW,
  };

  const layers: FeatureAssignmentInput[] = [
    assign({ scope: FeatureScope.Global, scopeId: null, value: false }),
    assign({ scope: FeatureScope.Plan, scopeId: 'plan-1', value: false }),
    assign({ scope: FeatureScope.Institution, scopeId: 'inst-1', value: false }),
    assign({ scope: FeatureScope.Campus, scopeId: 'campus-1', value: false }),
    assign({ scope: FeatureScope.InstitutionUser, scopeId: 'iu-1', value: true }),
  ];

  it('user override beats campus, institution, plan and global', () => {
    const r = resolve({ assignments: layers, context: ctx });
    expect(r.value).toBe(true);
    expect(r.scope).toBe(FeatureScope.InstitutionUser);
  });

  it('campus beats institution when no user override', () => {
    const r = resolve({
      assignments: layers.filter((a) => a.scope !== FeatureScope.InstitutionUser),
      context: ctx,
    });
    expect(r.scope).toBe(FeatureScope.Campus);
  });

  it('institution beats plan when no campus/user override', () => {
    const r = resolve({
      assignments: layers.filter(
        (a) => a.scope !== FeatureScope.InstitutionUser && a.scope !== FeatureScope.Campus,
      ),
      context: ctx,
    });
    expect(r.scope).toBe(FeatureScope.Institution);
  });

  it('plan beats global when no inst/campus/user override', () => {
    const r = resolve({
      assignments: [
        assign({ scope: FeatureScope.Global, scopeId: null, value: false }),
        assign({ scope: FeatureScope.Plan, scopeId: 'plan-1', value: true }),
      ],
      context: ctx,
    });
    expect(r.scope).toBe(FeatureScope.Plan);
    expect(r.value).toBe(true);
  });

  it('ignores assignments whose scopeId does not match the context', () => {
    const r = resolve({
      assignments: [assign({ scope: FeatureScope.Institution, scopeId: 'other-inst', value: true })],
      context: ctx,
    });
    expect(r.layer).toBe(FeatureResolutionLayer.Default);
  });

  it('matches an employee-role assignment against any of the context role keys', () => {
    const r = resolve({
      assignments: [assign({ scope: FeatureScope.EmployeeRole, scopeId: 'finance_admin', value: true })],
      context: { employeeRoleKeys: ['support_admin', 'finance_admin'], now: NOW },
    });
    expect(r.scope).toBe(FeatureScope.EmployeeRole);
    expect(r.value).toBe(true);
  });

  it('among same-scope assignments the most recently set wins', () => {
    const r = resolve({
      assignments: [
        assign({ scope: FeatureScope.EmployeeRole, scopeId: 'a', value: false, setAt: '2026-01-01' }),
        assign({ scope: FeatureScope.EmployeeRole, scopeId: 'b', value: true, setAt: '2026-06-01' }),
      ],
      context: { employeeRoleKeys: ['a', 'b'], now: NOW },
    });
    expect(r.value).toBe(true);
  });
});

describe('resolveFeature — scheduled activation/expiry', () => {
  const ctx: FeatureResolutionContext = { institutionId: 'inst-1', now: NOW };

  it('does not apply an assignment before its activation', () => {
    const r = resolve({
      assignments: [
        assign({ scope: FeatureScope.Institution, scopeId: 'inst-1', value: true, activatesAt: '2026-12-01' }),
      ],
      context: ctx,
    });
    expect(r.layer).toBe(FeatureResolutionLayer.Default);
  });

  it('applies an assignment once activated', () => {
    const r = resolve({
      assignments: [
        assign({ scope: FeatureScope.Institution, scopeId: 'inst-1', value: true, activatesAt: '2026-01-01' }),
      ],
      context: ctx,
    });
    expect(r.scope).toBe(FeatureScope.Institution);
  });

  it('does not apply an expired assignment', () => {
    const r = resolve({
      assignments: [
        assign({ scope: FeatureScope.Institution, scopeId: 'inst-1', value: true, expiresAt: '2026-01-01' }),
      ],
      context: ctx,
    });
    expect(r.layer).toBe(FeatureResolutionLayer.Default);
  });

  it('ignores a disabled assignment row', () => {
    const r = resolve({
      assignments: [
        assign({ scope: FeatureScope.Institution, scopeId: 'inst-1', value: true, enabled: false }),
      ],
      context: ctx,
    });
    expect(r.layer).toBe(FeatureResolutionLayer.Default);
  });
});

describe('resolveFeature — kill switch short-circuits to OFF', () => {
  it('beats an explicit user ON override', () => {
    const r = resolve({
      assignments: [assign({ scope: FeatureScope.InstitutionUser, scopeId: 'iu-1', value: true })],
      rollouts: [{ type: FeatureRolloutType.KillSwitch, enabled: true }],
      context: { institutionUserId: 'iu-1', now: NOW },
    });
    expect(r.value).toBe(false);
    expect(r.layer).toBe(FeatureResolutionLayer.KillSwitch);
    expect(r.killSwitchActive).toBe(true);
    expect(r.reason).toContain('kill switch');
  });

  it('beats an allow-list rollout', () => {
    const r = resolve({
      rollouts: [
        { type: FeatureRolloutType.AllowList, enabled: true, allowList: ['iu-1'] },
        { type: FeatureRolloutType.KillSwitch, enabled: true },
      ],
      context: { institutionUserId: 'iu-1', now: NOW },
    });
    expect(r.value).toBe(false);
    expect(r.layer).toBe(FeatureResolutionLayer.KillSwitch);
  });

  it('a disabled kill switch does not fire', () => {
    const r = resolve({
      definition: { defaultValue: true },
      rollouts: [{ type: FeatureRolloutType.KillSwitch, enabled: false }],
      context: { now: NOW },
    });
    expect(r.value).toBe(true);
    expect(r.killSwitchActive).toBe(false);
  });
});

describe('resolveFeature — definition lifecycle', () => {
  it('an inactive definition resolves OFF regardless of overrides', () => {
    const r = resolve({
      definition: { status: FeatureDefinitionStatus.Inactive, defaultValue: true },
      assignments: [assign({ scope: FeatureScope.Institution, scopeId: 'inst-1', value: true })],
      context: { institutionId: 'inst-1', now: NOW },
    });
    expect(r.value).toBe(false);
    expect(r.layer).toBe(FeatureResolutionLayer.DefinitionInactive);
  });
});

describe('resolveFeature — rollout modifiers', () => {
  it('block list forces OFF over an assignment ON', () => {
    const r = resolve({
      assignments: [assign({ scope: FeatureScope.Institution, scopeId: 'inst-1', value: true })],
      rollouts: [{ type: FeatureRolloutType.BlockList, enabled: true, blockList: ['inst-1'] }],
      context: { institutionId: 'inst-1', now: NOW },
    });
    expect(r.value).toBe(false);
    expect(r.layer).toBe(FeatureResolutionLayer.RolloutBlockList);
  });

  it('allow list forces ON over a default OFF', () => {
    const r = resolve({
      rollouts: [{ type: FeatureRolloutType.AllowList, enabled: true, allowList: ['inst-1'] }],
      context: { institutionId: 'inst-1', now: NOW },
    });
    expect(r.value).toBe(true);
    expect(r.layer).toBe(FeatureResolutionLayer.RolloutAllowList);
  });

  it('block list beats allow list for the same subject', () => {
    const r = resolve({
      rollouts: [
        { type: FeatureRolloutType.AllowList, enabled: true, allowList: ['inst-1'] },
        { type: FeatureRolloutType.BlockList, enabled: true, blockList: ['inst-1'] },
      ],
      context: { institutionId: 'inst-1', now: NOW },
    });
    expect(r.value).toBe(false);
    expect(r.layer).toBe(FeatureResolutionLayer.RolloutBlockList);
  });

  it('environment-scoped rollout only applies in the matching environment', () => {
    const rollouts: FeatureRolloutInput[] = [
      { type: FeatureRolloutType.AllowList, enabled: true, allowList: ['inst-1'], environments: ['production'] },
    ];
    const prod = resolve({ rollouts, context: { institutionId: 'inst-1', environment: 'production', now: NOW } });
    expect(prod.value).toBe(true);
    const staging = resolve({ rollouts, context: { institutionId: 'inst-1', environment: 'staging', now: NOW } });
    expect(staging.layer).toBe(FeatureResolutionLayer.Default);
  });

  it('scheduled rollout only applies inside its window', () => {
    const rollouts: FeatureRolloutInput[] = [
      {
        type: FeatureRolloutType.AllowList,
        enabled: true,
        allowList: ['inst-1'],
        startsAt: '2026-06-01',
        endsAt: '2026-07-01',
      },
    ];
    const inside = resolve({ rollouts, context: { institutionId: 'inst-1', now: '2026-06-15' } });
    expect(inside.value).toBe(true);
    const before = resolve({ rollouts, context: { institutionId: 'inst-1', now: '2026-05-15' } });
    expect(before.layer).toBe(FeatureResolutionLayer.Default);
  });

  it('percentage rollout is deterministic and bucket-gated', () => {
    const bucket = bucketOf(KEY, 'inst-1');
    const justAbove = resolve({
      rollouts: [{ type: FeatureRolloutType.Percentage, enabled: true, percentage: bucket + 1 }],
      context: { institutionId: 'inst-1', now: NOW },
    });
    expect(justAbove.value).toBe(true);
    expect(justAbove.layer).toBe(FeatureResolutionLayer.RolloutPercentage);

    const atOrBelow = resolve({
      rollouts: [{ type: FeatureRolloutType.Percentage, enabled: true, percentage: bucket }],
      context: { institutionId: 'inst-1', now: NOW },
    });
    expect(atOrBelow.layer).not.toBe(FeatureResolutionLayer.RolloutPercentage);
  });

  it('0% never rolls out, 100% always rolls out', () => {
    expect(
      resolve({
        rollouts: [{ type: FeatureRolloutType.Percentage, enabled: true, percentage: 0 }],
        context: { institutionId: 'inst-1', now: NOW },
      }).layer,
    ).toBe(FeatureResolutionLayer.Default);
    expect(
      resolve({
        rollouts: [{ type: FeatureRolloutType.Percentage, enabled: true, percentage: 100 }],
        context: { institutionId: 'inst-1', now: NOW },
      }).value,
    ).toBe(true);
  });
});

describe('bucketOf', () => {
  it('is stable for the same key+subject and within 0..99', () => {
    const a = bucketOf(KEY, 'subject-x');
    const b = bucketOf(KEY, 'subject-x');
    expect(a).toBe(b);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThan(100);
  });
});
