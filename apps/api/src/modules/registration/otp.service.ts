import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
} from '@nestjs/common';
import { createHash, randomInt } from 'node:crypto';
import { ActorType, AuditResult } from '@edrion/shared-types';
import { and, desc, eq, isNull, schema, type Database } from '@edrion/database';
import type { InstitutionRegistrationRequest } from '@edrion/database';
import type { AuditWriter } from '@edrion/audit';
import type { ApiEnv } from '@edrion/config';
import { API_ENV, AUDIT_WRITER, DATABASE } from '../../common/tokens';

/** Lightweight request metadata for forensics on every OTP event. */
export interface OtpContext {
  ip?: string;
  userAgent?: string;
  requestId?: string;
  correlationId?: string;
}

const PURPOSE = 'email_verification';

/**
 * Which OTP table + audit identity a call operates against. Defaults to the institution-registration
 * funnel; the public parent-admission funnel passes its own table (`admission_application_otps`) and
 * audit labels so the identical lifecycle drives both without duplication.
 */
export interface OtpTarget {
  table: typeof schema.institutionRegistrationOtps;
  module: string;
  entityType: string;
  actionPrefix: string;
}

const REGISTRATION_TARGET: OtpTarget = {
  table: schema.institutionRegistrationOtps,
  module: 'registration',
  entityType: 'registration_request',
  actionPrefix: 'registration',
};

export const OTP_TTL_SECONDS = 600; // 10 minutes
const OTP_LENGTH = 6;
const MAX_ATTEMPTS = 5;
const MAX_SENDS = 5;
const RESEND_COOLDOWN_SECONDS = 60;

export interface OtpIssueResult {
  /** Plaintext code — returned ONLY to the caller for emailing; never persisted. */
  code: string;
  expiresInSeconds: number;
  resendAvailableInSeconds: number;
  sendsRemaining: number;
}

/**
 * Email-verification OTP lifecycle. Only the salted SHA-256 of each code is stored; codes are
 * single-use, time-boxed and throttled (resend cooldown + send cap + per-code attempt cap). Every
 * generate/verify/failure/expiry is audited as an `applicant` actor.
 */
