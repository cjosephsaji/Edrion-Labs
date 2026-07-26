import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { resolveScopeFilter, type InstitutionScope, type ScopeFilter } from '@edrion/auth';
import type { AuditWriter, AuditEventInput } from '@edrion/audit';
import type {
  AdmissionsListQuery,
  CreateAdmissionInput,
  DecideAdmissionInput,
  EnrolAdmissionInput,
  UpdateAdmissionInput,
} from '@edrion/schemas';
import { formatPersonName } from '@edrion/schemas';
import { AUDIT_WRITER } from '../../common/tokens';
import { emailLayout } from '../../common/email-templates';
import type { Page } from './academics.repository';
import type { ListResult } from './academics.service';
import { AdmissionsRepository, type AdmissionRefTable } from './admissions.repository';
import { AnnouncementsRepository } from './announcements.repository';
import { EmailService } from './email.service';
import { basePortalAudit, type PortalActionContext } from './portal-action-context';

/** Human-facing label for each decision status (used in the guardian notification). */
const DECISION_LABEL: Record<string, string> = {
  accepted: 'Accepted',
  rejected: 'Not successful',
  waitlisted: 'Waitlisted',
  info_requested: 'More information needed',
};

const MODULE = 'portal-admissions';

/**
 * Institution-portal Admissions service (Phase 5). Owns the same tenant invariants as the other
 * portal services: every read/write is confined to the principal's institution + the request's
 * campus scope; new rows are stamped with the active campus; updates/deletes are version-guarded;
 * FKs are pre-checked for friendly 400s; and every mutation is audited.
 *
 * The `enrol` action is the admissions→students bridge: it creates a `students` row from an
 * accepted application and links it back via `enrolled_student_id`.
 */
@Injectable()
export class AdmissionsService {
  constructor(
    private readonly repo: AdmissionsRepository,
    private readonly announcements: AnnouncementsRepository,
    @Inject(AUDIT_WRITER) private readonly audit: AuditWriter,
    private readonly email: EmailService,
  ) {}

  async list(ctx: PortalActionContext, q: AdmissionsListQuery) {
    const f = this.filter(ctx);
    return this.paginate(await this.repo.list(ctx.principal.institutionId, f.campusIds, q), q);
  }

  async create(ctx: PortalActionContext, input: CreateAdmissionInput) {
    await this.assertOptional(ctx, 'gradeLevels', input.gradeLevelId, 'grade level');
    await this.assertOptional(ctx, 'academicYears', input.academicYearId, 'academic year');
    const campusId = this.createCampusId(ctx.scope);
    const row = await this.repo.insert({
      institutionId: ctx.principal.institutionId,
      campusId,
      applicationNo: input.applicationNo,
      firstName: input.firstName,
      middleName: input.middleName?.trim() || null,
      lastName: input.lastName,
      gender: input.gender ?? null,
      dateOfBirth: input.dateOfBirth ?? null,
      email: input.email ?? null,
      phone: input.phone ?? null,
      gradeLevelId: input.gradeLevelId ?? null,
      academicYearId: input.academicYearId ?? null,
      previousSchool: input.previousSchool ?? null,
      guardianName: input.guardianName ?? null,
      guardianPhone: input.guardianPhone ?? null,
      guardianEmail: input.guardianEmail ?? null,
      status: input.status,
      appliedDate: input.appliedDate ?? null,
      decisionNote: input.decisionNote ?? null,
      createdBy: ctx.principal.institutionUserId,
    });
    await this.write(ctx, 'admission.create', 'admission_application', row.id, campusId, {
      newState: { applicationNo: row.applicationNo, name: this.fullName(row), status: row.status },
    });
    return row;
  }

  async update(ctx: PortalActionContext, id: string, input: UpdateAdmissionInput) {
    const f = this.filter(ctx);
    const existing = await this.repo.find(id, ctx.principal.institutionId);
    this.assertInScope(existing?.campusId ?? null, existing, f);
    await this.assertOptional(ctx, 'gradeLevels', input.gradeLevelId, 'grade level');
    await this.assertOptional(ctx, 'academicYears', input.academicYearId, 'academic year');
    const statusChanged = input.status !== undefined && input.status !== existing!.status;
    const updated = await this.repo.update(id, input.version, {
      applicationNo: input.applicationNo ?? existing!.applicationNo,
      firstName: input.firstName ?? existing!.firstName,
      middleName: input.middleName === undefined ? existing!.middleName : input.middleName?.trim() || null,
      lastName: input.lastName ?? existing!.lastName,
      gender: input.gender === undefined ? existing!.gender : input.gender,
      dateOfBirth: input.dateOfBirth === undefined ? existing!.dateOfBirth : input.dateOfBirth,
      email: input.email === undefined ? existing!.email : input.email,
      phone: input.phone === undefined ? existing!.phone : input.phone,
      gradeLevelId: input.gradeLevelId === undefined ? existing!.gradeLevelId : input.gradeLevelId,
      academicYearId: input.academicYearId === undefined ? existing!.academicYearId : input.academicYearId,
      previousSchool: input.previousSchool === undefined ? existing!.previousSchool : input.previousSchool,
      guardianName: input.guardianName === undefined ? existing!.guardianName : input.guardianName,
      guardianPhone: input.guardianPhone === undefined ? existing!.guardianPhone : input.guardianPhone,
      guardianEmail: input.guardianEmail === undefined ? existing!.guardianEmail : input.guardianEmail,
      status: input.status ?? existing!.status,
      appliedDate: input.appliedDate === undefined ? existing!.appliedDate : input.appliedDate,
      decisionNote: input.decisionNote === undefined ? existing!.decisionNote : input.decisionNote,
      // record a decision date when an admin moves the application to a terminal review state
      decisionDate: statusChanged && this.isDecision(input.status!) ? this.today() : existing!.decisionDate,
      updatedBy: ctx.principal.institutionUserId,
    });
    if (!updated) throw this.versionConflict();
    await this.write(ctx, 'admission.update', 'admission_application', id, updated.campusId, {
      previousState: { status: existing!.status },
      newState: { name: this.fullName(updated), status: updated.status },
    });
    return updated;
  }

