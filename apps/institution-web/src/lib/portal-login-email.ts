/** True when the email field has non-whitespace content (user is still typing counts as entered). */
export function hasPortalLoginEmail(email: unknown): boolean {
  return typeof email === 'string' && email.trim().length > 0;
}

/**
 * Effective portal-login flag: off without email; otherwise follows the user's checkbox.
 */
export function effectivePortalLogin(email: unknown, createLogin: unknown): boolean {
  if (!hasPortalLoginEmail(email)) return false;
  return createLogin === true;
}

/**
 * When email is cleared, portal login must be off. When email is newly added, turn it on.
 * Preserves a manual opt-out while email stays filled.
 */
export function portalLoginAfterEmailChange(
  hadEmail: boolean,
  hasEmail: boolean,
  currentCreateLogin: boolean,
): boolean {
  if (!hasEmail) return false;
  if (!hadEmail && hasEmail) return true;
  return currentCreateLogin;
}