@Injectable()
export class OtpService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(AUDIT_WRITER) private readonly audit: AuditWriter,
    @Inject(API_ENV) private readonly env: ApiEnv,
  ) {}

  private hash(code: string): string {
    const pepper = this.env.REGISTRATION_OTP_PEPPER ?? this.env.SESSION_COOKIE_SECRET;
    return createHash('sha256').update(`${code}:${pepper}`).digest('hex');
  }

  /** Generate, store (hashed) and return a fresh code, enforcing cooldown + send caps. */
  async issue(
    request: InstitutionRegistrationRequest,
    email: string,
    ctx: OtpContext,
    target: OtpTarget = REGISTRATION_TARGET,
  ): Promise<OtpIssueResult> {
    const otps = target.table;
    const prior = await this.db
      .select()
      .from(otps)
      .where(and(eq(otps.requestId, request.id), eq(otps.purpose, PURPOSE)))
      .orderBy(desc(otps.createdAt));

    const sends = prior.length;
    if (sends >= MAX_SENDS) {
      throw new HttpException(
        { code: 'OTP_SEND_LIMIT', message: 'Too many codes requested. Contact support to continue.' },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    const latest = prior[0];
    if (latest) {
      const since = (Date.now() - latest.createdAt.getTime()) / 1000;
      if (since < RESEND_COOLDOWN_SECONDS) {
        const retryAfter = Math.ceil(RESEND_COOLDOWN_SECONDS - since);
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

    // Invalidate any still-pending prior codes so only the newest is valid (single live code).
    await this.db
      .update(otps)
      .set({ consumedAt: new Date() })
      .where(and(eq(otps.requestId, request.id), eq(otps.purpose, PURPOSE), isNull(otps.consumedAt)));

    const code = String(randomInt(0, 10 ** OTP_LENGTH)).padStart(OTP_LENGTH, '0');
    const expiresAt = new Date(Date.now() + OTP_TTL_SECONDS * 1000);
    await this.db.insert(otps).values({
      requestId: request.id,
      email,
      purpose: PURPOSE,
      codeHash: this.hash(code),
      expiresAt,
      maxAttempts: MAX_ATTEMPTS,
      sendCount: sends + 1,
      ip: ctx.ip ?? null,
      userAgent: ctx.userAgent ?? null,
    });

    await this.log(request, email, `${target.actionPrefix}.otp_generated`, ctx, AuditResult.Success, target, {
      sendCount: sends + 1,
      expiresAt: expiresAt.toISOString(),
    });

    return {
      code,
      expiresInSeconds: OTP_TTL_SECONDS,
      resendAvailableInSeconds: RESEND_COOLDOWN_SECONDS,
      sendsRemaining: MAX_SENDS - (sends + 1),
    };
  }

  /** Verify a code against the newest pending OTP. Throws on missing/expired/locked/invalid. */
  async verify(
    request: InstitutionRegistrationRequest,
    code: string,
    email: string,
    ctx: OtpContext,
    target: OtpTarget = REGISTRATION_TARGET,
  ): Promise<void> {
    const otps = target.table;
    const [otp] = await this.db
      .select()
      .from(otps)
      .where(and(eq(otps.requestId, request.id), eq(otps.purpose, PURPOSE), isNull(otps.consumedAt)))
      .orderBy(desc(otps.createdAt))
      .limit(1);

    if (!otp) {
      throw new BadRequestException({
        code: 'OTP_NOT_FOUND',
        message: 'No active code. Request a new verification code.',
      });
    }

    if (otp.expiresAt.getTime() < Date.now()) {
      await this.db.update(otps).set({ consumedAt: new Date() }).where(eq(otps.id, otp.id));
      await this.log(request, email, `${target.actionPrefix}.otp_expired`, ctx, AuditResult.Failure, target);
      throw new BadRequestException({
        code: 'OTP_EXPIRED',
        message: 'This code has expired. Request a new one.',
      });
    }

    if (otp.attempts >= otp.maxAttempts) {
      await this.db.update(otps).set({ consumedAt: new Date() }).where(eq(otps.id, otp.id));
      await this.log(request, email, `${target.actionPrefix}.otp_failed`, ctx, AuditResult.Denied, target, {
        reason: 'attempt_limit',
      });
      throw new BadRequestException({
        code: 'OTP_LOCKED',
        message: 'Too many incorrect attempts. Request a new code.',
      });
    }

    if (otp.codeHash !== this.hash(code)) {
      const attempts = otp.attempts + 1;
      await this.db.update(otps).set({ attempts }).where(eq(otps.id, otp.id));
      await this.log(request, email, `${target.actionPrefix}.otp_failed`, ctx, AuditResult.Failure, target, {
        attempts,
      });
      throw new BadRequestException({
        code: 'OTP_INVALID',
        message: 'Incorrect code. Please try again.',
        details: { attemptsRemaining: Math.max(0, otp.maxAttempts - attempts) },
      });
    }

    await this.db.update(otps).set({ consumedAt: new Date() }).where(eq(otps.id, otp.id));
    await this.log(request, email, `${target.actionPrefix}.otp_verified`, ctx, AuditResult.Success, target);
  }

  private async log(
    request: InstitutionRegistrationRequest,
    email: string,
    action: string,
    ctx: OtpContext,
    result: AuditResult,
    target: OtpTarget = REGISTRATION_TARGET,
    newState?: Record<string, unknown>,
  ): Promise<void> {
    await this.audit.logAudit({
      actorType: ActorType.Applicant,
      actorName: email,
      action,
      module: target.module,
      entityType: target.entityType,
      entityId: request.id,
      institutionName: request.displayName ?? request.legalName ?? undefined,
      result,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
      correlationId: ctx.correlationId,
      newState,
    });
  }
}
