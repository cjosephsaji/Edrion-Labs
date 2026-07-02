import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomBytes, randomInt } from 'node:crypto';
import { ActorType } from '@edrion/shared-types';
import { schema } from '@edrion/database';
import type {
  AdmissionApplicationDraft,
  AdmissionDraftPayload,
  Institution,
  InstitutionRegistrationRequest,
} from '@edrion/database';
import type { AuditWriter, AuditEventInput } from '@edrion/audit';
import type { ApiEnv } from '@edrion/config';
import type {
  AdmissionDraftPatchInput,
  StartAdmissionInput,
  SubmitAdmissionInput,
} from '@edrion/schemas';
import { API_ENV, AUDIT_WRITER } from '../../common/tokens';
import type { EdrionRequestContext } from '../../common/request-context';
import { OtpService, type OtpTarget } from '../registration/otp.service';
import { EmailService } from '../portal/email.service';
import { AttachmentStorageService } from '../portal/attachment-storage.service';
import {
  AdmissionsPublicRepository,
  type PublicInstitutionOptions,
  type PublicInstitutionView,
} from './admissions-public.repository';

const MODULE = 'admissions';
const ENTITY = 'admission_draft';
const RESUME_TTL_SECONDS = 7 * 24 * 3600; // 7 days
const APPLICATION_NO_RETRIES = 6;

/** Applicant-facing draft view — only fields the parent should see. */
export interface PublicAdmissionDraftView {
  id: string;
  institutionId: string;
  status: string;
  emailVerified: boolean;
  contactEmail: string;
  payload: AdmissionDraftPayload;
  submittedApplicationNo: string | null;
  updatedAt: string;
}

@Injectable()
export class AdmissionsPublicService {
  /** Admission funnel binds the shared OTP engine to its own table + audit identity. */
  private readonly otpTarget: OtpTarget = {
    table: schema.admissionApplicationOtps as unknown as typeof schema.institutionRegistrationOtps,
    module: MODULE,
    entityType: ENTITY,
    actionPrefix: 'admission',
  };

  constructor(
    private readonly repo: AdmissionsPublicRepository,
    private readonly otp: OtpService,
    private readonly emails: EmailService,
    @Inject(AUDIT_WRITER) private readonly audit: AuditWriter,
    @Inject(API_ENV) private readonly env: ApiEnv,
    private readonly storage: AttachmentStorageService,
  ) {}

  // ── Info requests (staff-built form the parent fills over a token link) ──────

  /** Load a request for the parent by its token — returns the form definition, not prior answers. */
  async getInfoRequest(id: string, token: string) {
    const req = await this.requireInfoRequest(id, token);
    return {
      id: req.id,
      status: req.status,
      message: req.message,
      fields: req.fields,
      submitted: req.status === 'submitted',
    };
  }

  /** Store an uploaded file (raw binary) for a `file` field; returns a reference to embed in responses. */
  async uploadInfoFile(id: string, token: string, fileName: string, contentType: string | null, buffer: Buffer) {
    const req = await this.requireInfoRequest(id, token);
    if (buffer.length === 0) throw new BadRequestException({ code: 'EMPTY_FILE', message: 'The file is empty.' });
    const storageKey = await this.storage.save(req.institutionId, buffer);
    return { fileName, storageKey, sizeBytes: buffer.length, contentType: contentType ?? null };
  }

  /** Parent submits the completed form: validate required fields, store, and move the app to review. */
  async submitInfoResponses(id: string, token: string, responses: Record<string, unknown>) {
    const req = await this.requireInfoRequest(id, token);
    if (req.status === 'submitted') {
      return { ok: true as const, applicationId: req.applicationId };
    }
    for (const field of req.fields) {
      if (!field.required) continue;
      const v = responses[field.key];
      const empty = v == null || (typeof v === 'string' && v.trim() === '') || (Array.isArray(v) && v.length === 0);
      if (empty) throw new BadRequestException({ code: 'MISSING_FIELD', message: `"${field.label}" is required.` });
    }
    await this.repo.saveInfoResponses(id, responses);
    // Info supplied → return the application to the review queue.
    await this.repo.setApplicationStatus(req.applicationId, 'under_review');
    if (req.contactEmail) {
      await this.emails
        .send({
          to: req.contactEmail,
          subject: 'Thank you — your information has been received',
          text: 'We have received the additional information for your admission application. The admissions team will continue reviewing it.',
          html: '<p>We have received the additional information for your admission application. The admissions team will continue reviewing it.</p>',
        })
        .catch(() => undefined);
    }
    return { ok: true as const, applicationId: req.applicationId };
  }

