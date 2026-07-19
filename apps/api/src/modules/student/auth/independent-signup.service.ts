import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
} from '@nestjs/common';
import { createHash, randomInt } from 'node:crypto';
import { eq, schema, type Database, type IndependentUser } from '@edrion/database';
import { ActorType, AuditResult } from '@edrion/shared-types';
import type { IndependentSignupInput, IndependentVerifyInput } from '@edrion/schemas';
import type { AuditWriter } from '@edrion/audit';
import type { ApiEnv } from '@edrion/config';
import { API_ENV, AUDIT_WRITER, DATABASE } from '../../../common/tokens';
import type { EdrionRequestContext } from '../../../common/request-context';
import { hashPassword } from '../../authentication/password.util';
import { emailCodeBlock, emailLayout } from '../../../common/email-templates';
import { EmailService } from '../../portal/email.service';

const MODULE = 'student-auth';
const OTP_TTL_SECONDS = 600;
const OTP_LENGTH = 6;
const MAX_ATTEMPTS = 5;
const MAX_SENDS = 5;
const RESEND_COOLDOWN_SECONDS = 60;

/**
 * Independent learner signup funnel — OTP verification reusing the admissions-public lifecycle
 * semantics (hashed codes, cooldown, send cap) stored on the user row's activation token fields.
 */
