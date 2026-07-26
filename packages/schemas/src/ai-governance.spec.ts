import { describe, expect, it } from 'vitest';
import { AiCapability, AiMode, FeatureScope } from '@edrion/shared-types';
import {
  evaluateGuardrailSchema,
  setAiKillSwitchSchema,
  upsertAiActionRuleSchema,
  upsertAiPolicySchema,
} from './ai-governance';

const REASON = 'policy change for compliance';

describe('upsertAiPolicySchema', () => {
  it('accepts a global policy without a scopeId', () => {
    const r = upsertAiPolicySchema.safeParse({ scope: FeatureScope.Global, mode: AiMode.Full, reason: REASON });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.enabled).toBe(true);
      expect(r.data.secondApproverCapabilities).toEqual([]);
    }
  });

  it('requires scopeId for a non-global scope (refine on scopeId)', () => {
    const r = upsertAiPolicySchema.safeParse({ scope: FeatureScope.Institution, mode: AiMode.ReadOnly, reason: REASON });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]!.path).toContain('scopeId');
  });

  it('rejects a negative financial cap and a missing reason', () => {
    expect(
      upsertAiPolicySchema.safeParse({ scope: FeatureScope.Global, mode: AiMode.Full, reason: REASON, maxFinancialImpactMinor: -1 }).success,
    ).toBe(false);
    expect(upsertAiPolicySchema.safeParse({ scope: FeatureScope.Global, mode: AiMode.Full }).success).toBe(false);
  });
});

describe('setAiKillSwitchSchema', () => {
  it('accepts a valid kill-switch toggle and requires a reason', () => {
    expect(
      setAiKillSwitchSchema.safeParse({ scope: FeatureScope.Global, enabled: true, reason: 'emergency stop now' }).success,
    ).toBe(true);
    expect(setAiKillSwitchSchema.safeParse({ scope: FeatureScope.Global, enabled: true, reason: 'no' }).success).toBe(false);
  });
});

describe('upsertAiActionRuleSchema', () => {
  it('accepts a capability + effect and allows a null action', () => {
    const r = upsertAiActionRuleSchema.safeParse({ capability: AiCapability.Billing, effect: 'block', action: null, reason: REASON });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.enabled).toBe(true);
  });

  it('rejects a 1-char action and an unknown effect', () => {
    expect(upsertAiActionRuleSchema.safeParse({ capability: AiCapability.Billing, effect: 'block', action: 'x', reason: REASON }).success).toBe(false);
    expect(upsertAiActionRuleSchema.safeParse({ capability: AiCapability.Billing, effect: 'nope', reason: REASON }).success).toBe(false);
  });
});

describe('evaluateGuardrailSchema', () => {
  it('requires a proposed.action of at least 2 chars and defaults context to {}', () => {
    const r = evaluateGuardrailSchema.safeParse({ proposed: { capability: AiCapability.InstitutionAccess, action: 'institutions.suspend' } });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.context).toEqual({});
    expect(evaluateGuardrailSchema.safeParse({ proposed: { capability: AiCapability.InstitutionAccess, action: 'x' } }).success).toBe(false);
  });
});
