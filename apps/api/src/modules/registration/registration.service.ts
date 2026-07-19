import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ActorType, RegistrationStatus } from '@edrion/shared-types';
import type {
  AddRegistrationNoteInput,
  AssignReviewerInput,
  DraftPatchInput,
  ListRegistrationsQuery,
  OtpRequestInput,
  OtpVerifyInput,
  PublicPlanView,
  RejectRegistrationInput,
  ResumeVerifyInput,
  StartRegistrationInput,
  StartReviewInput,
  SubmitRegistrationInput,
} from '@edrion/schemas';
import type {
  InstitutionRegistrationRequest,
  RegCampusInfo,
  RegConsent,
  RegInstitutionInfo,
  RegLocation,
  RegPrimaryContact,
  RegSubscription,
} from '@edrion/database';
import type { AuditWriter, AuditEventInput } from '@edrion/audit';
import type { ApiEnv } from '@edrion/config';
import { API_ENV, AUDIT_WRITER } from '../../common/tokens';
import { baseAudit, type ActionContext } from '../../common/action-context';
import type { EdrionRequestContext } from '../../common/request-context';
import { GeoLookupService } from '../../common/geo-lookup.service';
import { JwtError, signHs256, verifyHs256 } from '../../common/jwt';
import { RegistrationRepository } from './registration.repository';
import { OtpService } from './otp.service';
import { RegistrationEmailService } from './registration-email.service';

const MODULE = 'registration';
const ENTITY = 'registration_request';
const RESUME_TTL_SECONDS = 7 * 24 * 3600; // 7 days
const RESUME_PURPOSE = 'registration_draft';

/** Applicant-facing view — internal fields (reviewer, notes, forensics) are never included. */
export interface PublicDraftView {
  id: string;
  status: string;
  publicRef: string | null;
  emailVerified: boolean;
  verifiedEmail: string | null;
  institutionInfo: RegInstitutionInfo | null;
  location: RegLocation | null;
  campusInfo: RegCampusInfo | null;
  primaryContact: RegPrimaryContact | null;
  subscription: RegSubscription | null;
  consent: RegConsent | null;
  updatedAt: string;
}

export interface RegistrationDetail {
  request: InstitutionRegistrationRequest;
  reviews: Awaited<ReturnType<RegistrationRepository['reviewsFor']>>;
  auditEvents: Awaited<ReturnType<RegistrationRepository['auditEventsFor']>>;
}

@Injectable()
export class RegistrationService {
  constructor(
    private readonly repo: RegistrationRepository,
    private readonly otp: OtpService,
    private readonly emails: RegistrationEmailService,
    @Inject(AUDIT_WRITER) private readonly audit: AuditWriter,
    @Inject(API_ENV) private readonly env: ApiEnv,
    private readonly geoLookup: GeoLookupService,
  ) {}

  // ── Public funnel ──────────────────────────────────────────────────────────

  /** Published plans an applicant can choose from in the funnel. */
  listPublicPlans(): Promise<PublicPlanView[]> {
    return this.repo.listPublicPlans();
  }

  async startDraft(
    _input: StartRegistrationInput,
    reqCtx: EdrionRequestContext,
  ): Promise<{ id: string; resumeToken: string; status: string }> {
    const request = await this.repo.insert({
      status: RegistrationStatus.Draft,
      correlationId: reqCtx.correlationId,
      submitterIp: reqCtx.ip ?? null,
      submitterUserAgent: reqCtx.userAgent ?? null,
    });
    await this.publicAudit(request, 'registration.started', reqCtx);
    return { id: request.id, resumeToken: this.issueToken(request.id), status: request.status };
  }

  async getDraft(id: string, token: string): Promise<PublicDraftView> {
    const request = await this.loadWithToken(id, token);
    return this.toPublicView(request);
  }

