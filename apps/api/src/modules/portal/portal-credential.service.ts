import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { and, eq, gt, schema, type Database } from '@edrion/database';
import {
  AccountStatus,
  ActorType,
  AuditResult,
  InstitutionStatus,
  RiskLevel,
} from '@edrion/shared-types';
import type {
  PortalActivateInput,
  PortalForgotPasswordInput,
  PortalResetPasswordInput,
} from '@edrion/schemas';
import { canTransition } from '@edrion/schemas';
import type { AuditWriter } from '@edrion/audit';
import type { ApiEnv } from '@edrion/config';
import { API_ENV, AUDIT_WRITER, DATABASE } from '../../common/tokens';
import type { EdrionRequestContext } from '../../common/request-context';
import { RegistrationEmailService } from '../registration/registration-email.service';
import { hashPassword, hashToken, makeToken } from '../authentication/password.util';
import { PortalAuthService } from './portal-auth.service';
import { PortalSessionService } from './portal-session.service';

const MODULE = 'portal-auth';
const RESET_TTL_SECONDS = 60 * 60; // 1 hour

/**
 * Native-credential lifecycle for institution users: account activation (first password from the
 * invitation link), forgot-password and reset-password. The invitation/reset links carry a raw
 * single-use token; only its salted hash is stored. Completing activation also flips the parent
 * institution Onboarding→Active and auto-logs the user in (issues a portal session cookie).
 */
