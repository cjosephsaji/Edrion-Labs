/**
 * Governance for scope-confined role assignment (Phase 13). A Campus Admin (and any other
 * non-institution-wide principal holding `users.assign_scoped_roles`) may grant ONLY these
 * operational staff roles, and only within their own campuses. Institution Owner/Admin are
 * unaffected — they assign the full role set via `users.manage_roles`.
 *
 * Keys-only: nothing branches on a role *name* at runtime; this is just the allowlist the
 * User Management service enforces in validateRoleKeys.
 */
export const CAMPUS_ADMIN_ASSIGNABLE_ROLE_KEYS = [
  'school_nurse',
  'counselor',
  'lab_staff',
  'receptionist',
  'it_staff',
  'maintenance_staff',
  'security_staff',
] as const;

export type CampusAdminAssignableRoleKey = (typeof CAMPUS_ADMIN_ASSIGNABLE_ROLE_KEYS)[number];

const assignableSet = new Set<string>(CAMPUS_ADMIN_ASSIGNABLE_ROLE_KEYS);

/** True when a Campus Admin may assign this role key. */
export function isCampusAdminAssignableRole(key: string): boolean {
  return assignableSet.has(key);
}
