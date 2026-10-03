import {
  BadRequestException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { and, eq, gt, schema, type Database, type IndependentUser, type InstitutionUser } from '@edrion/database';
import { evaluatePermissions, expandEffectiveKeys } from '@edrion/permissions';
import { ALL_STUDENT_PERMISSION_KEYS, STUDENT_DEFAULT_ROLES } from '@edrion/permissions';
import { AccountStatus, ActorType, AuditResult, RiskLevel } from '@edrion/shared-types';
import type {
  IndependentSignupInput,
  IndependentVerifyInput,
  StudentActivateInput,
  StudentLoginInput,
  StudentResetInput,
  StudentResetRequestInput,
} from '@edrion/schemas';
import type { AuditWriter } from '@edrion/audit';
import type { ApiEnv } from '@edrion/config';
import { API_ENV, AUDIT_WRITER, DATABASE } from '../../../common/tokens';
import type { EdrionRequestContext } from '../../../common/request-context';
import { hashPassword, hashToken, makeToken, verifyPassword } from '../../authentication/password.util';
import { emailButton, emailLayout } from '../../../common/email-templates';
import { EmailService } from '../../portal/email.service';
import type { VerifiedStudentSession } from '../core/student-session.service';
import { StudentSessionService } from '../core/student-session.service';
import {
  type IndependentStudentPrincipal,
  type InstitutionalStudentPrincipal,
  type StudentPrincipal,
} from '../student.types';
import { IndependentSignupService } from './independent-signup.service';

const MODULE = 'student-auth';
const RESET_TTL_SECONDS = 60 * 60;

@Injectable()
export class StudentAuthService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(AUDIT_WRITER) private readonly audit: AuditWriter,
    @Inject(API_ENV) private readonly env: ApiEnv,
    private readonly sessions: StudentSessionService,
    private readonly signup: IndependentSignupService,
    private readonly emails: EmailService,
  ) {}

  private get pepper(): string {
    return this.env.REGISTRATION_OTP_PEPPER ?? this.env.SESSION_COOKIE_SECRET;
  }

  private evaluatedPermissions() {
    return evaluatePermissions({ roleKeys: ['student'] }, STUDENT_DEFAULT_ROLES);
  }

  private toPermissions(): string[] {
    return expandEffectiveKeys(this.evaluatedPermissions(), ALL_STUDENT_PERMISSION_KEYS);
  }

  async resolvePrincipal(session: VerifiedStudentSession): Promise<StudentPrincipal> {
    if (session.kind === 'independent') {
      return this.buildIndependent(await this.requireIndependentUser(session.userId), session.lastAuthAt);
    }
    const user = await this.requireInstitutionStudentUser(session.userId);
    return this.buildInstitutional(user, session.lastAuthAt);
  }

  /** Worker identity is reconstructed from a persisted initiating user, never a copied principal. */
  async resolveInstitutionalWorker(userId: string): Promise<InstitutionalStudentPrincipal> {
    const user = await this.requireInstitutionStudentUser(userId);
    if (user.status !== AccountStatus.Active) throw new UnauthorizedException('Student account is inactive');
    return this.buildInstitutional(user, null);
  }

  async resolveByEmail(email: string): Promise<StudentPrincipal> {
    const normalized = email.toLowerCase();
    const institutional = await this.loadInstitutionalByEmail(normalized);
    if (institutional) return this.buildInstitutional(institutional, new Date());
    const independent = await this.loadIndependentByEmail(normalized);
    if (independent) return this.buildIndependent(independent, new Date());
    throw new UnauthorizedException({ code: 'UNAUTHENTICATED', message: 'No such student user' });
  }

  async login(input: StudentLoginInput, req: EdrionRequestContext): Promise<{ token: string }> {
    const resolved = await this.resolveLoginIdentity(input);
    const user = resolved.user;

    if (this.isLocked(user)) {
      await this.logSecurity('student_login_blocked_locked', resolved.kind, user, req, true);
      throw new UnauthorizedException({ code: 'ACCOUNT_LOCKED', message: 'Account is temporarily locked' });
    }

    const invalid = new UnauthorizedException({
      code: 'UNAUTHENTICATED',
      message: 'Incorrect email or password',
    });
    if (!(await verifyPassword(input.password, user.passwordHash))) {
      await this.registerFailedLogin(resolved.kind, user.id, user.failedLoginAttempts);
      throw invalid;
    }

    if (resolved.kind === 'institutional' && user.status !== AccountStatus.Active) throw invalid;

    await this.markLoginSuccess(resolved.kind, user.id);
    const issue =
      resolved.kind === 'institutional'
        ? await this.sessions.issue({
            kind: 'institutional',
            userId: user.id,
            institutionId: (user as InstitutionUser).institutionId,
            ip: req.ip,
            userAgent: req.userAgent,
          })
        : await this.sessions.issue({
            kind: 'independent',
            userId: user.id,
            ip: req.ip,
            userAgent: req.userAgent,
          });

    await this.audit.logAudit({
      ...this.actorFields(resolved.kind, user, req),
      action: 'student.auth.login',
      module: MODULE,
      entityType: resolved.kind === 'institutional' ? 'portal_session' : 'independent_session',
      entityId: issue.sessionId,
      result: AuditResult.Success,
      riskLevel: RiskLevel.Low,
    });
    return { token: issue.token };
  }

  async logout(
    sessionId: string,
    principal: StudentPrincipal,
    req: EdrionRequestContext,
  ): Promise<void> {
    const kind = principal.kind;
    await this.sessions.revoke(sessionId, kind, 'logout');
    await this.audit.logAudit({
      ...this.actorFields(kind, principal, req),
      action: 'student.auth.logout',
      module: MODULE,
      entityType: kind === 'institutional' ? 'portal_session' : 'independent_session',
      entityId: sessionId,
      result: AuditResult.Success,
      riskLevel: RiskLevel.Low,
    });
  }

  async activate(input: StudentActivateInput, req: EdrionRequestContext): Promise<{ token: string }> {
    const tokenHash = hashToken(input.token, this.pepper);
    const institutional = await this.findInstitutionalByActivationToken(tokenHash);
    if (institutional) {
      return this.completeActivation('institutional', institutional, input.password, req);
    }
    const independent = await this.findIndependentByActivationToken(tokenHash);
    if (independent) {
      return this.completeActivation('independent', independent, input.password, req);
    }
    throw new BadRequestException({
      code: 'INVALID_TOKEN',
      message: 'This activation link is invalid or has expired. Ask for a new invitation.',
    });
  }

  async requestReset(input: StudentResetRequestInput, req: EdrionRequestContext): Promise<void> {
    const email = input.email.toLowerCase();
    const institutional = await this.loadInstitutionalByEmail(email);
    if (institutional?.status === AccountStatus.Active) {
      await this.issueReset('institutional', institutional, req);
      return;
    }
    const independent = await this.loadIndependentByEmail(email);
    if (independent?.activatedAt) {
      await this.issueReset('independent', independent, req);
    }
  }

  async resetPassword(input: StudentResetInput, req: EdrionRequestContext): Promise<void> {
    const tokenHash = hashToken(input.token, this.pepper);
    const institutional = await this.findInstitutionalByResetToken(tokenHash);
    if (institutional) {
      await this.completeReset('institutional', institutional, input.password, req);
      return;
    }
    const independent = await this.findIndependentByResetToken(tokenHash);
    if (independent) {
      await this.completeReset('independent', independent, input.password, req);
      return;
    }
    throw new BadRequestException({
      code: 'INVALID_TOKEN',
      message: 'This reset link is invalid or has expired. Request a new one.',
    });
  }

  async independentSignup(input: IndependentSignupInput, req: EdrionRequestContext) {
    return this.signup.start(input, req);
  }

  async independentVerify(input: IndependentVerifyInput, req: EdrionRequestContext): Promise<{ token: string }> {
    const user = await this.signup.verify(input, req);
    await this.markLoginSuccess('independent', user.id);
    const { token, sessionId } = await this.sessions.issue({
      kind: 'independent',
      userId: user.id,
      ip: req.ip,
      userAgent: req.userAgent,
    });
    await this.audit.logAudit({
      ...this.actorFields('independent', user, req),
      action: 'student.signup.verified',
      module: MODULE,
      entityType: 'independent_user',
      entityId: user.id,
      result: AuditResult.Success,
      riskLevel: RiskLevel.Low,
      newState: { sessionId },
    });
    return { token };
  }

  // --- identity resolution ---------------------------------------------------

  private async resolveLoginIdentity(
    input: StudentLoginInput,
  ): Promise<
    | { kind: 'institutional'; user: InstitutionUser }
    | { kind: 'independent'; user: IndependentUser }
  > {
    const identifier = input.identifier.trim();
    const invalid = new UnauthorizedException({
      code: 'UNAUTHENTICATED',
      message: 'Incorrect email or password',
    });

    if (identifier.includes('@')) {
      const institutional = await this.loadInstitutionalByEmail(identifier.toLowerCase());
      if (institutional) return { kind: 'institutional', user: institutional };
      const independent = await this.loadIndependentByEmail(identifier.toLowerCase());
      if (independent) return { kind: 'independent', user: independent };
      throw invalid;
    }

    if (!input.institutionCode) throw invalid;
    const [inst] = await this.db
      .select({ id: schema.institutions.id })
      .from(schema.institutions)
      .where(eq(schema.institutions.publicId, input.institutionCode.trim()))
      .limit(1);
    if (!inst) throw invalid;

    const [student] = await this.db
      .select()
      .from(schema.students)
      .where(
        and(
          eq(schema.students.institutionId, inst.id),
          eq(schema.students.admissionNo, identifier),
        ),
      )
      .limit(1);
    if (!student?.institutionUserId) throw invalid;

    const user = await this.requireInstitutionStudentUser(student.institutionUserId);
    return { kind: 'institutional', user };
  }

  private async buildInstitutional(
    user: InstitutionUser,
    lastAuthAt: Date | null,
  ): Promise<InstitutionalStudentPrincipal> {
    const [student] = await this.db
      .select()
      .from(schema.students)
      .where(eq(schema.students.institutionUserId, user.id))
      .limit(1);
    if (!student) {
      throw new UnauthorizedException({ code: 'UNAUTHENTICATED', message: 'No student record linked' });
    }
    return {
      kind: 'institutional',
      institutionId: user.institutionId,
      campusId: student.campusId,
      institutionUserId: user.id,
      studentId: student.id,
      email: user.email,
      fullName: user.fullName,
      lastAuthAt,
      permissions: this.toPermissions(),
    };
  }

  private async buildIndependent(
    user: IndependentUser,
    lastAuthAt: Date | null,
  ): Promise<IndependentStudentPrincipal> {
    return {
      kind: 'independent',
      independentUserId: user.id,
      email: user.email,
      fullName: user.fullName,
      lastAuthAt,
      permissions: this.toPermissions(),
    };
  }

  private async requireInstitutionStudentUser(id: string): Promise<InstitutionUser> {
    const [user] = await this.db
      .select()
      .from(schema.institutionUsers)
      .where(eq(schema.institutionUsers.id, id))
      .limit(1);
    if (!user || user.disabledAt) {
      throw new UnauthorizedException({ code: 'UNAUTHENTICATED', message: 'Unknown or disabled user' });
    }
    const [role] = await this.db
      .select({ roleKey: schema.institutionUserRoles.roleKey })
      .from(schema.institutionUserRoles)
      .where(
        and(
          eq(schema.institutionUserRoles.institutionUserId, user.id),
          eq(schema.institutionUserRoles.roleKey, 'student'),
        ),
      )
      .limit(1);
    if (!role) {
      throw new UnauthorizedException({ code: 'UNAUTHENTICATED', message: 'Not a student account' });
    }
    return user;
  }

  private async requireIndependentUser(id: string): Promise<IndependentUser> {
    const [user] = await this.db
      .select()
      .from(schema.independentUsers)
      .where(eq(schema.independentUsers.id, id))
      .limit(1);
    if (!user) {
      throw new UnauthorizedException({ code: 'UNAUTHENTICATED', message: 'Unknown independent user' });
    }
    return user;
  }

  private async loadInstitutionalByEmail(email: string): Promise<InstitutionUser | undefined> {
    const [user] = await this.db
      .select()
      .from(schema.institutionUsers)
      .where(eq(schema.institutionUsers.email, email))
      .limit(1);
    if (!user || user.disabledAt) return undefined;
    const [role] = await this.db
      .select({ roleKey: schema.institutionUserRoles.roleKey })
      .from(schema.institutionUserRoles)
      .where(
        and(
          eq(schema.institutionUserRoles.institutionUserId, user.id),
          eq(schema.institutionUserRoles.roleKey, 'student'),
        ),
      )
      .limit(1);
    return role ? user : undefined;
  }

  private async loadIndependentByEmail(email: string): Promise<IndependentUser | undefined> {
    const [user] = await this.db
      .select()
      .from(schema.independentUsers)
      .where(eq(schema.independentUsers.email, email))
      .limit(1);
    return user ?? undefined;
  }

  // --- lockout ---------------------------------------------------------------

  isLocked(user: { lockedUntil: Date | null }, now: Date = new Date()): boolean {
    return Boolean(user.lockedUntil && user.lockedUntil.getTime() > now.getTime());
  }

  async registerFailedLogin(
    kind: 'institutional' | 'independent',
    userId: string,
    currentAttempts: number,
  ): Promise<boolean> {
    const attempts = currentAttempts + 1;
    const locked = attempts >= this.env.AUTH_MAX_FAILED_LOGINS;
    const patch = {
      failedLoginAttempts: attempts,
      lockedUntil: locked ? new Date(Date.now() + this.env.AUTH_LOCKOUT_SECONDS * 1000) : null,
    };
    if (kind === 'institutional') {
      await this.db.update(schema.institutionUsers).set(patch).where(eq(schema.institutionUsers.id, userId));
    } else {
      await this.db.update(schema.independentUsers).set(patch).where(eq(schema.independentUsers.id, userId));
    }
    return locked;
  }

  async markLoginSuccess(kind: 'institutional' | 'independent', userId: string, now = new Date()): Promise<void> {
    const patch = {
      failedLoginAttempts: 0,
      lockedUntil: null,
      lastLoginAt: now,
      lastAuthAt: now,
    };
    if (kind === 'institutional') {
      await this.db.update(schema.institutionUsers).set(patch).where(eq(schema.institutionUsers.id, userId));
    } else {
      await this.db.update(schema.independentUsers).set(patch).where(eq(schema.independentUsers.id, userId));
    }
  }

  // --- activation / reset ----------------------------------------------------

  private async completeActivation(
    kind: 'institutional' | 'independent',
    user: InstitutionUser | IndependentUser,
    password: string,
    req: EdrionRequestContext,
  ): Promise<{ token: string }> {
    const now = new Date();
    const passwordHash = await hashPassword(password);
    if (kind === 'institutional') {
      const iu = user as InstitutionUser;
      await this.db
        .update(schema.institutionUsers)
        .set({
          passwordHash,
          status: AccountStatus.Active,
          activatedAt: now,
          activationTokenHash: null,
          activationTokenExpiresAt: null,
          failedLoginAttempts: 0,
          lockedUntil: null,
          lastLoginAt: now,
          lastAuthAt: now,
        })
        .where(eq(schema.institutionUsers.id, iu.id));
      const { token } = await this.sessions.issue({
        kind: 'institutional',
        userId: iu.id,
        institutionId: iu.institutionId,
        ip: req.ip,
        userAgent: req.userAgent,
      });
      await this.audit.logAudit({
        ...this.actorFields('institutional', iu, req),
        action: 'student.auth.activate',
        module: MODULE,
        entityType: 'institution_user',
        entityId: iu.id,
        result: AuditResult.Success,
        riskLevel: RiskLevel.Low,
      });
      return { token };
    }

    const iu = user as IndependentUser;
    await this.db
      .update(schema.independentUsers)
      .set({
        passwordHash,
        activatedAt: now,
        activationTokenHash: null,
        activationTokenExpiresAt: null,
        failedLoginAttempts: 0,
        lockedUntil: null,
        lastLoginAt: now,
        lastAuthAt: now,
        status: AccountStatus.Active,
      })
      .where(eq(schema.independentUsers.id, iu.id));
    const { token } = await this.sessions.issue({
      kind: 'independent',
      userId: iu.id,
      ip: req.ip,
      userAgent: req.userAgent,
    });
    await this.audit.logAudit({
      ...this.actorFields('independent', iu, req),
      action: 'student.auth.activate',
      module: MODULE,
      entityType: 'independent_user',
      entityId: iu.id,
      result: AuditResult.Success,
      riskLevel: RiskLevel.Low,
    });
    return { token };
  }

  private async issueReset(
    kind: 'institutional' | 'independent',
    user: InstitutionUser | IndependentUser,
    req: EdrionRequestContext,
  ): Promise<void> {
    const raw = makeToken();
    const expiresAt = new Date(Date.now() + RESET_TTL_SECONDS * 1000);
    const tokenHash = hashToken(raw, this.pepper);
    if (kind === 'institutional') {
      const iu = user as InstitutionUser;
      await this.db
        .update(schema.institutionUsers)
        .set({ passwordResetTokenHash: tokenHash, passwordResetExpiresAt: expiresAt })
        .where(eq(schema.institutionUsers.id, iu.id));
    } else {
      const iu = user as IndependentUser;
      await this.db
        .update(schema.independentUsers)
        .set({ passwordResetTokenHash: tokenHash, passwordResetExpiresAt: expiresAt })
        .where(eq(schema.independentUsers.id, iu.id));
    }
    const resetUrl = `${this.env.STUDENT_WEB_URL}/reset/confirm?token=${encodeURIComponent(raw)}`;
    const text = [
      `Hi ${user.fullName},`,
      '',
      'We received a request to reset your Edrion student password.',
      `Reset your password (valid for 1 hour):`,
      resetUrl,
      '',
      `If you didn't request this, you can safely ignore this email.`,
    ].join('\n');
    const html = emailLayout({
      heading: 'Reset your password',
      preheader: 'Choose a new Edrion student password',
      footer:
        "You're receiving this because a password reset was requested for your Edrion student account. If you didn't request this, you can safely ignore it.",
      bodyHtml: `<p style="margin:0 0 16px;">Hi ${user.fullName}, we received a request to reset the password on your Edrion student account.</p>
        <p style="margin:0 0 18px;">Click below to choose a new password. This link expires in <strong>1 hour</strong>.</p>
        ${emailButton(resetUrl, 'Reset your password')}
        <p style="margin:18px 0 0;">If you didn't request this, you can safely ignore this email — your password won't change.</p>`,
    });
    await this.emails.send({
      to: user.email,
      subject: 'Reset your Edrion student password',
      text,
      html,
    });
    await this.audit.logAudit({
      ...this.actorFields(kind, user, req),
      action: 'student.auth.password_reset_requested',
      module: MODULE,
      entityType: kind === 'institutional' ? 'institution_user' : 'independent_user',
      entityId: user.id,
      result: AuditResult.Success,
      riskLevel: RiskLevel.Medium,
    });
  }

  private async completeReset(
    kind: 'institutional' | 'independent',
    user: InstitutionUser | IndependentUser,
    password: string,
    req: EdrionRequestContext,
  ): Promise<void> {
    const passwordHash = await hashPassword(password);
    if (kind === 'institutional') {
      const iu = user as InstitutionUser;
      await this.db
        .update(schema.institutionUsers)
        .set({
          passwordHash,
          passwordResetTokenHash: null,
          passwordResetExpiresAt: null,
          failedLoginAttempts: 0,
          lockedUntil: null,
          sessionsRevokedAt: new Date(),
        })
        .where(eq(schema.institutionUsers.id, iu.id));
      await this.sessions.revokeAllForInstitutionalUser(iu.id, 'password_reset');
    } else {
      const iu = user as IndependentUser;
      await this.db
        .update(schema.independentUsers)
        .set({
          passwordHash,
          passwordResetTokenHash: null,
          passwordResetExpiresAt: null,
          failedLoginAttempts: 0,
          lockedUntil: null,
        })
        .where(eq(schema.independentUsers.id, iu.id));
      await this.sessions.revokeAllForIndependentUser(iu.id, 'password_reset');
    }
    await this.audit.logAudit({
      ...this.actorFields(kind, user, req),
      action: 'student.auth.password_reset',
      module: MODULE,
      entityType: kind === 'institutional' ? 'institution_user' : 'independent_user',
      entityId: user.id,
      result: AuditResult.Success,
      riskLevel: RiskLevel.Medium,
    });
  }

  private async findInstitutionalByActivationToken(tokenHash: string) {
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
    return user && !user.disabledAt ? user : undefined;
  }

  private async findIndependentByActivationToken(tokenHash: string) {
    const [user] = await this.db
      .select()
      .from(schema.independentUsers)
      .where(
        and(
          eq(schema.independentUsers.activationTokenHash, tokenHash),
          gt(schema.independentUsers.activationTokenExpiresAt, new Date()),
        ),
      )
      .limit(1);
    return user ?? undefined;
  }

  private async findInstitutionalByResetToken(tokenHash: string) {
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
    return user && !user.disabledAt ? user : undefined;
  }

  private async findIndependentByResetToken(tokenHash: string) {
    const [user] = await this.db
      .select()
      .from(schema.independentUsers)
      .where(
        and(
          eq(schema.independentUsers.passwordResetTokenHash, tokenHash),
          gt(schema.independentUsers.passwordResetExpiresAt, new Date()),
        ),
      )
      .limit(1);
    return user ?? undefined;
  }

  private actorFields(
    kind: 'institutional' | 'independent',
    user: InstitutionUser | IndependentUser | StudentPrincipal,
    req: EdrionRequestContext,
  ) {
    if ('kind' in user && user.kind === 'institutional') {
      return {
        actorType: ActorType.InstitutionUser,
        actorId: user.institutionUserId,
        actorName: user.fullName,
        institutionId: user.institutionId,
        ip: req.ip,
        userAgent: req.userAgent,
        requestId: req.requestId,
        correlationId: req.correlationId,
        apiEndpoint: req.apiEndpoint,
      };
    }
    if ('kind' in user && user.kind === 'independent') {
      return {
        actorType: ActorType.IndependentUser,
        actorId: user.independentUserId,
        actorName: user.fullName,
        ip: req.ip,
        userAgent: req.userAgent,
        requestId: req.requestId,
        correlationId: req.correlationId,
        apiEndpoint: req.apiEndpoint,
      };
    }
    if (kind === 'institutional') {
      const iu = user as InstitutionUser;
      return {
        actorType: ActorType.InstitutionUser,
        actorId: iu.id,
        actorName: iu.fullName,
        institutionId: iu.institutionId,
        ip: req.ip,
        userAgent: req.userAgent,
        requestId: req.requestId,
        correlationId: req.correlationId,
        apiEndpoint: req.apiEndpoint,
      };
    }
    const iu = user as IndependentUser;
    return {
      actorType: ActorType.IndependentUser,
      actorId: iu.id,
      actorName: iu.fullName,
      ip: req.ip,
      userAgent: req.userAgent,
      requestId: req.requestId,
      correlationId: req.correlationId,
      apiEndpoint: req.apiEndpoint,
    };
  }

  private async logSecurity(
    eventType: string,
    kind: 'institutional' | 'independent',
    user: InstitutionUser | IndependentUser,
    req: EdrionRequestContext,
    flagged: boolean,
  ): Promise<void> {
    await this.audit.logSecurity({
      eventType,
      actorType: kind === 'institutional' ? ActorType.InstitutionUser : ActorType.IndependentUser,
      actorId: user.id,
      institutionId: kind === 'institutional' ? (user as InstitutionUser).institutionId : undefined,
      riskLevel: flagged ? RiskLevel.High : RiskLevel.Medium,
      ip: req.ip,
      userAgent: req.userAgent,
      detail: { email: user.email },
      flagged,
    });
  }
}
