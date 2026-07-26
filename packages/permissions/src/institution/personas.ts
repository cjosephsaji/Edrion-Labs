/**
 * Dashboard personas — a PRESENTATION grouping over roles. A persona decides which heading a
 * dashboard widget sits under and in what order the groups render. It NEVER grants or restricts
 * anything: entitlement is always computed from permission keys via `can`/`canAny`, so a user with
 * a custom tenant role still receives every widget their permissions allow, and a user whose role
 * maps to a persona still sees nothing in it without the underlying permission.
 *
 * Roles are many-to-many (`institution_user_roles`), so a user holds a LIST of personas, not one.
 */

export const PERSONA_ORDER = [
  'leadership',
  'academics',
  'teaching',
  'finance',
  'people',
  'admissions',
  'wellbeing',
  'operations',
  'library',
  'it',
  'general',
] as const;

export type PersonaKey = (typeof PERSONA_ORDER)[number];

export const PERSONA_LABELS: Record<PersonaKey, string> = {
  leadership: 'Leadership',
  academics: 'Academics',
  teaching: 'Teaching',
  finance: 'Finance',
  people: 'People',
  admissions: 'Admissions',
  wellbeing: 'Wellbeing',
  operations: 'Operations',
  library: 'Library',
  it: 'IT',
  general: 'General',
};

/**
 * Role key → persona. Covers every key in INSTITUTION_DEFAULT_ROLES. Anything absent (a custom
 * tenant role from `institution_roles`) falls back to `general` — which costs the user nothing,
 * because their widgets come from their permissions either way.
 */
const ROLE_PERSONAS: Record<string, PersonaKey> = {
  institution_owner: 'leadership',
  institution_admin: 'leadership',
  campus_admin: 'leadership',
  principal: 'leadership',

  academic_coordinator: 'academics',
  registrar: 'academics',
  department_head: 'academics',

  teacher: 'teaching',
  professor: 'teaching',
  assistant_professor: 'teaching',

  finance_manager: 'finance',

  hr_manager: 'people',

  school_nurse: 'wellbeing',
  counselor: 'wellbeing',

  librarian: 'library',

  it_staff: 'it',

  transport_manager: 'operations',
  hostel_warden: 'operations',
  receptionist: 'operations',
  clerk: 'operations',
  lab_staff: 'operations',
  maintenance_staff: 'operations',
  security_staff: 'operations',

  // Present in the catalogue but served inside institution-web (student-web for learners). They map to
  // `general` so an institution login carrying one of these keys is never left personaless.
  parent: 'general',
  student: 'general',
  phd_scholar: 'general',
  viewer: 'general',
};

/** Persona for a single role key. Unknown / custom keys → 'general'. */
export function personaForRole(roleKey: string): PersonaKey {
  return ROLE_PERSONAS[roleKey] ?? 'general';
}

/**
 * The personas a user holds, deduped and in PERSONA_ORDER. Always returns at least one entry so
 * the dashboard never renders an empty shell — a user with no roles at all gets ['general'].
 */
export function derivePersonas(roleKeys: readonly string[]): PersonaKey[] {
  const held = new Set<PersonaKey>();
  for (const key of roleKeys) held.add(personaForRole(key));
  if (held.size === 0) held.add('general');
  return PERSONA_ORDER.filter((p) => held.has(p));
}

// --- role predicates ---------------------------------------------------------
//
// Use these for PRESENTATION decisions only (labels, ordering, empty states). To decide whether a
// user may see data, use `can`/`canAny` against their permissions — a role name is not an
// authorisation check, and custom roles will never match one.

export function hasRole(roleKeys: readonly string[], key: string): boolean {
  return roleKeys.includes(key);
}

export function hasAnyRole(roleKeys: readonly string[], ...keys: string[]): boolean {
  return keys.some((k) => roleKeys.includes(k));
}

export function hasAllRoles(roleKeys: readonly string[], ...keys: string[]): boolean {
  return keys.every((k) => roleKeys.includes(k));
}
