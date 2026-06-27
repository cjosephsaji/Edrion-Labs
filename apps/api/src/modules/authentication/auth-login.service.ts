import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ActorType, AuditResult, RiskLevel } from '@edrion/shared-types';
import { isMfaSatisfied, type Aal, type EmployeePrincipal } from '@edrion/auth';
import type { LoginInput, ReauthInput } from '@edrion/schemas';
import type { AuditWriter } from '@edrion/audit';
import type { PlatformEmployee } from '@edrion/database';
import type { ApiEnv } from '@edrion/config';
import { API_ENV, AUDIT_WRITER } from '../../common/tokens';
import type { EdrionRequestContext } from '../../common/request-context';
import { AuthService } from './auth.service';
import { SessionService } from './session.service';
import { SupabaseVerifier } from './supabase-verifier';

const MODULE = 'authentication';

/**
 * Orchestrates the authentication lifecycle (login → re-auth → logout) and audits every step.
 * The controller is HTTP-only (cookie set/clear); the policy — identity resolution, MFA
 * enforcement, account lockout, session issue/revoke — lives here. The per-request permission
 * boundary is unchanged: this only establishes who the request is and how fresh their auth is.
 */
@Injectable()
export class AuthLoginService {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionService,
    private readonly supabase: SupabaseVerifier,
    @Inject(AUDIT_WRITER) private readonly audit: AuditWriter,
    @Inject(API_ENV) private readonly env: ApiEnv,
  ) {}

  /** Authenticate, enforce MFA + lockout, issue a server session. Returns the cookie token. */
  async login(input: LoginInput, req: EdrionRequestContext): Promise<{ token: string }> {
    const resolved = await this.resolveIdentity(input);
    const { employee, aal, idpSessionId } = resolved;

    if (this.auth.isLocked(employee)) {
      await this.logSecurity('login_blocked_locked', employee, req, true);
      throw new UnauthorizedException({ code: 'ACCOUNT_LOCKED', message: 'Account is temporarily locked' });
    }

    if (!isMfaSatisfied({ aal }, employee.mfaEnrolled)) {
      const locked = await this.auth.registerFailedLogin(employee.id, employee.failedLoginAttempts);
      await this.logSecurity(locked ? 'account_locked' : 'login_mfa_required', employee, req, locked);
      throw new UnauthorizedException({
        code: 'MFA_REQUIRED',
        message: 'Multi-factor authentication is required for this account',
      });
    }

    await this.auth.markLoginSuccess(employee.id);
    const { token, session } = await this.sessions.issue({
      employeeId: employee.id,
      aal,
      idpSessionId,
      ip: req.ip,
      userAgent: req.userAgent,
    });

    await this.audit.logAudit({
      ...this.actorFields(employee, req),
      action: 'employee.login',
      module: MODULE,
      entityType: 'auth_session',
      entityId: session.id,
      result: AuditResult.Success,
      riskLevel: RiskLevel.Low,
      newState: { aal },
    });
    return { token };
  }

  /**
   * Strong re-authentication for the recent-auth gate. Stamps the session's lastAuthAt, which is
   * exactly what PermissionsGuard reads for sensitive actions. Makes the 9e RECENT_AUTH_REQUIRED
   * affordance a real re-auth instead of a placeholder.
   */
  async reauth(
    input: ReauthInput,
    sessionId: string,
    principal: EmployeePrincipal,
    req: EdrionRequestContext,
  ): Promise<void> {
    let aal: Aal = 'aal2';
    if (input.accessToken) {
      const claims = this.supabase.verify(input.accessToken);
      const matched = await this.auth.findActiveByAuthUserId(claims.sub);
      if (!matched || matched.id !== principal.employeeId) {
        throw new UnauthorizedException({ code: 'UNAUTHENTICATED', message: 'Token does not match session' });
      }
      if (!isMfaSatisfied({ aal: claims.aal }, principal.mfaEnrolled)) {
        throw new UnauthorizedException({ code: 'MFA_REQUIRED', message: 'Re-authentication requires MFA' });
      }
      aal = claims.aal ?? 'aal1';
    } else {
      if (!this.env.AUTH_DEV_LOGIN || input.confirm !== true) {
        throw new UnauthorizedException({ code: 'UNAUTHENTICATED', message: 'Re-authentication failed' });
      }
    }

    await this.sessions.touchReauth(sessionId, aal);
    await this.audit.logAudit({
      ...this.actorFields({ id: principal.employeeId, fullName: principal.fullName }, req),
      action: 'employee.reauth',
      module: MODULE,
      entityType: 'auth_session',
      entityId: sessionId,
      result: AuditResult.Success,
      riskLevel: RiskLevel.Medium,
    });
  }

  async logout(sessionId: string, principal: EmployeePrincipal, req: EdrionRequestContext): Promise<void> {
    await this.sessions.revoke(sessionId, 'logout');
    await this.audit.logAudit({
      ...this.actorFields({ id: principal.employeeId, fullName: principal.fullName }, req),
      action: 'employee.logout',
      module: MODULE,
      entityType: 'auth_session',
      entityId: sessionId,
      result: AuditResult.Success,
      riskLevel: RiskLevel.Low,
    });
  }

  // --- internals --------------------------------------------------------------

  private async resolveIdentity(
    input: LoginInput,
  ): Promise<{ employee: PlatformEmployee; aal: Aal; idpSessionId?: string }> {
    if (input.accessToken) {
      const claims = this.supabase.verify(input.accessToken);
      const employee = await this.auth.findActiveByAuthUserId(claims.sub);
      if (!employee) {
        throw new UnauthorizedException({ code: 'UNAUTHENTICATED', message: 'No employee for this identity' });
      }
      return { employee, aal: claims.aal ?? 'aal1', idpSessionId: claims.session_id };
    }

    // Dev login: email-only, behind an explicit flag, so login can be exercised without Supabase.
    if (!this.env.AUTH_DEV_LOGIN || !input.email) {
      throw new UnauthorizedException({ code: 'UNAUTHENTICATED', message: 'An access token is required' });
    }
    const employee = await this.auth.findActiveByEmail(input.email);
    if (!employee) {
      throw new UnauthorizedException({ code: 'UNAUTHENTICATED', message: 'Unknown or inactive employee' });
    }
    // Dev login simulates a completed MFA so the recent-auth flow is exercisable locally.
    return { employee, aal: employee.mfaEnrolled ? 'aal2' : 'aal1' };
  }

  private actorFields(actor: { id: string; fullName: string }, req: EdrionRequestContext) {
    return {
      actorType: ActorType.PlatformEmployee,
      actorId: actor.id,
      actorName: actor.fullName,
      ip: req.ip,
      userAgent: req.userAgent,
      requestId: req.requestId,
      correlationId: req.correlationId,
      apiEndpoint: req.apiEndpoint,
    };
  }

  private async logSecurity(
    eventType: string,
    employee: PlatformEmployee,
    req: EdrionRequestContext,
    flagged: boolean,
  ): Promise<void> {
    await this.audit.logSecurity({
      eventType,
      actorType: ActorType.PlatformEmployee,
      actorId: employee.id,
      riskLevel: flagged ? RiskLevel.High : RiskLevel.Medium,
      ip: req.ip,
      userAgent: req.userAgent,
      detail: { email: employee.email },
      flagged,
    });
  }
}