  private async requireInfoRequest(id: string, token: string) {
    // Guard against a malformed id (a real link is always a uuid) so Postgres doesn't 500 on it.
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'This form link is invalid or has expired.' });
    }
    const req = await this.repo.findInfoRequestById(id);
    if (!req || req.resumeTokenHash !== this.hashToken(token)) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'This form link is invalid or has expired.' });
    }
    if (req.expiresAt && req.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException({ code: 'EXPIRED', message: 'This form link has expired.' });
    }
    return req;
  }

  // ── Institution discovery ──────────────────────────────────────────────────

  listInstitutions(q?: string): Promise<PublicInstitutionView[]> {
    return this.repo.listInstitutions(q);
  }

  async institutionOptions(id: string): Promise<PublicInstitutionOptions> {
    await this.requireApplicable(id);
    return this.repo.institutionOptions(id);
  }

  // ── Draft lifecycle ─────────────────────────────────────────────────────────

  async start(
    input: StartAdmissionInput,
    reqCtx: EdrionRequestContext,
  ): Promise<{ id: string; token: string; status: string }> {
    const institution = await this.requireApplicable(input.institutionId);
    const token = randomBytes(32).toString('base64url');
    const draft = await this.repo.insertDraft({
      institutionId: institution.id,
      contactEmail: input.contactEmail,
      resumeTokenHash: this.hashToken(token),
      payload: { contact: { email: input.contactEmail } },
      status: 'draft',
      expiresAt: new Date(Date.now() + RESUME_TTL_SECONDS * 1000),
    });
    await this.publicAudit(draft, institution.displayName, 'admission.started', reqCtx);
    return { id: draft.id, token, status: draft.status };
  }

  async getDraft(id: string, token: string): Promise<PublicAdmissionDraftView> {
    const draft = await this.loadWithToken(id, token);
    return this.toPublicView(draft);
  }

  async patch(
    id: string,
    token: string,
    patch: AdmissionDraftPatchInput,
    reqCtx: EdrionRequestContext,
  ): Promise<PublicAdmissionDraftView> {
    const draft = await this.loadWithToken(id, token);
    this.assertEditable(draft);

    const payload = this.mergePayload(draft.payload, patch);
    // Changing the contact email after verification invalidates it — re-verify required.
    const nextEmail = payload.contact?.email;
    const emailDrifted =
      Boolean(draft.emailVerifiedAt) && nextEmail !== undefined && nextEmail !== draft.contactEmail;

    const updated = await this.repo.updateDraft(id, {
      payload,
      ...(nextEmail ? { contactEmail: nextEmail } : {}),
      ...(payload.target?.campusId ? { campusId: payload.target.campusId } : {}),
      ...(emailDrifted ? { emailVerifiedAt: null } : {}),
    });
    await this.publicAudit(updated ?? draft, null, 'admission.updated', reqCtx);
    return this.toPublicView(updated ?? draft);
  }

  async requestOtp(
    id: string,
    token: string,
    email: string,
    reqCtx: EdrionRequestContext,
  ): Promise<{
    sent: true;
    expiresInSeconds: number;
    resendAvailableInSeconds: number;
    sendsRemaining: number;
    devCode?: string;
  }> {
    const draft = await this.loadWithToken(id, token);
    this.assertEditable(draft);

    // Bind the OTP to the email being verified — persist it on the draft.
    const payload: AdmissionDraftPayload = {
      ...draft.payload,
      contact: { ...draft.payload.contact, email },
    };
    await this.repo.updateDraft(id, { payload, contactEmail: email });

    const { code, expiresInSeconds, resendAvailableInSeconds, sendsRemaining } = await this.otp.issue(
      this.otpSubject(draft, email),
      email,
      reqCtx,
      this.otpTarget,
    );
    await this.sendOtpEmail(email, code);
    const devCode =
      this.env.REGISTRATION_OTP_DEV_RETURN && this.env.NODE_ENV !== 'production' ? code : undefined;
    return { sent: true, expiresInSeconds, resendAvailableInSeconds, sendsRemaining, devCode };
  }

  async verifyOtp(
    id: string,
    token: string,
    code: string,
    reqCtx: EdrionRequestContext,
  ): Promise<{ verified: true }> {
    const draft = await this.loadWithToken(id, token);
    this.assertEditable(draft);
    const email = draft.contactEmail;
    if (!email) {
      throw new BadRequestException({
        code: 'NO_EMAIL',
        message: 'Request a verification code before verifying.',
      });
    }
    await this.otp.verify(this.otpSubject(draft, email), code, email, reqCtx, this.otpTarget);
    await this.repo.updateDraft(id, { emailVerifiedAt: new Date() });
    return { verified: true };
  }

  async submit(
    id: string,
    token: string,
    sections: SubmitAdmissionInput,
    reqCtx: EdrionRequestContext,
  ): Promise<{ applicationNo: string; status: string }> {
    const draft = await this.loadWithToken(id, token);

    // Idempotent: a re-submitted draft returns its existing reference rather than erroring.
    if (draft.status !== 'draft') {
      if (draft.submittedApplicationId) {
        const existing = await this.repo.findApplicationById(draft.submittedApplicationId);
        if (existing) return { applicationNo: existing.applicationNo, status: existing.status };
      }
      throw new ConflictException({
        code: 'ALREADY_SUBMITTED',
        message: 'This application has already been submitted.',
      });
    }

    const contactEmail = sections.contact.email;
    if (!draft.emailVerifiedAt || draft.contactEmail !== contactEmail) {
      throw new BadRequestException({
        code: 'EMAIL_NOT_VERIFIED',
        message: 'Verify the contact email address before submitting.',
      });
    }

    const institution = await this.requireApplicable(draft.institutionId);
    const target = await this.resolveTarget(institution.id, sections.target);

    const applicationNo = await this.generateApplicationNo(institution.id);
    const today = new Date().toISOString().slice(0, 10);
    const application = await this.repo.insertApplication({
      institutionId: institution.id,
      campusId: target.campusId ?? null,
      applicationNo,
      firstName: sections.student.firstName,
      lastName: sections.student.lastName,
      gender: sections.student.gender ?? null,
      dateOfBirth: sections.student.dateOfBirth ?? null,
      previousSchool: sections.student.previousSchool ?? null,
      email: contactEmail,
      phone: sections.contact.phone ?? null,
      gradeLevelId: target.gradeLevelId ?? null,
      academicYearId: target.academicYearId ?? null,
      guardianName: sections.guardian?.name ?? null,
      guardianPhone: sections.guardian?.phone ?? null,
      guardianEmail: this.blankToNull(sections.guardian?.email),
      additionalInfo: this.cleanAdditional(sections.additional),
      status: 'submitted',
      submittedVia: 'portal',
      appliedDate: today,
    });

    const updated = await this.repo.updateDraft(id, {
      status: 'submitted',
      submittedApplicationId: application.id,
    });
    await this.publicAudit(updated ?? draft, institution.displayName, 'admission.submitted', reqCtx, {
      newState: { applicationNo, status: application.status },
    });
    await this.sendSubmittedEmail(contactEmail, institution.displayName, applicationNo);

    return { applicationNo, status: application.status };
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private async requireApplicable(id: string): Promise<Institution> {
    const institution = await this.repo.findApplicableInstitution(id);
    if (!institution) {
      throw new NotFoundException({
        code: 'INSTITUTION_NOT_FOUND',
        message: 'This institution is not currently accepting applications.',
      });
    }
    return institution;
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private async loadWithToken(id: string, token: string): Promise<AdmissionApplicationDraft> {
    if (!token) {
      throw new ForbiddenException({ code: 'NO_RESUME_TOKEN', message: 'Missing admission token' });
    }
    const draft = await this.repo.findDraftById(id);
    if (!draft || draft.resumeTokenHash !== this.hashToken(token)) {
      throw new ForbiddenException({
        code: 'INVALID_RESUME_TOKEN',
        message: 'Invalid or expired admission link',
      });
    }
    if (draft.expiresAt && draft.expiresAt.getTime() < Date.now()) {
      throw new ForbiddenException({
        code: 'EXPIRED_RESUME_TOKEN',
        message: 'This admission link has expired. Start a new application.',
      });
    }
    return draft;
  }

  private assertEditable(draft: AdmissionApplicationDraft): void {
    if (draft.status !== 'draft') {
      throw new ConflictException({
        code: 'NOT_EDITABLE',
        message: 'This application has already been submitted and can no longer be edited.',
      });
    }
  }

  /** Re-validate the target IDs actually belong to the institution before persisting. */
  private async resolveTarget(
    institutionId: string,
    target: SubmitAdmissionInput['target'],
  ): Promise<{ campusId?: string; academicYearId?: string; gradeLevelId?: string }> {
    if (!target) return {};
    const options = await this.repo.institutionOptions(institutionId);
    const check = (id: string | undefined, allowed: { id: string }[], label: string) => {
      if (id === undefined) return undefined;
      if (!allowed.some((o) => o.id === id)) {
        throw new BadRequestException({
          code: 'INVALID_TARGET',
          message: `The selected ${label} is not valid for this institution.`,
        });
      }
      return id;
    };
    return {
      campusId: check(target.campusId, options.campuses, 'campus'),
      academicYearId: check(target.academicYearId, options.academicYears, 'academic year'),
      gradeLevelId: check(target.gradeLevelId, options.gradeLevels, 'grade level'),
    };
  }

  private async generateApplicationNo(institutionId: string): Promise<string> {
    for (let i = 0; i < APPLICATION_NO_RETRIES; i++) {
      const candidate = `ADM-${randomBytes(4).toString('hex').toUpperCase()}`;
      if (!(await this.repo.applicationNoExists(institutionId, candidate))) return candidate;
    }
    // Extremely unlikely; fall back to a time-seeded value to guarantee progress.
    return `ADM-${Date.now().toString(36).toUpperCase()}${randomInt(0, 1000)}`;
  }

  private mergePayload(
    existing: AdmissionDraftPayload,
    patch: AdmissionDraftPatchInput,
  ): AdmissionDraftPayload {
    const next: AdmissionDraftPayload = { ...existing };
    for (const key of ['target', 'student', 'guardian', 'contact', 'address'] as const) {
      const section = patch[key];
      if (section === undefined) continue;
      next[key] = { ...(existing[key] ?? {}), ...dropUndefined(section) } as never;
    }
    return next;
  }

  private otpSubject(draft: AdmissionApplicationDraft, email: string): InstitutionRegistrationRequest {
    return {
      id: draft.id,
      contactEmail: email,
      displayName: null,
      legalName: null,
    } as unknown as InstitutionRegistrationRequest;
  }

  private blankToNull(value: string | undefined): string | null {
    return value && value.trim() ? value : null;
  }

  /** Drop empty fields from the health/additional section; return null when nothing was filled in. */
  private cleanAdditional(section: Record<string, string | undefined> | undefined): Record<string, string> | null {
    if (!section) return null;
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(section)) {
      if (typeof v === 'string' && v.trim()) out[k] = v.trim();
    }
    return Object.keys(out).length ? out : null;
  }

  private toPublicView(draft: AdmissionApplicationDraft): PublicAdmissionDraftView {
    return {
      id: draft.id,
      institutionId: draft.institutionId,
      status: draft.status,
      emailVerified: Boolean(draft.emailVerifiedAt),
      contactEmail: draft.contactEmail,
      payload: draft.payload,
      submittedApplicationNo: null,
      updatedAt: draft.updatedAt.toISOString(),
    };
  }

  private async publicAudit(
    draft: AdmissionApplicationDraft,
    institutionName: string | null,
    action: string,
    reqCtx: EdrionRequestContext,
    extra: Partial<AuditEventInput> = {},
  ): Promise<void> {
    await this.audit.logAudit({
      actorType: ActorType.Applicant,
      actorName: draft.contactEmail,
      action,
      module: MODULE,
      entityType: ENTITY,
      entityId: draft.id,
      institutionName: institutionName ?? undefined,
      ip: reqCtx.ip,
      userAgent: reqCtx.userAgent,
      requestId: reqCtx.requestId,
      correlationId: reqCtx.correlationId,
      apiEndpoint: reqCtx.apiEndpoint,
      ...extra,
    });
  }

  private sendOtpEmail(to: string, code: string): Promise<unknown> {
    const text = `Your Edrion verification code is ${code}. It expires in 10 minutes. Do not share it with anyone.`;
    const html = `<p>Use the code below to verify your email and continue your admission application. It expires in 10 minutes.</p>
      <p style="font:700 30px/1 monospace;letter-spacing:8px;color:#14532D;">${code}</p>
      <p>For your security, never share this code.</p>`;
    return this.emails.send({ to, subject: `Your Edrion verification code: ${code}`, text, html });
  }

  private sendSubmittedEmail(to: string, displayName: string, applicationNo: string): Promise<unknown> {
    const text = `Thank you — your application to ${displayName} has been received. Reference: ${applicationNo}. The admissions team will review it and contact you with the outcome.`;
    const html = `<p>Thank you — your application to <strong>${displayName}</strong> has been received.</p>
      <p>Your reference number: <strong>${applicationNo}</strong></p>
      <p>The admissions team will review your application and contact you with the outcome.</p>`;
    return this.emails.send({
      to,
      subject: `We've received your application to ${displayName} (${applicationNo})`,
      text,
      html,
    });
  }
}

/** Drop undefined keys from a patch section so they don't overwrite saved values. */
function dropUndefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) out[k] = v;
  return out as Partial<T>;
}
