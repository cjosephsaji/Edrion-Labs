import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, desc, eq, schema, type Database } from '@edrion/database';
import { AccountStatus, ActorType, AuditResult, FeatureScope, RiskLevel, STUDENT_SURFACES } from '@edrion/shared-types';
import type { AuditWriter } from '@edrion/audit';
import type { ApiEnv } from '@edrion/config';
import { API_ENV, AUDIT_WRITER, DATABASE } from '../../common/tokens';
import { FeatureControlsRepository } from '../feature-controls/feature-controls.repository';
import { FeatureControlsService } from '../feature-controls/feature-controls.service';
import { STUDENT_MODULE_CATALOG } from '@edrion/feature-flags';
import { hashToken, makeToken } from '../authentication/password.util';
import { emailButton, emailLayout } from '../../common/email-templates';
import { EmailService } from './email.service';
import { PortalInviteService } from './portal-invite.service';
import type { PortalActionContext } from './portal-action-context';
import { basePortalAudit } from './portal-action-context';

const MODULE = 'student-portal';
const INVITE_TTL_SECONDS = 7 * 24 * 60 * 60;
const RESET_TTL_SECONDS = 60 * 60;

export interface StudentPortalInviteInput {
  targetEmail?: string;
  guardianParentId?: string;
}

@Injectable()
export class StudentPortalInviteService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(AUDIT_WRITER) private readonly audit: AuditWriter,
    @Inject(API_ENV) private readonly env: ApiEnv,
    private readonly invites: PortalInviteService,
    private readonly emails: EmailService,
    private readonly featureRepo: FeatureControlsRepository,
    private readonly features: FeatureControlsService,
  ) {}

  private get pepper(): string {
    return this.env.REGISTRATION_OTP_PEPPER ?? this.env.SESSION_COOKIE_SECRET;
  }

  async inviteStudent(ctx: PortalActionContext, studentId: string, input: StudentPortalInviteInput) {
    const hasEmail = Boolean(input.targetEmail);
    const hasGuardian = Boolean(input.guardianParentId);
    if (hasEmail === hasGuardian) {
      throw new BadRequestException({
        code: 'INVALID_INPUT',
        message: 'Provide exactly one of targetEmail or guardianParentId.',
      });
    }

    const institutionId = ctx.principal.institutionId;
    const [student] = await this.db
      .select()
      .from(schema.students)
      .where(and(eq(schema.students.id, studentId), eq(schema.students.institutionId, institutionId)))
      .limit(1);
    if (!student) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Student not found' });
    if (student.institutionUserId) {
      throw new ConflictException({
        code: 'ALREADY_LINKED',
        message: 'This student already has a portal account.',
      });
    }

    let inviteEmail = input.targetEmail?.toLowerCase();
    let guardianMediated = false;
    if (input.guardianParentId) {
      const [guardian] = await this.db
        .select({ email: schema.parents.email, firstName: schema.parents.firstName, lastName: schema.parents.lastName })
        .from(schema.studentGuardians)
        .innerJoin(schema.parents, eq(schema.studentGuardians.parentId, schema.parents.id))
        .where(
          and(
            eq(schema.studentGuardians.studentId, studentId),
            eq(schema.studentGuardians.parentId, input.guardianParentId),
          ),
        )
        .limit(1);
      if (!guardian?.email) {
        throw new BadRequestException({
          code: 'GUARDIAN_EMAIL_REQUIRED',
          message: 'The selected guardian does not have an email address.',
        });
      }
      inviteEmail = guardian.email.toLowerCase();
      guardianMediated = true;
    }

    const [institution] = await this.db
      .select({ publicId: schema.institutions.publicId, displayName: schema.institutions.displayName })
      .from(schema.institutions)
      .where(eq(schema.institutions.id, institutionId))
      .limit(1);

    const accountEmail =
      student.email?.toLowerCase() ??
      inviteEmail ??
      `stu-${student.admissionNo}@${institution?.publicId ?? 'school'}.edrion.local`;

    const fullName = `${student.firstName} ${student.lastName}`.trim();
    const rawToken = makeToken();
    const tokenHash = hashToken(rawToken, this.pepper);
    const expiresAt = new Date(Date.now() + INVITE_TTL_SECONDS * 1000);

    const [user] = await this.db
      .insert(schema.institutionUsers)
      .values({
        institutionId,
        email: accountEmail,
        fullName,
        status: 'invited',
        invitedAt: new Date(),
        activationTokenHash: tokenHash,
        activationTokenExpiresAt: expiresAt,
        createdBy: ctx.principal.institutionUserId,
      })
      .returning();
    if (!user) throw new Error('Failed to create institution user');

    await this.db.insert(schema.institutionUserRoles).values({
      institutionUserId: user.id,
      roleKey: 'student',
    });

    await this.db
      .update(schema.students)
      .set({ institutionUserId: user.id })
      .where(eq(schema.students.id, student.id));

    // Persist invitation metadata without the institution-portal email (that uses PORTAL_WEB_URL :3002).
    // Student activation always links to STUDENT_WEB_URL (:3005).
    const sent = await this.invites.invite({
      institutionId,
      institutionUserId: user.id,
      email: inviteEmail ?? accountEmail,
      fullName,
      invitedBy: ctx.principal.institutionUserId,
      sendEmail: false,
    });

    const activateUrl = `${this.env.STUDENT_WEB_URL.replace(/\/$/, '')}/activate?token=${encodeURIComponent(rawToken)}`;
    const institutionName = institution?.displayName ?? 'Your school';
    const to = inviteEmail ?? accountEmail;
    if (guardianMediated) {
      const text = [
        `Hello,`,
        '',
        `${institutionName} has invited ${fullName} to the Edrion student portal.`,
        `As their guardian, please set up their password using this link (valid 7 days):`,
        activateUrl,
        '',
      ].join('\n');
      const html = emailLayout({
        heading: `Activate ${fullName}'s student portal`,
        preheader: `Set up ${fullName}'s Edrion student account`,
        footer:
          "You're receiving this because your school invited your child to the Edrion student portal. If this wasn't expected, you can safely ignore it.",
        bodyHtml: `<p style="margin:0 0 16px;"><strong>${institutionName}</strong> has invited <strong>${fullName}</strong> to the Edrion student portal.</p>
          <p style="margin:0 0 18px;">As their guardian, please set up their password using the link below. It is valid for <strong>7 days</strong>.</p>
          ${emailButton(activateUrl, 'Set up student account')}`,
      });
      await this.emails.send({
        to,
        subject: `Activate ${fullName}'s student portal account`,
        text,
        html,
      });
    } else {
      const text = [
        `Hi ${fullName},`,
        '',
        `${institutionName} has invited you to the Edrion student portal.`,
        `Set up your password using this link (valid 7 days):`,
        activateUrl,
        '',
        `If you weren't expecting this, you can ignore this email.`,
      ].join('\n');
      const html = emailLayout({
        heading: `Activate your student portal`,
        preheader: `Set up your Edrion student account for ${institutionName}`,
        footer:
          "You're receiving this because your school invited you to the Edrion student portal. If this wasn't expected, you can safely ignore it.",
        bodyHtml: `<p style="margin:0 0 16px;">Hi ${fullName}, <strong>${institutionName}</strong> has invited you to the Edrion student portal.</p>
          <p style="margin:0 0 18px;">Click below to set your password and activate your account. This link is valid for <strong>7 days</strong>.</p>
          ${emailButton(activateUrl, 'Activate student account')}`,
      });
      await this.emails.send({
        to,
        subject: `You've been invited to ${institutionName} on Edrion`,
        text,
        html,
      });
    }

    await this.audit.logAudit({
      ...basePortalAudit(ctx),
      actorType: ActorType.InstitutionUser,
      action: 'student_portal.invite',
      module: MODULE,
      entityType: 'student',
      entityId: student.id,
      result: AuditResult.Success,
      riskLevel: RiskLevel.Low,
      newState: {
        institutionUserId: user.id,
        invitationId: sent.invitation.id,
        guardianMediated,
        email: inviteEmail ?? accountEmail,
      },
    });

    return {
      studentId: student.id,
      institutionUserId: user.id,
      invitationId: sent.invitation.id,
      guardianMediated,
    };
  }

  /**
   * Admin-triggered password reset for a student who already has a linked portal account.
   * Sends a student-web reset link (not institution-portal).
   */
  async sendPasswordReset(ctx: PortalActionContext, studentId: string) {
    const institutionId = ctx.principal.institutionId;
    const [student] = await this.db
      .select()
      .from(schema.students)
      .where(and(eq(schema.students.id, studentId), eq(schema.students.institutionId, institutionId)))
      .limit(1);
    if (!student) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Student not found' });
    if (!student.institutionUserId) {
      throw new BadRequestException({
        code: 'NOT_LINKED',
        message: 'This student does not have a portal account yet. Send an invitation first.',
      });
    }

    const [user] = await this.db
      .select()
      .from(schema.institutionUsers)
      .where(
        and(
          eq(schema.institutionUsers.id, student.institutionUserId),
          eq(schema.institutionUsers.institutionId, institutionId),
        ),
      )
      .limit(1);
    if (!user) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Linked portal account not found' });
    }
    if (user.status === AccountStatus.Disabled || user.disabledAt) {
      throw new BadRequestException({
        code: 'ACCOUNT_SUSPENDED',
        message: 'This student account is suspended. Unsuspend it before sending a password reset.',
      });
    }
    if (user.status !== AccountStatus.Active || !user.activatedAt) {
      throw new BadRequestException({
        code: 'NOT_ACTIVATED',
        message: 'This student has not activated their account yet. Send (or resend) an invitation instead.',
      });
    }

    const raw = makeToken();
    const expiresAt = new Date(Date.now() + RESET_TTL_SECONDS * 1000);
    await this.db
      .update(schema.institutionUsers)
      .set({
        passwordResetTokenHash: hashToken(raw, this.pepper),
        passwordResetExpiresAt: expiresAt,
      })
      .where(eq(schema.institutionUsers.id, user.id));

    const resetUrl = `${this.env.STUDENT_WEB_URL.replace(/\/$/, '')}/reset/confirm?token=${encodeURIComponent(raw)}`;
    const text = [
      `Hi ${user.fullName},`,
      '',
      'Your school requested a password reset for your Edrion student account.',
      `Reset your password (valid for 1 hour):`,
      resetUrl,
      '',
      `If you didn't expect this, you can safely ignore this email.`,
    ].join('\n');
    const html = emailLayout({
      heading: 'Reset your password',
      preheader: 'Your school requested a password reset',
      footer:
        "You're receiving this because your school requested a password reset for your Edrion student account. If you didn't expect this, you can safely ignore it.",
      bodyHtml: `<p style="margin:0 0 16px;">Hi ${user.fullName}, your school requested a password reset for your Edrion student account.</p>
        <p style="margin:0 0 18px;">Click below to choose a new password. This link expires in <strong>1 hour</strong>.</p>
        ${emailButton(resetUrl, 'Reset your password')}`,
    });
    await this.emails.send({
      to: user.email,
      subject: 'Reset your Edrion student password',
      text,
      html,
    });

    await this.audit.logAudit({
      ...basePortalAudit(ctx),
      actorType: ActorType.InstitutionUser,
      action: 'student_portal.password_reset',
      module: MODULE,
      entityType: 'student',
      entityId: student.id,
      result: AuditResult.Success,
      riskLevel: RiskLevel.Medium,
      newState: { institutionUserId: user.id, email: user.email },
    });

    return { studentId: student.id, institutionUserId: user.id, email: user.email };
  }

  /** Institution-scoped student portal surface toggles (Plan 01). */
  async listSurfaces(institutionId: string) {
    const portal = await this.features.resolveByKey('student.portal', { institutionId });
    const surfaces = await Promise.all(
      STUDENT_SURFACES.map(async (s) => {
        const resolution = await this.features.resolveByKey(s.featureFlagKey, { institutionId });
        return {
          key: s.key,
          label: s.label,
          featureFlagKey: s.featureFlagKey,
          enabled: resolution.value,
        };
      }),
    );
    return { portalEnabled: portal.value, surfaces };
  }

  async setSurface(institutionId: string, featureFlagKey: string, value: boolean, actorName: string) {
    const surface = STUDENT_SURFACES.find((s) => s.featureFlagKey === featureFlagKey);
    const isPortal = featureFlagKey === 'student.portal';
    if (!surface && !isPortal) {
      throw new BadRequestException({ code: 'UNKNOWN_SURFACE', message: 'Unknown student surface flag' });
    }

    const [definition] = await this.db
      .select()
      .from(schema.featureDefinitions)
      .where(eq(schema.featureDefinitions.key, featureFlagKey))
      .limit(1);
    if (!definition) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Feature definition not found' });
    }

    if (value && featureFlagKey.startsWith('student.surface.')) {
      const [sub] = await this.db
        .select({ planId: schema.planVersions.planId })
        .from(schema.subscriptions)
        .innerJoin(schema.planVersions, eq(schema.subscriptions.planVersionId, schema.planVersions.id))
        .where(eq(schema.subscriptions.institutionId, institutionId))
        .orderBy(desc(schema.subscriptions.updatedAt))
        .limit(1);
      const planResolution = await this.features.resolveByKey(featureFlagKey, { planId: sub?.planId });
      if (planResolution.layer === 'assignment' && planResolution.scope === 'plan' && !planResolution.value) {
        throw new ForbiddenException({
          code: 'PLAN_LOCKED',
          message: 'An Edrion super administrator must enable this surface.',
        });
      }
      const key = featureFlagKey.slice('student.surface.'.length);
      const module = STUDENT_MODULE_CATALOG.find((item) => item.key === key);
      if (module?.requiresInstitutionModule) {
        const dependency = await this.features.resolveByKey(
          `institution.module.${module.requiresInstitutionModule}`,
          { institutionId, planId: sub?.planId },
        );
        if (!dependency.value) {
          throw new ForbiddenException({
            code: 'MODULE_DEPENDENCY_DISABLED',
            message: 'The backing institution module is disabled.',
          });
        }
      }
    }

    const existing = await this.featureRepo.findAssignment(
      definition.id,
      FeatureScope.Institution,
      institutionId,
    );
    if (existing) {
      await this.featureRepo.updateAssignment(existing.id, {
        value,
        enabled: true,
        setByName: actorName,
        version: existing.version + 1,
      });
    } else {
      await this.featureRepo.insertAssignment({
        featureId: definition.id,
        scope: FeatureScope.Institution,
        scopeId: institutionId,
        value,
        enabled: true,
        setByName: actorName,
      });
    }
    return { featureFlagKey, value };
  }
}
