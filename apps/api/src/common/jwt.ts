import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Minimal HS256 JSON Web Token codec built on Node crypto — no third-party dependency.
 *
 * Why hand-rolled: the API only needs HS256 (the algorithm Supabase signs access tokens with,
 * using the project JWT secret) for both verifying inbound IdP tokens and signing its own
 * session cookie. Keeping it to the standard library avoids a new dependency in an exFAT /
 * offline-tolerant workspace, and the surface is small enough to fully unit-test.
 *
 * Security notes:
 *  - Only `alg: HS256` is accepted on verify; an `alg: none` / algorithm-confusion token is
 *    rejected before any signature work (the classic JWT bypass).
 *  - Signature comparison is constant-time.
 *  - `exp` (and `nbf` when present) are enforced with a small clock-skew tolerance.
 */

const ENC = 'base64url' as const;
const CLOCK_SKEW_SECONDS = 30;

function b64urlJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString(ENC);
}

function sign(signingInput: string, secret: string): string {
  return createHmac('sha256', secret).update(signingInput).digest(ENC);
}

export class JwtError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'JwtError';
  }
}

/** Sign a payload as an HS256 JWT. `expiresInSeconds` sets `exp`; `iat` is set to now. */
export function signHs256(
  payload: Record<string, unknown>,
  secret: string,
  expiresInSeconds: number,
  now: Date = new Date(),
): string {
  const iat = Math.floor(now.getTime() / 1000);
  const header = b64urlJson({ alg: 'HS256', typ: 'JWT' });
  const body = b64urlJson({ ...payload, iat, exp: iat + expiresInSeconds });
  const signingInput = `${header}.${body}`;
  return `${signingInput}.${sign(signingInput, secret)}`;
}

/**
 * Verify an HS256 JWT and return its decoded payload. Throws {@link JwtError} on a malformed
 * token, a wrong/`none` algorithm, a bad signature, or expiry. Does NOT interpret claims beyond
 * the standard time fields — domain claim validation lives in `parseSupabaseClaims`.
 */
export function verifyHs256(token: string, secret: string, now: Date = new Date()): Record<string, unknown> {
  const parts = token.split('.');
  if (parts.length !== 3) throw new JwtError('Malformed token');
  const [headerB64, bodyB64, sigB64] = parts as [string, string, string];

  let header: { alg?: unknown };
  try {
    header = JSON.parse(Buffer.from(headerB64, ENC).toString('utf8'));
  } catch {
    throw new JwtError('Unparseable header');
  }
  if (header.alg !== 'HS256') throw new JwtError('Unsupported algorithm');

  const expected = sign(`${headerB64}.${bodyB64}`, secret);
  const a = Buffer.from(sigB64);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new JwtError('Bad signature');

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(Buffer.from(bodyB64, ENC).toString('utf8'));
  } catch {
    throw new JwtError('Unparseable payload');
  }

  const nowSec = Math.floor(now.getTime() / 1000);
  if (typeof payload.exp === 'number' && payload.exp + CLOCK_SKEW_SECONDS < nowSec) {
    throw new JwtError('Token expired');
  }
  if (typeof payload.nbf === 'number' && payload.nbf - CLOCK_SKEW_SECONDS > nowSec) {
    throw new JwtError('Token not yet valid');
  }
  return payload;
}
