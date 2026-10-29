import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, gt, inArray, isNull, schema, type Database } from '@edrion/database';
import { AccountStatus, ActorType, AuditResult, RiskLevel } from '@edrion/shared-types';
import type {
  PortalAcceptInviteInput,
  PortalActivateInput,
  PortalForgotPasswordInput,
  PortalResetPasswordInput,
} from '@edrion/schemas';
import type { PortalInviteTokenPayload } from '@edrion/auth';
import type { AuditWriter } from '@edrion/audit';
import type { ApiEnv } from '@edrion/config';
import { API_ENV, AUDIT_WRITER, DATABASE } from '../../common/tokens';
import type { EdrionRequestContext } from '../../common/request-context';
import { JwtError, verifyHs256 } from '../../common/jwt';
import { RegistrationEmailService } from '../registration/registration-email.service';
import { hashPassword, hashToken, makeToken } from '../authentication/password.util';
import { PortalAuthService } from './portal-auth.service';
import { PortalSessionService } from './portal-session.service';
import { portalCredentialGroupId } from './portal-credential-account';

const MODULE = 'portal-auth';
const RESET_TTL_SECONDS = 60 * 60; // 1 hour

/**
 * Native-credential lifecycle for institution users: account activation (first password from the
 * invitation link), forgot-password and reset-password. The invitation/reset links carry a raw
 * single-use token; only its salted hash is stored. Activation signs the user in while the institution
 * stays in Onboarding until go-live. Memberships linked on approval share password resets.
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

  /** Set the first password from the invitation token, activate the account and auto-login. */
  async activate(
    input: PortalActivateInput,
    req: EdrionRequestContext,
  ): Promise<{ token: string }> {
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
        message:
          'This activation link is invalid or has expired. Ask an administrator to resend it.',
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

    const institutionName = await this.institutionName(user.institutionId);

    await this.logAudit(user, req, 'user.activate', AuditResult.Success, RiskLevel.Low, {
      entityType: 'institution_user',
      entityId: user.id,
      newState: { status: AccountStatus.Active },
    });

    // Auto-login: issue a portal session so the just-activated admin lands authenticated.
    const { token } = await this.sessions.issue({
      institutionId: user.institutionId,
      institutionUserId: user.id,
      aal: 'aal1',
      ip: req.ip,
      userAgent: req.userAgent,
    });

    // Welcome email now — the workspace is genuinely live (was previously sent prematurely on approval).
    if (institutionName) {
      await this.emails.sendWelcome(user.email, institutionName, this.env.PORTAL_WEB_URL);
    }

    return { token };
  }

  /** Validate an invite JWT and return display metadata for the accept form. */
  async previewAcceptInvite(
    token: string,
  ): Promise<{ fullName: string; email: string; institutionName: string }> {
    const { invitation, user } = await this.resolveInviteToken(token);
    const institutionName = await this.institutionName(user.institutionId);
    return {
      fullName: user.fullName,
      email: invitation.email,
      institutionName: institutionName ?? 'Your institution',
    };
  }

  /** Accept a portal invitation: set password, activate the user, stamp the invitation, auto-login. */
  async acceptInvite(
    input: PortalAcceptInviteInput,
    req: EdrionRequestContext,
  ): Promise<{ token: string }> {
    const { invitation, user } = await this.resolveInviteToken(input.token);
    if (user.status === AccountStatus.Active) {
      throw new BadRequestException({
        code: 'ALREADY_ACTIVE',
        message: 'This invitation has already been accepted. Sign in with your password.',
      });
    }
    if (user.status !== AccountStatus.Invited) {
      throw new BadRequestException({
        code: 'INVALID_TOKEN',
        message:
          'This invitation link is invalid or has expired. Ask an administrator to resend it.',
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

    await this.db
      .update(schema.portalInvitations)
      .set({ acceptedAt: now })
      .where(eq(schema.portalInvitations.id, invitation.id));

    const institutionName = await this.institutionName(user.institutionId);

    await this.logAudit(user, req, 'user.invite.accepted', AuditResult.Success, RiskLevel.Low, {
      entityType: 'institution_user',
      entityId: user.id,
      newState: { status: AccountStatus.Active, invitationId: invitation.id },
    });

    const { token } = await this.sessions.issue({
      institutionId: user.institutionId,
      institutionUserId: user.id,
      aal: 'aal1',
      ip: req.ip,
      userAgent: req.userAgent,
    });

    if (institutionName) {
      await this.emails.sendWelcome(user.email, institutionName, this.env.PORTAL_WEB_URL);
    }

    return { token };
  }

  /** One reset link per credential account; legacy accounts with separate passwords stay separate. */
  async forgotPassword(input: PortalForgotPasswordInput, req: EdrionRequestContext): Promise<void> {
    const users = await this.auth.loadAllActiveByEmail(input.email);
    const names = await this.auth.institutionNames(users);
    const accounts = new Map<string, typeof users>();
    for (const user of users) {
      const key = portalCredentialGroupId(user);
      accounts.set(key, [...(accounts.get(key) ?? []), user]);
    }
    for (const members of accounts.values()) {
      const user = members[0]!;
      const raw = makeToken();
      await this.db
        .update(schema.institutionUsers)
        .set({
          passwordResetTokenHash: hashToken(raw, this.pepper),
          passwordResetExpiresAt: new Date(Date.now() + RESET_TTL_SECONDS * 1000),
        })
        .where(
          inArray(
            schema.institutionUsers.id,
            members.map((member) => member.id),
          ),
        );
      const resetUrl = `${this.env.PORTAL_WEB_URL}/reset-password?token=${raw}`;
      const institutionNames = [
        ...new Set(members.map((member) => names.get(member.institutionId)).filter(Boolean)),
      ].join(', ');
      await this.emails.sendPasswordReset(
        user.email,
        user.fullName,
        resetUrl,
        institutionNames || undefined,
      );
      for (const member of members) {
        await this.logAudit(
          member,
          req,
          'user.password_reset_requested',
          AuditResult.Success,
          RiskLevel.Medium,
          {
            entityType: 'institution_user',
            entityId: member.id,
          },
        );
      }
    }
  }

  /** Consume the reset once and atomically update/revoke every explicitly linked membership. */
  async resetPassword(input: PortalResetPasswordInput, req: EdrionRequestContext): Promise<void> {
    const tokenHash = hashToken(input.token, this.pepper);
    const invalid = () =>
      new BadRequestException({
        code: 'INVALID_TOKEN',
        message: 'This reset link is invalid or has expired. Request a new one.',
      });
    const members = await this.db.transaction(async (tx) => {
      const [tokenUser] = await tx
        .select()
        .from(schema.institutionUsers)
        .where(
          and(
            eq(schema.institutionUsers.status, AccountStatus.Active),
            isNull(schema.institutionUsers.disabledAt),
            eq(schema.institutionUsers.passwordResetTokenHash, tokenHash),
            gt(schema.institutionUsers.passwordResetExpiresAt, new Date()),
          ),
        )
        .limit(1);
      if (!tokenUser) throw invalid();
      // Same lock order as registration approval; recheck the token after acquiring the locks.
      const emailUsers = await tx
        .select()
        .from(schema.institutionUsers)
        .where(eq(schema.institutionUsers.email, tokenUser.email))
        .orderBy(asc(schema.institutionUsers.id))
        .for('update');
      const user = emailUsers.find((candidate) => candidate.id === tokenUser.id);
      if (
        !user ||
        user.status !== AccountStatus.Active ||
        user.disabledAt ||
        user.passwordResetTokenHash !== tokenHash ||
        !user.passwordResetExpiresAt ||
        user.passwordResetExpiresAt.getTime() <= Date.now()
      )
        throw invalid();
      const groupId = portalCredentialGroupId(user);
      const linked = emailUsers.filter((member) => portalCredentialGroupId(member) === groupId);
      const ids = linked.map((member) => member.id);
      const now = new Date();
      await tx
        .update(schema.institutionUsers)
        .set({
          passwordHash: await hashPassword(input.password),
          passwordResetTokenHash: null,
          passwordResetExpiresAt: null,
          passwordResetRequiredAt: null,
          failedLoginAttempts: 0,
          lockedUntil: null,
          lockedAt: null,
          sessionsRevokedAt: now,
        })
        .where(inArray(schema.institutionUsers.id, ids));
      await tx
        .update(schema.portalSessions)
        .set({ revokedAt: now, revokedReason: 'password_reset' })
        .where(
          and(
            inArray(schema.portalSessions.institutionUserId, ids),
            isNull(schema.portalSessions.revokedAt),
          ),
        );
      return linked;
    });
    for (const user of members) {
      await this.logAudit(user, req, 'user.password_reset', AuditResult.Success, RiskLevel.Medium, {
        entityType: 'institution_user',
        entityId: user.id,
      });
    }
  }

  /**
   * The parent institution's display name, for the welcome email. Activation no longer flips the
   * institution live — it stays in Onboarding so the admin is steered through the setup wizard;
   * go-live (OnboardingService.complete) is the sole Onboarding→Active transition.
   */
  private async institutionName(institutionId: string): Promise<string | null> {
    const [inst] = await this.db
      .select({ displayName: schema.institutions.displayName })
      .from(schema.institutions)
      .where(eq(schema.institutions.id, institutionId))
      .limit(1);
    return inst?.displayName ?? null;
  }

  private async resolveInviteToken(token: string) {
    let payload: Record<string, unknown>;
    try {
      payload = verifyHs256(token, this.env.SESSION_COOKIE_SECRET);
    } catch (err) {
      const message =
        err instanceof JwtError && err.message === 'Token expired'
          ? 'This invitation link has expired. Ask an administrator to resend it.'
          : 'This invitation link is invalid or has expired. Ask an administrator to resend it.';
      throw new BadRequestException({ code: 'INVALID_TOKEN', message });
    }

    if (
      payload.purpose !== 'portal_invite' ||
      typeof payload.inv !== 'string' ||
      typeof payload.uid !== 'string'
    ) {
      throw new BadRequestException({
        code: 'INVALID_TOKEN',
        message:
          'This invitation link is invalid or has expired. Ask an administrator to resend it.',
      });
    }
    const invitePayload = payload as unknown as PortalInviteTokenPayload;

    const [invitation] = await this.db
      .select()
      .from(schema.portalInvitations)
      .where(
        and(
          eq(schema.portalInvitations.id, invitePayload.inv),
          eq(schema.portalInvitations.institutionUserId, invitePayload.uid),
          isNull(schema.portalInvitations.acceptedAt),
          gt(schema.portalInvitations.expiresAt, new Date()),
        ),
      )
      .limit(1);
    if (!invitation) {
      throw new BadRequestException({
        code: 'INVALID_TOKEN',
        message:
          'This invitation link is invalid or has expired. Ask an administrator to resend it.',
      });
    }

    const [user] = await this.db
      .select()
      .from(schema.institutionUsers)
      .where(eq(schema.institutionUsers.id, invitation.institutionUserId))
      .limit(1);
    if (!user || user.disabledAt) {
      throw new BadRequestException({
        code: 'INVALID_TOKEN',
        message:
          'This invitation link is invalid or has expired. Ask an administrator to resend it.',
      });
    }

    return { invitation, user };
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
