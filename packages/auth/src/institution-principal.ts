import type { EvaluatedPermissions } from '@edrion/permissions';
import type { Aal } from './claims';

/**
 * The authenticated INSTITUTION-PORTAL user for a request. Built by the API's portal-auth layer
 * from the session + institution_users / institution_user_roles / campus_user_access rows, then
 * attached to the request as `institutionContext`. Entirely separate from the platform
 * EmployeePrincipal — a user belongs to exactly one institution but may manage many campuses
 * inside it.
 *
 * Authorisation has two independent dimensions:
 *   1. permissions — WHAT actions (students.view, fees.manage …), evaluated from roles + overrides.
 *   2. scope       — WHICH campuses, derived from campus access + the request's active scope.
 */
export interface InstitutionPrincipal {
  institutionUserId: string;
  institutionId: string;
  email: string;
  fullName: string;
  roleKeys: string[];
  permissions: EvaluatedPermissions;
  /** Campus ids the user may access. Empty when the user is institution-wide (sees all). */
  allowedCampusIds: string[];
  /**
   * True when the user can operate across the ENTIRE institution and switch to any campus
   * (e.g. Institution Owner/Admin). When false the user is confined to allowedCampusIds.
   */
  isInstitutionWide: boolean;
  mfaEnrolled: boolean;
  lastAuthAt: Date | null;
  /** AAL from the active portal session token — used for step-up; never infer from mfaEnrolled alone. */
  sessionAal?: Aal;
}

/** The active viewing scope for a request — driven by the global scope switcher in the UI. */
export type InstitutionScope =
  | { mode: 'institution' }
  | { mode: 'campus'; campusId: string };

/**
 * The resolved campus filter a service must apply. `campusIds === null` means "every campus in
 * the institution" (no campus narrowing beyond institution_id). Otherwise the query must be
 * confined to the listed campus ids (plus institution-owned rows where campus_id IS NULL, which
 * the service decides per table).
 */
export interface ScopeFilter {
  mode: 'institution' | 'campus';
  campusIds: string[] | null;
}

/** The full per-request institution context attached to the request. */
export interface InstitutionContext {
  principal: InstitutionPrincipal;
  scope: InstitutionScope;
  authSessionId?: string;
}

export class ScopeForbiddenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ScopeForbiddenError';
  }
}

/**
 * Resolve the authoritative campus filter for a request. Pure — no IO. Throws
 * ScopeForbiddenError when the requested scope is outside the user's allowed campuses.
 *
 *  - institution scope + institution-wide user  → null (all campuses).
 *  - institution scope + confined user          → the user's allowedCampusIds.
 *  - campus scope                               → [campusId], asserted to be permitted.
 */
export function resolveScopeFilter(
  principal: InstitutionPrincipal,
  scope: InstitutionScope,
): ScopeFilter {
  if (scope.mode === 'institution') {
    if (principal.isInstitutionWide) return { mode: 'institution', campusIds: null };
    return { mode: 'institution', campusIds: principal.allowedCampusIds };
  }

  // campus mode — the target campus must be permitted.
  const permitted = principal.isInstitutionWide || principal.allowedCampusIds.includes(scope.campusId);
  if (!permitted) {
    throw new ScopeForbiddenError(`Campus ${scope.campusId} is outside your allowed campuses.`);
  }
  return { mode: 'campus', campusIds: [scope.campusId] };
}

/** The set of campuses the scope switcher should offer this user (ids only; names joined later). */
export function selectableCampusScope(principal: InstitutionPrincipal): {
  canSelectEntireInstitution: boolean;
  campusIds: string[] | 'all';
} {
  return {
    canSelectEntireInstitution: principal.isInstitutionWide,
    campusIds: principal.isInstitutionWide ? 'all' : principal.allowedCampusIds,
  };
}
