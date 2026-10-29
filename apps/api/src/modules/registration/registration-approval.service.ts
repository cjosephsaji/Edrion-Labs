import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import {
  AccountStatus,
  InstitutionStatus,
  OnboardingStatus,
  RegistrationStatus,
} from '@edrion/shared-types';
import type { ApproveRegistrationInput } from '@edrion/schemas';
import {
  and,
  asc,
  desc,
  eq,
  ilike,
  schema,
  seedInstitutionScheduleDefaults,
  type Database,
} from '@edrion/database';
import type { InstitutionRegistrationRequest } from '@edrion/database';
import type { AuditWriter, AuditEventInput } from '@edrion/audit';
import type { ApiEnv } from '@edrion/config';
import { API_ENV, AUDIT_WRITER, DATABASE } from '../../common/tokens';
import { buildCampusCode } from '../campuses/campus-code';
import { baseAudit, type ActionContext } from '../../common/action-context';
import { hashPassword, hashToken, makeToken } from '../authentication/password.util';
import { RegistrationRepository } from './registration.repository';
import { RegistrationEmailService } from './registration-email.service';
import {
  existingPortalCredentialAccount,
  portalCredentialGroupId,
} from '../portal/portal-credential-account';

const MODULE = 'registration';

/** How long an account-activation link stays valid. */
const ACTIVATION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/** The default onboarding checklist seeded for a newly provisioned institution. */
const DEFAULT_ONBOARDING_TASKS = [
  { key: 'kickoff', label: 'Schedule the onboarding kickoff call' },
  { key: 'campus_setup', label: 'Configure campuses and academic structure' },
  { key: 'import_people', label: 'Import staff and students' },
  { key: 'branding', label: 'Set institution branding and settings' },
  { key: 'training', label: 'Complete administrator training' },
  { key: 'go_live', label: 'Go live' },
] as const;

export interface ApprovalResult {
  institutionId: string;
  institutionPublicId: string;
  adminUserId: string;
  publicRef: string | null;
  adminAccess: 'existing_account' | 'activation' | 'temporary_password';
}

/**
 * Provisioning on approval. Everything — institution, default campus, primary administrator, role +
 * campus grants, onboarding checklist and the request transition — happens in ONE transaction so an
 * approval can never leave a half-built institution. Audits + emails are emitted after commit.
 *
 * Returning administrators reuse an active account's credentials immediately. First-time users
 * receive an activation link or temporary password. Institutions remain in Onboarding until go-live.
 */
