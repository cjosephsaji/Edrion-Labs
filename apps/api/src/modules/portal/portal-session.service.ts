import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import type { CookieOptions } from 'express';
import { and, eq, isNull, schema, type Database, type PortalSession } from '@edrion/database';
import type { Aal, PortalSessionTokenPayload } from '@edrion/auth';
import type { ApiEnv } from '@edrion/config';
import { API_ENV, DATABASE } from '../../common/tokens';
import { JwtError, signHs256, verifyHs256 } from '../../common/jwt';

export interface IssuePortalSessionInput {
  institutionId: string;
  institutionUserId: string;
  aal: Aal;
  idpSessionId?: string;
  ip?: string;
  userAgent?: string;
}

/**
 * Owns the Institution Portal's server-side sessions — the tenant-facing twin of the platform
 * SessionService. The HTTP-only portal cookie carries an API-signed JWT whose `sid` references a
 * `portal_sessions` row; that row is the authority for revocation and for the recent-auth window
 * (`lastAuthAt`). Once an institution user proves their identity at login, every later portal
 * request rides this lighter session — the dev `x-institution-user-email` header is no longer the
 * only way in.
 */
@Injectable()
export class PortalSessionService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(API_ENV) private readonly env: ApiEnv,
  ) {}

  get cookieName(): string {
    return this.env.PORTAL_SESSION_COOKIE_NAME;
  }

  /** Cookie options for the portal session cookie. HTTP-only + secure-in-prod so JS can't read it. */
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

  /** Create a session row + sign the cookie JWT. Called on a successful portal login. */
  async issue(input: IssuePortalSessionInput): Promise<{ token: string; session: PortalSession }> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.env.SESSION_TTL_SECONDS * 1000);
    const [session] = await this.db
      .insert(schema.portalSessions)
      .values({
        institutionId: input.institutionId,
        institutionUserId: input.institutionUserId,
        aal: input.aal,
        idpSessionId: input.idpSessionId ?? null,
        lastAuthAt: now,
        expiresAt,
        ip: input.ip ?? null,
        userAgent: input.userAgent ?? null,
      })
      .returning();
    if (!session) throw new Error('Failed to create portal session');

    const payload: Omit<PortalSessionTokenPayload, 'iat' | 'exp'> = {
      sid: session.id,
      uid: session.institutionUserId,
    };
    const token = signHs256(payload, this.env.SESSION_COOKIE_SECRET, this.env.SESSION_TTL_SECONDS, now);
    return { token, session };
  }

  /**
   * Verify the portal session cookie and load the live session row. Rejects a bad/expired cookie,
   * a revoked or expired session, or a sid/uid mismatch — every failure is a 401.
   */
  async verify(token: string): Promise<PortalSession> {
    let payload: Record<string, unknown>;
    try {
      payload = verifyHs256(token, this.env.SESSION_COOKIE_SECRET);
    } catch (err) {
      const message = err instanceof JwtError ? 'Invalid session' : 'Invalid session';
      throw new UnauthorizedException({ code: 'UNAUTHENTICATED', message });
    }
    const sid = typeof payload.sid === 'string' ? payload.sid : undefined;
    const uid = typeof payload.uid === 'string' ? payload.uid : undefined;
    if (!sid || !uid) throw new UnauthorizedException({ code: 'UNAUTHENTICATED', message: 'Invalid session' });

    const [session] = await this.db
      .select()
      .from(schema.portalSessions)
      .where(eq(schema.portalSessions.id, sid))
      .limit(1);

    if (!session || session.institutionUserId !== uid) {
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
      .update(schema.portalSessions)
      .set({ lastAuthAt: now, aal })
      .where(eq(schema.portalSessions.id, sessionId));
    return now;
  }

  async revoke(sessionId: string, reason: string): Promise<void> {
    await this.db
      .update(schema.portalSessions)
      .set({ revokedAt: new Date(), revokedReason: reason })
      .where(and(eq(schema.portalSessions.id, sessionId), isNull(schema.portalSessions.revokedAt)));
  }

  /** Revoke every live session for a user (lockout, disable, password reset, admin action). */
  async revokeAllForUser(institutionUserId: string, reason: string): Promise<void> {
    await this.db
      .update(schema.portalSessions)
      .set({ revokedAt: new Date(), revokedReason: reason })
      .where(
        and(
          eq(schema.portalSessions.institutionUserId, institutionUserId),
          isNull(schema.portalSessions.revokedAt),
        ),
      );
  }
}
