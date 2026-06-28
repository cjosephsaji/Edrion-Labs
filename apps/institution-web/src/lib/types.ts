/** Client-side mirror of the portal API DTOs. The API is the authority; these are read-only. */

export type ScopeMode = 'institution' | 'campus';

export type InstitutionScope =
  | { mode: 'institution' }
  | { mode: 'campus'; campusId: string };

export interface CampusOption {
  id: string;
  name: string;
}

/** GET /v1/portal/me — the authenticated portal user + their authorisation surface. */
export interface PortalMeDto {
  institutionUserId: string;
  fullName: string;
  email: string;
  institutionId: string;
  institutionName: string;
  roleKeys: string[];
  /** Effective (evaluated) permission keys. Client gates UI on these; API re-checks. */
  permissions: string[];
  isInstitutionWide: boolean;
  /** Campuses the scope switcher may offer this user. */
  campuses: CampusOption[];
}

export type DashboardKind =
  | 'institution'
  | 'campus'
  | 'teacher'
  | 'parent'
  | 'student'
  | 'generic';

export interface DashboardStat {
  key: string;
  label: string;
  value: number | string;
  hint?: string;
  /** True when the underlying module isn't built yet — rendered muted/"coming soon". */
  pending?: boolean;
}

export interface DashboardActivity {
  id: string;
  title: string;
  description: string;
  at: string;
}

export interface CampusComparisonRow {
  campusId: string;
  name: string;
  /** Seats/users currently provisioned on the campus (real). Richer academic metrics land later. */
  users: number;
}

/** GET /v1/portal/dashboard — adaptive, scope-aware dashboard payload (single request). */
export interface PortalDashboardDto {
  kind: DashboardKind;
  scopeLabel: string;
  stats: DashboardStat[];
  pendingApprovals: number;
  recentActivity: DashboardActivity[];
  /** Institution-wide variant only: per-campus comparison. */
  campusComparison?: CampusComparisonRow[];
}
