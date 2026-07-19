import { Inject, Injectable } from '@nestjs/common';
import { eq, schema, type Database, type PortalInvitation } from '@edrion/database';
import type { PortalInviteTokenPayload } from '@edrion/auth';
import type { ApiEnv } from '@edrion/config';
import { API_ENV, DATABASE } from '../../common/tokens';
import { signHs256 } from '../../common/jwt';
import { emailButton, emailLayout } from '../../common/email-templates';
import { EmailService } from './email.service';

/** Invitations are valid for 7 days, then the user must be re-invited. */
const INVITE_TTL_SECONDS = 7 * 24 * 60 * 60;

export interface SentInvitation {
  invitation: PortalInvitation;
  emailMessageId: string;
  emailTransport: 'smtp' | 'log';
}

/**
 * Issues a real invitation email for a newly-invited institution user. Persists a
 * `portal_invitations` row, mints a signed accept token (HS256, SESSION_COOKIE_SECRET, with a
 * `purpose` discriminator so it can never be replayed as a session token), builds the portal
 * accept link, and dispatches the message through the {@link EmailService} seam. The user row
 * stays `invited` until the link is accepted. Called from {@link UsersService.invite}.
 */
@Injectable()
export class PortalInviteService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(API_ENV) private readonly env: ApiEnv,
    private readonly email: EmailService,
  ) {}

  async invite(input: {
    institutionId: string;
    institutionUserId: string;
    email: string;
    fullName: string;
    invitedBy: string;
    /** When false, only persists the invitation row (e.g. student portal sends its own email). Default true. */
    sendEmail?: boolean;
  }): Promise<SentInvitation> {
    const institutionName = await this.institutionName(input.institutionId);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + INVITE_TTL_SECONDS * 1000);

    const [invitation] = await this.db
      .insert(schema.portalInvitations)
      .values({
        institutionId: input.institutionId,
        institutionUserId: input.institutionUserId,
        email: input.email,
        expiresAt,
        createdBy: input.invitedBy,
      })
      .returning();
    if (!invitation) throw new Error('Failed to create invitation');

    if (input.sendEmail === false) {
      return { invitation, emailMessageId: 'skipped', emailTransport: 'log' };
    }

    const payload: Omit<PortalInviteTokenPayload, 'iat' | 'exp'> = {
      inv: invitation.id,
      uid: input.institutionUserId,
      purpose: 'portal_invite',
    };
    const token = signHs256(payload, this.env.SESSION_COOKIE_SECRET, INVITE_TTL_SECONDS, now);
    const acceptUrl = `${this.env.PORTAL_WEB_URL}/accept-invite?token=${encodeURIComponent(token)}`;

    const text = [
      `Hi ${input.fullName},`,
      '',
      `${institutionName} has invited you to the Edrion institution portal.`,
      `Accept your invitation (valid for 7 days):`,
      acceptUrl,
      '',
      `If you weren't expecting this, you can ignore this email.`,
    ].join('\n');
    const html = emailLayout({
      heading: `You've been invited to ${institutionName}`,
      preheader: 'Accept your Edrion portal invitation',
      footer:
        "You're receiving this because you were invited to join an institution on Edrion. If you weren't expecting this, you can safely ignore it.",
      bodyHtml: `<p style="margin:0 0 16px;">Hi ${input.fullName}, <strong>${institutionName}</strong> has invited you to join their workspace on Edrion.</p>
        <p style="margin:0 0 18px;">Click below to accept your invitation and set up your account. This link is valid for <strong>7 days</strong>.</p>
        ${emailButton(acceptUrl, 'Accept invitation')}
        <p style="margin:18px 0 0;">If you weren't expecting this invitation, you can safely ignore this email.</p>`,
    });

    const sent = await this.email.send({
      to: input.email,
      subject: `You've been invited to ${institutionName} on Edrion`,
      text,
      html,
    });

    return { invitation, emailMessageId: sent.messageId, emailTransport: sent.transport };
  }

  private async institutionName(institutionId: string): Promise<string> {
    const [row] = await this.db
      .select({ name: schema.institutions.displayName })
      .from(schema.institutions)
      .where(eq(schema.institutions.id, institutionId))
      .limit(1);
    return row?.name ?? 'Your institution';
  }
}