  async patchDraft(
    id: string,
    token: string,
    patch: DraftPatchInput,
    reqCtx: EdrionRequestContext,
  ): Promise<PublicDraftView> {
    const request = await this.loadWithToken(id, token);
    this.assertEditable(request);

    const institutionInfo = merge(request.institutionInfo, patch.institutionInfo);
    const location = merge(request.location, patch.location);
    const campusInfo = merge(request.campusInfo, patch.campusInfo);
    const primaryContact = merge(request.primaryContact, patch.primaryContact);
    const subscription = merge(request.subscription, patch.subscription);
    const consent = merge(request.consent, patch.consent);

    const nextEmail = primaryContact?.email ?? null;
    // Changing the contact email after verification invalidates it — the applicant must re-verify.
    const emailDrifted = Boolean(request.verifiedEmail) && nextEmail !== request.verifiedEmail;

    const updated = await this.repo.update(id, {
      institutionInfo,
      location,
      campusInfo,
      primaryContact,
      subscription,
      consent,
      ...this.derivedColumns({ institutionInfo, location, campusInfo, primaryContact, subscription }),
      ...(emailDrifted ? { emailVerifiedAt: null, verifiedEmail: null } : {}),
    });
    await this.publicAudit(updated ?? request, 'registration.updated', reqCtx);
    return this.toPublicView(updated ?? request);
  }

  async requestOtp(
    id: string,
    token: string,
    input: OtpRequestInput,
    reqCtx: EdrionRequestContext,
  ): Promise<{
    sent: true;
    expiresInSeconds: number;
    resendAvailableInSeconds: number;
    sendsRemaining: number;
    devCode?: string;
  }> {
    const request = await this.loadWithToken(id, token);
    this.assertEditable(request);

    // Bind the OTP to the email being verified — persist it on the draft contact.
    const primaryContact: RegPrimaryContact = {
      ...(request.primaryContact ?? { fullName: '' }),
      email: input.email,
    } as RegPrimaryContact;
    await this.repo.update(id, {
      primaryContact,
      contactEmail: input.email,
      contactName: primaryContact.fullName || request.contactName,
    });

    const { code, expiresInSeconds, resendAvailableInSeconds, sendsRemaining } = await this.otp.issue(
      { ...request, contactEmail: input.email },
      input.email,
      reqCtx,
    );
    await this.emails.sendOtp(input.email, code);
    // Dev-only: surface the code so E2E/smoke can verify without reading the mailbox.
    const devCode =
      this.env.REGISTRATION_OTP_DEV_RETURN && this.env.NODE_ENV !== 'production' ? code : undefined;
    return { sent: true, expiresInSeconds, resendAvailableInSeconds, sendsRemaining, devCode };
  }

  async verifyOtp(
    id: string,
    token: string,
    input: OtpVerifyInput,
    reqCtx: EdrionRequestContext,
  ): Promise<{ verified: true }> {
    const request = await this.loadWithToken(id, token);
    this.assertEditable(request);
    const email = request.contactEmail;
    if (!email) {
      throw new BadRequestException({
        code: 'NO_EMAIL',
        message: 'Request a verification code before verifying.',
      });
    }
    await this.otp.verify(request, input.code, email, reqCtx);
    await this.repo.update(id, { emailVerifiedAt: new Date(), verifiedEmail: email });
    return { verified: true };
  }

  /**
   * Cross-device resume — step 1: email a fresh code to whatever draft this address owns. Returns
   * the same shape whether or not a draft exists (no account/draft enumeration); a real code is only
   * issued+sent when a draft is found.
   */
  async resumeRequest(
    input: OtpRequestInput,
    reqCtx: EdrionRequestContext,
  ): Promise<{ sent: true; expiresInSeconds: number; resendAvailableInSeconds: number; devCode?: string }> {
    const draft = await this.repo.findLatestDraftByEmail(input.email);
    if (!draft) {
      return { sent: true, expiresInSeconds: 600, resendAvailableInSeconds: 60 };
    }
    const { code, expiresInSeconds, resendAvailableInSeconds } = await this.otp.issue(
      { ...draft, contactEmail: input.email },
      input.email,
      reqCtx,
    );
    await this.emails.sendOtp(input.email, code);
    const devCode =
      this.env.REGISTRATION_OTP_DEV_RETURN && this.env.NODE_ENV !== 'production' ? code : undefined;
    return { sent: true, expiresInSeconds, resendAvailableInSeconds, devCode };
  }