@Injectable()
export class RegistrationApprovalService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(AUDIT_WRITER) private readonly audit: AuditWriter,
    @Inject(API_ENV) private readonly env: ApiEnv,
    private readonly repo: RegistrationRepository,
    private readonly emails: RegistrationEmailService,
  ) {}

  async approve(
    id: string,
    input: ApproveRegistrationInput,
    ctx: ActionContext,
  ): Promise<ApprovalResult> {
    const request = await this.repo.findById(id);
    if (!request)
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Registration not found' });
    if (request.status !== RegistrationStatus.UnderReview) {
      throw new ConflictException({
        code: 'INVALID_STATUS',
        message: `Cannot approve a request in status "${request.status}". Start the review first.`,
      });
    }
    this.assertProvisionable(request);

    const employeeId = ctx.principalContext.principal.employeeId;
    const info = request.institutionInfo!;
    const loc = request.location!;
    const contact = request.primaryContact!;

    const pepper = this.env.REGISTRATION_OTP_PEPPER ?? this.env.SESSION_COOKIE_SECRET;
    const adminEmail = input.admin.email.trim().toLowerCase();

    const result = await this.db.transaction(async (tx) => {
      // Lock existing memberships in a stable order, also used by password reset, so approval
      // cannot copy a password that is being changed concurrently.
      const existingUsers = await tx
        .select()
        .from(schema.institutionUsers)
        .where(eq(schema.institutionUsers.email, adminEmail))
        .orderBy(asc(schema.institutionUsers.id))
        .for('update');
      const existingAccount = existingPortalCredentialAccount(existingUsers);
      const credentialGroupId = existingAccount
        ? portalCredentialGroupId(existingAccount)
        : undefined;
      const tempPassword =
        !existingAccount && input.admin.credentialDelivery === 'temporary_password'
          ? generateTempPassword()
          : undefined;
      const activationToken = !existingAccount && !tempPassword ? makeToken() : undefined;
      if (existingAccount) {
        await tx
          .update(schema.institutionUsers)
          .set({
            metadata: { ...existingAccount.metadata, portalCredentialGroupId: credentialGroupId },
            updatedAt: new Date(),
            version: existingAccount.version + 1,
          })
          .where(eq(schema.institutionUsers.id, existingAccount.id));
      }

      // Gap-safe public id: base on the highest INST- id in use (count() reissues a deleted number
      // and collides on institutions_public_id_unique), then pre-check each candidate for races.
      const [topInst] = await tx
        .select({ publicId: schema.institutions.publicId })
        .from(schema.institutions)
        .where(ilike(schema.institutions.publicId, 'INST-%'))
        .orderBy(desc(schema.institutions.publicId))
        .limit(1);
      let seq = topInst?.publicId
        ? Number.parseInt(topInst.publicId.slice('INST-'.length), 10)
        : 1000;
      if (!Number.isFinite(seq)) seq = 1000;
      let institutionPublicId = `INST-${String(seq + 1).padStart(5, '0')}`;
      for (let attempt = 0; attempt < 5; attempt++) {
        seq += 1;
        institutionPublicId = `INST-${String(seq).padStart(5, '0')}`;
        const [dupe] = await tx
          .select({ id: schema.institutions.id })
          .from(schema.institutions)
          .where(eq(schema.institutions.publicId, institutionPublicId))
          .limit(1);
        if (!dupe) break;
      }

      const [institution] = await tx
        .insert(schema.institutions)
        .values({
          publicId: institutionPublicId,
          legalName: request.legalName ?? info.legalName,
          displayName: request.displayName ?? info.displayName,
          type: (request.type ?? info.type) as typeof schema.institutions.$inferInsert.type,
          country: request.country ?? loc.country,
          region: loc.region ?? null,
          timezone: loc.timezone || 'UTC',
          logoUrl: info.logoUrl ?? null,
          address: {
            line1: loc.address,
            city: loc.city,
            region: loc.region,
            postalCode: loc.postalCode,
            country: loc.country,
          },
          primaryContact: {
            name: contact.fullName,
            email: contact.email,
            phone: contact.phone,
            title: contact.jobTitle,
          },
          // Every newly approved institution starts in Onboarding regardless of credential delivery,
          // so its admin is steered through the setup wizard. Go-live is the sole Onboarding→Active
          // transition; `activatedAt` is stamped there.
          status: InstitutionStatus.Onboarding,
          activatedAt: null,
          onboardingStatus: OnboardingStatus.InProgress,
          supportTier: input.supportTier,
          customerSuccessOwnerId: employeeId,
          createdBy: employeeId,
        })
        .returning();

      await seedInstitutionScheduleDefaults(tx, institution!.id);

      const [campus] = await tx
        .insert(schema.campuses)
        .values({
          institutionId: institution!.id,
          name: input.campus.name,
          // First campus of a brand-new institution → no existing codes to avoid.
          code: buildCampusCode(input.campus.name, []),
          studentCapacity: request.expectedStudents ?? null,
          createdBy: employeeId,
        })
        .returning();

      // Open the subscription in the plan the institution chose during registration (an approver
      // override via input.planKey still wins). Starts as a trial; billing is finalised in onboarding.
      const planKey = input.planKey ?? request.preferredPlanKey ?? undefined;
      if (planKey) {
        const [pv] = await tx
          .select({
            id: schema.planVersions.id,
            trialDays: schema.planVersions.trialDays,
            currency: schema.planVersions.currency,
          })
          .from(schema.planVersions)
          .innerJoin(schema.plans, eq(schema.plans.id, schema.planVersions.planId))
          .where(and(eq(schema.plans.key, planKey), eq(schema.planVersions.status, 'published')))
          .orderBy(desc(schema.planVersions.version))
          .limit(1);
        if (pv) {
          const trialEndsAt = new Date(Date.now() + (pv.trialDays || 14) * 86_400_000);
          await tx.insert(schema.subscriptions).values({
            institutionId: institution!.id,
            planVersionId: pv.id,
            status: 'trial',
            currency: pv.currency,
            periodEnd: trialEndsAt,
            trialEndsAt,
          });
        }
      }

      const now = new Date();
      const [adminUser] = await tx
        .insert(schema.institutionUsers)
        .values({
          institutionId: institution!.id,
          email: adminEmail,
          fullName: input.admin.fullName,
          // A membership has its own roles and scope; only sign-in credentials are reused.
          status: existingAccount || tempPassword ? AccountStatus.Active : AccountStatus.Invited,
          passwordHash:
            existingAccount?.passwordHash ??
            (tempPassword ? await hashPassword(tempPassword) : null),
          authUserId: existingAccount?.authUserId ?? null,
          activatedAt: existingAccount || tempPassword ? now : null,
          activationTokenHash: activationToken ? hashToken(activationToken, pepper) : null,
          activationTokenExpiresAt: activationToken
            ? new Date(Date.now() + ACTIVATION_TTL_MS)
            : null,
          mfaEnrolled: existingAccount?.mfaEnrolled ?? false,
          requireMfa: existingAccount?.requireMfa ?? false,
          failedLoginAttempts: existingAccount?.failedLoginAttempts ?? 0,
          lockedUntil: existingAccount?.lockedUntil ?? null,
          lockedAt: existingAccount?.lockedAt ?? null,
          passwordResetRequiredAt: existingAccount?.passwordResetRequiredAt ?? null,
          metadata: credentialGroupId ? { portalCredentialGroupId: credentialGroupId } : {},
          invitedAt: now,
          createdBy: employeeId,
        })
        .returning();

      await tx.insert(schema.institutionUserRoles).values(
        input.admin.roleKeys.map((roleKey) => ({
          institutionUserId: adminUser!.id,
          roleKey,
        })),
      );

      await tx.insert(schema.campusUserAccess).values({
        institutionUserId: adminUser!.id,
        campusId: campus!.id,
        accessLevel: 'manage',
        createdBy: employeeId,
      });

      await tx.insert(schema.institutionOnboardingTasks).values(
        DEFAULT_ONBOARDING_TASKS.map((t, i) => ({
          institutionId: institution!.id,
          key: t.key,
          label: t.label,
          order: i,
        })),
      );

      // Optimistic-concurrency transition of the request — rolls the whole approval back on mismatch.
      const [updatedRequest] = await tx
        .update(schema.institutionRegistrationRequests)
        .set({
          status: RegistrationStatus.Approved,
          decidedBy: employeeId,
          decisionAt: new Date(),
          linkedInstitutionId: institution!.id,
          version: input.version + 1,
          updatedBy: employeeId,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(schema.institutionRegistrationRequests.id, id),
            eq(schema.institutionRegistrationRequests.version, input.version),
          ),
        )
        .returning();
      if (!updatedRequest) {
        throw new ConflictException({
          code: 'VERSION_CONFLICT',
          message: 'This record changed since you loaded it. Reload and try again.',
        });
      }

      await tx.insert(schema.institutionRegistrationReviews).values({
        requestId: id,
        reviewerId: employeeId,
        action: 'approved',
        fromStatus: request.status,
        toStatus: RegistrationStatus.Approved,
        note: input.note,
        metadata: {
          institutionId: institution!.id,
          institutionPublicId,
          adminUserId: adminUser!.id,
        },
      });

      return {
        institution: institution!,
        campus: campus!,
        adminUser: adminUser!,
        institutionPublicId,
        existingAccount,
        tempPassword,
        activationToken,
      };
    });

    // ── Post-commit: audit trail + notifications ──────────────────────────────
    const instName = result.institution.displayName;
    const adminAccess = result.existingAccount
      ? 'existing_account'
      : result.tempPassword
        ? 'temporary_password'
        : 'activation';
    await this.writeAudit(ctx, result.institution.id, instName, 'institution.create', {
      entityType: 'institution',
      entityId: result.institution.id,
      newState: {
        publicId: result.institutionPublicId,
        status: result.institution.status,
        source: 'registration',
        requestId: id,
      },
    });
    await this.writeAudit(ctx, result.institution.id, instName, 'campus.create', {
      entityType: 'campus',
      entityId: result.campus.id,
      newState: { name: result.campus.name, code: result.campus.code },
    });
    await this.writeAudit(
      ctx,
      result.institution.id,
      instName,
      result.existingAccount ? 'institution_user.link' : 'institution_user.invite',
      {
        entityType: 'institution_user',
        entityId: result.adminUser.id,
        newState: {
          email: result.adminUser.email,
          roleKeys: input.admin.roleKeys,
          primaryAdmin: true,
          adminAccess,
          existingInstitutionUserId: result.existingAccount?.id,
        },
      },
    );
    await this.writeAudit(ctx, result.institution.id, instName, 'registration.approved', {
      entityType: 'registration_request',
      entityId: id,
      previousState: { status: request.status },
      newState: { status: RegistrationStatus.Approved, institutionId: result.institution.id },
    });

    const base = this.env.PORTAL_WEB_URL.replace(/\/$/, '');
    const loginUrl = `${base}/login`;
    const inviteUrl = result.activationToken
      ? `${base}/activate?token=${result.activationToken}`
      : loginUrl;

    // When the applicant is also the returning administrator, send one clear approval email.
    // A separate applicant still receives the general approval notice, without activation instructions.
    if (
      request.contactEmail &&
      (!result.existingAccount || request.contactEmail.toLowerCase() !== result.adminUser.email)
    ) {
      const sent = await this.emails.sendApproved(
        request.contactEmail,
        instName,
        Boolean(result.existingAccount),
      );
      await this.writeAudit(ctx, result.institution.id, instName, 'registration.email_sent', {
        entityType: 'registration_request',
        entityId: id,
        newState: {
          template: 'registration_approved',
          to: request.contactEmail,
          messageId: sent.messageId,
        },
      });
    }
    const invitation = result.existingAccount
      ? await this.emails.sendExistingAccountApproved(
          result.adminUser.email,
          result.adminUser.fullName,
          instName,
          loginUrl,
          Boolean(result.adminUser.passwordHash),
        )
      : await this.emails.sendAdminInvitation(
          result.adminUser.email,
          result.adminUser.fullName,
          instName,
          inviteUrl,
          result.tempPassword,
        );
    await this.writeAudit(ctx, result.institution.id, instName, 'registration.email_sent', {
      entityType: 'institution_user',
      entityId: result.adminUser.id,
      newState: {
        template: result.existingAccount
          ? 'existing_account_institution_approved'
          : 'administrator_invitation',
        to: result.adminUser.email,
        messageId: invitation.messageId,
      },
    });

    if (result.tempPassword) {
      const welcome = await this.emails.sendWelcome(result.adminUser.email, instName, loginUrl);
      await this.writeAudit(ctx, result.institution.id, instName, 'registration.email_sent', {
        entityType: 'institution',
        entityId: result.institution.id,
        newState: { template: 'welcome', to: result.adminUser.email, messageId: welcome.messageId },
      });
    }

    return {
      institutionId: result.institution.id,
      institutionPublicId: result.institutionPublicId,
      adminUserId: result.adminUser.id,
      publicRef: request.publicRef,
      adminAccess,
    };
  }

  private assertProvisionable(request: InstitutionRegistrationRequest): void {
    if (!request.institutionInfo || !request.location || !request.primaryContact) {
      throw new BadRequestException({
        code: 'INCOMPLETE_REQUEST',
        message: 'This request is missing required institution, location or contact details.',
      });
    }
  }

  private async writeAudit(
    ctx: ActionContext,
    institutionId: string,
    institutionName: string,
    action: string,
    extra: Partial<AuditEventInput>,
  ): Promise<void> {
    await this.audit.logAudit({
      ...baseAudit(ctx),
      action,
      module: MODULE,
      institutionId,
      institutionName,
      ...extra,
    } as AuditEventInput);
  }
}

/** Human-typable temporary password: groups of letters/digits, no ambiguous characters. */
function generateTempPassword(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789abcdefghijkmnpqrstuvwxyz';
  const bytes = randomBytes(16);
  let out = '';
  for (let i = 0; i < 16; i++) {
    out += alphabet[bytes[i]! % alphabet.length];
    if (i === 3 || i === 7 || i === 11) out += '-';
  }
  return out;
}
