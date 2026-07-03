import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { eq, schema, type Database } from '@edrion/database';
import type { AuditWriter, AuditEventInput } from '@edrion/audit';
import type {
  DecideRequestInput,
  FulfilDocumentRequestInput,
  PublishNoticeInput,
  RecordMedicalIncidentInput,
  ReviewAbsenceNoteInput,
  StaffRecognitionInput,
  StaffReplyInput,
} from '@edrion/schemas';
import { AUDIT_WRITER, DATABASE } from '../../common/tokens';
import { basePortalAudit, type PortalActionContext } from '../portal/portal-action-context';
import { ParentNotifyService } from './parent-notify.service';

const MODULE = 'parent-staff';

/**
 * Institution-side counterparts of the guardian-facing features: review queues + creators that close
 * the loop (and fan out notifications). Gated by the parent_comm.* / students.* / frontdesk.* keys.
 */
@Injectable()
export class ParentStaffService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(AUDIT_WRITER) private readonly audit: AuditWriter,
    private readonly notify: ParentNotifyService,
  ) {}

  async reviewAbsenceNote(ctx: PortalActionContext, noteId: string, input: ReviewAbsenceNoteInput) {
    const [note] = await this.db.select().from(schema.parentAbsenceNotes).where(eq(schema.parentAbsenceNotes.id, noteId)).limit(1);
    if (!note) throw new NotFoundException({ code: 'NOTE_NOT_FOUND', message: 'Not found.' });
    await this.db
      .update(schema.parentAbsenceNotes)
      .set({ status: input.decision, reviewedBy: ctx.principal.institutionUserId, reviewedAt: new Date(), reviewNote: input.reviewNote ?? null })
      .where(eq(schema.parentAbsenceNotes.id, noteId));
    // Acknowledging marks the covered absence "explained" (parent reads derive it from acknowledged notes).
    await this.notify.emit(note.institutionId, [note.guardianUserId], { type: 'absence_note.reviewed', title: `Absence note ${input.decision}`, studentId: note.studentId, deepLink: `/child/${note.studentId}/attendance`, sourceEntity: `parent_absence_notes:${noteId}` });
    await this.write(ctx, 'parent_staff.absence_note.review', noteId, { newState: { decision: input.decision } });
    return { ok: true };
  }

  async verifyPickup(ctx: PortalActionContext, pickupId: string) {
    const [row] = await this.db.select().from(schema.pickupAuthorizations).where(eq(schema.pickupAuthorizations.id, pickupId)).limit(1);
    if (!row) throw new NotFoundException({ code: 'PICKUP_NOT_FOUND', message: 'Not found.' });
    await this.db
      .update(schema.pickupAuthorizations)
      .set({ status: 'active', verifiedBy: ctx.principal.institutionUserId, verifiedAt: new Date(), version: row.version + 1 })
      .where(eq(schema.pickupAuthorizations.id, pickupId));
    await this.notify.emit(row.institutionId, [row.guardianUserId], { type: 'pickup.verified', title: `Pickup authorization verified: ${row.personName}`, studentId: row.studentId, deepLink: `/child/${row.studentId}/pickup`, sourceEntity: `pickup_authorizations:${pickupId}` });
    await this.write(ctx, 'parent_staff.pickup.verify', pickupId, { newState: { status: 'active' } });
    return { ok: true };
  }

  async decideEarlyLeave(ctx: PortalActionContext, id: string, input: DecideRequestInput) {
    const [row] = await this.db.select().from(schema.earlyLeaveRequests).where(eq(schema.earlyLeaveRequests.id, id)).limit(1);
    if (!row) throw new NotFoundException({ code: 'REQUEST_NOT_FOUND', message: 'Not found.' });
    const status = input.decision === 'approve' ? 'approved' : 'denied';
    await this.db.update(schema.earlyLeaveRequests).set({ status, decidedBy: ctx.principal.institutionUserId, decidedAt: new Date(), decisionNote: input.note ?? null }).where(eq(schema.earlyLeaveRequests.id, id));
    if (input.decision === 'approve') {
      // Approval records a gate exit event (drives the "ward exited campus" alert).
      await this.db.insert(schema.gateExitEvents).values({ institutionId: row.institutionId, campusId: row.campusId, studentId: row.studentId, type: 'early_leave', occurredAt: new Date(), recordedBy: ctx.principal.institutionUserId });
    }
    await this.notify.emit(row.institutionId, [row.guardianUserId], { type: 'early_leave.decided', title: `Early-leave request ${status}`, studentId: row.studentId, deepLink: `/child/${row.studentId}/pickup`, sourceEntity: `early_leave_requests:${id}` });
    await this.write(ctx, 'parent_staff.early_leave.decide', id, { newState: { status } });
    return { ok: true, status };
  }

  async recordMedicalIncident(ctx: PortalActionContext, input: RecordMedicalIncidentInput) {
    const [row] = await this.db
      .insert(schema.medicalIncidents)
      .values({ institutionId: ctx.principal.institutionId, studentId: input.studentId, title: input.title, description: input.description ?? null, severity: input.severity, location: input.location ?? null, actionTaken: input.actionTaken ?? null, occurredAt: new Date(), status: 'open' })
      .returning();
    // Immediate: medical incidents always notify guardians (M6 makes this all-channels, quiet-hours-exempt).
    const n = await this.notify.emitToStudentGuardians(ctx.principal.institutionId, input.studentId, { type: 'medical_incident', title: `Health room: ${input.title}`, body: input.actionTaken ?? null, deepLink: `/child/${input.studentId}/health`, priority: 'immediate', sourceEntity: `medical_incidents:${row!.id}` });
    await this.write(ctx, 'parent_staff.medical_incident.record', row!.id, { newState: { studentId: input.studentId, severity: input.severity, notified: n } });
    return { id: row!.id, notified: n };
  }

  async staffReply(ctx: PortalActionContext, threadId: string, input: StaffReplyInput) {
    const [thread] = await this.db.select().from(schema.parentMessageThreads).where(eq(schema.parentMessageThreads.id, threadId)).limit(1);
    if (!thread) throw new NotFoundException({ code: 'THREAD_NOT_FOUND', message: 'Not found.' });
    const [msg] = await this.db.insert(schema.parentMessages).values({ institutionId: thread.institutionId, threadId, senderType: 'staff', senderId: ctx.principal.institutionUserId, body: input.body }).returning();
    await this.db.update(schema.parentMessageThreads).set({ status: input.closeThread ? 'closed' : 'answered', lastMessageAt: new Date() }).where(eq(schema.parentMessageThreads.id, threadId));
    await this.notify.emit(thread.institutionId, [thread.openedByGuardianId], { type: 'message.reply', title: `Reply: ${thread.subject}`, studentId: thread.studentId, deepLink: `/inbox/messages/${threadId}`, sourceEntity: `parent_message_threads:${threadId}` });
    await this.write(ctx, 'parent_staff.message.reply', msg!.id, { newState: { threadId } });
    return msg;
  }

  async fulfilDocumentRequest(ctx: PortalActionContext, requestId: string, input: FulfilDocumentRequestInput) {
    const [req] = await this.db.select().from(schema.documentRequests).where(eq(schema.documentRequests.id, requestId)).limit(1);
    if (!req) throw new NotFoundException({ code: 'REQUEST_NOT_FOUND', message: 'Not found.' });
    const [doc] = await this.db
      .insert(schema.studentDocuments)
      .values({ institutionId: req.institutionId, campusId: req.campusId, studentId: req.studentId, type: req.type === 'custom' ? 'other' : req.type, title: input.title, fileRef: input.fileRef, contentType: input.contentType, issuedAt: new Date(), published: true, issuedBy: ctx.principal.institutionUserId })
      .returning();
    await this.db.update(schema.documentRequests).set({ status: 'ready', fulfilledDocumentId: doc!.id, decidedBy: ctx.principal.institutionUserId, decidedAt: new Date() }).where(eq(schema.documentRequests.id, requestId));
    await this.notify.emit(req.institutionId, [req.guardianUserId], { type: 'document.ready', title: `Document ready: ${input.title}`, studentId: req.studentId, deepLink: `/child/${req.studentId}/documents`, sourceEntity: `student_documents:${doc!.id}` });
    await this.write(ctx, 'parent_staff.document_request.fulfil', requestId, { newState: { documentId: doc!.id } });
    return { documentId: doc!.id };
  }

  async createRecognition(ctx: PortalActionContext, input: StaffRecognitionInput) {
    const [row] = await this.db
      .insert(schema.studentRecognitions)
      .values({ institutionId: ctx.principal.institutionId, studentId: input.studentId, type: input.type, title: input.title, description: input.description ?? null, awardedAt: new Date(), awardedBy: ctx.principal.institutionUserId })
      .returning();
    await this.notify.emitToStudentGuardians(ctx.principal.institutionId, input.studentId, { type: 'recognition', title: `🎉 ${input.title}`, deepLink: `/child/${input.studentId}/behavior`, priority: 'digest', sourceEntity: `student_recognitions:${row!.id}` });
    await this.write(ctx, 'parent_staff.recognition.create', row!.id, { newState: { studentId: input.studentId, title: input.title } });
    return row;
  }

  async publishNotice(ctx: PortalActionContext, input: PublishNoticeInput) {
    const [row] = await this.db
      .insert(schema.parentNotices)
      .values({ institutionId: ctx.principal.institutionId, title: input.title, body: input.body, priority: input.priority, requiresAcknowledgement: input.requiresAcknowledgement, publishedAt: new Date() })
      .returning();
    await this.write(ctx, 'parent_staff.notice.publish', row!.id, { newState: { title: input.title } });
    return row;
  }

  async decideProfileChange(ctx: PortalActionContext, id: string, input: DecideRequestInput) {
    const [req] = await this.db.select().from(schema.profileChangeRequests).where(eq(schema.profileChangeRequests.id, id)).limit(1);
    if (!req) throw new NotFoundException({ code: 'REQUEST_NOT_FOUND', message: 'Not found.' });
    if (req.status !== 'submitted') throw new BadRequestException({ code: 'ALREADY_DECIDED', message: 'Already decided.' });
    if (input.decision === 'approve') {
      // Apply the proposed change to the canonical student record (known fields only), then audit both.
      const changes = req.proposedChanges as Record<string, unknown>;
      const patch: Record<string, string> = {};
      for (const k of ['address', 'phone', 'email'] as const) {
        if (typeof changes[k] === 'string') patch[k] = changes[k] as string;
      }
      if (Object.keys(patch).length) {
        await this.db.update(schema.students).set(patch).where(eq(schema.students.id, req.studentId));
        await this.write(ctx, 'parent_staff.student.apply_profile_change', req.studentId, { newState: patch });
      }
    }
    await this.db.update(schema.profileChangeRequests).set({ status: input.decision === 'approve' ? 'approved' : 'rejected', reviewedBy: ctx.principal.institutionUserId, reviewedAt: new Date(), reviewNote: input.note ?? null }).where(eq(schema.profileChangeRequests.id, id));
    await this.notify.emit(req.institutionId, [req.guardianUserId], { type: 'profile_change.decided', title: `Profile update ${input.decision === 'approve' ? 'approved' : 'rejected'}`, studentId: req.studentId, sourceEntity: `profile_change_requests:${id}` });
    await this.write(ctx, 'parent_staff.profile_change.decide', id, { newState: { decision: input.decision } });
    return { ok: true };
  }

  private async write(ctx: PortalActionContext, action: string, entityId: string, extra: Partial<AuditEventInput> = {}) {
    await this.audit.logAudit({ ...basePortalAudit(ctx), action, module: MODULE, entityType: 'parent_staff', entityId, ...extra } as AuditEventInput);
  }
}