  /**
   * Cross-device resume — step 2: verify the code and hand back a fresh resume token + the draft.
   * Verifying the code also (re)confirms the email. Errors are generic so a wrong email can't be
   * distinguished from a wrong code.
   */
  async resumeVerify(
    input: ResumeVerifyInput,
    reqCtx: EdrionRequestContext,
  ): Promise<{ id: string; resumeToken: string; draft: PublicDraftView }> {
    const draft = await this.repo.findLatestDraftByEmail(input.email);
    if (!draft) {
      throw new BadRequestException({ code: 'INVALID_CODE', message: 'Invalid or expired code. Please try again.' });
    }
    await this.otp.verify(draft, input.code, input.email, reqCtx);
    const updated = await this.repo.update(draft.id, { emailVerifiedAt: new Date(), verifiedEmail: input.email });
    await this.publicAudit(updated ?? draft, 'registration.resumed', reqCtx);
    return {
      id: draft.id,
      resumeToken: this.issueToken(draft.id),
      draft: this.toPublicView(updated ?? draft),
    };
  }

  /**
   * Best-effort location guess from the applicant's IP, used to pre-fill the funnel. Returns only
   * ISO-safe fields (alpha-2 country, IANA timezone, free-text city); region is intentionally
   * omitted because providers return names, not the ISO 3166-2 codes the picker expects.
   */
  detectLocation(
    reqCtx: EdrionRequestContext,
  ): Promise<{ country?: string; city?: string; timezone?: string }> {
    return this.geoLookup.detectLocation(reqCtx);
  }

  async submit(
    id: string,
    token: string,
    sections: SubmitRegistrationInput,
    reqCtx: EdrionRequestContext,
  ): Promise<{ publicRef: string; status: string }> {
    const request = await this.loadWithToken(id, token);

    // Idempotent: a re-submitted draft returns its existing reference rather than erroring.
    if (request.status !== RegistrationStatus.Draft) {
      if (request.publicRef) return { publicRef: request.publicRef, status: request.status };
      throw new ConflictException({
        code: 'ALREADY_SUBMITTED',
        message: 'This application has already been submitted.',
      });
    }

    const contactEmail = sections.primaryContact.email;
    if (!request.emailVerifiedAt || request.verifiedEmail !== contactEmail) {
      throw new BadRequestException({
        code: 'EMAIL_NOT_VERIFIED',
        message: 'Verify the contact email address before submitting.',
      });
    }

    const duplicate = await this.repo.findActiveByEmail(contactEmail, id);
    if (duplicate) {
      throw new ConflictException({
        code: 'DUPLICATE_REGISTRATION',
        message: 'An application with this contact email is already in progress.',
      });
    }

    const publicRef = await this.nextPublicRef();
    const updated = await this.repo.update(id, {
      status: RegistrationStatus.Submitted,
      publicRef,
      submittedAt: new Date(),
      institutionInfo: sections.institutionInfo,
      location: sections.location,
      campusInfo: sections.campusInfo,
      primaryContact: sections.primaryContact,
      subscription: sections.subscription,
      consent: { ...sections.consent, acceptedAt: new Date().toISOString() },
      submitterIp: reqCtx.ip ?? request.submitterIp,
      submitterUserAgent: reqCtx.userAgent ?? request.submitterUserAgent,
      ...this.derivedColumns(sections),
    });
    const row = updated ?? request;

    await this.publicAudit(row, 'registration.submitted', reqCtx, {
      newState: { publicRef, status: RegistrationStatus.Submitted },
    });
    const sent = await this.emails.sendSubmitted(contactEmail, sections.institutionInfo.displayName, publicRef);
    await this.emailAudit(row, contactEmail, 'registration_submitted', sent.messageId, reqCtx);

    return { publicRef, status: RegistrationStatus.Submitted };
  }