@Injectable()
export class PortalCredentialService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(AUDIT_WRITER) private readonly audit: AuditWriter,
    @Inject(API_ENV) private readonly env: ApiEnv,
    private readonly auth: PortalAuthService,
    private readonly sessions: PortalSessionService,
    private readonly emails: RegistrationEmailService,
  ) {}

  private get pepper(): string {
    return this.env.REGISTRATION_OTP_PEPPER ?? this.env.SESSION_COOKIE_SECRET;
  }

  /** Set the first password from the invitation token, activate the account + institution, auto-login. */
  async activate(input: PortalActivateInput, req: EdrionRequestContext): Promise<{ token: string }> {
    const tokenHash = hashToken(input.token, this.pepper);
    const [user] = await this.db
      .select()
      .from(schema.institutionUsers)
      .where(
        and(
          eq(schema.institutionUsers.activationTokenHash, tokenHash),
          gt(schema.institutionUsers.activationTokenExpiresAt, new Date()),
        ),
      )
      .limit(1);
    if (!user || user.disabledAt) {
      throw new BadRequestException({
        code: 'INVALID_TOKEN',
        message: 'This activation link is invalid or has expired. Ask an administrator to resend it.',
      });
    }

    const now = new Date();
    await this.db
      .update(schema.institutionUsers)
      .set({
        passwordHash: await hashPassword(input.password),
        status: AccountStatus.Active,
        activatedAt: now,
        activationTokenHash: null,
        activationTokenExpiresAt: null,
        failedLoginAttempts: 0,
        lockedUntil: null,
        lockedAt: null,
        lastLoginAt: now,
        lastAuthAt: now,
      })
      .where(eq(schema.institutionUsers.id, user.id));

    const institutionName = await this.activateInstitution(user.institutionId, user.id, req);

    await this.logAudit(user, req, 'user.activate', AuditResult.Success, RiskLevel.Low, {
      entityType: 'institution_user',
      entityId: user.id,
      newState: { status: AccountStatus.Active },
    });

    // Auto-login: issue a portal session so the just-activated admin lands authenticated.
    const { token } = await this.sessions.issue({
      institutionId: user.institutionId,
      institutionUserId: user.id,
      aal: user.mfaEnrolled ? 'aal2' : 'aal1',
      ip: req.ip,
      userAgent: req.userAgent,
    });

    // Welcome email now — the workspace is genuinely live (was previously sent prematurely on approval).
    if (institutionName) {
      await this.emails.sendWelcome(user.email, institutionName, this.env.PORTAL_WEB_URL);
    }

    return { token };
  }

  /** Email a reset link if the address maps to an active user. Always resolves (no enumeration). */
  async forgotPassword(input: PortalForgotPasswordInput, req: EdrionRequestContext): Promise<void> {
    const user = await this.auth.loadActiveByEmail(input.email);
    if (!user || user.status !== AccountStatus.Active) return;

    const raw = makeToken();
    await this.db
      .update(schema.institutionUsers)
      .set({
        passwordResetTokenHash: hashToken(raw, this.pepper),
        passwordResetExpiresAt: new Date(Date.now() + RESET_TTL_SECONDS * 1000),
      })
      .where(eq(schema.institutionUsers.id, user.id));

    const resetUrl = `${this.env.PORTAL_WEB_URL}/reset-password?token=${raw}`;
    await this.emails.sendPasswordReset(user.email, user.fullName, resetUrl);
    await this.logAudit(user, req, 'user.password_reset_requested', AuditResult.Success, RiskLevel.Medium, {
      entityType: 'institution_user',
      entityId: user.id,
    });
  }

  /** Complete a reset with the single-use token; revokes all live sessions. */
  async resetPassword(input: PortalResetPasswordInput, req: EdrionRequestContext): Promise<void> {
    const tokenHash = hashToken(input.token, this.pepper);
    const [user] = await this.db
      .select()
      .from(schema.institutionUsers)
      .where(
        and(
          eq(schema.institutionUsers.passwordResetTokenHash, tokenHash),
          gt(schema.institutionUsers.passwordResetExpiresAt, new Date()),
        ),
      )
      .limit(1);
    if (!user || user.disabledAt) {
      throw new BadRequestException({
        code: 'INVALID_TOKEN',
        message: 'This reset link is invalid or has expired. Request a new one.',
      });
    }

    await this.db
      .update(schema.institutionUsers)
      .set({
        passwordHash: await hashPassword(input.password),
        passwordResetTokenHash: null,
        passwordResetExpiresAt: null,
        failedLoginAttempts: 0,
        lockedUntil: null,
        lockedAt: null,
        sessionsRevokedAt: new Date(),
      })
      .where(eq(schema.institutionUsers.id, user.id));
    await this.sessions.revokeAllForUser(user.id, 'password_reset');

    await this.logAudit(user, req, 'user.password_reset', AuditResult.Success, RiskLevel.Medium, {
      entityType: 'institution_user',
      entityId: user.id,
    });
  }

  /** Flip the parent institution Onboarding→Active on first admin activation. Returns its name. */
  private async activateInstitution(
    institutionId: string,
    actingUserId: string,
    req: EdrionRequestContext,
  ): Promise<string | null> {
    const [inst] = await this.db
      .select({
        id: schema.institutions.id,
        status: schema.institutions.status,
        displayName: schema.institutions.displayName,
      })
      .from(schema.institutions)
      .where(eq(schema.institutions.id, institutionId))
      .limit(1);
    if (!inst) return null;

    if (
      inst.status !== InstitutionStatus.Active &&
      canTransition(inst.status as InstitutionStatus, InstitutionStatus.Active)
    ) {
      await this.db
        .update(schema.institutions)
        .set({ status: InstitutionStatus.Active, activatedAt: new Date() })
        .where(eq(schema.institutions.id, institutionId));
      await this.audit.logAudit({
        actorType: ActorType.InstitutionUser,
        actorId: actingUserId,
        institutionId,
        institutionName: inst.displayName,
        action: 'institution.activate',
        module: MODULE,
        entityType: 'institution',
        entityId: institutionId,
        result: AuditResult.Success,
        riskLevel: RiskLevel.Low,
        ip: req.ip,
        userAgent: req.userAgent,
        requestId: req.requestId,
        correlationId: req.correlationId,
        previousState: { status: inst.status },
        newState: { status: InstitutionStatus.Active, source: 'admin_activation' },
      } as Parameters<AuditWriter['logAudit']>[0]);
    }
    return inst.displayName;
  }

  private async logAudit(
    user: { id: string; institutionId: string; fullName: string },
    req: EdrionRequestContext,
    action: string,
    result: AuditResult,
    riskLevel: RiskLevel,
    extra: Record<string, unknown>,
  ): Promise<void> {
    await this.audit.logAudit({
      actorType: ActorType.InstitutionUser,
      actorId: user.id,
      actorName: user.fullName,
      institutionId: user.institutionId,
      action,
      module: MODULE,
      result,
      riskLevel,
      ip: req.ip,
      userAgent: req.userAgent,
      requestId: req.requestId,
      correlationId: req.correlationId,
      ...extra,
    } as Parameters<AuditWriter['logAudit']>[0]);
  }
}
