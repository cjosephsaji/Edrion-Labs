import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, eq, schema, type Database } from '@edrion/database';
import { ActorType, AuditResult, FeatureScope, RiskLevel, STUDENT_SURFACES } from '@edrion/shared-types';
import type { AuditWriter } from '@edrion/audit';
import type { ApiEnv } from '@edrion/config';
import { API_ENV, AUDIT_WRITER, DATABASE } from '../../common/tokens';
import { FeatureControlsRepository } from '../feature-controls/feature-controls.repository';
import { FeatureControlsService } from '../feature-controls/feature-controls.service';
import { hashToken, makeToken } from '../authentication/password.util';
import { EmailService } from './email.service';
import { PortalInviteService } from './portal-invite.service';
import type { PortalActionContext } from './portal-action-context';
import { basePortalAudit } from './portal-action-context';

const MODULE = 'student-portal';
const INVITE_TTL_SECONDS = 7 * 24 * 60 * 60;

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

    const sent = await this.invites.invite({
      institutionId,
      institutionUserId: user.id,
      email: inviteEmail ?? accountEmail,
      fullName,
      invitedBy: ctx.principal.institutionUserId,
    });

    const activateUrl = `${this.env.STUDENT_WEB_URL}/activate?token=${encodeURIComponent(rawToken)}`;
    if (guardianMediated) {
      await this.emails.send({
        to: inviteEmail!,
        subject: `Activate ${fullName}'s student portal account`,
        text: [
          `Hello,`,
          '',
          `${institution?.displayName ?? 'Your school'} has invited ${fullName} to the Edrion student portal.`,
          `As their guardian, please set up their password using this link (valid 7 days):`,
          activateUrl,
          '',
        ].join('\n'),
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
