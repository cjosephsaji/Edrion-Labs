import { createHash } from 'node:crypto';
import { z } from 'zod';
import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ActorType, AuditResult, RiskLevel } from '@edrion/shared-types';
import { isMfaSatisfied, type Aal } from '@edrion/auth';
import type {
  PortalLoginInput,
  PortalReauthInput,
  PortalSelectInstitutionInput,
} from '@edrion/schemas';
import type { AuditWriter } from '@edrion/audit';
import type { InstitutionUser } from '@edrion/database';
import type { ApiEnv } from '@edrion/config';
import { API_ENV, AUDIT_WRITER } from '../../common/tokens';
import type { EdrionRequestContext } from '../../common/request-context';
import { SupabaseVerifier } from '../authentication/supabase-verifier';
import { verifyPassword } from '../authentication/password.util';
import { PortalAuthService } from './portal-auth.service';
import { PortalSessionService, type PortalMembershipProof } from './portal-session.service';
import { signHs256, verifyHs256 } from '../../common/jwt';

const MODULE = 'portal-auth';

const proofSchema = z.object({
  userId: z.string(),
  credentialVersion: z.string(),
  aal: z.enum(['aal1', 'aal2']),
  lastAuthAt: z.string().datetime(),
});
const selectionSchema = z.object({
  purpose: z.literal('portal-institution-selection'),
  email: z.string(),
  membershipProofs: z.array(proofSchema).min(1),
  aal: z.enum(['aal1', 'aal2']),
  lastAuthAt: z.string().datetime(),
  idpSessionId: z.string().optional(),
});

type SelectionContext = {
  users: InstitutionUser[];
  membershipProofs: PortalMembershipProof[];
  aal: Aal;
  lastAuthAt: Date;
  idpSessionId?: string;
  sessionId?: string;
  currentUserId?: string;
  expiresAt?: Date;
};

export type PortalLoginResult =
  | { token: string; selectionToken?: never }
  | { selectionToken: string; token?: never };

/**
 * Orchestrates the institution-portal authentication lifecycle (login → re-auth → logout) and
 * audits every step — the tenant-facing twin of the platform AuthLoginService. The controller is
 * HTTP-only (cookie set/clear); the policy — identity resolution, MFA enforcement, account
 * lockout, session issue/revoke — lives here. The per-request permission boundary is unchanged.
 */
@Injectable()
export class PortalAuthLoginService {
  constructor(
    private readonly auth: PortalAuthService,
    private readonly sessions: PortalSessionService,
    private readonly supabase: SupabaseVerifier,
    @Inject(AUDIT_WRITER) private readonly audit: AuditWriter,
    @Inject(API_ENV) private readonly env: ApiEnv,
  ) {}

  get selectionCookieName(): string {
    return `${this.sessions.cookieName}_selection`;
  }

  /** Authenticate every matching membership; never choose an arbitrary email match. */
  async login(input: PortalLoginInput, req: EdrionRequestContext): Promise<PortalLoginResult> {
    const context = await this.resolveIdentities(input);
    if (context.users.length > 1) {
      return {
        selectionToken: signHs256(
          {
            purpose: 'portal-institution-selection',
            email: context.users[0]!.email,
            membershipProofs: context.membershipProofs,
            aal: context.aal,
            lastAuthAt: context.lastAuthAt.toISOString(),
            idpSessionId: context.idpSessionId,
          },
          this.env.SESSION_COOKIE_SECRET,
          300,
        ),
      };
    }
    return this.issue(context.users[0]!, context, req);
  }

  /** Public at the routing layer; a verified pending ticket or live server session is mandatory. */
  async institutions(sessionToken?: string, selectionToken?: string) {
    const context = await this.selectionContext(sessionToken, selectionToken);
    const names = await this.auth.institutionNames(context.users);
    return {
      currentUserId: context.currentUserId ?? null,
      institutions: context.users
        .map((user) => ({
          institutionUserId: user.id,
          institutionId: user.institutionId,
          institutionName: names.get(user.institutionId) ?? 'Institution',
          requiresPassword: !this.hasProof(user, context.membershipProofs),
        }))
        .sort((a, b) => a.institutionName.localeCompare(b.institutionName)),
    };
  }

