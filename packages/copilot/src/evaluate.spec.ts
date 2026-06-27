import { describe, expect, it } from 'vitest';
import {
  AiActionRuleEffect,
  AiCapability,
  AiGuardrailDecision,
  AiGuardrailLayer,
  AiMode,
  FeatureScope,
  RiskLevel,
} from '@edrion/shared-types';
import { evaluateGuardrail } from './evaluate';
import type {
  AiActionRuleInput,
  AiPolicyInput,
  AiResolutionContext,
  ProposedAction,
} from './types';

function globalPolicy(overrides: Partial<AiPolicyInput> = {}): AiPolicyInput {
  return { scope: FeatureScope.Global, scopeId: null, enabled: true, mode: AiMode.Full, ...overrides };
}

function evaluate(parts: {
  proposed: Partial<ProposedAction> & { capability: AiCapability };
  policies?: AiPolicyInput[];
  rules?: AiActionRuleInput[];
  context?: AiResolutionContext;
}) {
  const proposed: ProposedAction = {
    action: parts.proposed.action ?? `${parts.proposed.capability}.do`,
    ...parts.proposed,
  };
  return evaluateGuardrail({
    proposed,
    policies: parts.policies ?? [globalPolicy()],
    rules: parts.rules ?? [],
    context: parts.context ?? {},
  });
}

describe('evaluateGuardrail — kill switch short-circuits to BLOCKED', () => {
  it('beats full mode + an enabled capability', () => {
    const r = evaluate({
      proposed: { capability: AiCapability.Search },
      policies: [globalPolicy({ killSwitch: true, setByName: 'Platform Owner' })],
    });
    expect(r.decision).toBe(AiGuardrailDecision.Blocked);
    expect(r.layer).toBe(AiGuardrailLayer.KillSwitch);
    expect(r.killSwitchActive).toBe(true);
    expect(r.reason).toContain('kill switch');
  });
});

describe('evaluateGuardrail — disabled states BLOCK', () => {
  it('mode disabled blocks', () => {
    const r = evaluate({
      proposed: { capability: AiCapability.Analysis },
      policies: [globalPolicy({ mode: AiMode.Disabled })],
    });
    expect(r.decision).toBe(AiGuardrailDecision.Blocked);
    expect(r.layer).toBe(AiGuardrailLayer.ModeDisabled);
  });

  it('empty policy set (disabled by default) blocks', () => {
    const r = evaluate({ proposed: { capability: AiCapability.Search }, policies: [] });
    expect(r.decision).toBe(AiGuardrailDecision.Blocked);
    expect(r.layer).toBe(AiGuardrailLayer.ModeDisabled);
  });

  it('a disabled capability blocks even in full mode', () => {
    const r = evaluate({
      proposed: { capability: AiCapability.Billing },
      policies: [globalPolicy({ capabilities: { [AiCapability.Billing]: false } })],
    });
    expect(r.decision).toBe(AiGuardrailDecision.Blocked);
    expect(r.layer).toBe(AiGuardrailLayer.CapabilityDisabled);
  });
});

describe('evaluateGuardrail — mode gating', () => {
  it('read_only ALLOWS a read capability', () => {
    const r = evaluate({
      proposed: { capability: AiCapability.Search },
      policies: [globalPolicy({ mode: AiMode.ReadOnly })],
    });
    expect(r.decision).toBe(AiGuardrailDecision.Allow);
    expect(r.layer).toBe(AiGuardrailLayer.ReadOnlyAllowed);
  });

  it('read_only BLOCKS drafting and mutations', () => {
    expect(
      evaluate({ proposed: { capability: AiCapability.Drafting }, policies: [globalPolicy({ mode: AiMode.ReadOnly })] }).layer,
    ).toBe(AiGuardrailLayer.ModeReadOnly);
    expect(
      evaluate({ proposed: { capability: AiCapability.RecordEdit }, policies: [globalPolicy({ mode: AiMode.ReadOnly })] }).decision,
    ).toBe(AiGuardrailDecision.Blocked);
  });

  it('draft_only ALLOWS drafting + reads but BLOCKS mutations', () => {
    expect(
      evaluate({ proposed: { capability: AiCapability.Drafting }, policies: [globalPolicy({ mode: AiMode.DraftOnly })] }).decision,
    ).toBe(AiGuardrailDecision.Allow);
    expect(
      evaluate({ proposed: { capability: AiCapability.Analysis }, policies: [globalPolicy({ mode: AiMode.DraftOnly })] }).decision,
    ).toBe(AiGuardrailDecision.Allow);
    const mut = evaluate({ proposed: { capability: AiCapability.Billing }, policies: [globalPolicy({ mode: AiMode.DraftOnly })] });
    expect(mut.decision).toBe(AiGuardrailDecision.Blocked);
    expect(mut.layer).toBe(AiGuardrailLayer.ModeDraftOnly);
  });
});