  // ── Reviewer reads ───────────────────────────────────────────────────────

  list(q: ListRegistrationsQuery) {
    return this.repo.list(q);
  }

  summary() {
    return this.repo.summaryByStatus();
  }

  async getDetail(id: string): Promise<RegistrationDetail> {
    const request = await this.requireRequest(id);
    const [reviews, auditEvents] = await Promise.all([
      this.repo.reviewsFor(id),
      this.repo.auditEventsFor(id),
    ]);
    return { request, reviews, auditEvents };
  }

  // ── Reviewer actions ─────────────────────────────────────────────────────

  async startReview(
    id: string,
    input: StartReviewInput,
    ctx: ActionContext,
  ): Promise<InstitutionRegistrationRequest> {
    const request = await this.requireRequest(id);
    if (request.status === RegistrationStatus.UnderReview) return request;
    if (request.status !== RegistrationStatus.Submitted) {
      throw this.invalidStatus(request.status, 'start review');
    }
    const reviewerId = ctx.principalContext.principal.employeeId;
    const updated = await this.repo.updateWithVersion(id, input.version, {
      status: RegistrationStatus.UnderReview,
      assignedReviewerId: request.assignedReviewerId ?? reviewerId,
      updatedBy: reviewerId,
    });
    if (!updated) throw this.versionConflict();
    await this.repo.insertReview({
      requestId: id,
      reviewerId,
      action: 'started_review',
      fromStatus: request.status,
      toStatus: updated.status,
    });
    await this.writeAudit(ctx, updated, 'registration.start_review', {
      previousState: { status: request.status },
      newState: { status: updated.status },
    });

    const recipient = updated.contactEmail ?? updated.verifiedEmail;
    if (recipient) {
      const sent = await this.emails.sendReviewStarted(
        recipient,
        updated.displayName ?? updated.legalName ?? 'your institution',
        updated.publicRef ?? id,
      );
      await this.writeAudit(ctx, updated, 'registration.email_sent', {
        newState: { template: 'registration_review_started', to: recipient, messageId: sent.messageId },
      });
    }

    return updated;
  }

  async assign(
    id: string,
    input: AssignReviewerInput,
    ctx: ActionContext,
  ): Promise<InstitutionRegistrationRequest> {
    const request = await this.requireRequest(id);
    this.assertReviewable(request);
    const updated = await this.repo.updateWithVersion(id, input.version, {
      assignedReviewerId: input.reviewerId,
      updatedBy: ctx.principalContext.principal.employeeId,
    });
    if (!updated) throw this.versionConflict();
    await this.repo.insertReview({
      requestId: id,
      reviewerId: ctx.principalContext.principal.employeeId,
      action: 'assigned',
      metadata: { assignedReviewerId: input.reviewerId },
    });
    await this.writeAudit(ctx, updated, 'registration.assign', {
      previousState: { assignedReviewerId: request.assignedReviewerId },
      newState: { assignedReviewerId: updated.assignedReviewerId },
    });
    return updated;
  }

  async addNote(
    id: string,
    input: AddRegistrationNoteInput,
    ctx: ActionContext,
  ): Promise<InstitutionRegistrationRequest> {
    const request = await this.requireRequest(id);
    await this.repo.insertReview({
      requestId: id,
      reviewerId: ctx.principalContext.principal.employeeId,
      action: 'note_added',
      note: input.note,
    });
    await this.writeAudit(ctx, request, 'registration.note_added', {});
    return request;
  }

