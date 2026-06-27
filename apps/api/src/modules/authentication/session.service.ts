import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import type { CookieOptions } from 'express';
import { and, eq, isNull, schema, type AuthSession, type Database } from '@edrion/database';
import type { Aal, SessionTokenPayload } from '@edrion/auth';
import type { ApiEnv } from '@edrion/config';
import { API_ENV, DATABASE } from '../../common/tokens';
import { JwtError, signHs256, verifyHs256 } from '../../common/jwt';

export interface IssueSessionInput {
  employeeId: string;
  aal: Aal;
  idpSessionId?: string;
  ip?: string;
  userAgent?: string;
}

/**
 * Owns the API's server-side sessions. The HTTP-only cookie carries an API-signed JWT whose
 * `sid` references an `auth_sessions` row; that row is the authority for revocation and for the
 * recent-auth window (`lastAuthAt`). Verifying IdP tokens is the SupabaseVerifier's job — once
 * an identity is proven at login, every later request rides this lighter session.
 */
@Injectable()
export class SessionService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(API_ENV) private readonly env: ApiEnv,
  ) {}

  get cookieName(): string {
    return this.env.SESSION_COOKIE_NAME;
  }

  /** Cookie options for the session cookie. HTTP-only + secure-in-prod so JS can't read it. */
  cookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      sameSite: 'lax',
      secure: this.env.NODE_ENV === 'production',
      path: '/',
      maxAge: this.env.SESSION_TTL_SECONDS * 1000,
    };
  }

  clearCookieOptions(): CookieOptions {
    const { maxAge: _maxAge, ...rest } = this.cookieOptions();
    return rest;
  }

  /** Create a session row + sign the cookie JWT. Called on a successful login. */
  async issue(input: IssueSessionInput): Promise<{ token: string; session: AuthSession }> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.env.SESSION_TTL_SECONDS * 1000);
    const [session] = await this.db
      .insert(schema.authSessions)
      .values({
        employeeId: input.employeeId,
        aal: input.aal,
        idpSessionId: input.idpSessionId ?? null,
        lastAuthAt: now,
        expiresAt,
        ip: input.ip ?? null,
        userAgent: input.userAgent ?? null,
      })
      .returning();
    if (!session) throw new Error('Failed to create auth session');

    const payload: Omit<SessionTokenPayload, 'iat' | 'exp'> = { sid: session.id, eid: session.employeeId };
    const token = signHs256(payload, this.env.SESSION_COOKIE_SECRET, this.env.SESSION_TTL_SECONDS, now);
    return { token, session };
  }

  /**
   * Verify the session cookie and load the live session row. Rejects a bad/expired cookie, a
   * revoked or expired session, or a sid/eid mismatch — every failure is a 401.
   */
  async verify(token: string): Promise<AuthSession> {
    let payload: Record<string, unknown>;
    try {
      payload = verifyHs256(token, this.env.SESSION_COOKIE_SECRET);
    } catch (err) {
      const message = err instanceof JwtError ? 'Invalid session' : 'Invalid session';
      throw new UnauthorizedException({ code: 'UNAUTHENTICATED', message });
    }
    const sid = typeof payload.sid === 'string' ? payload.sid : undefined;
    const eid = typeof payload.eid === 'string' ? payload.eid : undefined;
    if (!sid || !eid) throw new UnauthorizedException({ code: 'UNAUTHENTICATED', message: 'Invalid session' });

    const [session] = await this.db
      .select()
      .from(schema.authSessions)
      .where(eq(schema.authSessions.id, sid))
      .limit(1);

    if (!session || session.employeeId !== eid) {
      throw new UnauthorizedException({ code: 'UNAUTHENTICATED', message: 'Session not found' });
    }
    if (session.revokedAt) {
      throw new UnauthorizedException({ code: 'SESSION_REVOKED', message: 'Session has been revoked' });
    }
    if (session.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException({ code: 'SESSION_EXPIRED', message: 'Session has expired' });
    }
    return session;
  }

  /** Stamp a strong re-authentication onto the session — this is what recent-auth reads. */
  async touchReauth(sessionId: string, aal: Aal): Promise<Date> {
    const now = new Date();
    await this.db
      .update(schema.authSessions)
      .set({ lastAuthAt: now, aal })
      .where(eq(schema.authSessions.id, sessionId));
    return now;
  }

  async revoke(sessionId: string, reason: string): Promise<void> {
    await this.db
      .update(schema.authSessions)
      .set({ revokedAt: new Date(), revokedReason: reason })
      .where(and(eq(schema.authSessions.id, sessionId), isNull(schema.authSessions.revokedAt)));
  }

  /** Revoke every live session for an employee (lockout, password reset, admin action). */
  async revokeAllForEmployee(employeeId: string, reason: string): Promise<void> {
    await this.db
      .update(schema.authSessions)
      .set({ revokedAt: new Date(), revokedReason: reason })
      .where(
        and(eq(schema.authSessions.employeeId, employeeId), isNull(schema.authSessions.revokedAt)),
      );
  }
}
