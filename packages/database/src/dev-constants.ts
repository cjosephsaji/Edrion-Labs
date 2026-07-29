/**
 * Dev-only bcrypt hash of the password `password` (cost 10). Used by seeds and local login.
 * NEVER use in production.
 */
export const DEV_PASSWORD_HASH =
  '$2a$10$ByZT0oBbpXQboXG7ZlkzbOWfBfx9uAwu6Zf0HAt/G3yIcji9Rh.WG';

export const DEV_PASSWORD_PLAINTEXT = 'password';

/** Emails deleted from auth.users during dev reset (Postgres regex). */
export const DEV_AUTH_USER_EMAIL_PATTERN =
  '@(greenwood\\.edu|edrion\\.dev|edrion\\.local|uis\\.edu\\.in|example\\.com)$';
