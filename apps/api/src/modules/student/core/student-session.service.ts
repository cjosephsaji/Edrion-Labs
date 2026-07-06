import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import type { CookieOptions } from 'express';
import { and, eq, isNull, schema, type Database } from '@edrion/database';
import type { ApiEnv } from '@edrion/config';
import { API_ENV, DATABASE } from '../../../common/tokens';
import { JwtError, signHs256, verifyHs256 } from '../../../common/jwt';
import type { StudentSessionKind, StudentSessionTokenPayload } from '../student.types';

export interface IssueStudentSessionInput {
  kind: StudentSessionKind;
  userId: string;
  institutionId?: string;
  ip?: string;
  userAgent?: string;
}

export interface VerifiedStudentSession {
  kind: StudentSessionKind;
  sessionId: string;
  userId: string;
  institutionId?: string;
  lastAuthAt: Date;
}

/**
 * Fronts both session stores: `portal_sessions` for institutional students and
 * `independent_sessions` for independent learners. The HTTP-only student cookie carries a JWT
 * `{ sid, uid, kind }` referencing the live session row.
 */
@Injectable()
export class StudentSessionService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(API_ENV) private readonly env: ApiEnv,
  ) {}

  get cookieName(): string {
    return this.env.STUDENT_SESSION_COOKIE_NAME;
  }

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

  async issue(input: IssueStudentSessionInput): Promise<{ token: string; sessionId: string }> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.env.SESSION_TTL_SECONDS * 1000);

    if (input.kind === 'institutional') {
      if (!input.institutionId) throw new Error('institutionId required for institutional session');
      const [session] = await this.db
        .insert(schema.portalSessions)
        .values({
          institutionId: input.institutionId,
          institutionUserId: input.userId,
          aal: 'aal1',
          lastAuthAt: now,
          expiresAt,
          ip: input.ip ?? null,
          userAgent: input.userAgent ?? null,
        })
        .returning();
      if (!session) throw new Error('Failed to create student session');
      const payload: Omit<StudentSessionTokenPayload, 'iat' | 'exp'> = {
        sid: session.id,
        uid: session.institutionUserId,
        kind: 'institutional',
      };
      const token = signHs256(payload, this.env.SESSION_COOKIE_SECRET, this.env.SESSION_TTL_SECONDS, now);
      return { token, sessionId: session.id };
    }

    const [session] = await this.db
      .insert(schema.independentSessions)
      .values({
        independentUserId: input.userId,
        aal: 'aal1',
        lastAuthAt: now,
        expiresAt,
        ip: input.ip ?? null,
        userAgent: input.userAgent ?? null,
      })
      .returning();
    if (!session) throw new Error('Failed to create independent session');
    const payload: Omit<StudentSessionTokenPayload, 'iat' | 'exp'> = {
      sid: session.id,
      uid: session.independentUserId,
      kind: 'independent',
    };
    const token = signHs256(payload, this.env.SESSION_COOKIE_SECRET, this.env.SESSION_TTL_SECONDS, now);
    return { token, sessionId: session.id };
  }

  async verify(token: string): Promise<VerifiedStudentSession> {
    let payload: Record<string, unknown>;
    try {
      payload = verifyHs256(token, this.env.SESSION_COOKIE_SECRET);
    } catch (err) {
      const message = err instanceof JwtError ? 'Invalid session' : 'Invalid session';
      throw new UnauthorizedException({ code: 'UNAUTHENTICATED', message });
    }

    const sid = typeof payload.sid === 'string' ? payload.sid : undefined;
    const uid = typeof payload.uid === 'string' ? payload.uid : undefined;
    const kind = payload.kind === 'institutional' || payload.kind === 'independent' ? payload.kind : undefined;
    if (!sid || !uid || !kind) {
      throw new UnauthorizedException({ code: 'UNAUTHENTICATED', message: 'Invalid session' });
    }

    if (kind === 'institutional') {
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
      return {
        kind: 'institutional',
        sessionId: session.id,
        userId: session.institutionUserId,
        institutionId: session.institutionId,
        lastAuthAt: session.lastAuthAt,
      };
    }

    const [session] = await this.db
      .select()
      .from(schema.independentSessions)
      .where(eq(schema.independentSessions.id, sid))
      .limit(1);
    if (!session || session.independentUserId !== uid) {
      throw new UnauthorizedException({ code: 'UNAUTHENTICATED', message: 'Session not found' });
    }
    if (session.revokedAt) {
      throw new UnauthorizedException({ code: 'SESSION_REVOKED', message: 'Session has been revoked' });
    }
    if (session.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException({ code: 'SESSION_EXPIRED', message: 'Session has expired' });
    }
    return {
      kind: 'independent',
      sessionId: session.id,
      userId: session.independentUserId,
      lastAuthAt: session.lastAuthAt,
    };
  }

  async revoke(sessionId: string, kind: StudentSessionKind, reason: string): Promise<void> {
    if (kind === 'institutional') {
      await this.db
        .update(schema.portalSessions)
        .set({ revokedAt: new Date(), revokedReason: reason })
        .where(and(eq(schema.portalSessions.id, sessionId), isNull(schema.portalSessions.revokedAt)));
      return;
    }
    await this.db
      .update(schema.independentSessions)
      .set({ revokedAt: new Date(), revokedReason: reason })
      .where(and(eq(schema.independentSessions.id, sessionId), isNull(schema.independentSessions.revokedAt)));
  }

  async revokeAllForInstitutionalUser(institutionUserId: string, reason: string): Promise<void> {
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

  async revokeAllForIndependentUser(independentUserId: string, reason: string): Promise<void> {
    await this.db
      .update(schema.independentSessions)
      .set({ revokedAt: new Date(), revokedReason: reason })
      .where(
        and(
          eq(schema.independentSessions.independentUserId, independentUserId),
          isNull(schema.independentSessions.revokedAt),
        ),
      );
  }
}