  async selectInstitution(
    input: PortalSelectInstitutionInput,
    req: EdrionRequestContext,
    sessionToken?: string,
    selectionToken?: string,
  ): Promise<{ token: string }> {
    const context = await this.selectionContext(sessionToken, selectionToken);
    const user = context.users.find((candidate) => candidate.id === input.institutionUserId);
    if (!user) throw this.unauthenticated('This institution is not linked to your account');
    if (this.auth.isLocked(user)) {
      await this.logSecurity('portal_login_blocked_locked', user, req, true);
      throw new UnauthorizedException({
        code: 'ACCOUNT_LOCKED',
        message: 'Account is temporarily locked',
      });
    }
    if (!this.hasProof(user, context.membershipProofs)) {
      if (!input.password) {
        throw new UnauthorizedException({
          code: 'PASSWORD_REQUIRED',
          message: 'Enter your password for this institution',
        });
      }
      if (!(await verifyPassword(input.password, user.passwordHash))) {
        await this.auth.registerFailedLogin(user.id, user.failedLoginAttempts);
        throw this.unauthenticated('Incorrect password for this institution');
      }
      context.membershipProofs = [
        ...context.membershipProofs.filter((proof) => proof.userId !== user.id),
        this.proof(user, 'aal1', new Date()),
      ];
      context.lastAuthAt = new Date();
      // A native password is aal1 even when the previous institution used MFA.
      context.aal = 'aal1';
    }
    const selectedProof = context.membershipProofs.find((proof) => proof.userId === user.id)!;
    context.aal = selectedProof.aal;
    context.lastAuthAt = new Date(selectedProof.lastAuthAt);
    const result = await this.issue(user, context, req);
    if (context.sessionId) {
      await this.sessions.revoke(context.sessionId, 'institution_switch');
    }
    return result;
  }

  private async issue(user: InstitutionUser, context: SelectionContext, req: EdrionRequestContext) {
    if (this.auth.isLocked(user)) {
      await this.logSecurity('portal_login_blocked_locked', user, req, true);
      throw new UnauthorizedException({
        code: 'ACCOUNT_LOCKED',
        message: 'Account is temporarily locked',
      });
    }
    if (!isMfaSatisfied({ aal: context.aal }, user.mfaEnrolled || user.requireMfa)) {
      const locked = await this.auth.registerFailedLogin(user.id, user.failedLoginAttempts);
      await this.logSecurity(
        locked ? 'portal_account_locked' : 'portal_login_mfa_required',
        user,
        req,
        locked,
      );
      throw new UnauthorizedException({
        code: 'MFA_REQUIRED',
        message: 'Multi-factor authentication is required for this account',
      });
    }
    await this.auth.markLoginSuccess(user.id);
    const { token, session } = await this.sessions.issue({
      institutionId: user.institutionId,
      institutionUserId: user.id,
      aal: context.aal,
      idpSessionId: context.idpSessionId,
      membershipProofs: context.membershipProofs,
      lastAuthAt: context.lastAuthAt,
      expiresAt: context.expiresAt,
      ip: req.ip,
      userAgent: req.userAgent,
    });
    await this.audit.logAudit({
      ...this.actorFields(user, req),
      action: context.sessionId ? 'user.institution_switch' : 'user.login',
      module: MODULE,
      entityType: 'portal_session',
      entityId: session.id,
      result: AuditResult.Success,
      riskLevel: RiskLevel.Low,
      newState: { aal: context.aal, previousInstitutionUserId: context.currentUserId },
    });
    return { token };
  }

