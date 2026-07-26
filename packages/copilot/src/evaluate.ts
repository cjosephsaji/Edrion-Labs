import {
  AiActionRuleEffect,
  AiCapability,
  AiGuardrailDecision,
  AiGuardrailLayer,
  AiMode,
  RiskLevel,
} from '@edrion/shared-types';
import { resolveAiPolicy } from './resolve-policy';
import type {
  AiActionRuleInput,
  EffectiveAiPolicy,
  EvaluateGuardrailInput,
  GuardrailResult,
  GuardrailTraceEntry,
  ProposedAction,
} from './types';

/** Read-only capabilities — no state change, may proceed without confirmation. */
const READ_CAPABILITIES: ReadonlySet<AiCapability> = new Set([
  AiCapability.Search,
  AiCapability.Analysis,
  AiCapability.Recommendations,
  AiCapability.Report,
]);

/** Capabilities whose mutations are inherently high-risk (sensitive surfaces). */
const SENSITIVE_CAPABILITIES: ReadonlySet<AiCapability> = new Set([
  AiCapability.Billing,
  AiCapability.Permission,
  AiCapability.InstitutionAccess,
  AiCapability.User,
]);

function isReadOnly(c: AiCapability): boolean {
  return READ_CAPABILITIES.has(c);
}
function isDraft(c: AiCapability): boolean {
  return c === AiCapability.Drafting;
}
/** State-changing — the non-negotiable rule applies: never runs without human confirmation. */
function isMutating(c: AiCapability): boolean {
  return !isReadOnly(c) && !isDraft(c);
}

/**
 * Deterministic guardrail evaluation for a proposed Copilot action.
 *
 * Mirrors the feature-flags resolution engine: resolve the layered policy, then run a fixed
 * pipeline where the first matching rule short-circuits, returning the deciding rule + reason
 * (never a bare flag). THE non-negotiable rule (docs/AI-GUARDRAILS.md): every state-changing
 * capability resolves to at least NEEDS_CONFIRMATION — there is no ALLOW path for a mutation.
 *
 * Pipeline (highest precedence first):
 *   1. kill switch (any enabled layer)          → BLOCKED
 *   2. mode disabled                             → BLOCKED
 *   3. capability disabled in policy             → BLOCKED
 *   4. action rule effect = block                → BLOCKED
 *   5. mode read_only + non-read capability      → BLOCKED
 *   6. mode draft_only + mutating capability     → BLOCKED
 *   7. financial impact over the hard cap        → BLOCKED
 *   8. affected users over the hard cap          → BLOCKED
 *   then, for a permitted action:
 *     - read-only / drafting capability          → ALLOW
 *     - mutating capability                      → NEEDS_CONFIRMATION
 *       escalated to NEEDS_SECOND_APPROVER when a rule, the two-person financial threshold,
 *       a sensitive/configured capability, or critical risk demands a second human.
 *
 * Pure — no IO. Unit-tested as a matrix.
 */
