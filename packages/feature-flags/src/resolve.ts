import {
  FeatureDefinitionStatus,
  FeatureResolutionLayer,
  FeatureRolloutType,
  FeatureScope,
} from '@edrion/shared-types';
import type {
  FeatureAssignmentInput,
  FeatureResolution,
  FeatureResolutionContext,
  FeatureResolutionTraceEntry,
  FeatureRolloutInput,
  ResolveFeatureInput,
} from './types';

/**
 * Deterministic feature resolution.
 *
 * Pipeline (highest precedence first — first match short-circuits):
 *   1. emergency kill switch          → OFF, regardless of any override
 *   2. definition not active          → OFF
 *   3. rollout block-list (subject)   → OFF
 *   4. rollout allow-list (subject)   → ON
 *   5. rollout percentage (in bucket) → ON
 *   6. scope assignment hierarchy     → most specific wins
 *        institution_user / independent_user → employee_role → campus → institution → plan → global
 *   7. global default value
 *
 * Pure — no IO, no Date.now() unless `context.now` is omitted — so the hierarchy can be
 * unit-tested exhaustively and run identically on the client for the Effective-Value preview.
 */
export function resolveFeature(input: ResolveFeatureInput): FeatureResolution {
  const { definition, assignments, rollouts, context } = input;
  const now = toDate(context.now) ?? new Date();
  const environment = context.environment ?? 'production';
  const subjectId = context.subjectId ?? defaultSubject(context);
  const trace: FeatureResolutionTraceEntry[] = [];

  const finish = (
    value: boolean,
    layer: FeatureResolution['layer'],
    reason: string,
    extra: { scope?: FeatureScope; scopeId?: string | null; killSwitchActive?: boolean } = {},
  ): FeatureResolution => {
    trace.push({ layer, scope: extra.scope, scopeId: extra.scopeId, applied: true, value, note: reason });
    return {
      key: definition.key,
      value,
      layer,
      scope: extra.scope,
      scopeId: extra.scopeId,
      reason,
      killSwitchActive: extra.killSwitchActive ?? false,
      trace,
    };
  };

  // 1. Emergency kill switch — short-circuits to OFF over everything.
  const kill = rollouts.find(
    (r) => r.type === FeatureRolloutType.KillSwitch && r.enabled && rolloutScheduleActive(r, now),
  );
  if (kill) {
    return finish(false, FeatureResolutionLayer.KillSwitch, killReason(kill), { killSwitchActive: true });
  }

  // 2. Definition lifecycle.
  if (definition.status !== FeatureDefinitionStatus.Active) {
    return finish(
      false,
      FeatureResolutionLayer.DefinitionInactive,
      `OFF — feature is ${definition.status}`,
    );
  }

  // 3–5. Rollout modifiers (only those applicable in this environment + schedule window).
  const applicable = rollouts.filter(
    (r) =>
      r.enabled &&
      r.type !== FeatureRolloutType.KillSwitch &&
      rolloutEnvironmentMatches(r, environment) &&
      rolloutScheduleActive(r, now),
  );

  if (subjectId) {
    const block = applicable.find(
      (r) => r.type === FeatureRolloutType.BlockList && listIncludes(r.blockList, subjectId),
    );
    if (block) {
      return finish(false, FeatureResolutionLayer.RolloutBlockList, rolloutReason('OFF', 'block list', block));
    }
    const allow = applicable.find(
      (r) => r.type === FeatureRolloutType.AllowList && listIncludes(r.allowList, subjectId),
    );
    if (allow) {
      return finish(true, FeatureResolutionLayer.RolloutAllowList, rolloutReason('ON', 'allow list', allow));
    }
    const pct = applicable.find(
      (r) =>
        r.type === FeatureRolloutType.Percentage &&
        inPercentageBucket(definition.key, subjectId, r.percentage ?? 0),
    );
    if (pct) {
      const bucket = bucketOf(definition.key, subjectId);
      return finish(
        true,
        FeatureResolutionLayer.RolloutPercentage,
        `ON — ${pct.percentage ?? 0}% rollout (bucket ${bucket})`,
      );
    }
  }
  // Record skipped rollouts for the explainer (without changing the result).
  for (const r of applicable) {
    if (r.type === FeatureRolloutType.Percentage || r.type === FeatureRolloutType.AllowList || r.type === FeatureRolloutType.BlockList) {
      trace.push({
        layer:
          r.type === FeatureRolloutType.BlockList
            ? FeatureResolutionLayer.RolloutBlockList
            : r.type === FeatureRolloutType.AllowList
              ? FeatureResolutionLayer.RolloutAllowList
              : FeatureResolutionLayer.RolloutPercentage,
        applied: false,
        note: `${r.type} rollout did not match subject`,
      });
    }
  }

  // 6. Scope assignment hierarchy — most specific wins.
  for (const scope of SPECIFICITY_ORDER) {
    const match = bestAssignmentForScope(scope, assignments, context, now);
    if (match) {
      return finish(match.value, FeatureResolutionLayer.Assignment, assignmentReason(match), {
        scope,
        scopeId: match.scopeId,
      });
    }
  }

  // 7. Global default.
  return finish(
    definition.defaultValue,
    FeatureResolutionLayer.Default,
    `${onOff(definition.defaultValue)} — global default`,
  );
}

