import { compare, hash } from 'bcryptjs';
import { createHash, randomBytes } from 'node:crypto';

/**
 * Native-credential helpers shared by the platform and portal auth flows.
 *
 * Passwords are stored as bcrypt hashes (cost 10). Single-use tokens (account activation,
 * password reset) are random 256-bit secrets handed out in email links and stored only as a
 * salted SHA-256 — mirroring the registration OTP pattern (see `otp.service.ts`) so a DB leak
 * alone cannot reconstruct a live link.
 */

const BCRYPT_COST = 10;

export function hashPassword(plain: string): Promise<string> {
  return hash(plain, BCRYPT_COST);
}

export function verifyPassword(plain: string, passwordHash: string | null | undefined): Promise<boolean> {
  if (!passwordHash) return Promise.resolve(false);
  return compare(plain, passwordHash);
}

/** Fresh URL-safe token for an email link. The raw value is emailed and never persisted. */
export function makeToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Salted SHA-256 of a token for at-rest storage/lookup. `pepper` is a server secret. */
export function hashToken(token: string, pepper: string): string {
  return createHash('sha256').update(`${token}:${pepper}`).digest('hex');
}
