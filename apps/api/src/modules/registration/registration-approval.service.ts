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
import { and, count, desc, eq, schema, type Database } from '@edrion/database';
import type { InstitutionRegistrationRequest } from '@edrion/database';
import type { AuditWriter, AuditEventInput } from '@edrion/audit';
import type { ApiEnv } from '@edrion/config';
import { API_ENV, AUDIT_WRITER, DATABASE } from '../../common/tokens';
import { buildCampusCode } from '../campuses/campus-code';
import { baseAudit, type ActionContext } from '../../common/action-context';
import { hashPassword, hashToken, makeToken } from '../authentication/password.util';
import { RegistrationRepository } from './registration.repository';
import { RegistrationEmailService } from './registration-email.service';

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
}

/**
 * Provisioning on approval. Everything — institution, default campus, primary administrator, role +
 * campus grants, onboarding checklist and the request transition — happens in ONE transaction so an
 * approval can never leave a half-built institution. Audits + emails are emitted after commit.
 *
 * Activation is credential-delivery-driven. The default (`activation`) creates the admin `invited`
 * and the institution in `Onboarding`, emailing a single-use set-password link; the institution
 * only flips to `Active` when the admin completes activation (see PortalCredentialService). The
 * `temporary_password` option instead hands over working credentials and goes live immediately.
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
    if (!request) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Registration not found' });
    if (
      request.status !== RegistrationStatus.Submitted &&
      request.status !== RegistrationStatus.UnderReview
    ) {
      throw new ConflictException({
        code: 'INVALID_STATUS',
        message: `Cannot approve a request in status "${request.status}".`,
      });
    }
    this.assertProvisionable(request);

    const employeeId = ctx.principalContext.principal.employeeId;
    const info = request.institutionInfo!;
    const loc = request.location!;
    const contact = request.primaryContact!;

    const tempPassword =
      input.admin.credentialDelivery === 'temporary_password' ? generateTempPassword() : undefined;
    // Activation delivery (the default): the admin gets a single-use link to set their own password.
    // Their account stays `invited` and the institution stays `Onboarding` until they activate.
    // Temporary-password delivery activates immediately, so no token is issued.
    const pepper = this.env.REGISTRATION_OTP_PEPPER ?? this.env.SESSION_COOKIE_SECRET;
    const activationToken = tempPassword ? undefined : makeToken();

    const result = await this.db.transaction(async (tx) => {
      const countRows = await tx.select({ value: count() }).from(schema.institutions);
      const existing = Number(countRows[0]?.value ?? 0);
      const institutionPublicId = `INST-${String(1000 + existing + 1).padStart(5, '0')}`;

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
          // Temp-password delivery hands over working credentials now, so the institution is live
          // immediately. Activation delivery keeps it in Onboarding until the admin sets a password.
          status: tempPassword ? InstitutionStatus.Active : InstitutionStatus.Onboarding,
          activatedAt: tempPassword ? new Date() : null,
          onboardingStatus: OnboardingStatus.InProgress,
          supportTier: input.supportTier,
          customerSuccessOwnerId: employeeId,
          createdBy: employeeId,
        })
        .returning();

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
          email: input.admin.email,
          fullName: input.admin.fullName,
          // Temp-password: active now with a usable bcrypt credential. Activation: invited, holding
          // only the hash of a single-use link the admin uses to choose their own password.
          status: tempPassword ? AccountStatus.Active : AccountStatus.Invited,
          passwordHash: tempPassword ? await hashPassword(tempPassword) : null,
          activatedAt: tempPassword ? now : null,
          activationTokenHash: activationToken ? hashToken(activationToken, pepper) : null,
          activationTokenExpiresAt: activationToken ? new Date(Date.now() + ACTIVATION_TTL_MS) : null,
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
      };
    });

    // ── Post-commit: audit trail + notifications ──────────────────────────────
    const instName = result.institution.displayName;
    await this.writeAudit(ctx, result.institution.id, instName, 'institution.create', {
      entityType: 'institution',
      entityId: result.institution.id,
      newState: { publicId: result.institutionPublicId, status: result.institution.status, source: 'registration', requestId: id },
    });
    await this.writeAudit(ctx, result.institution.id, instName, 'campus.create', {
      entityType: 'campus',
      entityId: result.campus.id,
      newState: { name: result.campus.name, code: result.campus.code },
    });
    await this.writeAudit(ctx, result.institution.id, instName, 'institution_user.invite', {
      entityType: 'institution_user',
      entityId: result.adminUser.id,
      newState: { email: result.adminUser.email, roleKeys: input.admin.roleKeys, primaryAdmin: true },
    });
    await this.writeAudit(ctx, result.institution.id, instName, 'registration.approved', {
      entityType: 'registration_request',
      entityId: id,
      previousState: { status: request.status },
      newState: { status: RegistrationStatus.Approved, institutionId: result.institution.id },
    });

    const base = this.env.PORTAL_WEB_URL.replace(/\/$/, '');
    // Activation delivery → a tokenised set-password link. Temp-password delivery → the plain login
    // page (the credentials are in the email body). The welcome email is NOT sent here for the
    // activation path — it fires once the admin actually activates (see PortalCredentialService).
    const inviteUrl = activationToken ? `${base}/activate?token=${activationToken}` : `${base}/login`;

    if (request.contactEmail) {
      const sent = await this.emails.sendApproved(request.contactEmail, instName);
      await this.writeAudit(ctx, result.institution.id, instName, 'registration.email_sent', {
        entityType: 'registration_request',
        entityId: id,
        newState: { template: 'registration_approved', to: request.contactEmail, messageId: sent.messageId },
      });
    }
    const invite = await this.emails.sendAdminInvitation(
      result.adminUser.email,
      result.adminUser.fullName,
      instName,
      inviteUrl,
      tempPassword,
    );
    await this.writeAudit(ctx, result.institution.id, instName, 'registration.email_sent', {
      entityType: 'institution_user',
      entityId: result.adminUser.id,
      newState: { template: 'administrator_invitation', to: result.adminUser.email, messageId: invite.messageId },
    });

    // Temp-password accounts are live immediately, so the welcome is appropriate now. Activation
    // accounts receive it on completion instead — avoids the premature "your workspace is ready".
    if (tempPassword) {
      const welcome = await this.emails.sendWelcome(result.adminUser.email, instName, `${base}/login`);
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
