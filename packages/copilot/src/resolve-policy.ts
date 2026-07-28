import { AiMode, FeatureScope } from '@edrion/shared-types';
import type { AiCapability } from '@edrion/shared-types';
import type { AiPolicyInput, AiResolutionContext, EffectiveAiPolicy } from './types';

/**
 * Most specific → least specific. The most specific enabled policy that sets a field wins
 * (mirrors feature-flags assignment specificity). Global always matches and is the safety floor.
 */
const SPECIFICITY_ORDER: FeatureScope[] = [
  FeatureScope.EmployeeRole,
  FeatureScope.InstitutionUser,
  FeatureScope.IndependentUser,
  FeatureScope.Campus,
  FeatureScope.Institution,
  FeatureScope.Plan,
  FeatureScope.Global,
];

/**
 * Resolve the effective AI governance policy for a context.
 *
 * Per-field, the most specific enabled layer that defines the field wins — EXCEPT the kill
 * switch, which is OR'd across every enabled layer (any active kill switch stops everything,
 * an emergency stop is never overridden by a more specific layer). When no layer sets a field
 * the safe default applies (mode = disabled, no caps, no second-approver capabilities).
 *
 * Pure — no IO, no Date.now() unless `context.now` is omitted.
 */
export function resolveAiPolicy(
  policies: AiPolicyInput[],
  context: AiResolutionContext,
): EffectiveAiPolicy {
  const now = toDate(context.now) ?? new Date();
  void now; // policies have no schedule window today; kept for symmetry with feature-flags

  // Ordered most → least specific so the first matching layer wins each field.
  const layered = SPECIFICITY_ORDER.map((scope) => bestPolicyForScope(scope, policies, context)).filter(
    (p): p is AiPolicyInput => !!p,
  );

  const modeLayer = layered.find((p) => p.mode != null);
  const mode = modeLayer?.mode ?? AiMode.Disabled;

  const maxFinancialImpactMinor = firstDefined(layered, (p) => p.maxFinancialImpactMinor);
  const maxAffectedUsers = firstDefined(layered, (p) => p.maxAffectedUsers);
  const twoPersonThresholdMinor = firstDefined(layered, (p) => p.twoPersonThresholdMinor);
  const maxRunsPerDay = firstDefined(layered, (p) => p.maxRunsPerDay);
  const maxRunsPerEmployeePerDay = firstDefined(layered, (p) => p.maxRunsPerEmployeePerDay);
  const topicalityMode = firstDefined(layered, (p) => p.topicalityMode);

  // Capabilities: apply least → most specific so the most specific override stands.
  // Values may be boolean (admin) or string enums (student_tutor DEC-16).
  const capabilities: Partial<Record<AiCapability, boolean | string>> = {};
  for (const p of [...layered].reverse()) {
    if (p.capabilities) Object.assign(capabilities, p.capabilities);
  }

  // Second-approver capabilities: union across layers (additive — a layer can only add caution).
  const secondApproverCapabilities = Array.from(
    new Set(layered.flatMap((p) => p.secondApproverCapabilities ?? [])),
  );

  // Kill switch: OR across every enabled layer; record the most specific one that fired.
  const killLayer = layered.find((p) => p.killSwitch === true);

  return {
    mode,
    capabilities,
    maxFinancialImpactMinor: maxFinancialImpactMinor ?? null,
    maxAffectedUsers: maxAffectedUsers ?? null,
    twoPersonThresholdMinor: twoPersonThresholdMinor ?? null,
    secondApproverCapabilities,
    maxRunsPerDay: maxRunsPerDay ?? null,
    maxRunsPerEmployeePerDay: maxRunsPerEmployeePerDay ?? null,
    topicalityMode: topicalityMode ?? 'enforce',
    killSwitch: !!killLayer,
    modeScope: modeLayer?.scope ?? FeatureScope.Global,
    modeScopeId: modeLayer?.scopeId ?? null,
    killSwitchScope: killLayer?.scope,
    killSwitchSetByName: killLayer?.setByName ?? null,
  };
}

/** Pick the most-recently-set enabled policy for a scope that matches the context. */
function bestPolicyForScope(
  scope: FeatureScope,
  policies: AiPolicyInput[],
  ctx: AiResolutionContext,
): AiPolicyInput | undefined {
  const candidates = policies.filter(
    (p) => p.scope === scope && p.enabled && scopeMatchesContext(scope, p.scopeId, ctx),
  );
  if (candidates.length === 0) return undefined;
  return [...candidates].sort((x, y) => setAtMs(y) - setAtMs(x))[0];
}

/** Exported so domain wrappers apply the identical scope guard rather than re-deriving one. */
export function scopeMatchesContext(
  scope: FeatureScope,
  scopeId: string | null,
  ctx: AiResolutionContext,
): boolean {
  switch (scope) {
    case FeatureScope.Global:
      return true;
    case FeatureScope.Plan:
      return !!ctx.planId && scopeId === ctx.planId;
    case FeatureScope.Institution:
      return !!ctx.institutionId && scopeId === ctx.institutionId;
    case FeatureScope.Campus:
      return !!ctx.campusId && scopeId === ctx.campusId;
    case FeatureScope.InstitutionUser:
      return !!ctx.institutionUserId && scopeId === ctx.institutionUserId;
    case FeatureScope.IndependentUser:
      return !!ctx.independentUserId && scopeId === ctx.independentUserId;
    case FeatureScope.EmployeeRole:
      return !!scopeId && (ctx.employeeRoleKeys ?? []).includes(scopeId);
    default:
      return false;
  }
}

/** First non-null/undefined value across the most→least specific layer list. */
function firstDefined<T>(
  layers: AiPolicyInput[],
  pick: (p: AiPolicyInput) => T | null | undefined,
): T | undefined {
  for (const p of layers) {
    const v = pick(p);
    if (v != null) return v;
  }
  return undefined;
}

function toDate(v: string | Date | null | undefined): Date | null {
  if (v == null) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function setAtMs(p: AiPolicyInput): number {
  return toDate(p.setAt)?.getTime() ?? 0;
}