  async reject(
    id: string,
    input: RejectRegistrationInput,
    ctx: ActionContext,
  ): Promise<InstitutionRegistrationRequest> {
    const request = await this.requireRequest(id);
    this.assertDecidable(request);
    const reviewerId = ctx.principalContext.principal.employeeId;
    const updated = await this.repo.updateWithVersion(id, input.version, {
      status: RegistrationStatus.Rejected,
      rejectionReason: input.reason,
      decidedBy: reviewerId,
      decisionAt: new Date(),
      updatedBy: reviewerId,
    });
    if (!updated) throw this.versionConflict();
    await this.repo.insertReview({
      requestId: id,
      reviewerId,
      action: 'rejected',
      fromStatus: request.status,
      toStatus: updated.status,
      rejectionReason: input.reason,
      note: input.internalNote,
    });
    await this.writeAudit(ctx, updated, 'registration.rejected', {
      reason: input.reason,
      previousState: { status: request.status },
      newState: { status: updated.status },
    });

    if (updated.contactEmail) {
      const sent = await this.emails.sendRejected(
        updated.contactEmail,
        updated.displayName ?? updated.legalName ?? 'your institution',
        input.reason,
      );
      await this.writeAudit(ctx, updated, 'registration.email_sent', {
        newState: { template: 'registration_rejected', to: updated.contactEmail, messageId: sent.messageId },
      });
    }
    return updated;
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private issueToken(id: string): string {
    return signHs256({ draftId: id, purpose: RESUME_PURPOSE }, this.env.SESSION_COOKIE_SECRET, RESUME_TTL_SECONDS);
  }

  private async loadWithToken(id: string, token: string): Promise<InstitutionRegistrationRequest> {
    if (!token) throw new ForbiddenException({ code: 'NO_RESUME_TOKEN', message: 'Missing registration token' });
    let payload: Record<string, unknown>;
    try {
      payload = verifyHs256(token, this.env.SESSION_COOKIE_SECRET);
    } catch (e) {
      if (e instanceof JwtError) {
        throw new ForbiddenException({ code: 'INVALID_RESUME_TOKEN', message: 'Invalid or expired registration link' });
      }
      throw e;
    }
    if (payload.draftId !== id || payload.purpose !== RESUME_PURPOSE) {
      throw new ForbiddenException({ code: 'INVALID_RESUME_TOKEN', message: 'Invalid registration link' });
    }
    const request = await this.repo.findById(id);
    if (!request) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Registration not found' });
    return request;
  }

  private assertEditable(request: InstitutionRegistrationRequest): void {
    if (request.status !== RegistrationStatus.Draft) {
      throw new ConflictException({
        code: 'NOT_EDITABLE',
        message: 'This application has already been submitted and can no longer be edited.',
      });
    }
  }

  private assertReviewable(request: InstitutionRegistrationRequest): void {
    if (
      request.status !== RegistrationStatus.Submitted &&
      request.status !== RegistrationStatus.UnderReview
    ) {
      throw this.invalidStatus(request.status, 'review');
    }
  }

  private assertDecidable(request: InstitutionRegistrationRequest): void {
    if (request.status !== RegistrationStatus.UnderReview) {
      throw this.invalidStatus(request.status, 'approve or reject');
    }
  }

  private async requireRequest(id: string): Promise<InstitutionRegistrationRequest> {
    const request = await this.repo.findById(id);
    if (!request) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Registration not found' });
    return request;
  }

  private async nextPublicRef(): Promise<string> {
    const year = new Date().getUTCFullYear();
    // Base the next sequence on the highest ref used this year (gap-safe — count() reissues a
    // deleted number and collides on the unique constraint), then pre-check each candidate so a
    // concurrent submit can't hand out the same ref.
    let seq = (await this.repo.maxRefSeqForYear(year)) + 1;
    for (let attempt = 0; attempt < 5; attempt++) {
      const ref = `EDR-REG-${year}-${String(seq).padStart(6, '0')}`;
      if (!(await this.repo.publicRefExists(ref))) return ref;
      seq++;
    }
    // Extremely unlikely; time-seed to guarantee forward progress.
    return `EDR-REG-${year}-${Date.now().toString(36).toUpperCase()}`;
  }

  private derivedColumns(s: {
    institutionInfo?: RegInstitutionInfo | null;
    location?: RegLocation | null;
    campusInfo?: RegCampusInfo | null;
    primaryContact?: RegPrimaryContact | null;
    subscription?: RegSubscription | null;
  }): Partial<InstitutionRegistrationRequest> {
    return {
      legalName: s.institutionInfo?.legalName ?? null,
      displayName: s.institutionInfo?.displayName ?? null,
      type: (s.institutionInfo?.type as InstitutionRegistrationRequest['type']) ?? null,
      country: s.location?.country ?? null,
      region: s.location?.region ?? null,
      contactName: s.primaryContact?.fullName ?? null,
      contactEmail: s.primaryContact?.email ?? null,
      contactPhone: s.primaryContact?.phone ?? null,
      campusesCount: s.campusInfo?.currentCampuses ?? null,
      expectedStudents: s.campusInfo?.expectedStudents ?? null,
      preferredPlanKey: s.subscription?.planKey ?? null,
    };
  }

  private toPublicView(r: InstitutionRegistrationRequest): PublicDraftView {
    return {
      id: r.id,
      status: r.status,
      publicRef: r.publicRef,
      emailVerified: Boolean(r.emailVerifiedAt),
      verifiedEmail: r.verifiedEmail,
      institutionInfo: r.institutionInfo,
      location: r.location,
      campusInfo: r.campusInfo,
      primaryContact: r.primaryContact,
      subscription: r.subscription,
      consent: r.consent,
      updatedAt: r.updatedAt.toISOString(),
    };
  }

  private async publicAudit(
    request: InstitutionRegistrationRequest,
    action: string,
    reqCtx: EdrionRequestContext,
    extra: Partial<AuditEventInput> = {},
  ): Promise<void> {
    await this.audit.logAudit({
      actorType: ActorType.Applicant,
      actorName: request.contactEmail ?? undefined,
      action,
      module: MODULE,
      entityType: ENTITY,
      entityId: request.id,
      institutionName: request.displayName ?? request.legalName ?? undefined,
      ip: reqCtx.ip,
      userAgent: reqCtx.userAgent,
      requestId: reqCtx.requestId,
      correlationId: reqCtx.correlationId,
      apiEndpoint: reqCtx.apiEndpoint,
      ...extra,
    });
  }

  private async emailAudit(
    request: InstitutionRegistrationRequest,
    to: string,
    template: string,
    messageId: string,
    reqCtx: EdrionRequestContext,
  ): Promise<void> {
    await this.publicAudit(request, 'registration.email_sent', reqCtx, {
      newState: { template, to, messageId },
    });
  }

  private async writeAudit(
    ctx: ActionContext,
    request: InstitutionRegistrationRequest,
    action: string,
    extra: Partial<AuditEventInput>,
  ): Promise<void> {
    await this.audit.logAudit({
      ...baseAudit(ctx),
      action,
      module: MODULE,
      entityType: ENTITY,
      entityId: request.id,
      institutionName: request.displayName ?? request.legalName ?? undefined,
      ...extra,
    } as AuditEventInput);
  }

  private versionConflict() {
    return new ConflictException({
      code: 'VERSION_CONFLICT',
      message: 'This record changed since you loaded it. Reload and try again.',
    });
  }

  private invalidStatus(status: string, op: string) {
    return new ConflictException({
      code: 'INVALID_STATUS',
      message: `Cannot ${op} a request in status "${status}".`,
    });
  }
}

/** Merge a partial patch into an existing JSONB section, dropping undefined keys. */
function merge<T extends Record<string, unknown>>(
  existing: T | null | undefined,
  patch: Partial<T> | undefined,
): T | null {
  if (patch === undefined) return existing ?? null;
  const base = (existing ?? {}) as Record<string, unknown>;
  const next = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    if (v !== undefined) next[k] = v;
  }
  return next as T;
}
