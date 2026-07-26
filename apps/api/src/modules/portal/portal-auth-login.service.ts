import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ActorType, AuditResult, RiskLevel } from '@edrion/shared-types';
import { isMfaSatisfied, type Aal } from '@edrion/auth';
import type { PortalLoginInput, PortalReauthInput } from '@edrion/schemas';
import type { AuditWriter } from '@edrion/audit';
import type { InstitutionUser } from '@edrion/database';
import type { ApiEnv } from '@edrion/config';
import { API_ENV, AUDIT_WRITER } from '../../common/tokens';
import type { EdrionRequestContext } from '../../common/request-context';
import { SupabaseVerifier } from '../authentication/supabase-verifier';
import { verifyPassword } from '../authentication/password.util';
import { PortalAuthService } from './portal-auth.service';
import { PortalSessionService } from './portal-session.service';

const MODULE = 'portal-auth';

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

  /** Authenticate, enforce MFA + lockout, issue a server session. Returns the cookie token. */
  async login(input: PortalLoginInput, req: EdrionRequestContext): Promise<{ token: string }> {
    const { user, aal, idpSessionId } = await this.resolveIdentity(input);

    if (this.auth.isLocked(user)) {
      await this.logSecurity('portal_login_blocked_locked', user, req, true);
      throw new UnauthorizedException({ code: 'ACCOUNT_LOCKED', message: 'Account is temporarily locked' });
    }

    if (!isMfaSatisfied({ aal }, user.mfaEnrolled)) {
      const locked = await this.auth.registerFailedLogin(user.id, user.failedLoginAttempts);
      await this.logSecurity(locked ? 'portal_account_locked' : 'portal_login_mfa_required', user, req, locked);
      throw new UnauthorizedException({
        code: 'MFA_REQUIRED',
        message: 'Multi-factor authentication is required for this account',
      });
    }

    await this.auth.markLoginSuccess(user.id);
    const { token, session } = await this.sessions.issue({
      institutionId: user.institutionId,
      institutionUserId: user.id,
      aal,
      idpSessionId,
      ip: req.ip,
      userAgent: req.userAgent,
    });

    await this.audit.logAudit({
      ...this.actorFields(user, req),
      action: 'user.login',
      module: MODULE,
      entityType: 'portal_session',
      entityId: session.id,
      result: AuditResult.Success,
      riskLevel: RiskLevel.Low,
      newState: { aal },
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
      const matched = await this.auth.loadActiveByAuthUserId(claims.sub);
      if (!matched || matched.id !== user.id) {
        throw new UnauthorizedException({ code: 'UNAUTHENTICATED', message: 'Token does not match session' });
      }
      if (!isMfaSatisfied({ aal: claims.aal }, user.mfaEnrolled)) {
        throw new UnauthorizedException({ code: 'MFA_REQUIRED', message: 'Re-authentication requires MFA' });
      }
      aal = claims.aal ?? 'aal1';
    } else if (!this.env.PORTAL_AUTH_DEV_LOGIN || input.confirm !== true) {
      throw new UnauthorizedException({ code: 'UNAUTHENTICATED', message: 'Re-authentication failed' });
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

  private async resolveIdentity(
    input: PortalLoginInput,
  ): Promise<{ user: InstitutionUser; aal: Aal; idpSessionId?: string }> {
    if (input.accessToken) {
      const claims = this.supabase.verify(input.accessToken);
      const user = await this.auth.loadActiveByAuthUserId(claims.sub);
      if (!user) {
        throw new UnauthorizedException({ code: 'UNAUTHENTICATED', message: 'No portal user for this identity' });
      }
      return { user, aal: claims.aal ?? 'aal1', idpSessionId: claims.session_id };
    }

    // Native password login: email + bcrypt password. The account must be active (activated) and
    // hold a password hash — invited-but-not-activated users have none, so they cannot sign in yet.
    if (input.email && input.password) {
      const invalid = new UnauthorizedException({
        code: 'UNAUTHENTICATED',
        message: 'Incorrect email or password',
      });
      const user = await this.auth.loadActiveByEmail(input.email);
      if (!user || user.status !== 'active') throw invalid;
      if (!(await verifyPassword(input.password, user.passwordHash))) {
        await this.auth.registerFailedLogin(user.id, user.failedLoginAttempts);
        throw invalid;
      }
      return { user, aal: 'aal1' };
    }

    // Dev login: email-only, behind an explicit flag, so login can be exercised without Supabase.
    if (!this.env.PORTAL_AUTH_DEV_LOGIN || !input.email) {
      throw new UnauthorizedException({ code: 'UNAUTHENTICATED', message: 'An access token is required' });
    }
    const user = await this.auth.loadActiveByEmail(input.email);
    if (!user) {
      throw new UnauthorizedException({ code: 'UNAUTHENTICATED', message: 'Unknown or disabled user' });
    }
    // Dev login simulates a completed MFA so the recent-auth flow is exercisable locally.
    return { user, aal: user.mfaEnrolled ? 'aal2' : 'aal1' };
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
