import { AiCapability, AiMode, FeatureScope } from '@edrion/shared-types';
import { resolveAiPolicy, scopeMatchesContext } from './resolve-policy';
import type { AiPolicyInput, AiResolutionContext } from './types';

export type StudentTutorCurriculumBounds = 'open' | 'institution_curriculum' | 'assigned_material_only';
export type StudentTutorAnswerDirectness = 'default' | 'guided' | 'never_direct_on_assignment';
export type StudentTutorSessionVisibility = 'none' | 'aggregate' | 'transcript';

export interface StudentTutorPolicyInput extends AiPolicyInput {
  policyDomain?: 'copilot' | 'student_tutor';
  /**
   * @deprecated DEC-16 — read from `capabilities` (AiCapability grammar). Kept as a
   * fallback for rows not yet migrated by 0107.
   */
  domainConfig?: Record<string, unknown>;
}

export interface ResolvedStudentTutorPolicy {
  v: 1;
  curriculum_bounds: StudentTutorCurriculumBounds;
  answer_directness: StudentTutorAnswerDirectness;
  session_visibility: StudentTutorSessionVisibility;
  effective_mode: 'enabled' | 'disabled';
  resolved_layers: string[];
  version?: string;
  kill_switch: boolean;
  kill_switch_scope?: FeatureScope;
}

const BOUNDS = new Set<StudentTutorCurriculumBounds>([
  'open',
  'institution_curriculum',
  'assigned_material_only',
]);
const DIRECTNESS = new Set<StudentTutorAnswerDirectness>([
  'default',
  'guided',
  'never_direct_on_assignment',
]);
const VISIBILITY = new Set<StudentTutorSessionVisibility>(['none', 'aggregate', 'transcript']);

function pickDomainConfig(layered: StudentTutorPolicyInput[], key: string): unknown {
  for (const row of layered) {
    const v = row.domainConfig?.[key];
    if (v != null) return v;
  }
  return undefined;
}

function asBounds(v: unknown): StudentTutorCurriculumBounds {
  return typeof v === 'string' && BOUNDS.has(v as StudentTutorCurriculumBounds)
    ? (v as StudentTutorCurriculumBounds)
    : 'open';
}

function asDirectness(v: unknown): StudentTutorAnswerDirectness {
  return typeof v === 'string' && DIRECTNESS.has(v as StudentTutorAnswerDirectness)
    ? (v as StudentTutorAnswerDirectness)
    : 'default';
}

function asVisibility(v: unknown): StudentTutorSessionVisibility {
  return typeof v === 'string' && VISIBILITY.has(v as StudentTutorSessionVisibility)
    ? (v as StudentTutorSessionVisibility)
    : 'none';
}

/**
 * Resolve Edrion Learn student_tutor policy from ai_policies rows.
 * Reuses base scope precedence, capability merge, and OR kill-switch semantics (DEC-16).
 */
export function resolveStudentTutorPolicy(
  policies: StudentTutorPolicyInput[],
  context: AiResolutionContext,
): ResolvedStudentTutorPolicy {
  const tutorRows = policies.filter((p) => p.policyDomain === 'student_tutor');
  const base = resolveAiPolicy(tutorRows, context);

  const layered = [
    FeatureScope.EmployeeRole,
    FeatureScope.InstitutionUser,
    FeatureScope.IndependentUser,
    FeatureScope.Campus,
    FeatureScope.Institution,
    FeatureScope.Plan,
    FeatureScope.Global,
  ]
    .map((scope) =>
      tutorRows
        .filter((p) => p.scope === scope && p.enabled && scopeMatchesContext(scope, p.scopeId ?? null, context))
        .sort((a, b) => (b.setAt ? new Date(b.setAt).getTime() : 0) - (a.setAt ? new Date(a.setAt).getTime() : 0))[0],
    )
    .filter((p): p is StudentTutorPolicyInput => !!p);

  // DEC-16: primary source is the engine's capabilities map; domain_config is legacy fallback.
  const curriculum_bounds = asBounds(
    base.capabilities[AiCapability.CurriculumBounds] ?? pickDomainConfig(layered, 'curriculum_bounds'),
  );
  const answer_directness = asDirectness(
    base.capabilities[AiCapability.AnswerDirectness] ?? pickDomainConfig(layered, 'answer_directness'),
  );
  const session_visibility = asVisibility(
    base.capabilities[AiCapability.SessionVisibility] ?? pickDomainConfig(layered, 'session_visibility'),
  );

  const disabled = base.killSwitch || base.mode === AiMode.Disabled;

  return {
    v: 1,
    curriculum_bounds,
    answer_directness,
    session_visibility,
    effective_mode: disabled ? 'disabled' : 'enabled',
    resolved_layers: layered.map((p) => `${p.scope}${p.scopeId ? `:${p.scopeId}` : ''}`),
    version: String(pickDomainConfig(layered, 'v') ?? 1),
    kill_switch: base.killSwitch,
    kill_switch_scope: base.killSwitchScope,
  };
}
