import { FeatureScope } from '@edrion/shared-types';
import type { AiPolicyInput, AiResolutionContext } from './types';
import { resolveAiPolicy } from './resolve-policy';

/** Mirrors resolve-policy specificity (most specific wins per field). */
const SPECIFICITY_ORDER: FeatureScope[] = [
  FeatureScope.EmployeeRole,
  FeatureScope.InstitutionUser,
  FeatureScope.IndependentUser,
  FeatureScope.Campus,
  FeatureScope.Institution,
  FeatureScope.Plan,
  FeatureScope.Global,
];

export type StudentTutorCurriculumBounds = 'open' | 'institution_curriculum' | 'assigned_material_only';
export type StudentTutorAnswerDirectness = 'default' | 'guided' | 'never_direct_on_assignment';
export type StudentTutorSessionVisibility = 'none' | 'aggregate' | 'transcript';

export interface LearnPolicyV1Resolved {
  v: 1;
  curriculum_bounds: StudentTutorCurriculumBounds;
  answer_directness: StudentTutorAnswerDirectness;
  session_visibility: StudentTutorSessionVisibility;
  allowed_curriculum_keys?: string[];
  wishlist_topic_keys?: string[];
  effective_kill: boolean;
  resolved_layers: string[];
  policy_version?: string;
}

const DEFAULT_PERMISSIVE: LearnPolicyV1Resolved = {
  v: 1,
  curriculum_bounds: 'open',
  answer_directness: 'default',
  session_visibility: 'none',
  effective_kill: false,
  resolved_layers: ['intrinsic_default'],
};

function bestPolicyForScope(
  scope: FeatureScope,
  policies: AiPolicyInput[],
  ctx: AiResolutionContext,
): AiPolicyInput | undefined {
  const candidates = policies.filter(
    (p) =>
      p.enabled &&
      (p.policyDomain ?? 'copilot') === 'student_tutor' &&
      p.scope === scope &&
      scopeMatchesContext(scope, p.scopeId, ctx),
  );
  if (candidates.length === 0) return undefined;
  return [...candidates].sort((x, y) => setAtMs(y) - setAtMs(x))[0];
}

function scopeMatchesContext(
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

function setAtMs(p: AiPolicyInput): number {
  if (!p.setAt) return 0;
  return new Date(p.setAt).getTime();
}

function parseBounds(raw: unknown): StudentTutorCurriculumBounds | undefined {
  if (raw === 'open' || raw === 'institution_curriculum' || raw === 'assigned_material_only') return raw;
  return undefined;
}

function parseDirectness(raw: unknown): StudentTutorAnswerDirectness | undefined {
  if (raw === 'default' || raw === 'guided' || raw === 'never_direct_on_assignment') return raw;
  return undefined;
}

function parseVisibility(raw: unknown): StudentTutorSessionVisibility | undefined {
  if (raw === 'none' || raw === 'aggregate' || raw === 'transcript') return raw;
  return undefined;
}

function layerKey(p: AiPolicyInput): string {
  return `${p.scope}:${p.scopeId ?? 'null'}`;
}

/**
 * Resolve Edrion Learn student-tutor policy for a principal context.
 * Uses the same layer ordering as Copilot; kill switch ORs across student_tutor layers
 * and the global Copilot kill switch.
 */
export function resolveStudentTutorPolicy(
  policies: AiPolicyInput[],
  context: AiResolutionContext,
): LearnPolicyV1Resolved {
  const tutorPolicies = policies.filter((p) => (p.policyDomain ?? 'copilot') === 'student_tutor');
  const layered = SPECIFICITY_ORDER.map((scope) => bestPolicyForScope(scope, tutorPolicies, context)).filter(
    (p): p is AiPolicyInput => !!p,
  );

  const copilotEffective = resolveAiPolicy(policies, context);
  const tutorKill = layered.some((p) => p.killSwitch === true);
  const effective_kill = tutorKill || copilotEffective.killSwitch;

  if (layered.length === 0) {
    return { ...DEFAULT_PERMISSIVE, effective_kill };
  }

  const resolved_layers: string[] = [];
  let curriculum_bounds = DEFAULT_PERMISSIVE.curriculum_bounds;
  let answer_directness = DEFAULT_PERMISSIVE.answer_directness;
  let session_visibility = DEFAULT_PERMISSIVE.session_visibility;
  let allowed_curriculum_keys: string[] | undefined;
  let wishlist_topic_keys: string[] | undefined;
  let policy_version: string | undefined;

  for (const layer of [...layered].reverse()) {
    const cfg = layer.domainConfig ?? {};
    const bounds = parseBounds(cfg.curriculum_bounds);
    const directness = parseDirectness(cfg.answer_directness);
    const visibility = parseVisibility(cfg.session_visibility);
    if (bounds) {
      curriculum_bounds = bounds;
      resolved_layers.push(layerKey(layer));
    }
    if (directness) {
      answer_directness = directness;
      if (!resolved_layers.includes(layerKey(layer))) resolved_layers.push(layerKey(layer));
    }
    if (visibility) {
      session_visibility = visibility;
      if (!resolved_layers.includes(layerKey(layer))) resolved_layers.push(layerKey(layer));
    }
    if (Array.isArray(cfg.allowed_curriculum_keys)) {
      allowed_curriculum_keys = cfg.allowed_curriculum_keys as string[];
    }
    if (Array.isArray(cfg.wishlist_topic_keys)) {
      wishlist_topic_keys = cfg.wishlist_topic_keys as string[];
    }
    if (typeof cfg.v === 'number') policy_version = String(cfg.v);
  }

  return {
    v: 1,
    curriculum_bounds,
    answer_directness,
    session_visibility,
    allowed_curriculum_keys,
    wishlist_topic_keys,
    effective_kill,
    resolved_layers: resolved_layers.length ? resolved_layers : ['global'],
    policy_version,
  };
}
