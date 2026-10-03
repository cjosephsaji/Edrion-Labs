import { randomBytes } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  lt,
  lte,
  or,
  schema,
  sql,
  type Database,
} from '@edrion/database';
import type { AuditWriter } from '@edrion/audit';
import type { InstitutionPrincipal, ScopeFilter } from '@edrion/auth';
import { resolveScopeFilter } from '@edrion/auth';
import { ActorType } from '@edrion/shared-types';
import type {
  AttendanceCorrectionPayload,
  DocumentRequestPayload,
  LeaveRequestPayload,
  OdRequestPayload,
  PortalRequestsListQuery,
  RequestApproveInput,
  RequestAttachmentInput,
  RequestBulkApproveInput,
  RequestInfoInput,
  RequestReassignInput,
  RequestRejectInput,
  RequestReplyInput,
  RequestStatus,
  RequestVersionInput,
  StudentRequestsListQuery,
  SubmitStudentRequestInput,
} from '@edrion/schemas';
import { AUDIT_WRITER, DATABASE } from '../../common/tokens';
import type { EdrionRequestContext } from '../../common/request-context';
import type { PortalActionContext } from '../portal/portal-action-context';
import { basePortalAudit } from '../portal/portal-action-context';
import { AttendancePolicyService } from '../portal/attendance-policy.service';
import { AttendanceService } from '../portal/attendance.service';
import { FeeLedgerService } from '../portal/fee-ledger.service';
import { ResultsSettingsService } from '../portal/results-settings.service';
import { institutionNow } from '../portal/institution-clock';
import { ATTENDANCE_RECOMPUTE_JOB } from '../student/attendance/attendance.constants';
import { RESULTS_RECOMPUTE_TERM_JOB } from '../portal/results.constants';
import { JobsService } from '../../common/queue/jobs.service';
import { StudentStorageService } from '../student/storage/student-storage.service';
import type { InstitutionalStudentPrincipal } from '../student/student.types';
import { RequestRegistryService, type ResolvedRequestType } from './request-registry.service';
import { RequestNotifyService } from './request-notify.service';
import { addWorkingDays, codeSuffix, dateDiffDays, decodeCursor, encodeCursor } from './request-utils';
import { RequestDocumentService } from './request-document.service';
import { DocumentRequestPolicyService } from './document-request-policy.service';
import { SensitiveReportService } from './sensitive-report.service';
import { assertRequestTransition, canStudentCancel } from './request-state';
import { revaluationApproveFormSchema } from '@edrion/schemas';

/** Side-effect appliers only run for request types that always carry a student (0155 allows null solely for anonymous sensitive reports). */
function requireStudentId(row: { studentId: string | null }): string {
  if (!row.studentId) {
    throw new BadRequestException({ code: 'STUDENT_REQUIRED', message: 'This request is not linked to a student.' });
  }
  return row.studentId;
}

type RequestRow = typeof schema.studentRequests.$inferSelect;
type EventActor = {
  kind: 'student' | 'staff' | 'system';
  userId?: string | null;
  role?: string | null;
  name?: string | null;
};

export interface StudentRequestContext {
  principal: InstitutionalStudentPrincipal;
  request: EdrionRequestContext;
}

const TERMINAL = new Set<RequestStatus>(['fulfilled', 'rejected', 'cancelled', 'expired']);
const ATTACHMENT_MIMES = new Set(['image/jpeg', 'image/png', 'application/pdf']);
const PENDING_STATUSES: RequestStatus[] = ['submitted', 'in_review', 'needs_info', 'approved', 'fulfilled'];

