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
  /** Institution type preset (school, college, university, …). Drives nomenclature fallbacks. */
  institutionType: import('@edrion/shared-types').InstitutionType;
  /** ISO 3166-1 alpha-2 from the institution record (registration / profile). Phone-input default. */
  institutionCountry: string;
  /** Resolved UI labels for this institution (type preset + any overrides). */
  nomenclature: import('@edrion/shared-types').ResolvedNomenclature;
  /** Sidebar order + label overrides (empty object when unset). */
  navigation?: import('@edrion/schemas').NavigationLayout;
  roleKeys: string[];
  /** Effective (evaluated) permission keys. Client gates UI on these; API re-checks. */
  permissions: string[];
  isInstitutionWide: boolean;
  /** Campuses the scope switcher may offer this user. */
  campuses: CampusOption[];
}

/** Presentation grouping over roles. Mirrors PERSONA_ORDER in @edrion/permissions/institution. */
export type PersonaKey =
  | 'leadership'
  | 'academics'
  | 'teaching'
  | 'finance'
  | 'people'
  | 'admissions'
  | 'wellbeing'
  | 'operations'
  | 'library'
  | 'it'
  | 'general';

export interface DashboardStat {
  key: string;
  label: string;
  value: number | string;
  hint?: string;
  /** 'money' → value is integer MINOR units; formatted in the institution's currency by the web. */
  format?: 'money';
}

/**
 * A widget's payload, discriminated by `type`. The web renders by type, so a widget the API adds
 * reusing an existing type needs no change here — and an unrecognised type is skipped, not thrown.
 *
 * `attention` carries no payload: that widget fetches /portal/attention itself via useAttention().
 */
export type WidgetData =
  | { type: 'stats'; stats: DashboardStat[] }
  | { type: 'list'; items: Array<{ id: string; title: string; subtitle?: string; badge?: string }> }
  | { type: 'comparison'; rows: Array<{ id: string; name: string; value: number }> }
  | { type: 'activity'; items: Array<{ id: string; title: string; description: string; at: string }> }
  | { type: 'attention' };

export interface DashboardWidget {
  id: string;
  persona: PersonaKey;
  title: string;
  description?: string;
  size: 'sm' | 'md' | 'lg';
  pinned: boolean;
  data: WidgetData;
}

export interface DashboardPersona {
  key: PersonaKey;
  label: string;
  /** True when one of the user's roles maps to this persona. Ordering hint only. */
  fromRole: boolean;
}

/**
 * GET /v1/portal/dashboard — the composed, scope-aware dashboard.
 *
 * Only widgets the caller's PERMISSIONS entitle them to are present; the queries behind the rest
 * never ran. Personas group them; they do not gate them.
 */
export interface PortalDashboardDto {
  scopeLabel: string;
  personas: DashboardPersona[];
  widgets: DashboardWidget[];
  /** Widget ids this user hid, so the web can offer "unhide" without another request. */
  hidden: string[];
}

/** GET/PUT /v1/portal/dashboard/prefs */
export interface DashboardPrefs {
  hidden: string[];
  pinned: string[];
  activePersona: PersonaKey | null;
}
