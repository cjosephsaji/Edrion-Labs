/** Client-side mirror of the portal API DTOs. The API is the authority; these are read-only. */

export type ScopeMode = 'institution' | 'campus';

/**
 * A resolved, human-readable reference to a domain entity — the client mirror of the API's
 * `PortalEntityResolver` output. Any list/detail field that used to show a bare UUID now carries one
 * of these under a sibling key (e.g. `studentId` + `student`). Render with the `EntityRef` component.
 */
export interface EntityDisplay {
  id: string;
  label: string;
  sub?: string | null;
  meta?: Record<string, unknown>;
}

/** A student's primary guardian, denormalised for a detail header (mirror of the API). */
export interface GuardianDisplay {
  name: string;
  phone: string | null;
  email: string | null;
  relationship: string;
  isPrimary: boolean;
}

/**
 * The full "student card" the Health / Counseling / Attention screens render: the student plus
 * resolved class/grade/section/campus names, computed age and the primary guardian. Mirror of the
 * API's `PortalEntityResolver.studentContexts` output. Extends {@link EntityDisplay}, so anywhere an
 * `EntityDisplay` is expected (e.g. `EntityRef`) a `StudentContext` also works.
 */
export interface StudentContext extends EntityDisplay {
  className?: string | null;
  gradeName?: string | null;
  section?: string | null;
  campusName?: string | null;
  age?: number | null;
  guardian?: GuardianDisplay | null;
}

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
  /** Institution lifecycle status (e.g. `onboarding`, `active`). Gates the setup wizard. */
  institutionStatus: string;
  /** Onboarding lifecycle (`not_started` | `in_progress` | `awaiting_customer` | `completed`). */
  onboardingStatus: string;
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
  /** 'money' → value is integer MINOR units; formatted in the institution's currency by the web. */
  format?: 'money';
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
