import type {
  AiActionRuleEffect,
  AiCapability,
  AiGuardrailDecision,
  AiGuardrailLayer,
  AiMode,
  FeatureScope,
  RiskLevel,
} from '@edrion/shared-types';

/**
 * Pure inputs to the guardrail evaluator. The API repository loads policy + rule rows; the
 * engine never does IO so the decision matrix can be unit-tested exhaustively and run
 * identically on the server (enforcement) and the client (the confirmation-screen explainer).
 *
 * Mirrors the feature-flags resolution engine conceptually — most-specific policy layer wins,
 * the emergency kill switch short-circuits, and every outcome carries the deciding rule + reason.
 */

/** A governance policy attached at a scope (global/plan/institution/campus/user/role). */
export interface AiPolicyInput {
  scope: FeatureScope;
  /** Id the policy attaches to (plan/institution/campus/user id or role key). `null` for global. */
  scopeId: string | null;
  /** Soft on/off for the policy row itself; a disabled row is ignored on resolution. */
  enabled: boolean;
  /** Operating mode for this scope. */
  mode: AiMode;
  /** Per-capability enable map. A capability absent from the map defaults to enabled. */
  capabilities?: Partial<Record<AiCapability, boolean>>;
  /** Hard ceiling on financial impact (minor units). Over this → BLOCKED. `null`/undefined = no cap. */
  maxFinancialImpactMinor?: number | null;
  /** Hard ceiling on affected users. Over this → BLOCKED. `null`/undefined = no cap. */
  maxAffectedUsers?: number | null;
  /** Financial impact at/above this (minor units) escalates to a second approver. */
  twoPersonThresholdMinor?: number | null;
  /** Capabilities that always require a second approver when state-changing. */
  secondApproverCapabilities?: AiCapability[];
  /** Daily AI-run ceiling for this scope (all employees). `null`/undefined = no scope cap. */
  maxRunsPerDay?: number | null;
  /** Daily AI-run ceiling per employee under this scope. `null`/undefined = no per-employee cap. */
  maxRunsPerEmployeePerDay?: number | null;
  /** Emergency kill switch — short-circuits every action under this scope to BLOCKED. */
  killSwitch?: boolean;
  setByName?: string | null;
  setAt?: string | Date | null;
}

/**
 * A per-capability or per-action override layered on top of the resolved policy. `action` (when
 * set) matches a specific underlying action key (e.g. `billing.refund`); otherwise the rule
 * applies to the whole capability.
 */
export interface AiActionRuleInput {
  capability: AiCapability;
  /** Specific underlying action this rule targets; `null` = all actions of the capability. */
  action?: string | null;
  enabled: boolean;
  effect: AiActionRuleEffect;
  /** Optional risk classification this rule pins for the matched action. */
  riskLevel?: RiskLevel | null;
}

/** The proposed action the Copilot wants to take, plus the resolution context. */
export interface ProposedAction {
  capability: AiCapability;
  /** Underlying audited-service action key (e.g. `institutions.suspend`, `billing.refund`). */
  action: string;
  /** The permission the underlying human path requires — recorded for the confirmation screen. */
  requiredPermission?: string;
  /** Estimated financial impact in minor units (absolute value). Defaults to 0. */
  financialImpactMinor?: number;
  /** Estimated number of users affected. Defaults to 0. */
  affectedUsers?: number;
  /** Risk proposed by the planner; the evaluator may raise it via an action rule. */
  riskLevel?: RiskLevel;
  /** Whether the action is reversible — shown on the confirmation screen. */
  reversible?: boolean;
}

/** The entity the action targets. Any field may be absent; drives policy-layer matching. */
export interface AiResolutionContext {
  planId?: string | null;
  institutionId?: string | null;
  campusId?: string | null;
  institutionUserId?: string | null;
  independentUserId?: string | null;
  employeeRoleKeys?: string[];
  /** ISO instant the decision is evaluated at. Defaults to "now". */
  now?: string | Date;
}

export interface GuardrailTraceEntry {
  layer: AiGuardrailLayer;
  /** Did this rule determine the outcome (true) or was it considered and passed (false)? */
  applied: boolean;
  decision?: AiGuardrailDecision;
  note: string;
}

/** The fully-resolved effective policy for a context, with per-field provenance. */
export interface EffectiveAiPolicy {
  mode: AiMode;
  capabilities: Partial<Record<AiCapability, boolean>>;
  maxFinancialImpactMinor: number | null;
  maxAffectedUsers: number | null;
  twoPersonThresholdMinor: number | null;
  secondApproverCapabilities: AiCapability[];
  /** Daily AI-run ceilings (Phase 10b). null = no cap from policy (env default applies). */
  maxRunsPerDay: number | null;
  maxRunsPerEmployeePerDay: number | null;
  killSwitch: boolean;
  /** Most-specific scope that set the operating mode (provenance for the explainer). */
  modeScope: FeatureScope;
  modeScopeId: string | null;
  /** The scope whose kill switch fired, if any. */
  killSwitchScope?: FeatureScope;
  killSwitchSetByName?: string | null;
}

/** The full, explainable guardrail outcome — never just a decision flag. */
export interface GuardrailResult {
  decision: AiGuardrailDecision;
  layer: AiGuardrailLayer;
  /** Human-readable explanation, e.g. "BLOCKED — kill switch active (by Platform Owner)". */
  reason: string;
  capability: AiCapability;
  action: string;
  requiredPermission?: string;
  /** Effective risk after any rule escalation. */
  riskLevel: RiskLevel;
  /** True when a second human approver is required in addition to confirmation. */
  requiresSecondApprover: boolean;
  killSwitchActive: boolean;
  /** The resolved policy the decision was made against. */
  policy: EffectiveAiPolicy;
  /** Ordered record of every rule the engine considered, for the UI explainer + audit. */
  trace: GuardrailTraceEntry[];
}

export interface EvaluateGuardrailInput {
  proposed: ProposedAction;
  policies: AiPolicyInput[];
  rules: AiActionRuleInput[];
  context: AiResolutionContext;
}