@Injectable()
export class RequestEngineService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(AUDIT_WRITER) private readonly audit: AuditWriter,
    private readonly registry: RequestRegistryService,
    private readonly storage: StudentStorageService,
    private readonly notifications: RequestNotifyService,
    private readonly attendance: AttendanceService,
    private readonly documents: RequestDocumentService,
    private readonly documentPolicy: DocumentRequestPolicyService,
    private readonly policy: AttendancePolicyService,
    private readonly jobs: JobsService,
    private readonly feeLedger: FeeLedgerService,
    private readonly resultsSettings: ResultsSettingsService,
    private readonly sensitiveReports: SensitiveReportService,
  ) {}

  async submit(ctx: StudentRequestContext, input: SubmitStudentRequestInput) {
    const { principal } = ctx;
    let resolved = await this.registry.requireEnabled(principal.institutionId, input.type);
    const parsed = resolved.config.payloadSchema.safeParse(input.payload);
    if (!parsed.success) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details: parsed.error.flatten().fieldErrors,
      });
    }
    let payload = parsed.data as Record<string, unknown>;
    if (input.type === 'leave_request') {
      payload = await this.prepareLeave(principal, payload as LeaveRequestPayload);
    }
    if (input.type === 'od_request') {
      payload = await this.prepareOd(principal, payload as OdRequestPayload);
    }
    if (input.type === 'attendance_correction') {
      await this.validateCorrection(principal, payload as AttendanceCorrectionPayload);
    }
    if (input.type === 'document_request') {
      const docPayload = parsed.data as DocumentRequestPayload;
      resolved = await this.documentPolicy.applyToResolved(
        principal.institutionId,
        docPayload,
        resolved,
      );
      if (!docPayload.subtypeKey) {
        payload = { ...payload, subtypeKey: docPayload.doc_type };
      }
      await this.documents.assertRequestableTemplate(principal.institutionId, docPayload.doc_type);
    }

    const attachments = await this.normalizeAttachments(principal, input.attachments);
    const routing = await this.resolveRouting(principal, resolved);
    const now = new Date();
    const campusId = principal.campusId;
    if (!campusId) {
      throw new BadRequestException({ code: 'CAMPUS_REQUIRED', message: 'Your campus could not be resolved.' });
    }
    const holidays = await this.loadHolidayDates(principal.institutionId, campusId, now, resolved.slaDays);
    const values = {
      institutionId: principal.institutionId,
      campusId,
      studentId: input.type === 'sensitive_report' ? null : principal.studentId,
      type: input.type,
      payload,
      payloadSchemaVersion: resolved.config.payloadSchemaVersion,
      status: resolved.config.requiresPayment ? 'draft' as const : 'submitted' as const,
      assignedRole: routing.role,
      assignedUserId: routing.userId,
      attachments,
      slaDueAt: addWorkingDays(now, resolved.slaDays, holidays),
      submittedAt: resolved.config.requiresPayment ? null : now,
    };
    const row = await this.db.transaction(async tx => {
      let insertedRow:RequestRow|undefined;
      for (let attempt = 0; attempt < 6 && !insertedRow; attempt += 1) {
        const suffixLength = attempt === 5 ? 5 : 4;
        const humanCode = `${resolved.config.humanCodePrefix}-${codeSuffix(randomBytes(8), suffixLength)}`;
        const [inserted] = await tx.insert(schema.studentRequests).values({ ...values, humanCode }).onConflictDoNothing({target:[schema.studentRequests.institutionId,schema.studentRequests.humanCode]}).returning();
        insertedRow=inserted;
      }
      if(!insertedRow) return undefined;
      await tx.insert(schema.studentRequestEvents).values([this.eventValues(insertedRow,1,'created',this.studentActor(principal)),...(resolved.config.requiresPayment?[]:[this.eventValues(insertedRow,2,'submitted',this.studentActor(principal))])]);
      if(resolved.config.requiresPayment){const feeLine=resolved.config.feeLine;if(!feeLine)throw new BadRequestException({code:'REQUEST_PAYMENT_NOT_CONFIGURED',message:'This request type is missing its fee configuration.'});const[invoice]=await tx.insert(schema.feeInvoices).values({institutionId:principal.institutionId,campusId,invoiceNo:`REQ-${insertedRow.humanCode}`,studentId:principal.studentId,source:'other',amount:feeLine.amountMinor,amountPaid:0,status:'pending',issueDate:now.toISOString().slice(0,10),dueDate:new Date(now.getTime()+72*60*60*1000).toISOString().slice(0,10),origin:'request',linkedRequestId:insertedRow.id,createdBy:principal.institutionUserId}).returning();await tx.insert(schema.feeInvoiceItems).values({institutionId:principal.institutionId,invoiceId:invoice!.id,studentId:principal.studentId,kind:'charge',category:feeLine.category,label:feeLine.label,amountMinor:feeLine.amountMinor,source:{request_id:insertedRow.id,request_type:insertedRow.type}});const[updated]=await tx.update(schema.studentRequests).set({paymentRequestId:invoice!.id}).where(eq(schema.studentRequests.id,insertedRow.id)).returning();insertedRow=updated!;}
      return insertedRow;
    });
    if (!row) {
      throw new ConflictException({ code: 'CODE_COLLISION', message: 'Could not allocate a request code. Try again.' });
    }
    if (input.type === 'sensitive_report') {
      await this.sensitiveReports.sealAfterSubmit(row.id, principal);
    }
    await this.writeStudentAudit(ctx, row, 'student_request.submit', null, row.status);
    if(!resolved.config.requiresPayment)await this.notifications.dispatch({ institutionId: row.institutionId, requestId: row.id, eventSeq: 2 });
    const expectation = await this.fulfilmentExpectation(row.institutionId, row.type, resolved.slaDays);
    return { ...this.toView(row, resolved), ...expectation };
  }

  async listStudent(principal: InstitutionalStudentPrincipal, query: StudentRequestsListQuery) {
    const t = schema.studentRequests;
    const cursor = decodeCursor(query.cursor);
    const owned = await this.db
      .select({ requestId: schema.studentSensitiveReportOwnership.requestId })
      .from(schema.studentSensitiveReportOwnership)
      .where(
        and(
          eq(schema.studentSensitiveReportOwnership.institutionId, principal.institutionId),
          eq(schema.studentSensitiveReportOwnership.studentId, principal.studentId),
        ),
      );
    const ownedIds = owned.map((o) => o.requestId);
    const conds = [
      eq(t.institutionId, principal.institutionId),
      ownedIds.length
        ? or(eq(t.studentId, principal.studentId), inArray(t.id, ownedIds))!
        : eq(t.studentId, principal.studentId),
    ];
    if (query.type) conds.push(eq(t.type, query.type));
    if (query.status) conds.push(eq(t.status, query.status));
    if (cursor) {
      const at = new Date(cursor.at);
      conds.push(or(lt(t.createdAt, at), and(eq(t.createdAt, at), lt(t.id, cursor.id)))!);
    }
    const rows = await this.db
      .select()
      .from(t)
      .where(and(...conds))
      .orderBy(desc(t.createdAt), desc(t.id))
      .limit(query.limit + 1);
    const hasMore = rows.length > query.limit;
    const items = rows.slice(0, query.limit);
    return {
      items: await Promise.all(items.map((row) => this.toViewResolved(row))),
      nextCursor:
        hasMore && items.length
          ? encodeCursor({ at: items[items.length - 1]!.createdAt.toISOString(), id: items[items.length - 1]!.id })
          : null,
    };
  }

  async leavePreview(principal: InstitutionalStudentPrincipal, start: string, end: string) {
    const [student] = await this.db
      .select({ classId: schema.students.classId })
      .from(schema.students)
      .where(eq(schema.students.id, principal.studentId))
      .limit(1);
    if (!student?.classId || end < start) return { sessions: [], sessionCount: 0, subjectCount: 0 };
    const sessions = await this.db
      .select({
        sessionId: schema.attendanceSessions.id,
        date: schema.attendanceSessions.date,
        subjectId: schema.attendanceSessions.subjectId,
        period: schema.attendanceSessions.period,
      })
      .from(schema.attendanceSessions)
      .where(
        and(
          eq(schema.attendanceSessions.institutionId, principal.institutionId),
          eq(schema.attendanceSessions.classId, student.classId),
          sql`${schema.attendanceSessions.date} >= ${start}`,
          sql`${schema.attendanceSessions.date} <= ${end}`,
        ),
      )
      .orderBy(asc(schema.attendanceSessions.date), asc(schema.attendanceSessions.period));
    return {
      sessions,
      sessionCount: sessions.length,
      subjectCount: new Set(sessions.map((session) => session.subjectId).filter(Boolean)).size,
    };
  }

  async getStudent(principal: InstitutionalStudentPrincipal, id: string) {
    const row = await this.requireStudentRequest(principal, id);
    const [events, staffNameSettings] = await Promise.all([
      this.db
        .select()
        .from(schema.studentRequestEvents)
        .where(eq(schema.studentRequestEvents.requestId, id))
        .orderBy(asc(schema.studentRequestEvents.seq)),
      this.db
        .select({ campusId: schema.institutionSettings.campusId, value: schema.institutionSettings.value })
        .from(schema.institutionSettings)
        .where(
          and(
            eq(schema.institutionSettings.institutionId, principal.institutionId),
            eq(schema.institutionSettings.category, 'student_portal'),
            eq(schema.institutionSettings.key, 'show_staff_names_to_students'),
            principal.campusId
              ? or(isNull(schema.institutionSettings.campusId), eq(schema.institutionSettings.campusId, principal.campusId))
              : isNull(schema.institutionSettings.campusId),
          ),
        ),
    ]);
    const campusSetting = principal.campusId
      ? staffNameSettings.find((setting) => setting.campusId === principal.campusId)
      : undefined;
    const showStaffNames = (campusSetting ?? staffNameSettings.find((setting) => setting.campusId === null))?.value === 'true';
    const staffIds = showStaffNames
      ? [...new Set(events.filter((event) => event.actorKind === 'staff').map((event) => event.actorUserId).filter((userId): userId is string => Boolean(userId)))]
      : [];
    const staffNames = staffIds.length
      ? await this.db
          .select({ id: schema.institutionUsers.id, name: schema.institutionUsers.fullName })
          .from(schema.institutionUsers)
          .where(
            and(
              eq(schema.institutionUsers.institutionId, principal.institutionId),
              inArray(schema.institutionUsers.id, staffIds),
            ),
          )
      : [];
    const namesById = new Map(staffNames.map((staff) => [staff.id, staff.name]));
    const visibleEvents = events
      .filter((event) => event.eventType !== 'note_added')
      .map((event) => ({
        ...event,
        actorUserId: event.actorKind === 'student' ? event.actorUserId : null,
        actorName: event.actorKind === 'staff' && showStaffNames && event.actorUserId
          ? namesById.get(event.actorUserId) ?? event.actorRole
          : event.actorKind === 'staff'
            ? event.actorRole
            : undefined,
      }));
    return { ...(await this.toViewResolved(row)), events: visibleEvents };
  }

  async cancel(ctx: StudentRequestContext, id: string, input: RequestVersionInput) {
    const row = await this.requireStudentRequest(ctx.principal, id);
    const resolved = await this.registry.resolve(row.institutionId, row.type);
    if (!canStudentCancel(row.status, row.assignedUserId, resolved.config.cancellableStatuses)) {
      throw new ConflictException({
        code: 'CANCEL_TOO_LATE',
        message: "This request is already being reviewed — contact the office if it's no longer needed.",
      });
    }
    let updated: RequestRow;
    try {
      updated = await this.updateVersioned(row, input.version, {
        status: 'cancelled',
        resolvedAt: new Date(),
      });
    } catch (error) {
      const fresh = await this.requireStudentRequest(ctx.principal, id);
      if (!canStudentCancel(fresh.status, fresh.assignedUserId, resolved.config.cancellableStatuses)) {
        throw new ConflictException({
          code: 'CANCEL_TOO_LATE',
          message: "This request is already being reviewed — contact the office if it's no longer needed.",
        });
      }
      throw error;
    }
    const seq = await this.appendEvent(updated, 'cancelled', this.studentActor(ctx.principal));
    await this.writeStudentAudit(ctx, updated, 'student_request.cancel', row.status, 'cancelled');
    await this.notifications.dispatch({ institutionId: row.institutionId, requestId: row.id, eventSeq: seq });
    return this.toView(updated, resolved);
  }

  async reply(ctx: StudentRequestContext, id: string, input: RequestReplyInput) {
    const row = await this.requireStudentRequest(ctx.principal, id);
    this.assertTransition(row, ['needs_info'], 'in_review');
    if ((row.attachments?.length ?? 0) + input.attachments.length > 5) {
      throw new BadRequestException({ code: 'TOO_MANY_FILES', message: 'Max 5 files, 10 MB each.' });
    }
    const attachments = await this.normalizeAttachments(ctx.principal, input.attachments);
    const payload = { ...(row.payload as Record<string, unknown>) };
    const replies = Array.isArray(payload.info_replies) ? [...payload.info_replies] : [];
    replies.push({ text: input.text, attachments, at: new Date().toISOString() });
    payload.info_replies = replies;
    const updated = await this.updateVersioned(row, input.version, {
      status: 'in_review',
      payload,
      attachments: [...(row.attachments ?? []), ...attachments],
      needsInfoQuestion: null,
    });
    const seq = await this.appendEvent(updated, 'info_provided', this.studentActor(ctx.principal), input.text);
    await this.writeStudentAudit(ctx, updated, 'student_request.info_provided', row.status, 'in_review');
    await this.notifications.dispatch({ institutionId: row.institutionId, requestId: row.id, eventSeq: seq });
    return this.toViewResolved(updated);
  }

  async listPortal(ctx: PortalActionContext, query: PortalRequestsListQuery) {
    const t = schema.studentRequests;
    const scope = resolveScopeFilter(ctx.principal, ctx.scope);
    const cursor = decodeCursor(query.cursor);
    const access = or(
      eq(t.assignedUserId, ctx.principal.institutionUserId),
      and(
        sql`not (${t.type} = 'leave_request' and ${t.assignedRole} = 'teacher')`,
        ctx.principal.roleKeys.length ? inArray(t.assignedRole, ctx.principal.roleKeys) : undefined,
      ),
      and(
        eq(t.type, 'leave_request'),
        eq(t.assignedRole, 'teacher'),
        eq(schema.staff.institutionUserId, ctx.principal.institutionUserId),
      ),
    );
    if (!access) return { items: [], nextCursor: null };
    const conds = [eq(t.institutionId, ctx.principal.institutionId), access];
    this.addCampusFilter(conds, t.campusId, scope);
    if (query.type) conds.push(eq(t.type, query.type));
    if (query.status) conds.push(eq(t.status, query.status));
    else conds.push(inArray(t.status, ['submitted', 'in_review', 'needs_info']));
    if (query.sla === 'breached') conds.push(lte(t.slaDueAt, new Date()));
    if (query.mine) conds.push(eq(t.assignedUserId, ctx.principal.institutionUserId));
    if (cursor) {
      const at = new Date(cursor.at);
      conds.push(or(lt(t.submittedAt, at), and(eq(t.submittedAt, at), lt(t.id, cursor.id)))!);
    }
    const breached = sql<number>`case when ${t.slaDueAt} is not null and ${t.slaDueAt} < now() then 1 else 0 end`;
    const rows = await this.db
      .select({ request: t, studentName: sql<string>`concat_ws(' ', ${schema.students.firstName}, ${schema.students.middleName}, ${schema.students.lastName})`, breached })
      .from(t)
      .innerJoin(schema.students, eq(schema.students.id, t.studentId))
      .leftJoin(schema.classes, eq(schema.classes.id, schema.students.classId))
      .leftJoin(schema.staff, eq(schema.staff.id, schema.classes.classTeacherId))
      .where(and(...conds))
      .orderBy(desc(breached), asc(t.submittedAt), asc(t.id))
      .limit(query.limit + 1);
    const hasMore = rows.length > query.limit;
    const page = rows.slice(0, query.limit);
    return {
      items: await Promise.all(page.map(async ({ request, studentName, breached: isBreached }) => ({
        ...(await this.toViewResolved(request)),
        studentName,
        slaBreached: Boolean(isBreached),
      }))),
      nextCursor:
        hasMore && page.length && page[page.length - 1]!.request.submittedAt
          ? encodeCursor({ at: page[page.length - 1]!.request.submittedAt!.toISOString(), id: page[page.length - 1]!.request.id })
          : null,
    };
  }

  async getPortal(ctx: PortalActionContext, id: string) {
    const row = await this.requirePortalRequest(ctx, id);
    const [events, context] = await Promise.all([
      this.db
        .select()
        .from(schema.studentRequestEvents)
        .where(eq(schema.studentRequestEvents.requestId, id))
        .orderBy(asc(schema.studentRequestEvents.seq)),
      this.contextSnapshot(row),
    ]);
    return { ...(await this.toViewResolved(row)), events, context };
  }

  async portalAttachment(ctx: PortalActionContext, id: string, storageObjectId: string) {
    const request = await this.requirePortalRequest(ctx, id);
    const attachment = (request.attachments ?? []).find(
      (item) => item.storage_object_id === storageObjectId,
    );
    if (!attachment) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Attachment not found.' });
    }
    const [object] = await this.db
      .select()
      .from(schema.storageObjects)
      .where(
        and(
          eq(schema.storageObjects.id, storageObjectId),
          eq(schema.storageObjects.institutionId, request.institutionId),
          eq(schema.storageObjects.ownerStudentId, requireStudentId(request)),
        ),
      )
      .limit(1);
    if (!object) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Attachment not found.' });
    return { object, stream: this.storage.stream(object.storageKey) };
  }

  async claim(ctx: PortalActionContext, id: string, input: RequestVersionInput) {
    const row = await this.requirePortalRequest(ctx, id);
    if (row.assignedUserId === ctx.principal.institutionUserId) return this.toViewResolved(row);
    if (row.assignedUserId) await this.alreadyClaimed(row.assignedUserId);
    this.assertTransition(row, ['submitted', 'in_review'], 'in_review');
    const [updated] = await this.db
      .update(schema.studentRequests)
      .set({
        assignedUserId: ctx.principal.institutionUserId,
        status: 'in_review',
        version: input.version + 1,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.studentRequests.id, id),
          eq(schema.studentRequests.version, input.version),
          isNull(schema.studentRequests.assignedUserId),
        ),
      )
      .returning();
    if (!updated) {
      const fresh = await this.requirePortalRequest(ctx, id);
      if (fresh.assignedUserId) await this.alreadyClaimed(fresh.assignedUserId);
      throw this.versionConflict();
    }
    await this.appendEvent(updated, 'claimed', this.staffActor(ctx.principal));
    await this.writePortalAudit(ctx, updated, 'student_request.claim', row.status, updated.status);
    return this.toViewResolved(updated);
  }

  async unclaim(ctx: PortalActionContext, id: string, input: RequestVersionInput) {
    const row = await this.requirePortalRequest(ctx, id);
    if (row.assignedUserId !== ctx.principal.institutionUserId) {
      throw new ConflictException({ code: 'NOT_CLAIMED_BY_YOU', message: 'This request is not claimed by you.' });
    }
    const updated = await this.updateVersioned(row, input.version, { assignedUserId: null });
    await this.appendEvent(updated, 'unclaimed', this.staffActor(ctx.principal));
    await this.writePortalAudit(ctx, updated, 'student_request.unclaim', row.status, updated.status);
    return this.toViewResolved(updated);
  }

  async requestInfo(ctx: PortalActionContext, id: string, input: RequestInfoInput) {
    const row = await this.requirePortalRequest(ctx, id);
    this.assertTransition(row, ['submitted', 'in_review'], 'needs_info');
    const { events, assignedUserId } = await this.decisionPrelude(row, ctx.principal);
    const updated = await this.updateDecisionVersioned(row, input.version, {
      status: 'needs_info',
      assignedUserId,
      needsInfoQuestion: input.question,
    }, ctx.principal);
    await this.appendEvents(updated, [...events, { type: 'info_requested', note: input.question }], this.staffActor(ctx.principal));
    const seq = await this.lastSeq(updated.id);
    await this.writePortalAudit(ctx, updated, 'student_request.info_requested', row.status, 'needs_info');
    await this.notifications.dispatch({ institutionId: row.institutionId, requestId: row.id, eventSeq: seq });
    return this.toViewResolved(updated);
  }

  async reject(ctx: PortalActionContext, id: string, input: RequestRejectInput) {
    const row = await this.requirePortalRequest(ctx, id);
    this.assertTransition(row, ['submitted', 'in_review'], 'rejected');
    const { events, assignedUserId } = await this.decisionPrelude(row, ctx.principal);
    const updated = await this.updateDecisionVersioned(row, input.version, {
      status: 'rejected',
      assignedUserId,
      decisionNote: input.note,
      resolvedAt: new Date(),
    }, ctx.principal);
    await this.appendEvents(updated, [...events, { type: 'rejected', note: input.note, data: { refund_flagged: input.refund_flagged ?? false } }], this.staffActor(ctx.principal));
    const seq = await this.lastSeq(updated.id);
    await this.writePortalAudit(ctx, updated, 'student_request.reject', row.status, 'rejected', input.note);
    await this.maybeRefundRevaluationFee(ctx, row);
    await this.notifications.dispatch({ institutionId: row.institutionId, requestId: row.id, eventSeq: seq });
    return this.toViewResolved(updated);
  }

  async approve(ctx: PortalActionContext, id: string, input: RequestApproveInput) {
    const row = await this.requirePortalRequest(ctx, id);
    this.assertTransition(row, ['submitted', 'in_review'], 'approved');
    const resolved = await this.registry.resolve(row.institutionId, row.type);
    const { events, assignedUserId } = await this.decisionPrelude(row, ctx.principal);

    if (resolved.config.approvalSideEffectKey === 'leave_attendance') {
      return this.approveWithSideEffect(ctx, row, input, events, assignedUserId, () =>
        this.applyLeaveAttendance(ctx, row),
      );
    }

    if (resolved.config.approvalSideEffectKey === 'od_attendance') {
      return this.approveWithSideEffect(ctx, row, input, events, assignedUserId, () =>
        this.applyOdAttendance(ctx, row),
      );
    }

    if (resolved.config.approvalSideEffectKey === 'attendance_correction') {
      return this.approveWithSideEffect(ctx, row, input, events, assignedUserId, () =>
        this.applyAttendanceCorrection(ctx, row, input),
      );
    }

    if (resolved.config.approvalSideEffectKey === 'revaluation') {
      return this.approveWithSideEffect(ctx, row, input, events, assignedUserId, () =>
        this.applyRevaluation(ctx, row, input),
      );
    }

    if (resolved.config.approvalSideEffectKey === 'hostel_outpass_gate_pass') {
      return this.approveWithSideEffect(ctx, row, input, events, assignedUserId, () =>
        this.applyHostelOutpass(ctx, row),
      );
    }

    if (resolved.config.approvalSideEffectKey === 'campus_library_renewal') {
      return this.approveWithSideEffect(ctx, row, input, events, assignedUserId, () =>
        this.applyLibraryRenewal(ctx, row),
      );
    }

    if (resolved.config.approvalSideEffectKey === 'transport_renewal') {
      return this.approveWithSideEffect(ctx, row, input, events, assignedUserId, () =>
        this.applyTransportRenewal(ctx, row),
      );
    }

    if (resolved.config.approvalSideEffectKey === 'id_card_reissue') {
      return this.approveWithSideEffect(ctx, row, input, events, assignedUserId, () =>
        this.applyIdCardReissue(ctx, row),
      );
    }

    if (resolved.config.approvalSideEffectKey === 'club_join') {
      return this.approveWithSideEffect(ctx, row, input, events, assignedUserId, () =>
        this.applyClubJoin(ctx, row),
      );
    }

    if (resolved.config.approvalSideEffectKey === 'health_profile_update') {
      return this.approveWithSideEffect(ctx, row, input, events, assignedUserId, () =>
        this.applyHealthProfileUpdate(ctx, row),
      );
    }

    if(resolved.config.approvalSideEffectKey==='fee_waiver'){
      const[invoice]=await this.db.select().from(schema.feeInvoices).where(and(eq(schema.feeInvoices.id,String(row.payload.invoice_id)),eq(schema.feeInvoices.institutionId,row.institutionId),eq(schema.feeInvoices.studentId,requireStudentId(row)),sql`${schema.feeInvoices.status}<>'cancelled'`)).limit(1);if(!invoice)throw new NotFoundException({code:'INVOICE_NOT_FOUND',message:'The selected fee invoice was not found.'});const amount=Number(row.payload.requested_amount_minor??(invoice.amount-invoice.amountPaid));if(amount<=0||amount>invoice.amount-invoice.amountPaid)throw new BadRequestException({code:'WAIVER_AMOUNT_INVALID',message:'The waiver must be within the outstanding invoice balance.'});const[config]=await this.db.select().from(schema.institutionFeeConfig).where(eq(schema.institutionFeeConfig.institutionId,row.institutionId)).limit(1);const threshold=config?.waiverTwoPersonThresholdMinor??1_000_000;const requiresSecond=amount>threshold;const[waiver]=await this.db.insert(schema.feeWaivers).values({institutionId:row.institutionId,studentId:requireStudentId(row),invoiceId:invoice.id,label:'Requested fee waiver',amountMinor:amount,reason:String(row.payload.reason),status:requiresSecond?'pending_second_approval':'approved',proposedBy:ctx.principal.institutionUserId,approvedBy:ctx.principal.institutionUserId,thresholdSnapshotMinor:threshold,requestId:row.id}).returning();if(!requiresSecond){await this.db.transaction(async tx=>{await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`fees:${row.institutionId}:${row.studentId}`}))`);await tx.insert(schema.feeInvoiceItems).values({institutionId:row.institutionId,invoiceId:invoice.id,studentId:requireStudentId(row),kind:'waiver',category:'other',label:waiver!.label,amountMinor:-amount,source:{waiver_id:waiver!.id,request_id:row.id}});await tx.update(schema.feeInvoices).set({amount:sql`${schema.feeInvoices.amount}-${amount}`,updatedAt:new Date()}).where(eq(schema.feeInvoices.id,invoice.id));await tx.update(schema.feeWaivers).set({status:'posted',version:1}).where(eq(schema.feeWaivers.id,waiver!.id));});}
      const approved=await this.updateDecisionVersioned(row,input.version,{status:'approved',assignedUserId,decisionNote:input.note??null},ctx.principal);await this.appendEvents(approved,[...events,{type:'approved',note:input.note}],this.staffActor(ctx.principal));await this.writePortalAudit(ctx,approved,'student_request.approve',row.status,'approved',input.note);if(requiresSecond)return this.toViewResolved(approved);const fulfilled=await this.updateVersioned(approved,approved.version,{status:'fulfilled',resolvedAt:new Date()});const seq=await this.appendEvent(fulfilled,'fulfilled',this.staffActor(ctx.principal),null,{waiver_id:waiver!.id});await this.writePortalAudit(ctx,fulfilled,'student_request.fulfil','approved','fulfilled');await this.notifications.dispatch({institutionId:row.institutionId,requestId:row.id,eventSeq:seq});return this.toViewResolved(fulfilled);
    }

    const updated = await this.updateDecisionVersioned(row, input.version, {
      status: 'approved',
      assignedUserId,
      decisionNote: input.note ?? null,
    }, ctx.principal);
    await this.appendEvents(updated, [...events, { type: 'approved', note: input.note }], this.staffActor(ctx.principal));
    await this.writePortalAudit(ctx, updated, 'student_request.approve', row.status, 'approved', input.note);
    if (resolved.config.producesDocument) await this.documents.enqueue(ctx, updated);
    return this.toViewResolved(updated);
  }

  async reassign(ctx: PortalActionContext, id: string, input: RequestReassignInput) {
    const row = await this.requirePortalRequest(ctx, id);
    if (
      !ctx.principal.permissions.hasWildcard &&
      !ctx.principal.permissions.keys.has('requests.reassign') &&
      row.assignedUserId !== ctx.principal.institutionUserId
    ) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Only an administrator or the currently assigned reviewer can reassign this request.',
      });
    }
    if (TERMINAL.has(row.status as RequestStatus)) this.illegal(row, 'reassigned');
    if (input.to_user_id) await this.requireInstitutionUser(row.institutionId, input.to_user_id);
    const from = { role: row.assignedRole, userId: row.assignedUserId };
    const patch = input.to_role
      ? { assignedRole: input.to_role, assignedUserId: null }
      : { assignedUserId: input.to_user_id! };
    const updated = await this.updateVersioned(row, input.version, patch);
    const seq = await this.appendEvent(updated, 'reassigned', this.staffActor(ctx.principal), null, {
      from,
      to: { role: updated.assignedRole, userId: updated.assignedUserId },
    });
    await this.writePortalAudit(ctx, updated, 'student_request.reassign', row.status, updated.status);
    await this.notifications.dispatch({ institutionId: row.institutionId, requestId: row.id, eventSeq: seq });
    return this.toViewResolved(updated);
  }

  async addNote(ctx: PortalActionContext, id: string, input: { version: number; note: string }) {
    const row = await this.requirePortalRequest(ctx, id);
    if (TERMINAL.has(row.status as RequestStatus)) this.illegal(row, 'note_added');
    const updated = await this.updateVersioned(row, input.version, {});
    await this.appendEvent(updated, 'note_added', this.staffActor(ctx.principal), input.note);
    await this.writePortalAudit(ctx, updated, 'student_request.note', row.status, updated.status, input.note);
    return this.toViewResolved(updated);
  }

  async bulkApprove(ctx: PortalActionContext, input: RequestBulkApproveInput) {
    const results: Array<{ id: string; ok: boolean; code?: string; request?: unknown }> = [];
    for (const id of input.ids) {
      try {
        const row = await this.requirePortalRequest(ctx, id);
        const type = await this.registry.resolve(row.institutionId, row.type);
        if (!type.config.bulkApprovable) {
          throw new ConflictException({ code: 'NOT_BULK_APPROVABLE', message: 'This request must be reviewed individually.' });
        }
        const request = await this.approve(ctx, id, { version: input.version_map[id]!, note: undefined });
        results.push({ id, ok: true, request });
      } catch (error) {
        const response = error instanceof ConflictException ? error.getResponse() : undefined;
        const code = typeof response === 'object' && response && 'code' in response ? String(response.code) : 'FAILED';
        results.push({ id, ok: false, code });
      }
    }
    return { results };
  }

  async expireSilentRequests(institutionId: string): Promise<number> {
    const cutoff = new Date(Date.now() - 14 * 86_400_000);
    const rows = await this.db
      .select({ request: schema.studentRequests })
      .from(schema.studentRequests)
      .innerJoin(
        schema.studentRequestEvents,
        and(
          eq(schema.studentRequestEvents.requestId, schema.studentRequests.id),
          eq(schema.studentRequestEvents.eventType, 'info_requested'),
        ),
      )
      .where(
        and(
          eq(schema.studentRequests.institutionId, institutionId),
          eq(schema.studentRequests.status, 'needs_info'),
          lte(schema.studentRequestEvents.createdAt, cutoff),
          sql`${schema.studentRequestEvents.seq} = (
            select max(latest_info.seq)
            from student_request_events latest_info
            where latest_info.request_id = ${schema.studentRequests.id}
              and latest_info.event_type = 'info_requested'
          )`,
        ),
      );
    let count = 0;
    for (const { request } of rows) {
      const [updated] = await this.db
        .update(schema.studentRequests)
        .set({ status: 'expired', resolvedAt: new Date(), version: request.version + 1, updatedAt: new Date() })
        .where(
          and(
            eq(schema.studentRequests.id, request.id),
            eq(schema.studentRequests.status, 'needs_info'),
            eq(schema.studentRequests.version, request.version),
          ),
        )
        .returning();
      if (!updated) continue;
      const note = 'Closed — no reply to the information request within 14 days.';
      const seq = await this.appendEvent(updated, 'expired', { kind: 'system' }, note);
      await this.audit.logAudit({
        actorType: ActorType.System,
        institutionId,
        action: 'student_request.expire',
        module: 'request-engine',
        entityType: 'student_request',
        entityId: request.id,
        previousState: { status: 'needs_info' },
        newState: { status: 'expired' },
        reason: note,
      });
      await this.notifications.dispatch({ institutionId, requestId: request.id, eventSeq: seq });
      count += 1;
    }
    return count;
  }

  // ── internals ──────────────────────────────────────────────────────────────

  private async loadHolidayDates(
    institutionId: string,
    campusId: string,
    start: Date,
    slaDays: number,
  ): Promise<Set<string>> {
    const from = start.toISOString().slice(0, 10);
    const horizon = new Date(start);
    // The override is capped at 365 days. This window leaves ample room for
    // Sundays and institution holidays while keeping the calendar read bounded.
    horizon.setUTCDate(horizon.getUTCDate() + Math.max(45, slaDays * 3 + 30));
    const to = horizon.toISOString().slice(0, 10);
    const event = schema.calendarEvents;
    const eventType = schema.calendarEventTypes;
    const rows = await this.db
      .select({ startsOn: event.startsOn, endsOn: event.endsOn })
      .from(event)
      .leftJoin(eventType, eq(eventType.id, event.eventTypeId))
      .where(
        and(
          eq(event.institutionId, institutionId),
          eq(event.status, 'published'),
          or(isNull(event.campusId), eq(event.campusId, campusId)),
          or(eq(event.type, 'holiday'), eq(eventType.key, 'holiday')),
          lte(event.startsOn, to),
          or(isNull(event.endsOn), gte(event.endsOn, from)),
        ),
      );
    const dates = new Set<string>();
    for (const row of rows) {
      const first = row.startsOn < from ? from : row.startsOn;
      const last = (row.endsOn ?? row.startsOn) > to ? to : (row.endsOn ?? row.startsOn);
      const cursor = new Date(`${first}T00:00:00.000Z`);
      const end = new Date(`${last}T00:00:00.000Z`);
      while (cursor <= end) {
        dates.add(cursor.toISOString().slice(0, 10));
        cursor.setUTCDate(cursor.getUTCDate() + 1);
      }
    }
    return dates;
  }

  private async fulfilmentExpectation(institutionId: string, type: string, fallbackDays: number) {
    const rows = await this.db
      .select({
        campusId: schema.studentRequests.campusId,
        submittedAt: schema.studentRequests.submittedAt,
        resolvedAt: schema.studentRequests.resolvedAt,
      })
      .from(schema.studentRequests)
      .where(
        and(
          eq(schema.studentRequests.institutionId, institutionId),
          eq(schema.studentRequests.type, type),
          eq(schema.studentRequests.status, 'fulfilled'),
        ),
      )
      .orderBy(desc(schema.studentRequests.resolvedAt))
      .limit(20);
    if (rows.length < 20) return { expectedWorkingDays: fallbackDays, expectationSource: 'sla' as const };
    const holidaysByCampus = new Map<string, Set<string>>();
    for (const campusId of new Set(rows.map((row) => row.campusId))) {
      const campusRows = rows.filter((row) => row.campusId === campusId && row.submittedAt && row.resolvedAt);
      if (!campusRows.length) continue;
      const first = new Date(Math.min(...campusRows.map((row) => row.submittedAt!.getTime())));
      const last = new Date(Math.max(...campusRows.map((row) => row.resolvedAt!.getTime())));
      const spanDays = Math.max(1, Math.ceil((last.getTime() - first.getTime()) / 86_400_000));
      holidaysByCampus.set(
        campusId,
        await this.loadHolidayDates(institutionId, campusId, first, spanDays),
      );
    }
    const durations = rows
      .map((row) => row.submittedAt && row.resolvedAt
        ? workingDaysElapsed(row.submittedAt, row.resolvedAt, holidaysByCampus.get(row.campusId))
        : null)
      .filter((days): days is number => days !== null)
      .sort((a, b) => a - b);
    if (durations.length < 20) return { expectedWorkingDays: fallbackDays, expectationSource: 'sla' as const };
    const median = Math.max(1, Math.round((durations[9]! + durations[10]!) / 2));
    return { expectedWorkingDays: median, expectationSource: 'median' as const };
  }

  private async prepareLeave(principal: InstitutionalStudentPrincipal, payload: LeaveRequestPayload) {
    const days = dateDiffDays(payload.start_date, payload.end_date);
    // dateDiffDays is exclusive; a 30-day inclusive range has a delta of 29.
    if (days < 0 || days > 29) {
      throw new BadRequestException({ code: 'LEAVE_RANGE_INVALID', message: 'Leave can cover at most 30 days.' });
    }
    const oldest = new Date();
    oldest.setUTCHours(0, 0, 0, 0);
    oldest.setUTCDate(oldest.getUTCDate() - 7);
    if (new Date(`${payload.start_date}T00:00:00.000Z`) < oldest) {
      throw new BadRequestException({
        code: 'LEAVE_TOO_OLD',
        message: 'For older dates, contact your reviewer.',
      });
    }
    const overlap = await this.db
      .select({ id: schema.studentRequests.id, humanCode: schema.studentRequests.humanCode, payload: schema.studentRequests.payload })
      .from(schema.studentRequests)
      .where(
        and(
          eq(schema.studentRequests.institutionId, principal.institutionId),
          eq(schema.studentRequests.studentId, principal.studentId),
          eq(schema.studentRequests.type, 'leave_request'),
          inArray(schema.studentRequests.status, PENDING_STATUSES),
          sql`(${schema.studentRequests.payload}->>'start_date') <= ${payload.end_date}`,
          sql`(${schema.studentRequests.payload}->>'end_date') >= ${payload.start_date}`,
        ),
      )
      .limit(1);
    if (overlap[0]) {
      const existing = overlap[0].payload as Record<string, unknown>;
      throw new ConflictException({
        code: 'LEAVE_OVERLAP',
        message: `You already have a leave request covering ${String(existing.start_date)}–${String(existing.end_date)} (${overlap[0].humanCode}).`,
      });
    }
    await this.assertNoCrossTypeOverlap(principal, payload.start_date, payload.end_date, 'leave_request');
    const [student] = await this.db
      .select({ classId: schema.students.classId })
      .from(schema.students)
      .where(eq(schema.students.id, principal.studentId))
      .limit(1);
    const sessions = student?.classId
      ? await this.db
          .select({
            session_id: schema.attendanceSessions.id,
            date: schema.attendanceSessions.date,
            subject_id: schema.attendanceSessions.subjectId,
            period: schema.attendanceSessions.period,
          })
          .from(schema.attendanceSessions)
          .where(
            and(
              eq(schema.attendanceSessions.institutionId, principal.institutionId),
              eq(schema.attendanceSessions.classId, student.classId),
              sql`${schema.attendanceSessions.date} >= ${payload.start_date}`,
              sql`${schema.attendanceSessions.date} <= ${payload.end_date}`,
            ),
          )
      : [];
    return { ...payload, notify_sessions: sessions };
  }

  private async resolveRouting(principal: InstitutionalStudentPrincipal, resolved: ResolvedRequestType) {
    if ('role' in resolved.routing) return { role: resolved.routing.role, userId: null as string | null };
    const [target] = await this.db
      .select({ institutionUserId: schema.staff.institutionUserId })
      .from(schema.students)
      .innerJoin(schema.classes, eq(schema.classes.id, schema.students.classId))
      .innerJoin(schema.staff, eq(schema.staff.id, schema.classes.classTeacherId))
      .where(
        and(
          eq(schema.students.id, principal.studentId),
          eq(schema.students.institutionId, principal.institutionId),
        ),
      )
      .limit(1);
    if (!target?.institutionUserId) {
      throw new ConflictException({
        code: 'ROUTING_UNAVAILABLE',
        message: 'No reviewer is assigned for this request type. Contact your institution.',
      });
    }
    return { role: 'teacher', userId: null };
  }

  private async normalizeAttachments(
    principal: InstitutionalStudentPrincipal,
    attachments: RequestAttachmentInput[],
  ) {
    if (attachments.length > 5) throw new BadRequestException({ code: 'TOO_MANY_FILES', message: 'Max 5 files, 10 MB each.' });
    const rows = [];
    for (const input of attachments) {
      const row = await this.storage.getOwned(principal, input.storage_object_id);
      if (!ATTACHMENT_MIMES.has(row.mimeType) || row.sizeBytes > 10 * 1024 * 1024) {
        throw new BadRequestException({ code: 'INVALID_ATTACHMENT', message: 'Max 5 files, 10 MB each. Use JPG, PNG, or PDF.' });
      }
      rows.push({
        storage_object_id: row.id,
        filename: row.filename ?? input.filename,
        mime: row.mimeType,
        bytes: row.sizeBytes,
      });
    }
    return rows;
  }

  private async approveWithSideEffect(
    ctx: PortalActionContext,
    row: RequestRow,
    input: RequestApproveInput,
    events: Array<{ type: string; note?: string }>,
    assignedUserId: string | null,
    sideEffect: () => Promise<Record<string, unknown> | void>,
  ) {
    const fulfillmentData = (await sideEffect()) ?? undefined;
    const approved = await this.updateDecisionVersioned(row, input.version, {
      status: 'approved',
      assignedUserId,
      decisionNote: input.note ?? null,
    }, ctx.principal);
    await this.appendEvents(
      approved,
      [...events, { type: 'approved', note: input.note }],
      this.staffActor(ctx.principal),
    );
    await this.writePortalAudit(ctx, approved, 'student_request.approve', row.status, 'approved', input.note);
    const updated = await this.updateVersioned(approved, approved.version, {
      status: 'fulfilled',
      resolvedAt: new Date(),
    });
    const seq = await this.appendEvent(
      updated,
      'fulfilled',
      this.staffActor(ctx.principal),
      input.note ?? null,
      fulfillmentData,
    );
    await this.writePortalAudit(ctx, updated, 'student_request.fulfil', 'approved', 'fulfilled');
    await this.notifications.dispatch({ institutionId: row.institutionId, requestId: row.id, eventSeq: seq });
    const resolved = await this.registry.resolve(row.institutionId, row.type);
    if (resolved.config.producesDocument) {
      if (row.type === 'id_card_reissue') {
        await this.documents.enqueueIdCardReissue(ctx, updated);
      } else {
        await this.documents.enqueue(ctx, updated);
      }
    }
    return this.toViewResolved(updated);
  }

  private async applyLeaveAttendance(_ctx: PortalActionContext, row: RequestRow): Promise<void> {
    const payload = row.payload as unknown as LeaveRequestPayload;
    const policy = await this.policy.resolvePolicyValues(row.institutionId, row.campusId);
    const mark = policy.leaveMark;
    const [institution] = await this.db
      .select({ timezone: schema.institutions.timezone })
      .from(schema.institutions)
      .where(eq(schema.institutions.id, row.institutionId))
      .limit(1);
    const today = institutionNow(institution?.timezone ?? 'UTC').date;
    for (const session of payload.notify_sessions ?? []) {
      const isFuture = session.date > today;
      const provenance = { kind: 'leave_approval' as const, request_id: row.id };
      if (isFuture) {
        const [student] = await this.db
          .select({ classId: schema.students.classId })
          .from(schema.students)
          .where(eq(schema.students.id, requireStudentId(row)))
          .limit(1);
        if (!student?.classId) continue;
        await this.db
          .insert(schema.requestMarksPending)
          .values({
            institutionId: row.institutionId,
            requestId: row.id,
            studentId: requireStudentId(row),
            classId: student.classId,
            subjectId: session.subject_id,
            occurrenceDate: session.date,
            slotId: null,
            targetMark: mark,
          })
          .onConflictDoNothing();
        continue;
      }
      await this.attendance.markSystem(row.institutionId, session.session_id, {
        studentId: requireStudentId(row),
        status: mark,
        remarks: `Leave ${row.humanCode}`,
        provenance,
      });
    }
    await this.enqueueRecompute(row);
  }

  private async applyOdAttendance(_ctx: PortalActionContext, row: RequestRow): Promise<void> {
    const payload = row.payload as unknown as OdRequestPayload;
    const [institution] = await this.db
      .select({ timezone: schema.institutions.timezone })
      .from(schema.institutions)
      .where(eq(schema.institutions.id, row.institutionId))
      .limit(1);
    const today = institutionNow(institution?.timezone ?? 'UTC').date;
    const [student] = await this.db
      .select({ classId: schema.students.classId })
      .from(schema.students)
      .where(eq(schema.students.id, requireStudentId(row)))
      .limit(1);
    if (!student?.classId) return;
    for (const occurrence of payload.sessions_snapshot ?? []) {
      const provenance = { kind: 'od_approval' as const, request_id: row.id };
      if (occurrence.date > today) {
        await this.db
          .insert(schema.requestMarksPending)
          .values({
            institutionId: row.institutionId,
            requestId: row.id,
            studentId: requireStudentId(row),
            classId: student.classId,
            subjectId: occurrence.subject_id,
            occurrenceDate: occurrence.date,
            slotId: occurrence.slot_id,
            targetMark: 'od',
          })
          .onConflictDoNothing();
        continue;
      }
      const [session] = await this.db
        .select()
        .from(schema.attendanceSessions)
        .where(
          and(
            eq(schema.attendanceSessions.institutionId, row.institutionId),
            eq(schema.attendanceSessions.classId, student.classId),
            eq(schema.attendanceSessions.date, occurrence.date),
            occurrence.slot_id
              ? eq(schema.attendanceSessions.slotId, occurrence.slot_id)
              : isNull(schema.attendanceSessions.slotId),
          ),
        )
        .limit(1);
      if (!session) continue;
      await this.attendance.markSystem(row.institutionId, session.id, {
        studentId: requireStudentId(row),
        status: 'od',
        remarks: `OD ${row.humanCode}`,
        provenance,
      });
    }
    await this.enqueueRecompute(row);
  }

  private async applyAttendanceCorrection(
    _ctx: PortalActionContext,
    row: RequestRow,
    input: RequestApproveInput,
  ): Promise<Record<string, unknown>> {
    const payload = row.payload as unknown as AttendanceCorrectionPayload;
    const toggled = new Set(input.accepted_session_ids ?? payload.record_refs.map((ref) => ref.session_id));
    const flipped: string[] = [];
    const kept: string[] = [];
    for (const ref of payload.record_refs) {
      if (!toggled.has(ref.session_id)) {
        kept.push(ref.session_id);
        continue;
      }
      await this.attendance.markSystem(row.institutionId, ref.session_id, {
        studentId: requireStudentId(row),
        status: 'present',
        remarks: input.note ?? `Correction ${row.humanCode}`,
        provenance: { kind: 'correction_approval', request_id: row.id },
      });
      flipped.push(ref.session_id);
    }
    await this.enqueueRecompute(row);
    return { flipped, kept };
  }

  private async maybeRefundRevaluationFee(ctx: PortalActionContext, row: RequestRow) {
    if (row.type !== 'revaluation' || !row.paymentRequestId) return;
    const settings = await this.resultsSettings.get(ctx);
    if (!settings.revaluationRefundOnReject) return;
    const [invoice] = await this.db
      .select()
      .from(schema.feeInvoices)
      .where(
        and(
          eq(schema.feeInvoices.id, row.paymentRequestId),
          eq(schema.feeInvoices.institutionId, row.institutionId),
          eq(schema.feeInvoices.studentId, requireStudentId(row)),
        ),
      )
      .limit(1);
    if (!invoice || invoice.amountPaid <= 0) return;
    const [payment] = await this.db
      .select()
      .from(schema.feePayments)
      .where(and(eq(schema.feePayments.invoiceId, invoice.id), sql`${schema.feePayments.amount} > 0`))
      .orderBy(desc(schema.feePayments.paidDate))
      .limit(1);
    if (!payment?.receiptId) return;
    await this.feeLedger.refundReceipt(
      ctx,
      payment.receiptId,
      invoice.amountPaid,
      `Revaluation ${row.humanCode} rejected`,
      `revaluation-reject:${row.id}`,
    );
  }

  private async applyRevaluation(
    ctx: PortalActionContext,
    row: RequestRow,
    input: RequestApproveInput,
  ): Promise<Record<string, unknown>> {
    const form = revaluationApproveFormSchema.parse({
      new_score: input.new_score,
      note: input.note,
      ...(input.form ?? {}),
    });
    const payload = row.payload as { grade_entry_id: string };
    const [entry] = await this.db
      .select()
      .from(schema.gradeEntries)
      .where(
        and(
          eq(schema.gradeEntries.id, payload.grade_entry_id),
          eq(schema.gradeEntries.institutionId, row.institutionId),
          eq(schema.gradeEntries.studentId, requireStudentId(row)),
        ),
      )
      .limit(1);
    if (!entry) {
      throw new NotFoundException({ code: 'GRADE_ENTRY_NOT_FOUND', message: 'Grade entry not found.' });
    }
    if (!Number.isInteger(form.new_score)) {
      throw new BadRequestException({ code: 'INVALID_SCORE', message: 'Score must be a whole number.' });
    }
    if (form.new_score < 0 || form.new_score > entry.maxMarks) {
      throw new BadRequestException({
        code: 'SCORE_OUT_OF_RANGE',
        message: `Score must be between 0 and ${entry.maxMarks}.`,
      });
    }

    const revisionId = await this.db.transaction(async (tx) => {
      const [revision] = await tx
        .insert(schema.markRevisions)
        .values({
          institutionId: row.institutionId,
          studentId: requireStudentId(row),
          gradeEntryId: entry.id,
          oldScore: entry.marksObtained,
          newScore: form.new_score,
          reasonKind: 'revaluation',
          note: form.note,
          requestId: row.id,
          revisedBy: ctx.principal.institutionUserId,
        })
        .returning({ id: schema.markRevisions.id });
      await tx
        .update(schema.gradeEntries)
        .set({ marksObtained: form.new_score, updatedAt: new Date(), updatedBy: ctx.principal.institutionUserId })
        .where(eq(schema.gradeEntries.id, entry.id));
      return revision!.id;
    });

    if (entry.termId) {
      await this.jobs.enqueue(
        'reports',
        RESULTS_RECOMPUTE_TERM_JOB,
        {
          institutionId: row.institutionId,
          studentId: row.studentId,
          termId: entry.termId,
          revisionId,
        },
        { jobId: `results:${row.studentId}:${entry.termId}` },
      );
    }

    return { grade_entry_id: entry.id, old_score: entry.marksObtained, new_score: form.new_score };
  }

  private async applyHostelOutpass(_ctx: PortalActionContext, row: RequestRow): Promise<void> {
    const payload = row.payload as {
      leave_at: string;
      expected_return_at: string;
      destination: string;
      reason: string;
    };
    const [student] = await this.db
      .select({ firstName: schema.students.firstName, lastName: schema.students.lastName })
      .from(schema.students)
      .where(eq(schema.students.id, requireStudentId(row)))
      .limit(1);
    await this.db.insert(schema.gatePasses).values({
      institutionId: row.institutionId,
      campusId: row.campusId,
      holderName: [student?.firstName, student?.lastName].filter(Boolean).join(' ') || 'Student',
      kind: 'student',
      reason: `${payload.reason}: ${payload.destination}`,
      issuedAt: new Date(payload.leave_at),
      expiresAt: new Date(payload.expected_return_at),
      expectedReturnAt: new Date(payload.expected_return_at),
      status: 'active',
      requestId: row.id,
      holderStudentId: row.studentId,
      direction: 'outgoing',
    });
  }

  private async applyLibraryRenewal(_ctx: PortalActionContext, row: RequestRow): Promise<void> {
    const payload = row.payload as { loan_id: string; renewal_days: number };
    const [loan] = await this.db
      .select()
      .from(schema.libraryLoans)
      .where(
        and(
          eq(schema.libraryLoans.id, payload.loan_id),
          eq(schema.libraryLoans.studentId, requireStudentId(row)),
          eq(schema.libraryLoans.status, 'issued'),
        ),
      )
      .limit(1);
    if (!loan?.dueDate) return;
    const base = new Date(`${loan.dueDate}T00:00:00.000Z`);
    base.setUTCDate(base.getUTCDate() + (payload.renewal_days ?? 7));
    const next = base.toISOString().slice(0, 10);
    await this.db
      .update(schema.libraryLoans)
      .set({ dueDate: next, updatedAt: new Date(), notes: `Renewed via ${row.humanCode}` })
      .where(eq(schema.libraryLoans.id, loan.id));
  }

  private async applyTransportRenewal(_ctx: PortalActionContext, row: RequestRow): Promise<void> {
    const payload = row.payload as { assignment_id: string; term_months: number };
    const [assignment] = await this.db
      .select()
      .from(schema.transportAssignments)
      .where(
        and(
          eq(schema.transportAssignments.id, payload.assignment_id),
          eq(schema.transportAssignments.studentId, requireStudentId(row)),
          eq(schema.transportAssignments.status, 'active'),
        ),
      )
      .limit(1);
    if (!assignment) return;
    const renewedUntil = new Date();
    renewedUntil.setUTCMonth(renewedUntil.getUTCMonth() + (payload.term_months ?? 12));
    await this.db
      .update(schema.transportAssignments)
      .set({
        notes: `Renewed via ${row.humanCode} until ${renewedUntil.toISOString().slice(0, 10)}`,
        updatedAt: new Date(),
      })
      .where(eq(schema.transportAssignments.id, assignment.id));
  }

  private async applyIdCardReissue(_ctx: PortalActionContext, row: RequestRow): Promise<void> {
    await this.db
      .update(schema.studentIdCards)
      .set({ status: 'revoked', revokedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(schema.studentIdCards.studentId, requireStudentId(row)),
          eq(schema.studentIdCards.status, 'active'),
        ),
      );
    await this.db.insert(schema.studentIdCards).values({
      institutionId: row.institutionId,
      campusId: row.campusId,
      studentId: requireStudentId(row),
      status: 'pending_issue',
      tokenVersion: 1,
    });
  }

  private async applyClubJoin(_ctx: PortalActionContext, row: RequestRow): Promise<void> {
    const payload = row.payload as { club_id: string };
    await this.db
      .insert(schema.clubMemberships)
      .values({ clubId: payload.club_id, studentId: row.studentId!, status: 'active', joinedAt: new Date() })
      .onConflictDoUpdate({
        target: [schema.clubMemberships.clubId, schema.clubMemberships.studentId],
        set: { status: 'active', joinedAt: new Date() },
      });
  }

  private async applyHealthProfileUpdate(_ctx: PortalActionContext, row: RequestRow): Promise<void> {
    const payload = row.payload as {
      blood_group?: string;
      allergies?: string;
      conditions?: string;
      emergency_contact?: string;
    };
    const allergies = payload.allergies
      ? payload.allergies.split(',').map((s) => s.trim()).filter(Boolean)
      : [];
    const chronic = payload.conditions
      ? payload.conditions.split(',').map((s) => s.trim()).filter(Boolean)
      : [];
    const [last] = await this.db
      .select({ revision: schema.parentHealthProfiles.revision })
      .from(schema.parentHealthProfiles)
      .where(eq(schema.parentHealthProfiles.studentId, row.studentId!))
      .orderBy(desc(schema.parentHealthProfiles.revision))
      .limit(1);
    await this.db.insert(schema.parentHealthProfiles).values({
      institutionId: row.institutionId,
      campusId: row.campusId,
      studentId: row.studentId!,
      bloodGroup: payload.blood_group ?? null,
      allergies,
      chronicConditions: chronic,
      emergencyContacts: payload.emergency_contact
        ? [{ name: 'Emergency', relationship: 'contact', phone: payload.emergency_contact }]
        : [],
      revision: (last?.revision ?? 0) + 1,
      lastVerifiedBy: null,
      lastVerifiedAt: new Date(),
    });
  }

  private async enqueueRecompute(row: RequestRow) {
    await this.jobs.enqueue(
      'notifications',
      ATTENDANCE_RECOMPUTE_JOB,
      { institutionId: row.institutionId, studentId: row.studentId, subjectId: null, rebuild: false },
      { jobId: `attendance:${row.studentId}:overall:recompute`, delay: 30_000 },
    );
  }

  private async prepareOd(principal: InstitutionalStudentPrincipal, payload: OdRequestPayload) {
    await this.assertNoCrossTypeOverlap(principal, payload.start_date, payload.end_date, 'od_request');
    return { ...payload, sessions_snapshot: payload.sessions_snapshot ?? [] };
  }

  private async validateCorrection(
    principal: InstitutionalStudentPrincipal,
    payload: AttendanceCorrectionPayload,
  ) {
    for (const ref of payload.record_refs) {
      const [record] = await this.db
        .select({ status: schema.attendanceRecords.status })
        .from(schema.attendanceRecords)
        .where(
          and(
            eq(schema.attendanceRecords.sessionId, ref.session_id),
            eq(schema.attendanceRecords.studentId, principal.studentId),
          ),
        )
        .limit(1);
      if (!record || !['absent', 'late'].includes(record.status)) {
        throw new BadRequestException({ code: 'CORRECTION_INELIGIBLE', message: 'Only marked absences can be disputed.' });
      }
    }
    const sessionIds = payload.record_refs.map((ref) => ref.session_id);
    const open = await this.db
      .select({ humanCode: schema.studentRequests.humanCode, payload: schema.studentRequests.payload })
      .from(schema.studentRequests)
      .where(
        and(
          eq(schema.studentRequests.institutionId, principal.institutionId),
          eq(schema.studentRequests.studentId, principal.studentId),
          eq(schema.studentRequests.type, 'attendance_correction'),
          inArray(schema.studentRequests.status, PENDING_STATUSES),
        ),
      );
    for (const row of open) {
      const refs = (row.payload as AttendanceCorrectionPayload).record_refs ?? [];
      const overlap = refs.some((ref) => sessionIds.includes(ref.session_id));
      if (overlap) {
        throw new ConflictException({
          code: 'CORRECTION_ALREADY_OPEN',
          message: `You already have an open correction (${row.humanCode}) for one of these sessions.`,
        });
      }
    }
  }

  private async assertNoCrossTypeOverlap(
    principal: InstitutionalStudentPrincipal,
    start: string,
    end: string,
    type: string,
  ) {
    const overlap = await this.db
      .select({ humanCode: schema.studentRequests.humanCode, type: schema.studentRequests.type })
      .from(schema.studentRequests)
      .where(
        and(
          eq(schema.studentRequests.institutionId, principal.institutionId),
          eq(schema.studentRequests.studentId, principal.studentId),
          inArray(schema.studentRequests.status, PENDING_STATUSES),
          sql`(${schema.studentRequests.payload}->>'start_date') <= ${end}`,
          sql`(${schema.studentRequests.payload}->>'end_date') >= ${start}`,
        ),
      )
      .limit(1);
    if (overlap[0] && overlap[0].type !== type) {
      throw new ConflictException({
        code: 'ATTENDANCE_OVERLAP',
        message: `You already have ${overlap[0].humanCode} covering ${start}–${end}.`,
      });
    }
  }

  private async decisionPrelude(row: RequestRow, principal: InstitutionPrincipal) {
    if (row.assignedUserId && row.assignedUserId !== principal.institutionUserId) {
      await this.alreadyClaimed(row.assignedUserId);
    }
    return {
      assignedUserId: row.assignedUserId ?? principal.institutionUserId,
      events: row.assignedUserId ? [] : [{ type: 'claimed' as const }],
    };
  }

  private async appendEvents(
    row: RequestRow,
    events: Array<{ type: string; note?: string | null; data?: Record<string, unknown> }>,
    actor: EventActor,
  ) {
    let seq = await this.lastSeq(row.id);
    for (const event of events) {
      seq += 1;
      await this.db.insert(schema.studentRequestEvents).values(
        this.eventValues(row, seq, event.type, actor, event.note, event.data),
      );
    }
    return seq;
  }

  private async appendEvent(
    row: RequestRow,
    type: string,
    actor: EventActor,
    note?: string | null,
    data?: Record<string, unknown>,
  ) {
    const seq = (await this.lastSeq(row.id)) + 1;
    await this.db.insert(schema.studentRequestEvents).values(this.eventValues(row, seq, type, actor, note, data));
    return seq;
  }

  private eventValues(
    row: RequestRow,
    seq: number,
    type: string,
    actor: EventActor,
    note?: string | null,
    data?: Record<string, unknown>,
  ) {
    return {
      requestId: row.id,
      institutionId: row.institutionId,
      seq,
      eventType: type,
      actorKind: actor.kind,
      actorUserId: actor.userId ?? null,
      actorRole: actor.role ?? null,
      note: note ?? null,
      data: data ?? {},
    };
  }

  private async lastSeq(requestId: string): Promise<number> {
    const [row] = await this.db
      .select({ value: sql<number>`coalesce(max(${schema.studentRequestEvents.seq}), 0)` })
      .from(schema.studentRequestEvents)
      .where(eq(schema.studentRequestEvents.requestId, requestId));
    return Number(row?.value ?? 0);
  }

  private async updateVersioned(row: RequestRow, version: number, patch: Record<string, unknown>) {
    const [updated] = await this.db
      .update(schema.studentRequests)
      .set({ ...patch, version: version + 1, updatedAt: new Date() })
      .where(
        and(
          eq(schema.studentRequests.id, row.id),
          eq(schema.studentRequests.institutionId, row.institutionId),
          eq(schema.studentRequests.version, version),
        ),
      )
      .returning();
    if (!updated) throw this.versionConflict();
    return updated;
  }

  private async updateDecisionVersioned(
    row: RequestRow,
    version: number,
    patch: Record<string, unknown>,
    principal: InstitutionPrincipal,
  ) {
    try {
      return await this.updateVersioned(row, version, patch);
    } catch (error) {
      const [fresh] = await this.db
        .select({ assignedUserId: schema.studentRequests.assignedUserId })
        .from(schema.studentRequests)
        .where(
          and(
            eq(schema.studentRequests.id, row.id),
            eq(schema.studentRequests.institutionId, row.institutionId),
          ),
        )
        .limit(1);
      if (fresh?.assignedUserId && fresh.assignedUserId !== principal.institutionUserId) {
        await this.alreadyClaimed(fresh.assignedUserId);
      }
      throw error;
    }
  }

  private async requireStudentRequest(principal: InstitutionalStudentPrincipal, id: string) {
    const [row] = await this.db
      .select()
      .from(schema.studentRequests)
      .where(
        and(eq(schema.studentRequests.id, id), eq(schema.studentRequests.institutionId, principal.institutionId)),
      )
      .limit(1);
    if (!row) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Request not found.' });
    if (row.studentId === principal.studentId) return row;
    const [owned] = await this.db
      .select()
      .from(schema.studentSensitiveReportOwnership)
      .where(
        and(
          eq(schema.studentSensitiveReportOwnership.requestId, id),
          eq(schema.studentSensitiveReportOwnership.studentId, principal.studentId),
        ),
      )
      .limit(1);
    if (!owned) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Request not found.' });
    return row;
  }

  private async requirePortalRequest(ctx: PortalActionContext, id: string) {
    const [row] = await this.db
      .select()
      .from(schema.studentRequests)
      .where(
        and(
          eq(schema.studentRequests.id, id),
          eq(schema.studentRequests.institutionId, ctx.principal.institutionId),
        ),
      )
      .limit(1);
    if (!row) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Request not found.' });
    const scope = resolveScopeFilter(ctx.principal, ctx.scope);
    if (scope.campusIds && !scope.campusIds.includes(row.campusId)) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Request not found.' });
    }
    let entitled = row.assignedUserId === ctx.principal.institutionUserId;
    if (!entitled && row.type === 'leave_request' && row.assignedRole === 'teacher') {
      const [teacher] = await this.db
        .select({ userId: schema.staff.institutionUserId })
        .from(schema.students)
        .leftJoin(schema.classes, eq(schema.classes.id, schema.students.classId))
        .leftJoin(schema.staff, eq(schema.staff.id, schema.classes.classTeacherId))
        .where(eq(schema.students.id, requireStudentId(row)))
        .limit(1);
      entitled = teacher?.userId === ctx.principal.institutionUserId;
    } else if (!entitled) {
      entitled = ctx.principal.roleKeys.includes(row.assignedRole);
    }
    if (!entitled) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Request not found.' });
    return row;
  }

  private addCampusFilter(conds: unknown[], column: typeof schema.studentRequests.campusId, scope: ScopeFilter) {
    if (scope.campusIds) (conds as ReturnType<typeof eq>[]).push(inArray(column, scope.campusIds));
  }

  private assertTransition(row: RequestRow, from: string[], to: string) {
    if (!from.includes(row.status)) this.illegal(row, to);
    assertRequestTransition(row.status, to);
  }

  private illegal(row: RequestRow, to: string): never {
    throw new ConflictException({
      code: 'ILLEGAL_TRANSITION',
      message: `Cannot transition this request from ${row.status} to ${to}.`,
      currentStatus: row.status,
    });
  }

  private versionConflict() {
    return new ConflictException({
      code: 'VERSION_CONFLICT',
      message: 'This request changed since you loaded it. Reload and try again.',
    });
  }

  private async alreadyClaimed(userId: string): Promise<never> {
    const [user] = await this.db
      .select({ name: schema.institutionUsers.fullName })
      .from(schema.institutionUsers)
      .where(eq(schema.institutionUsers.id, userId))
      .limit(1);
    throw new ConflictException({
      code: 'ALREADY_CLAIMED',
      message: `Already claimed by ${user?.name ?? 'another reviewer'}.`,
      claimerName: user?.name ?? null,
    });
  }

  private async requireInstitutionUser(institutionId: string, userId: string) {
    const [user] = await this.db
      .select({ id: schema.institutionUsers.id })
      .from(schema.institutionUsers)
      .where(
        and(
          eq(schema.institutionUsers.id, userId),
          eq(schema.institutionUsers.institutionId, institutionId),
        ),
      )
      .limit(1);
    if (!user) throw new BadRequestException({ code: 'INVALID_REFERENCE', message: 'Unknown institution user.' });
  }

  private studentActor(principal: InstitutionalStudentPrincipal): EventActor {
    return { kind: 'student', userId: principal.institutionUserId, role: 'student', name: principal.fullName };
  }

  private staffActor(principal: InstitutionPrincipal): EventActor {
    return { kind: 'staff', userId: principal.institutionUserId, role: principal.roleKeys[0], name: principal.fullName };
  }

  private async toViewResolved(row: RequestRow) {
    return this.toView(row, await this.registry.resolve(row.institutionId, row.type));
  }

  private toView(row: RequestRow, type: ResolvedRequestType) {
    return {
      ...row,
      displayStatus:
        row.type === 'document_request' && row.status === 'approved'
          ? 'in_review'
          : row.status,
      typeLabel: type.label,
      category: type.config.category,
      summary: type.config.summaryLine(row.payload as never),
      producesDocument: type.config.producesDocument,
      canCancel: canStudentCancel(
        row.status,
        row.assignedUserId,
        type.config.cancellableStatuses,
      ),
      slaBreached: Boolean(row.slaDueAt && row.slaDueAt.getTime() < Date.now() && !TERMINAL.has(row.status as RequestStatus)),
    };
  }

  private async contextSnapshot(row: RequestRow) {
    const [student] = await this.db
      .select({
        id: schema.students.id,
        name: sql<string>`concat_ws(' ', ${schema.students.firstName}, ${schema.students.middleName}, ${schema.students.lastName})`,
        admissionNo: schema.students.admissionNo,
        className: schema.classes.name,
        gradeName: schema.gradeLevels.name,
        programmeName: schema.departments.name,
      })
      .from(schema.students)
      .leftJoin(schema.classes, eq(schema.classes.id, schema.students.classId))
      .leftJoin(schema.gradeLevels, eq(schema.gradeLevels.id, schema.students.gradeLevelId))
      .leftJoin(
        schema.departmentGradeLevels,
        eq(schema.departmentGradeLevels.id, schema.classes.programmeLevelId),
      )
      .leftJoin(
        schema.departments,
        eq(schema.departments.id, schema.departmentGradeLevels.departmentId),
      )
      .where(eq(schema.students.id, requireStudentId(row)))
      .limit(1);
    if (row.type === 'leave_request') {
      const payload = row.payload as unknown as LeaveRequestPayload;
      const subjectIds = [...new Set((payload.notify_sessions ?? []).map((session) => session.subject_id).filter((id): id is string => Boolean(id)))];
      const attendance = subjectIds.length
        ? await this.db
            .select({
              subjectId: schema.attendanceSessions.subjectId,
              subjectName: schema.subjects.name,
              total: sql<number>`count(${schema.attendanceRecords.id}) filter (where ${schema.attendanceRecords.status} <> 'excused')`,
              attended: sql<number>`count(${schema.attendanceRecords.id}) filter (where ${schema.attendanceRecords.status} in ('present', 'late'))`,
            })
            .from(schema.attendanceRecords)
            .innerJoin(
              schema.attendanceSessions,
              eq(schema.attendanceSessions.id, schema.attendanceRecords.sessionId),
            )
            .leftJoin(schema.subjects, eq(schema.subjects.id, schema.attendanceSessions.subjectId))
            .where(
              and(
                eq(schema.attendanceRecords.studentId, requireStudentId(row)),
                inArray(schema.attendanceSessions.subjectId, subjectIds),
              ),
            )
            .groupBy(schema.attendanceSessions.subjectId, schema.subjects.name)
        : [];
      return {
        student,
        sessions: payload.notify_sessions ?? [],
        sessionCount: payload.notify_sessions?.length ?? 0,
        attendance: attendance.map((item) => ({
          subjectId: item.subjectId,
          subjectName: item.subjectName,
          percentage: Number(item.total) > 0 ? Math.round((Number(item.attended) / Number(item.total)) * 100) : null,
        })),
      };
    }
    if (row.type === 'od_request') {
      const payload = row.payload as unknown as OdRequestPayload;
      const sessions = payload.sessions_snapshot ?? [];
      const subjectIds = [...new Set(sessions.map((session) => session.subject_id).filter((id): id is string => Boolean(id)))];
      const attendance = subjectIds.length
        ? await this.db
            .select({
              subjectId: schema.attendanceSessions.subjectId,
              subjectName: schema.subjects.name,
              total: sql<number>`count(${schema.attendanceRecords.id}) filter (where ${schema.attendanceRecords.status} <> 'excused')`,
              attended: sql<number>`count(${schema.attendanceRecords.id}) filter (where ${schema.attendanceRecords.status} in ('present', 'late'))`,
            })
            .from(schema.attendanceRecords)
            .innerJoin(schema.attendanceSessions, eq(schema.attendanceSessions.id, schema.attendanceRecords.sessionId))
            .leftJoin(schema.subjects, eq(schema.subjects.id, schema.attendanceSessions.subjectId))
            .where(and(eq(schema.attendanceRecords.studentId, requireStudentId(row)), inArray(schema.attendanceSessions.subjectId, subjectIds)))
            .groupBy(schema.attendanceSessions.subjectId, schema.subjects.name)
        : [];
      return {
        student,
        sessions,
        sessionCount: sessions.length,
        attendance: attendance.map((item) => ({
          subjectId: item.subjectId,
          subjectName: item.subjectName,
          percentage: Number(item.total) > 0 ? Math.round((Number(item.attended) / Number(item.total)) * 100) : null,
        })),
        eventName: payload.event_name,
        organizer: payload.organizer,
        reason: payload.reason,
      };
    }
    if (row.type === 'attendance_correction') {
      const payload = row.payload as unknown as AttendanceCorrectionPayload;
      const sessionIds = payload.record_refs.map((ref) => ref.session_id);
      const records = sessionIds.length
        ? await this.db
            .select({
              sessionId: schema.attendanceSessions.id,
              date: schema.attendanceSessions.date,
              period: schema.attendanceSessions.period,
              subjectName: schema.subjects.name,
              status: schema.attendanceRecords.status,
            })
            .from(schema.attendanceSessions)
            .leftJoin(schema.subjects, eq(schema.subjects.id, schema.attendanceSessions.subjectId))
            .leftJoin(
              schema.attendanceRecords,
              and(
                eq(schema.attendanceRecords.sessionId, schema.attendanceSessions.id),
                eq(schema.attendanceRecords.studentId, requireStudentId(row)),
              ),
            )
            .where(inArray(schema.attendanceSessions.id, sessionIds))
        : [];
      return {
        student,
        sessions: records.map((record) => ({
          session_id: record.sessionId,
          date: record.date,
          period: record.period,
          subject_name: record.subjectName,
          current_status: record.status,
        })),
        sessionCount: records.length,
        claim: payload.claim,
      };
    }
    const payload = row.payload as Record<string, unknown>;
    const prior = await this.db
      .select({ id: schema.studentDocumentVault.id, issuedAt: schema.studentDocumentVault.issuedAt })
      .from(schema.studentDocumentVault)
      .where(
        and(
          eq(schema.studentDocumentVault.studentId, requireStudentId(row)),
          eq(schema.studentDocumentVault.docType, String(payload.doc_type)),
          gte(schema.studentDocumentVault.issuedAt, new Date(Date.UTC(new Date().getUTCFullYear(), 0, 1))),
        ),
      );
    const feeDues = await this.feeDuesSnapshot(row.institutionId, requireStudentId(row));
    return { student, priorDocuments: prior, feeDues };
  }

  private async feeDuesSnapshot(institutionId: string, studentId: string) {
    try {
      const [config] = await this.db
        .select({ duesBlock: schema.institutionFeeConfig.duesBlock })
        .from(schema.institutionFeeConfig)
        .where(eq(schema.institutionFeeConfig.institutionId, institutionId))
        .limit(1);
      const [balance] = await this.db
        .select({
          overdueMinor: sql<number>`coalesce(sum(greatest(0, ${schema.feeInvoices.amount} - ${schema.feeInvoices.amountPaid})) filter (where ${schema.feeInvoices.dueDate} < current_date and ${schema.feeInvoices.status} in ('pending','partial','overdue')), 0)::int`,
        })
        .from(schema.feeInvoices)
        .where(
          and(
            eq(schema.feeInvoices.institutionId, institutionId),
            eq(schema.feeInvoices.studentId, studentId),
            sql`${schema.feeInvoices.status} <> 'cancelled'`,
          ),
        );
      const overdueMinor = Number(balance?.overdueMinor ?? 0);
      const raw = (config?.duesBlock ?? {}) as Record<string, unknown>;
      const triggered =
        raw.threshold_mode === 'amount_gte'
          ? overdueMinor >= Number(raw.threshold_minor ?? 0)
          : overdueMinor > 0;
      return {
        overdueMinor,
        consequences: {
          hallTicket: triggered && raw.hall_ticket === true,
          result: triggered && raw.result === true,
          tc: triggered && raw.tc === true,
        },
      };
    } catch {
      return null;
    }
  }

  private async writeStudentAudit(
    ctx: StudentRequestContext,
    row: RequestRow,
    action: string,
    previousStatus: string | null,
    status: string,
  ) {
    await this.audit.logAudit({
      actorType: ActorType.InstitutionUser,
      actorId: ctx.principal.institutionUserId,
      actorName: ctx.principal.fullName,
      actorRole: 'student',
      institutionId: ctx.principal.institutionId,
      campusId: ctx.principal.campusId ?? undefined,
      action,
      module: 'request-engine',
      entityType: 'student_request',
      entityId: row.id,
      previousState: previousStatus ? { status: previousStatus } : undefined,
      newState: { status },
      ip: ctx.request.ip,
      userAgent: ctx.request.userAgent,
      requestId: ctx.request.requestId,
      correlationId: ctx.request.correlationId,
      apiEndpoint: ctx.request.apiEndpoint,
    });
  }

  private async writePortalAudit(
    ctx: PortalActionContext,
    row: RequestRow,
    action: string,
    previousStatus: string,
    status: string,
    reason?: string | null,
  ) {
    await this.audit.logAudit({
      ...basePortalAudit(ctx),
      actorType: ActorType.InstitutionUser,
      action,
      module: 'request-engine',
      entityType: 'student_request',
      entityId: row.id,
      campusId: row.campusId,
      previousState: { status: previousStatus },
      newState: { status },
      reason: reason ?? undefined,
    });
  }
}

function workingDaysElapsed(start: Date, end: Date, holidays: ReadonlySet<string> = new Set()): number {
  const cursor = new Date(start);
  cursor.setUTCHours(0, 0, 0, 0);
  const finish = new Date(end);
  finish.setUTCHours(0, 0, 0, 0);
  let days = 0;
  while (cursor < finish) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    if (cursor.getUTCDay() !== 0 && !holidays.has(cursor.toISOString().slice(0, 10))) days += 1;
  }
  return days;
}