  /**
   * Record a decision on an application (accept/reject/waitlist/request-info). Sets status +
   * decision_note + decision_date, audits the action, and — unless `notify` is false — fans out a
   * notification to the guardian (reusing the Phase-9 notifications feed, the decision→notify bridge).
   */
  async decide(ctx: PortalActionContext, id: string, input: DecideAdmissionInput) {
    const f = this.filter(ctx);
    const existing = await this.repo.find(id, ctx.principal.institutionId);
    this.assertInScope(existing?.campusId ?? null, existing, f);
    if (existing!.status === 'enrolled') {
      throw new BadRequestException({
        code: 'ALREADY_ENROLLED',
        message: 'This applicant is already enrolled; a decision can no longer be recorded.',
      });
    }
    const note = input.note ?? existing!.decisionNote ?? null;
    const updated = await this.repo.update(id, input.version, {
      status: input.decision,
      decisionNote: note,
      decisionDate: this.today(),
      updatedBy: ctx.principal.institutionUserId,
    });
    if (!updated) throw this.versionConflict();

    // Public-funnel applications carry the OTP-verified CONTACT email in `email`; the guardian step
    // often has no email. Fall back so a decision still notifies whoever's email is on file.
    const recipientEmail = updated.guardianEmail ?? updated.email;
    let notificationId: string | null = null;
    if (input.notify && recipientEmail) {
      const label = DECISION_LABEL[input.decision] ?? input.decision;
      const notification = await this.announcements.insertNotification({
        institutionId: ctx.principal.institutionId,
        campusId: updated.campusId,
        title: `Admission update: ${label}`,
        body: this.decisionBody(label, this.fullName(updated), updated.applicationNo, note),
        kind: 'alert',
        audience: 'parents',
        status: 'unread',
        recipientCount: 1,
        targetSummary: recipientEmail,
        createdBy: ctx.principal.institutionUserId,
      });
      notificationId = notification.id;
    }

    // Email the applicant the outcome (enabled by default for every decision).
    if (input.notify && recipientEmail) {
      const label = DECISION_LABEL[input.decision] ?? input.decision;
      const applicantName = this.fullName(updated);
      const text = `Hello,\n\nThere is an update on admission application ${updated.applicationNo} for ${applicantName}: ${label}.${note ? `\n\n${note}` : ''}\n\nThank you.`;
      const html = emailLayout({
        heading: 'Admission update',
        preheader: `${updated.applicationNo}: ${label}`,
        footer:
          "You're receiving this because you submitted an admission application through Edrion. If this wasn't you, you can safely ignore it.",
        bodyHtml: `<p style="margin:0 0 16px;">There is an update on admission application <strong>${updated.applicationNo}</strong> for <strong>${applicantName}</strong>.</p>
          <div style="margin:0 0 18px;background:#E7F0EA;border-radius:12px;padding:14px 18px;font:700 16px/1 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#14532D;">${label}</div>
          ${note ? `<p style="margin:0 0 16px;">${note}</p>` : ''}
          <p style="margin:0;">Thank you for your patience.</p>`,
      });
      await this.email
        .send({
          to: recipientEmail,
          subject: `Admission update for ${updated.applicationNo}: ${label}`,
          text,
          html,
        })
        .catch(() => undefined);
    }

    await this.write(ctx, 'admission.decision', 'admission_application', id, updated.campusId, {
      previousState: { status: existing!.status },
      newState: { status: updated.status, decision: input.decision, notificationId, notified: !!notificationId },
    });
    return { application: updated, notificationId };
  }

  async delete(ctx: PortalActionContext, id: string, version: number) {
    const f = this.filter(ctx);
    const existing = await this.repo.find(id, ctx.principal.institutionId);
    this.assertInScope(existing?.campusId ?? null, existing, f);
    const ok = await this.repo.delete(id, version);
    if (!ok) throw this.versionConflict();
    await this.write(ctx, 'admission.delete', 'admission_application', id, existing!.campusId, {
      previousState: { applicationNo: existing!.applicationNo, name: this.fullName(existing!) },
    });
    return { deleted: true };
  }