@Injectable()
export class IndependentSignupService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(AUDIT_WRITER) private readonly audit: AuditWriter,
    @Inject(API_ENV) private readonly env: ApiEnv,
    private readonly emails: EmailService,
  ) {}

  private get pepper(): string {
    return this.env.REGISTRATION_OTP_PEPPER ?? this.env.SESSION_COOKIE_SECRET;
  }

  private hashCode(code: string): string {
    return createHash('sha256').update(`${code}:${this.pepper}`).digest('hex');
  }

  async start(input: IndependentSignupInput, req: EdrionRequestContext) {
    const email = input.email.toLowerCase();
    let [user] = await this.db
      .select()
      .from(schema.independentUsers)
      .where(eq(schema.independentUsers.email, email))
      .limit(1);

    if (user?.activatedAt) {
      throw new ConflictException({
        code: 'ALREADY_REGISTERED',
        message: 'An account with this email already exists. Sign in instead.',
      });
    }

    if (!user) {
      const [created] = await this.db
        .insert(schema.independentUsers)
        .values({
          email,
          fullName: input.fullName,
          country: input.country ?? null,
          status: 'invited',
          signupSource: 'student_portal',
        })
        .returning();
      if (!created) throw new Error('Failed to create independent user');
      user = created;
    } else {
      await this.db
        .update(schema.independentUsers)
        .set({ fullName: input.fullName, country: input.country ?? user.country })
        .where(eq(schema.independentUsers.id, user.id));
    }

    const sends = user.activationTokenHash ? 1 : 0;
    if (sends >= MAX_SENDS) {
      throw new HttpException(
        { code: 'OTP_SEND_LIMIT', message: 'Too many codes requested. Contact support to continue.' },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    if (user.activationTokenExpiresAt && user.activationTokenExpiresAt.getTime() > Date.now()) {
      const since =
        user.updatedAt.getTime() - (user.activationTokenExpiresAt.getTime() - OTP_TTL_SECONDS * 1000);
      if (since < RESEND_COOLDOWN_SECONDS * 1000) {
        const retryAfter = Math.ceil(RESEND_COOLDOWN_SECONDS - since / 1000);
        throw new HttpException(
          {
            code: 'OTP_COOLDOWN',
            message: `Please wait ${retryAfter}s before requesting another code.`,
            details: { retryAfter },
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }

    const code = String(randomInt(0, 10 ** OTP_LENGTH)).padStart(OTP_LENGTH, '0');
    const expiresAt = new Date(Date.now() + OTP_TTL_SECONDS * 1000);
    await this.db
      .update(schema.independentUsers)
      .set({
        activationTokenHash: this.hashCode(code),
        activationTokenExpiresAt: expiresAt,
        failedLoginAttempts: 0,
      })
      .where(eq(schema.independentUsers.id, user.id));

    const text = [
      `Hi ${input.fullName},`,
      '',
      `Your verification code is ${code}.`,
      'It expires in 10 minutes.',
      '',
    ].join('\n');
    const html = emailLayout({
      heading: 'Verify your email',
      preheader: 'Your Edrion verification code',
      footer:
        "You're receiving this because a student account signup was started with this email at Edrion. If this wasn't you, you can safely ignore it.",
      bodyHtml: `<p style="margin:0 0 18px;">Use the code below to verify your email and continue creating your Edrion student account. It expires in <strong>10 minutes</strong>.</p>
        ${emailCodeBlock(code)}
        <p style="margin:0;">For your security, never share this code. Edrion staff will never ask you for it.</p>`,
    });
    await this.emails.send({
      to: email,
      subject: 'Your Edrion verification code',
      text,
      html,
    });

    await this.audit.logAudit({
      actorType: ActorType.Applicant,
      actorName: email,
      action: 'student.signup.otp_sent',
      module: MODULE,
      entityType: 'independent_user',
      entityId: user.id,
      result: AuditResult.Success,
      ip: req.ip,
      userAgent: req.userAgent,
      requestId: req.requestId,
      correlationId: req.correlationId,
    });

    const devCode =
      this.env.REGISTRATION_OTP_DEV_RETURN && this.env.NODE_ENV !== 'production' ? { code } : {};
    return {
      ok: true,
      expiresInSeconds: OTP_TTL_SECONDS,
      resendAvailableInSeconds: RESEND_COOLDOWN_SECONDS,
      ...devCode,
    };
  }

  async verify(input: IndependentVerifyInput, req: EdrionRequestContext): Promise<IndependentUser> {
    const email = input.email.toLowerCase();
    const [user] = await this.db
      .select()
      .from(schema.independentUsers)
      .where(eq(schema.independentUsers.email, email))
      .limit(1);

    if (!user || !user.activationTokenHash || !user.activationTokenExpiresAt) {
      throw new BadRequestException({
        code: 'OTP_NOT_FOUND',
        message: 'No active code. Request a new verification code.',
      });
    }

    if (user.activationTokenExpiresAt.getTime() < Date.now()) {
      throw new BadRequestException({
        code: 'OTP_EXPIRED',
        message: 'This code has expired. Request a new one.',
      });
    }

    if (user.failedLoginAttempts >= MAX_ATTEMPTS) {
      throw new BadRequestException({
        code: 'OTP_LOCKED',
        message: 'Too many incorrect attempts. Request a new code.',
      });
    }

    if (user.activationTokenHash !== this.hashCode(input.code)) {
      const attempts = user.failedLoginAttempts + 1;
      await this.db
        .update(schema.independentUsers)
        .set({ failedLoginAttempts: attempts })
        .where(eq(schema.independentUsers.id, user.id));
      throw new BadRequestException({
        code: 'OTP_INVALID',
        message: 'Incorrect code. Please try again.',
        details: { attemptsRemaining: Math.max(0, MAX_ATTEMPTS - attempts) },
      });
    }

    const now = new Date();
    const [updated] = await this.db
      .update(schema.independentUsers)
      .set({
        passwordHash: await hashPassword(input.password),
        activatedAt: now,
        activationTokenHash: null,
        activationTokenExpiresAt: null,
        failedLoginAttempts: 0,
        lockedUntil: null,
        lastLoginAt: now,
        lastAuthAt: now,
        status: 'active',
      })
      .where(eq(schema.independentUsers.id, user.id))
      .returning();
    if (!updated) throw new Error('Failed to activate independent user');

    await this.audit.logAudit({
      actorType: ActorType.Applicant,
      actorName: email,
      action: 'student.signup.otp_verified',
      module: MODULE,
      entityType: 'independent_user',
      entityId: user.id,
      result: AuditResult.Success,
      ip: req.ip,
      userAgent: req.userAgent,
      requestId: req.requestId,
      correlationId: req.correlationId,
    });

    return updated;
  }
}