  /**
   * Strong re-authentication for the recent-auth gate. Stamps the session's lastAuthAt, which is
   * exactly what the portal PermissionsGuard reads for sensitive actions.
   */
  async reauth(
    input: PortalReauthInput,
    sessionId: string,
    user: { id: string; institutionId: string; fullName: string; mfaEnrolled: boolean },
    req: EdrionRequestContext,
  ): Promise<void> {
    let aal: Aal = 'aal2';
    if (input.accessToken) {
      const claims = this.supabase.verify(input.accessToken);
      const matched = await this.auth.loadAllActiveByAuthUserId(claims.sub);
      if (!matched.some((candidate) => candidate.id === user.id)) {
        throw new UnauthorizedException({
          code: 'UNAUTHENTICATED',
          message: 'Token does not match session',
        });
      }
      if (!isMfaSatisfied({ aal: claims.aal }, user.mfaEnrolled)) {
        throw new UnauthorizedException({
          code: 'MFA_REQUIRED',
          message: 'Re-authentication requires MFA',
        });
      }
      aal = claims.aal ?? 'aal1';
    } else if (!this.env.PORTAL_AUTH_DEV_LOGIN || input.confirm !== true) {
      throw new UnauthorizedException({
        code: 'UNAUTHENTICATED',
        message: 'Re-authentication failed',
      });
    }

    await this.sessions.touchReauth(sessionId, aal);
    await this.audit.logAudit({
      ...this.actorFields(user, req),
      action: 'user.reauth',
      module: MODULE,
      entityType: 'portal_session',
      entityId: sessionId,
      result: AuditResult.Success,
      riskLevel: RiskLevel.Medium,
    });
  }

  async logout(
    sessionId: string,
    user: { id: string; institutionId: string; fullName: string },
    req: EdrionRequestContext,
  ): Promise<void> {
    await this.sessions.revoke(sessionId, 'logout');
    await this.audit.logAudit({
      ...this.actorFields(user, req),
      action: 'user.logout',
      module: MODULE,
      entityType: 'portal_session',
      entityId: sessionId,
      result: AuditResult.Success,
      riskLevel: RiskLevel.Low,
    });
  }

  // --- internals --------------------------------------------------------------

  private async resolveIdentities(input: PortalLoginInput): Promise<SelectionContext> {
    let users: InstitutionUser[];
    let verified: InstitutionUser[];
    let aal: Aal = 'aal1';
    let idpSessionId: string | undefined;
    if (input.accessToken) {
      const claims = this.supabase.verify(input.accessToken);
      users = await this.auth.loadAllActiveByAuthUserId(claims.sub);
      verified = users;
      aal = claims.aal ?? 'aal1';
      idpSessionId = claims.session_id;
    } else if (input.email && input.password) {
      users = await this.auth.loadAllActiveByEmail(input.email);
      verified = [];
      for (const user of users) {
        if (this.auth.isLocked(user)) continue;
        if (await verifyPassword(input.password, user.passwordHash)) verified.push(user);
      }
      if (!verified.length) {
        for (const user of users) {
          if (!this.auth.isLocked(user))
            await this.auth.registerFailedLogin(user.id, user.failedLoginAttempts);
        }
        throw this.unauthenticated('Incorrect email or password');
      }
    } else {
      if (!this.env.PORTAL_AUTH_DEV_LOGIN || !input.email) {
        throw this.unauthenticated('An access token or email and password is required');
      }
      users = await this.auth.loadAllActiveByEmail(input.email);
      verified = users;
      aal = 'aal2';
    }
    if (!verified.length) throw this.unauthenticated('No active portal account for this identity');
    const lastAuthAt = new Date();
    return {
      users,
      membershipProofs: verified.map((user) => this.proof(user, aal, lastAuthAt)),
      aal,
      idpSessionId,
      lastAuthAt,
    };
  }