/** Most specific → least specific. Global is matched last (it always matches). */
const SPECIFICITY_ORDER: FeatureScope[] = [
  FeatureScope.InstitutionUser,
  FeatureScope.IndependentUser,
  FeatureScope.EmployeeRole,
  FeatureScope.Campus,
  FeatureScope.Institution,
  FeatureScope.Plan,
  FeatureScope.Global,
];

/** The context id an assignment of the given scope must match (employee_role matches any role key). */
function scopeMatchesContext(
  scope: FeatureScope,
  scopeId: string | null,
  ctx: FeatureResolutionContext,
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

/**
 * Pick the winning assignment for a scope. When multiple active assignments target the same
 * scope (e.g. several role keys), the most recently set wins — deterministic and matches the
 * "latest override stands" mental model.
 */
function bestAssignmentForScope(
  scope: FeatureScope,
  assignments: FeatureAssignmentInput[],
  ctx: FeatureResolutionContext,
  now: Date,
): FeatureAssignmentInput | undefined {
  const candidates = assignments
    .filter((a) => a.scope === scope && a.enabled && scopeMatchesContext(scope, a.scopeId, ctx))
    .filter((a) => assignmentActive(a, now));
  if (candidates.length === 0) return undefined;
  return [...candidates].sort((x, y) => setAtMs(y) - setAtMs(x))[0];
}

/** Within the scheduled activation/expiry window. */
function assignmentActive(a: FeatureAssignmentInput, now: Date): boolean {
  const activates = toDate(a.activatesAt);
  const expires = toDate(a.expiresAt);
  if (activates && now < activates) return false;
  if (expires && now >= expires) return false;
  return true;
}

function rolloutScheduleActive(r: FeatureRolloutInput, now: Date): boolean {
  const starts = toDate(r.startsAt);
  const ends = toDate(r.endsAt);
  if (starts && now < starts) return false;
  if (ends && now >= ends) return false;
  return true;
}

function rolloutEnvironmentMatches(r: FeatureRolloutInput, environment: string): boolean {
  if (!r.environments || r.environments.length === 0) return true;
  return r.environments.includes(environment);
}

function listIncludes(list: string[] | null | undefined, subjectId: string): boolean {
  return !!list && list.includes(subjectId);
}

/** Deterministic 0..99 bucket from feature key + subject. Stable across processes (FNV-1a). */
export function bucketOf(key: string, subjectId: string): number {
  let hash = 0x811c9dc5;
  const input = `${key}:${subjectId}`;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) % 100;
}

function inPercentageBucket(key: string, subjectId: string, percentage: number): boolean {
  const pct = Math.max(0, Math.min(100, percentage));
  if (pct <= 0) return false;
  if (pct >= 100) return true;
  return bucketOf(key, subjectId) < pct;
}

function defaultSubject(ctx: FeatureResolutionContext): string | null {
  return (
    ctx.institutionUserId ??
    ctx.independentUserId ??
    ctx.campusId ??
    ctx.institutionId ??
    ctx.planId ??
    null
  );
}

function toDate(v: string | Date | null | undefined): Date | null {
  if (v == null) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function setAtMs(a: FeatureAssignmentInput): number {
  return toDate(a.setAt)?.getTime() ?? 0;
}

function onOff(v: boolean): string {
  return v ? 'ON' : 'OFF';
}

const SCOPE_LABEL: Record<string, string> = {
  global: 'global default',
  plan: 'plan',
  institution: 'institution',
  campus: 'campus',
  institution_user: 'institution-user',
  independent_user: 'independent-user',
  employee_role: 'employee-role',
  cohort: 'cohort',
};

function assignmentReason(a: FeatureAssignmentInput): string {
  const who = a.setByName ? ` by ${a.setByName}` : '';
  const when = toDate(a.setAt) ? ` on ${toDate(a.setAt)!.toISOString().slice(0, 10)}` : '';
  return `${onOff(a.value)} — ${SCOPE_LABEL[a.scope] ?? a.scope} override set${who}${when}`;
}

function killReason(r: FeatureRolloutInput): string {
  const who = r.setByName ? ` (by ${r.setByName})` : '';
  return `OFF — kill switch active${who}`;
}

function rolloutReason(state: string, label: string, r: FeatureRolloutInput): string {
  const who = r.setByName ? ` (by ${r.setByName})` : '';
  return `${state} — ${label} rollout${who}`;
}
