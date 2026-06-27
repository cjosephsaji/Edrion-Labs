/**
 * Identity-provider (Supabase Auth) token claims + the API's own session-cookie payload.
 *
 * These are pure shapes + pure predicates: no crypto, no I/O. The API verifies the JWT
 * signature (HS256, project secret) and then validates the decoded payload through here, so the
 * same rules can be unit-tested without a network or a hosted Supabase instance.
 */

/** Authenticator Assurance Level. `aal2` means a second factor was satisfied. */
export type Aal = 'aal1' | 'aal2';

/** The subset of Supabase access-token claims the platform relies on. */
export interface SupabaseClaims {
  /** Auth user id — maps to `platform_employees.auth_user_id`. */
  sub: string;
  email?: string;
  /** Assurance level of the session that minted this token. */
  aal?: Aal;
  /** Supabase session id, persisted so the API session can be tied back to the IdP session. */
  session_id?: string;
  /** Unix seconds. */
  exp?: number;
  iat?: number;
}

/** Payload of the API-signed session cookie (HS256, SESSION_COOKIE_SECRET). */
export interface SessionTokenPayload {
  /** auth_sessions.id — the revocation + recent-auth authority for this session. */
  sid: string;
  /** platform_employees.id. */
  eid: string;
  exp: number;
  iat: number;
}

class ClaimError extends Error {}

/** Validate a decoded JWT payload as Supabase claims, throwing on anything malformed. */
export function parseSupabaseClaims(payload: unknown, now: Date = new Date()): SupabaseClaims {
  if (typeof payload !== 'object' || payload === null) throw new ClaimError('Token payload is not an object');
  const p = payload as Record<string, unknown>;
  if (typeof p.sub !== 'string' || p.sub.length === 0) throw new ClaimError('Token is missing sub');
  if (p.aal !== undefined && p.aal !== 'aal1' && p.aal !== 'aal2') throw new ClaimError('Invalid aal claim');
  if (typeof p.exp === 'number' && p.exp * 1000 < now.getTime()) throw new ClaimError('Token has expired');
  return {
    sub: p.sub,
    email: typeof p.email === 'string' ? p.email : undefined,
    aal: p.aal as Aal | undefined,
    session_id: typeof p.session_id === 'string' ? p.session_id : undefined,
    exp: typeof p.exp === 'number' ? p.exp : undefined,
    iat: typeof p.iat === 'number' ? p.iat : undefined,
  };
}

/**
 * MFA policy for employees: an employee enrolled in MFA must present an `aal2` token. An
 * employee not yet enrolled may authenticate at `aal1` (so onboarding isn't a chicken-and-egg).
 * This is the rule the auth layer enforces at login; the permission/recent-auth boundary is
 * unchanged and remains authoritative for what an authenticated employee may then do.
 */
export function isMfaSatisfied(claims: Pick<SupabaseClaims, 'aal'>, mfaEnrolled: boolean): boolean {
  if (!mfaEnrolled) return true;
  return claims.aal === 'aal2';
}