  private async selectionContext(
    sessionToken?: string,
    selectionToken?: string,
  ): Promise<SelectionContext> {
    // Pending login takes precedence over an older session in the same browser.
    if (selectionToken) {
      let claims: z.infer<typeof selectionSchema>;
      try {
        claims = selectionSchema.parse(verifyHs256(selectionToken, this.env.SESSION_COOKIE_SECRET));
      } catch {
        throw this.unauthenticated('Your institution selection expired. Sign in again.');
      }
      const users = await this.auth.loadAllActiveByEmail(claims.email);
      if (
        !users.some(
          (user) => this.hasProof(user, claims.membershipProofs) && !this.auth.isLocked(user),
        )
      ) {
        throw this.unauthenticated('Your account changed. Sign in again.');
      }
      return {
        users,
        membershipProofs: claims.membershipProofs,
        aal: claims.aal,
        idpSessionId: claims.idpSessionId,
        lastAuthAt: new Date(claims.lastAuthAt),
      };
    }
    if (!sessionToken) throw this.unauthenticated('Sign in to choose an institution');
    const session = await this.sessions.verify(sessionToken);
    const user = await this.auth.loadActiveById(session.institutionUserId);
    if (!user) throw this.unauthenticated('Unknown or disabled user');
    const claims = verifyHs256(sessionToken, this.env.SESSION_COOKIE_SECRET);
    const parsed = z.array(proofSchema).safeParse(claims.membershipProofs);
    // Activation and older sessions have no membership proofs; only the current membership is trusted.
    const proofs =
      parsed.success && parsed.data.length
        ? parsed.data
        : [this.proof(user, session.aal as Aal, session.lastAuthAt)];
    if (!this.hasProof(user, proofs))
      throw this.unauthenticated('Your credentials changed. Sign in again.');
    // A re-authentication upgrades only the current membership, never another institution's proof.
    const refreshedProofs = proofs.map((proof) =>
      proof.userId === user.id ? this.proof(user, session.aal as Aal, session.lastAuthAt) : proof,
    );
    return {
      users: await this.auth.loadAllActiveByEmail(user.email),
      membershipProofs: refreshedProofs,
      aal: session.aal as Aal,
      idpSessionId: session.idpSessionId ?? undefined,
      lastAuthAt: session.lastAuthAt,
      expiresAt: session.expiresAt,
      sessionId: session.id,
      currentUserId: user.id,
    };
  }

  private proof(
    user: InstitutionUser,
    aal: Aal = 'aal1',
    lastAuthAt = new Date(),
  ): PortalMembershipProof {
    // Invalidate saved credential proof after password reset, identity relinking or session revocation.
    const credentialVersion = createHash('sha256')
      .update(
        JSON.stringify([user.passwordHash, user.authUserId, user.sessionsRevokedAt?.toISOString()]),
      )
      .digest('hex');
    return { userId: user.id, credentialVersion, aal, lastAuthAt: lastAuthAt.toISOString() };
  }

  private hasProof(user: InstitutionUser, proofs: PortalMembershipProof[]): boolean {
    return proofs.some(
      (proof) =>
        proof.userId === user.id && proof.credentialVersion === this.proof(user).credentialVersion,
    );
  }

  private unauthenticated(message: string) {
    return new UnauthorizedException({ code: 'UNAUTHENTICATED', message });
  }

  private actorFields(
    user: { id: string; institutionId: string; fullName: string },
    req: EdrionRequestContext,
  ) {
    return {
      actorType: ActorType.InstitutionUser,
      actorId: user.id,
      actorName: user.fullName,
      institutionId: user.institutionId,
      ip: req.ip,
      userAgent: req.userAgent,
      requestId: req.requestId,
      correlationId: req.correlationId,
      apiEndpoint: req.apiEndpoint,
    };
  }

  private async logSecurity(
    eventType: string,
    user: InstitutionUser,
    req: EdrionRequestContext,
    flagged: boolean,
  ): Promise<void> {
    await this.audit.logSecurity({
      eventType,
      actorType: ActorType.InstitutionUser,
      actorId: user.id,
      institutionId: user.institutionId,
      riskLevel: flagged ? RiskLevel.High : RiskLevel.Medium,
      ip: req.ip,
      userAgent: req.userAgent,
      detail: { email: user.email },
      flagged,
    });
  }
}