describe('evaluateGuardrail — the non-negotiable rule (no mutation without confirmation)', () => {
  for (const capability of [
    AiCapability.RecordCreate,
    AiCapability.RecordEdit,
    AiCapability.Billing,
    AiCapability.User,
    AiCapability.Permission,
    AiCapability.InstitutionAccess,
    AiCapability.Feature,
    AiCapability.Communications,
  ]) {
    it(`a "${capability}" mutation never ALLOWs — at least NEEDS_CONFIRMATION`, () => {
      const r = evaluate({ proposed: { capability }, policies: [globalPolicy()] });
      expect(r.decision).not.toBe(AiGuardrailDecision.Allow);
      expect([
        AiGuardrailDecision.NeedsConfirmation,
        AiGuardrailDecision.NeedsSecondApprover,
      ]).toContain(r.decision);
    });
  }

  it('a low-risk record edit needs confirmation', () => {
    const r = evaluate({
      proposed: { capability: AiCapability.RecordEdit, riskLevel: RiskLevel.Low, action: 'records.update' },
    });
    expect(r.decision).toBe(AiGuardrailDecision.NeedsConfirmation);
    expect(r.layer).toBe(AiGuardrailLayer.ConfirmationRequired);
  });
});

describe('evaluateGuardrail — hard caps BLOCK', () => {
  it('financial impact over the cap blocks', () => {
    const r = evaluate({
      proposed: { capability: AiCapability.Billing, financialImpactMinor: 50_000 },
      policies: [globalPolicy({ maxFinancialImpactMinor: 10_000 })],
    });
    expect(r.decision).toBe(AiGuardrailDecision.Blocked);
    expect(r.layer).toBe(AiGuardrailLayer.FinancialCap);
  });

  it('uses the absolute value of the impact (a large refund still trips the cap)', () => {
    const r = evaluate({
      proposed: { capability: AiCapability.Billing, financialImpactMinor: -50_000 },
      policies: [globalPolicy({ maxFinancialImpactMinor: 10_000 })],
    });
    expect(r.layer).toBe(AiGuardrailLayer.FinancialCap);
  });

  it('affected-users over the cap blocks', () => {
    const r = evaluate({
      proposed: { capability: AiCapability.Communications, affectedUsers: 5000 },
      policies: [globalPolicy({ maxAffectedUsers: 100 })],
    });
    expect(r.decision).toBe(AiGuardrailDecision.Blocked);
    expect(r.layer).toBe(AiGuardrailLayer.AffectedUsersCap);
  });

  it('at the cap (not over) is permitted', () => {
    const r = evaluate({
      proposed: { capability: AiCapability.Billing, financialImpactMinor: 10_000, riskLevel: RiskLevel.Medium },
      policies: [globalPolicy({ maxFinancialImpactMinor: 10_000 })],
    });
    expect(r.decision).not.toBe(AiGuardrailDecision.Blocked);
  });
});

describe('evaluateGuardrail — second-approver escalation', () => {
  it('financial impact at/above the two-person threshold escalates', () => {
    const r = evaluate({
      proposed: { capability: AiCapability.Billing, financialImpactMinor: 20_000, riskLevel: RiskLevel.Medium },
      policies: [globalPolicy({ twoPersonThresholdMinor: 20_000 })],
    });
    expect(r.decision).toBe(AiGuardrailDecision.NeedsSecondApprover);
    expect(r.layer).toBe(AiGuardrailLayer.TwoPersonThreshold);
    expect(r.requiresSecondApprover).toBe(true);
  });

  it('a configured second-approver capability escalates', () => {
    const r = evaluate({
      proposed: { capability: AiCapability.Permission, riskLevel: RiskLevel.Medium },
      policies: [globalPolicy({ secondApproverCapabilities: [AiCapability.Permission] })],
    });
    expect(r.decision).toBe(AiGuardrailDecision.NeedsSecondApprover);
    expect(r.layer).toBe(AiGuardrailLayer.CapabilitySecondApprover);
  });

  it('critical risk escalates to a second approver', () => {
    const r = evaluate({
      proposed: { capability: AiCapability.InstitutionAccess, riskLevel: RiskLevel.Critical },
    });
    expect(r.decision).toBe(AiGuardrailDecision.NeedsSecondApprover);
    expect(r.layer).toBe(AiGuardrailLayer.RiskSecondApprover);
  });
});