  /** Enrol an accepted applicant → create the student record and link it back to the application. */
  async enrol(ctx: PortalActionContext, id: string, input: EnrolAdmissionInput) {
    const f = this.filter(ctx);
    const app = await this.repo.find(id, ctx.principal.institutionId);
    this.assertInScope(app?.campusId ?? null, app, f);
    if (app!.enrolledStudentId) {
      throw new BadRequestException({ code: 'ALREADY_ENROLLED', message: 'This applicant is already enrolled.' });
    }
    if (app!.status !== 'accepted') {
      throw new BadRequestException({
        code: 'NOT_ACCEPTED',
        message: 'Only accepted applications can be enrolled.',
      });
    }
    await this.assertOptional(ctx, 'classes', input.classId, 'class');
    const admissionNo = (input.admissionNo ?? app!.applicationNo).trim();
    if (await this.repo.admissionNoExists(ctx.principal.institutionId, admissionNo)) {
      throw new BadRequestException({
        code: 'ADMISSION_NO_TAKEN',
        message: `Admission number "${admissionNo}" is already in use.`,
      });
    }

    const student = await this.repo.insertStudent({
      institutionId: ctx.principal.institutionId,
      campusId: app!.campusId,
      admissionNo,
      firstName: app!.firstName,
      middleName: app!.middleName,
      lastName: app!.lastName,
      gender: app!.gender,
      dateOfBirth: app!.dateOfBirth,
      email: app!.email,
      phone: app!.phone,
      gradeLevelId: app!.gradeLevelId,
      classId: input.classId ?? null,
      status: 'enrolled',
      enrollmentDate: this.today(),
      createdBy: ctx.principal.institutionUserId,
    });

    const updated = await this.repo.update(id, app!.version, {
      status: 'enrolled',
      decisionDate: app!.decisionDate ?? this.today(),
      enrolledStudentId: student.id,
      updatedBy: ctx.principal.institutionUserId,
    });
    if (!updated) throw this.versionConflict();

    await this.write(ctx, 'admission.enrol', 'admission_application', id, app!.campusId, {
      newState: { studentId: student.id, admissionNo, name: this.fullName(app!) },
    });
    return { application: updated, student };
  }

  // === helpers ===============================================================

  private filter(ctx: PortalActionContext): ScopeFilter {
    return resolveScopeFilter(ctx.principal, ctx.scope);
  }

  private createCampusId(scope: InstitutionScope): string | null {
    return scope.mode === 'campus' ? scope.campusId : null;
  }

  private fullName(p: { firstName: string; middleName?: string | null; lastName: string }): string {
    return formatPersonName(p);
  }

  private today(): string {
    return new Date().toISOString().slice(0, 10);
  }

  private isDecision(status: string): boolean {
    return ['accepted', 'rejected', 'waitlisted', 'withdrawn', 'info_requested'].includes(status);
  }

  private decisionBody(label: string, name: string, applicationNo: string, note: string | null): string {
    const head = `The application ${applicationNo} for ${name} has been updated to: ${label}.`;
    return note ? `${head}\n\n${note}` : head;
  }

  private assertInScope<T>(campusId: string | null, row: T | undefined, filter: ScopeFilter): asserts row is T {
    if (!row) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Not found' });
    if (campusId === null) return;
    if (filter.campusIds === null) return;
    if (!filter.campusIds.includes(campusId)) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Not found in the current scope' });
    }
  }

  private async assertRef(ctx: PortalActionContext, table: AdmissionRefTable, id: string, label: string): Promise<void> {
    const ok = await this.repo.existsInInstitution(table, id, ctx.principal.institutionId);
    if (!ok) throw new BadRequestException({ code: 'INVALID_REFERENCE', message: `Unknown ${label}` });
  }

  private async assertOptional(
    ctx: PortalActionContext,
    table: AdmissionRefTable,
    id: string | null | undefined,
    label: string,
  ): Promise<void> {
    if (!id) return;
    await this.assertRef(ctx, table, id, label);
  }

  private paginate<T>(page: Page<T>, q: AdmissionsListQuery): ListResult<T> {
    return { ...page, page: q.page, pageSize: q.pageSize, hasMore: q.page * q.pageSize < page.total };
  }

  private async write(
    ctx: PortalActionContext,
    action: string,
    entityType: string,
    entityId: string,
    campusId: string | null,
    extra: Partial<AuditEventInput> = {},
  ): Promise<void> {
    await this.audit.logAudit({
      ...basePortalAudit(ctx),
      action,
      module: MODULE,
      entityType,
      entityId,
      campusId: campusId ?? undefined,
      ...extra,
    } as AuditEventInput);
  }

  private versionConflict() {
    return new ConflictException({
      code: 'VERSION_CONFLICT',
      message: 'This record changed since you loaded it. Reload and try again.',
    });
  }
}
