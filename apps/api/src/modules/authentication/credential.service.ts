import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { and, eq, gt, schema, type Database } from '@edrion/database';
import { ActorType, AuditResult, RiskLevel } from '@edrion/shared-types';
import type { ForgotPasswordInput, ResetPasswordInput } from '@edrion/schemas';
import type { AuditWriter } from '@edrion/audit';
import type { ApiEnv } from '@edrion/config';
import { API_ENV, AUDIT_WRITER, DATABASE } from '../../common/tokens';
import type { EdrionRequestContext } from '../../common/request-context';
import { RegistrationEmailService } from '../registration/registration-email.service';
import { AuthService } from './auth.service';
import { SessionService } from './session.service';
import { hashPassword, hashToken, makeToken } from './password.util';

const MODULE = 'authentication';
const RESET_TTL_SECONDS = 60 * 60; // 1 hour

/**
 * Native-credential lifecycle for platform employees: forgot-password + reset-password. The reset
 * link carries a raw single-use token; only its salted hash is stored. Employees are seeded active
 * (no activation step), so there is no activate endpoint here — this is the super-admin twin of the
 * portal {@link PortalCredentialService}.
 */
@Injectable()
export class CredentialService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(AUDIT_WRITER) private readonly audit: AuditWriter,
    @Inject(API_ENV) private readonly env: ApiEnv,
    private readonly auth: AuthService,
    private readonly sessions: SessionService,
    private readonly emails: RegistrationEmailService,
  ) {}

  private get pepper(): string {
    return this.env.REGISTRATION_OTP_PEPPER ?? this.env.SESSION_COOKIE_SECRET;
  }

  /** Email a reset link if the address maps to an active employee. Always resolves (no enumeration). */
  async forgotPassword(input: ForgotPasswordInput, req: EdrionRequestContext): Promise<void> {
    const employee = await this.auth.findActiveByEmail(input.email);
    if (!employee) return;

    const raw = makeToken();
    await this.db
      .update(schema.platformEmployees)
      .set({
        passwordResetTokenHash: hashToken(raw, this.pepper),
        passwordResetExpiresAt: new Date(Date.now() + RESET_TTL_SECONDS * 1000),
      })
      .where(eq(schema.platformEmployees.id, employee.id));

    const url = `${this.env.SUPER_ADMIN_WEB_URL.replace(/\/$/, '')}/reset-password?token=${raw}`;
    await this.emails.sendPasswordReset(employee.email, employee.fullName, url);
    await this.logAudit(employee, req, 'employee.password_reset_requested', RiskLevel.Medium);
  }

  /** Complete a reset with the single-use token; revokes all live sessions. */
  async resetPassword(input: ResetPasswordInput, req: EdrionRequestContext): Promise<void> {
    const tokenHash = hashToken(input.token, this.pepper);
    const [employee] = await this.db
      .select()
      .from(schema.platformEmployees)
      .where(
        and(
          eq(schema.platformEmployees.passwordResetTokenHash, tokenHash),
          gt(schema.platformEmployees.passwordResetExpiresAt, new Date()),
        ),
      )
      .limit(1);
    if (!employee || employee.status !== 'active') {
      throw new BadRequestException({
        code: 'INVALID_TOKEN',
        message: 'This reset link is invalid or has expired. Request a new one.',
      });
    }

    await this.db
      .update(schema.platformEmployees)
      .set({
        passwordHash: await hashPassword(input.password),
        passwordResetTokenHash: null,
        passwordResetExpiresAt: null,
        failedLoginAttempts: 0,
        lockedUntil: null,
      })
      .where(eq(schema.platformEmployees.id, employee.id));
    await this.sessions.revokeAllForEmployee(employee.id, 'password_reset');

    await this.logAudit(employee, req, 'employee.password_reset', RiskLevel.Medium);
  }

  private async logAudit(
    employee: { id: string; fullName: string },
    req: EdrionRequestContext,
    action: string,
    riskLevel: RiskLevel,
  ): Promise<void> {
    await this.audit.logAudit({
      actorType: ActorType.PlatformEmployee,
      actorId: employee.id,
      actorName: employee.fullName,
      action,
      module: MODULE,
      entityType: 'platform_employee',
      entityId: employee.id,
      result: AuditResult.Success,
      riskLevel,
      ip: req.ip,
      userAgent: req.userAgent,
      requestId: req.requestId,
      correlationId: req.correlationId,
    } as Parameters<AuditWriter['logAudit']>[0]);
  }
}