describe('evaluateGuardrail — action rules', () => {
  const block: AiActionRuleInput = {
    capability: AiCapability.Billing,
    action: 'billing.refund',
    enabled: true,
    effect: AiActionRuleEffect.Block,
  };

  it('an action-specific block beats a capability-wide allow', () => {
    const r = evaluate({
      proposed: { capability: AiCapability.Billing, action: 'billing.refund' },
      rules: [
        block,
        { capability: AiCapability.Billing, action: null, enabled: true, effect: AiActionRuleEffect.RequireConfirmation },
      ],
    });
    expect(r.decision).toBe(AiGuardrailDecision.Blocked);
    expect(r.layer).toBe(AiGuardrailLayer.ActionRuleBlock);
  });

  it('a rule does not apply to a different action of the same capability', () => {
    const r = evaluate({
      proposed: { capability: AiCapability.Billing, action: 'billing.credit', riskLevel: RiskLevel.Medium },
      rules: [block],
    });
    expect(r.decision).not.toBe(AiGuardrailDecision.Blocked);
  });

  it('require_second_approver rule escalates', () => {
    const r = evaluate({
      proposed: { capability: AiCapability.Feature, action: 'feature.kill_switch', riskLevel: RiskLevel.Medium },
      rules: [{ capability: AiCapability.Feature, action: 'feature.kill_switch', enabled: true, effect: AiActionRuleEffect.RequireSecondApprover }],
    });
    expect(r.decision).toBe(AiGuardrailDecision.NeedsSecondApprover);
    expect(r.layer).toBe(AiGuardrailLayer.ActionRuleSecondApprover);
  });

  it('require_confirmation rule raises a read capability above ALLOW', () => {
    const r = evaluate({
      proposed: { capability: AiCapability.Report, action: 'report.export_pii' },
      rules: [{ capability: AiCapability.Report, action: 'report.export_pii', enabled: true, effect: AiActionRuleEffect.RequireConfirmation }],
    });
    expect(r.decision).toBe(AiGuardrailDecision.NeedsConfirmation);
    expect(r.layer).toBe(AiGuardrailLayer.ConfirmationRequired);
  });

  it('a rule pins the effective risk level', () => {
    const r = evaluate({
      proposed: { capability: AiCapability.RecordEdit, action: 'records.bulk_update', riskLevel: RiskLevel.Low },
      rules: [{ capability: AiCapability.RecordEdit, action: 'records.bulk_update', enabled: true, effect: AiActionRuleEffect.RequireSecondApprover, riskLevel: RiskLevel.Critical }],
    });
    expect(r.riskLevel).toBe(RiskLevel.Critical);
    expect(r.decision).toBe(AiGuardrailDecision.NeedsSecondApprover);
  });
});

describe('evaluateGuardrail — precedence + provenance', () => {
  it('a disabled capability beats the cap and threshold checks', () => {
    const r = evaluate({
      proposed: { capability: AiCapability.Billing, financialImpactMinor: 1_000_000 },
      policies: [globalPolicy({ capabilities: { [AiCapability.Billing]: false }, maxFinancialImpactMinor: 1 })],
    });
    expect(r.layer).toBe(AiGuardrailLayer.CapabilityDisabled);
  });

  it('carries the required permission and risk through to the result', () => {
    const r = evaluate({
      proposed: { capability: AiCapability.InstitutionAccess, action: 'institutions.suspend', requiredPermission: 'institutions.suspend' },
    });
    expect(r.requiredPermission).toBe('institutions.suspend');
    expect(r.riskLevel).toBe(RiskLevel.High); // sensitive capability default
  });

  it('records the deciding layer in the trace', () => {
    const r = evaluate({ proposed: { capability: AiCapability.Search } });
    expect(r.trace.at(-1)?.layer).toBe(r.layer);
    expect(r.trace.at(-1)?.applied).toBe(true);
  });

  it('an institution kill switch blocks an action targeting that institution', () => {
    const r = evaluate({
      proposed: { capability: AiCapability.Search },
      policies: [
        globalPolicy({ mode: AiMode.Full }),
        { scope: FeatureScope.Institution, scopeId: 'inst-1', enabled: true, mode: AiMode.Full, killSwitch: true },
      ],
      context: { institutionId: 'inst-1' },
    });
    expect(r.decision).toBe(AiGuardrailDecision.Blocked);
    expect(r.layer).toBe(AiGuardrailLayer.KillSwitch);
    expect(r.policy.killSwitchScope).toBe(FeatureScope.Institution);
  });
});