export function evaluateGuardrail(input: EvaluateGuardrailInput): GuardrailResult {
  const { proposed, policies, rules, context } = input;
  const policy = resolveAiPolicy(policies, context);
  const trace: GuardrailTraceEntry[] = [];
  const rule = matchRule(rules, proposed);
  const effectiveRisk = resolveRisk(proposed, rule);

  const finish = (
    decision: AiGuardrailDecision,
    layer: AiGuardrailLayer,
    reason: string,
    opts: { requiresSecondApprover?: boolean; killSwitchActive?: boolean } = {},
  ): GuardrailResult => {
    trace.push({ layer, applied: true, decision, note: reason });
    return {
      decision,
      layer,
      reason,
      capability: proposed.capability,
      action: proposed.action,
      requiredPermission: proposed.requiredPermission,
      riskLevel: effectiveRisk,
      requiresSecondApprover:
        opts.requiresSecondApprover ?? decision === AiGuardrailDecision.NeedsSecondApprover,
      killSwitchActive: opts.killSwitchActive ?? false,
      policy,
      trace,
    };
  };

  // 1. Emergency kill switch — short-circuits everything to BLOCKED.
  if (policy.killSwitch) {
    const who = policy.killSwitchSetByName ? ` (by ${policy.killSwitchSetByName})` : '';
    const where = policy.killSwitchScope ? ` at ${policy.killSwitchScope} scope` : '';
    return finish(
      AiGuardrailDecision.Blocked,
      AiGuardrailLayer.KillSwitch,
      `BLOCKED — AI kill switch active${where}${who}`,
      { killSwitchActive: true },
    );
  }

  // 2. Mode disabled.
  if (policy.mode === AiMode.Disabled) {
    return finish(
      AiGuardrailDecision.Blocked,
      AiGuardrailLayer.ModeDisabled,
      `BLOCKED — AI is disabled${scopeSuffix(policy)}`,
    );
  }

  // 3. Capability disabled in the resolved policy.
  if (policy.capabilities[proposed.capability] === false) {
    return finish(
      AiGuardrailDecision.Blocked,
      AiGuardrailLayer.CapabilityDisabled,
      `BLOCKED — the "${proposed.capability}" capability is disabled${scopeSuffix(policy)}`,
    );
  }

  // 4. Explicit action-rule block.
  if (rule?.effect === AiActionRuleEffect.Block) {
    return finish(
      AiGuardrailDecision.Blocked,
      AiGuardrailLayer.ActionRuleBlock,
      `BLOCKED — a governance rule blocks "${ruleTarget(rule)}"`,
    );
  }

  // 5. read_only mode forbids anything that isn't a pure read.
  if (policy.mode === AiMode.ReadOnly && !isReadOnly(proposed.capability)) {
    return finish(
      AiGuardrailDecision.Blocked,
      AiGuardrailLayer.ModeReadOnly,
      `BLOCKED — read-only mode allows search/analysis only, not "${proposed.capability}"`,
    );
  }

  // 6. draft_only mode forbids executing a state change (drafting/reads are allowed).
  if (policy.mode === AiMode.DraftOnly && isMutating(proposed.capability)) {
    return finish(
      AiGuardrailDecision.Blocked,
      AiGuardrailLayer.ModeDraftOnly,
      `BLOCKED — draft-only mode cannot execute the state-changing "${proposed.capability}" action`,
    );
  }

  // 7–8. Hard caps (only meaningful for state-changing actions carrying impact).
  const impact = Math.abs(proposed.financialImpactMinor ?? 0);
  if (policy.maxFinancialImpactMinor != null && impact > policy.maxFinancialImpactMinor) {
    return finish(
      AiGuardrailDecision.Blocked,
      AiGuardrailLayer.FinancialCap,
      `BLOCKED — financial impact ${impact} exceeds the cap of ${policy.maxFinancialImpactMinor}`,
    );
  }
  const affected = proposed.affectedUsers ?? 0;
  if (policy.maxAffectedUsers != null && affected > policy.maxAffectedUsers) {
    return finish(
      AiGuardrailDecision.Blocked,
      AiGuardrailLayer.AffectedUsersCap,
      `BLOCKED — ${affected} affected users exceeds the cap of ${policy.maxAffectedUsers}`,
    );
  }

  // Permitted: read-only / drafting needs no confirmation; a rule can still raise it.
  if (!isMutating(proposed.capability)) {
    if (rule?.effect === AiActionRuleEffect.RequireConfirmation) {
      return finish(
        AiGuardrailDecision.NeedsConfirmation,
        AiGuardrailLayer.ConfirmationRequired,
        `CONFIRM — a governance rule requires confirmation for "${ruleTarget(rule)}"`,
      );
    }
    return finish(
      AiGuardrailDecision.Allow,
      AiGuardrailLayer.ReadOnlyAllowed,
      `ALLOW — "${proposed.capability}" is read-only and changes no state`,
    );
  }

  // State-changing: always at least confirmation. Decide whether a second approver is required.
  if (rule?.effect === AiActionRuleEffect.RequireSecondApprover) {
    return finish(
      AiGuardrailDecision.NeedsSecondApprover,
      AiGuardrailLayer.ActionRuleSecondApprover,
      `SECOND APPROVER — a governance rule requires two-person approval for "${ruleTarget(rule)}"`,
      { requiresSecondApprover: true },
    );
  }
  if (policy.twoPersonThresholdMinor != null && impact >= policy.twoPersonThresholdMinor) {
    return finish(
      AiGuardrailDecision.NeedsSecondApprover,
      AiGuardrailLayer.TwoPersonThreshold,
      `SECOND APPROVER — financial impact ${impact} is at/above the two-person threshold of ${policy.twoPersonThresholdMinor}`,
      { requiresSecondApprover: true },
    );
  }
  if (policy.secondApproverCapabilities.includes(proposed.capability)) {
    return finish(
      AiGuardrailDecision.NeedsSecondApprover,
      AiGuardrailLayer.CapabilitySecondApprover,
      `SECOND APPROVER — "${proposed.capability}" actions require two-person approval by policy`,
      { requiresSecondApprover: true },
    );
  }
  if (effectiveRisk === RiskLevel.Critical) {
    return finish(
      AiGuardrailDecision.NeedsSecondApprover,
      AiGuardrailLayer.RiskSecondApprover,
      `SECOND APPROVER — this action is classified critical risk`,
      { requiresSecondApprover: true },
    );
  }

  return finish(
    AiGuardrailDecision.NeedsConfirmation,
    AiGuardrailLayer.ConfirmationRequired,
    `CONFIRM — "${proposed.action}" changes state and needs explicit human confirmation`,
  );
}

/**
 * Select the most relevant rule for an action. Action-specific rules beat capability-wide ones;
 * among equally-specific rules the strictest effect wins (deterministic, fail-safe).
 */
function matchRule(
  rules: AiActionRuleInput[],
  proposed: ProposedAction,
): AiActionRuleInput | undefined {
  const matching = rules.filter((r) => r.enabled && r.capability === proposed.capability);
  const specific = matching.filter((r) => r.action && r.action === proposed.action);
  const pool = specific.length > 0 ? specific : matching.filter((r) => !r.action);
  if (pool.length === 0) return undefined;
  return [...pool].sort((a, b) => effectRank(b.effect) - effectRank(a.effect))[0];
}

function effectRank(e: AiActionRuleEffect): number {
  switch (e) {
    case AiActionRuleEffect.Block:
      return 3;
    case AiActionRuleEffect.RequireSecondApprover:
      return 2;
    case AiActionRuleEffect.RequireConfirmation:
      return 1;
    default:
      return 0;
  }
}

/** Effective risk: a rule pins it; else the planner's; else a capability-based default. */
function resolveRisk(proposed: ProposedAction, rule?: AiActionRuleInput): RiskLevel {
  if (rule?.riskLevel) return rule.riskLevel;
  if (proposed.riskLevel) return proposed.riskLevel;
  if (!isMutating(proposed.capability)) return RiskLevel.Low;
  return SENSITIVE_CAPABILITIES.has(proposed.capability) ? RiskLevel.High : RiskLevel.Medium;
}

function ruleTarget(rule: AiActionRuleInput): string {
  return rule.action ?? rule.capability;
}

function scopeSuffix(policy: EffectiveAiPolicy): string {
  return policy.modeScope ? ` (${policy.modeScope} policy)` : '';
}
