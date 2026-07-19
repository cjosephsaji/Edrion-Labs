/**
 * True when the signed-in user should use the guardian (/family) experience instead of the staff
 * portal shell. A user with both parent and staff roles (e.g. a teacher who is also a guardian)
 * keeps the staff portal.
 */
export function isParentPortalUser(
  roleKeys: readonly string[],
  permissions: readonly string[],
): boolean {
  if (!roleKeys.includes('parent')) return false;
  const keys = new Set(permissions);
  if (keys.has('*')) return false;
  return !keys.has('students.view') && !keys.has('staff.view');
}
