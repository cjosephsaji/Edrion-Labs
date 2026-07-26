import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, gte, inArray, isNull, schema, sql, type Database } from '@edrion/database';
import type { AuditWriter, AuditEventInput } from '@edrion/audit';
import type {
  BookPtmSlotInput,
  CreateAbsenceNoteInput,
  CreateParentThreadInput,
  ReplyParentMessageInput,
  RespondConsentInput,
  UpdatePreferencesInput,
} from '@edrion/schemas';
import { AUDIT_WRITER, DATABASE } from '../../common/tokens';
import { assertWard } from './guardian-scope.guard';
import type { GuardianContext } from './guardian-context';
import { basePortalAudit, type PortalActionContext } from '../portal/portal-action-context';

const MODULE = 'parent-comm';
const MAX_THREADS_PER_DAY = 5;

/**
 * Communication for guardians: notices (read/ack), consents (respond, supersede pattern), PTM
 * (capacity-safe booking), absence notes, structured messaging (category-routed, rate-limited) and
 * notification preferences.
 */
@Injectable()
export class ParentCommService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(AUDIT_WRITER) private readonly audit: AuditWriter,
  ) {}

  // ── Notices ────────────────────────────────────────────────────────────────
  async notices(guardian: GuardianContext) {
    const rows = await this.db
      .select()
      .from(schema.parentNotices)
      .where(and(eq(schema.parentNotices.institutionId, guardian.institutionId), sql`${schema.parentNotices.publishedAt} is not null`))
      .orderBy(desc(schema.parentNotices.publishedAt))
      .limit(100);
    const receipts = await this.db
      .select({ noticeId: schema.parentNoticeReceipts.noticeId, readAt: schema.parentNoticeReceipts.readAt, acknowledgedAt: schema.parentNoticeReceipts.acknowledgedAt })
      .from(schema.parentNoticeReceipts)
      .where(eq(schema.parentNoticeReceipts.guardianUserId, guardian.guardianUserId));
    const byId = new Map(receipts.map((r) => [r.noticeId, r]));
    return {
      items: rows.map((n) => ({
        id: n.id,
        title: n.title,
        body: n.body,
        priority: n.priority,
        requiresAcknowledgement: n.requiresAcknowledgement,
        attachments: n.attachments,
        publishedAt: n.publishedAt,
        read: !!byId.get(n.id)?.readAt,
        acknowledged: !!byId.get(n.id)?.acknowledgedAt,
      })),
    };
  }

  private async upsertReceipt(guardian: GuardianContext, noticeId: string, patch: { readAt?: Date; acknowledgedAt?: Date }) {
    const studentId = guardian.studentIds[0];
    if (!studentId) throw new BadRequestException({ code: 'NO_WARD', message: 'No linked student.' });
    const [existing] = await this.db
      .select()
      .from(schema.parentNoticeReceipts)
      .where(and(eq(schema.parentNoticeReceipts.noticeId, noticeId), eq(schema.parentNoticeReceipts.guardianUserId, guardian.guardianUserId)))
      .limit(1);
    if (existing) {
      await this.db.update(schema.parentNoticeReceipts).set(patch).where(eq(schema.parentNoticeReceipts.id, existing.id));
    } else {
      await this.db.insert(schema.parentNoticeReceipts).values({ institutionId: guardian.institutionId, noticeId, guardianUserId: guardian.guardianUserId, studentId, ...patch });
    }
  }

  async readNotice(guardian: GuardianContext, noticeId: string) {
    await this.upsertReceipt(guardian, noticeId, { readAt: new Date() });
    return { ok: true };
  }

  async acknowledgeNotice(ctx: PortalActionContext, guardian: GuardianContext, noticeId: string) {
    await this.upsertReceipt(guardian, noticeId, { readAt: new Date(), acknowledgedAt: new Date() });
    await this.write(ctx, 'parent.notice.acknowledge', noticeId);
    return { ok: true };
  }

  // ── Consents ───────────────────────────────────────────────────────────────
  async consents(guardian: GuardianContext) {
    const forms = await this.db
      .select()
      .from(schema.parentConsentForms)
      .where(and(eq(schema.parentConsentForms.institutionId, guardian.institutionId), eq(schema.parentConsentForms.status, 'published')))
      .orderBy(desc(schema.parentConsentForms.publishedAt));
    const responses = await this.db
      .select()
      .from(schema.parentConsentResponses)
      .where(and(eq(schema.parentConsentResponses.guardianUserId, guardian.guardianUserId), isNull(schema.parentConsentResponses.supersededAt)));
    return {
      items: forms.map((f) => ({
        id: f.id,
        title: f.title,
        description: f.description,
        consentType: f.consentType,
        options: f.options,
        dueAt: f.dueAt,
        responses: responses
          .filter((r) => r.consentFormId === f.id)
          .map((r) => ({ studentId: r.studentId, response: r.response, respondedAt: r.respondedAt })),
      })),
    };
  }

  async respondConsent(ctx: PortalActionContext, guardian: GuardianContext, formId: string, input: RespondConsentInput) {
    assertWard(guardian, input.studentId);
    const [form] = await this.db.select().from(schema.parentConsentForms).where(eq(schema.parentConsentForms.id, formId)).limit(1);
    if (!form || form.status !== 'published') throw new NotFoundException({ code: 'CONSENT_NOT_FOUND', message: 'Not found.' });
    // Supersede any prior active response for this (form, student, guardian) — never UPDATE a response.
    await this.db
      .update(schema.parentConsentResponses)
      .set({ supersededAt: new Date() })
      .where(and(
        eq(schema.parentConsentResponses.consentFormId, formId),
        eq(schema.parentConsentResponses.studentId, input.studentId),
        eq(schema.parentConsentResponses.guardianUserId, guardian.guardianUserId),
        isNull(schema.parentConsentResponses.supersededAt),
      ));
    const [row] = await this.db
      .insert(schema.parentConsentResponses)
      .values({ institutionId: guardian.institutionId, consentFormId: formId, studentId: input.studentId, guardianUserId: guardian.guardianUserId, response: input.response, note: input.note ?? null })
      .returning();
    await this.write(ctx, 'parent.consent.respond', row!.id, { newState: { response: input.response, studentId: input.studentId } });
    return row;
  }

  // ── PTM ────────────────────────────────────────────────────────────────────
  async ptmEvents(guardian: GuardianContext) {
    const rows = await this.db
      .select()
      .from(schema.parentPtmEvents)
      .where(and(eq(schema.parentPtmEvents.institutionId, guardian.institutionId), eq(schema.parentPtmEvents.status, 'published')))
      .orderBy(desc(schema.parentPtmEvents.createdAt));
    return { items: rows };
  }

  async ptmSlots(guardian: GuardianContext, eventId: string) {
    const rows = await this.db
      .select({ id: schema.parentPtmSlots.id, teacherId: schema.parentPtmSlots.teacherId, startsAt: schema.parentPtmSlots.startsAt, endsAt: schema.parentPtmSlots.endsAt, capacity: schema.parentPtmSlots.capacity, bookedCount: schema.parentPtmSlots.bookedCount, teacherFirst: schema.staff.firstName, teacherLast: schema.staff.lastName })
      .from(schema.parentPtmSlots)
      .leftJoin(schema.staff, eq(schema.staff.id, schema.parentPtmSlots.teacherId))
      .where(and(eq(schema.parentPtmSlots.eventId, eventId), eq(schema.parentPtmSlots.institutionId, guardian.institutionId)))
      .orderBy(schema.parentPtmSlots.startsAt);
    return { items: rows.map((r) => ({ ...r, available: r.bookedCount < r.capacity })) };
  }

  /** Capacity-safe booking: locks the slot row, checks capacity, one active booking per (event, student). */
  async bookPtm(ctx: PortalActionContext, guardian: GuardianContext, slotId: string, input: BookPtmSlotInput) {
    assertWard(guardian, input.studentId);
    return this.db.transaction(async (tx) => {
      const [slot] = await tx.select().from(schema.parentPtmSlots).where(eq(schema.parentPtmSlots.id, slotId)).limit(1).for('update');
      if (!slot) throw new NotFoundException({ code: 'SLOT_NOT_FOUND', message: 'Slot not found.' });
      if (slot.bookedCount >= slot.capacity) throw new ConflictException({ code: 'SLOT_FULL', message: 'This slot is full.' });
      const [existing] = await tx
        .select({ id: schema.parentPtmBookings.id })
        .from(schema.parentPtmBookings)
        .where(and(eq(schema.parentPtmBookings.eventId, slot.eventId), eq(schema.parentPtmBookings.studentId, input.studentId), eq(schema.parentPtmBookings.status, 'booked')))
        .limit(1);
      if (existing) throw new ConflictException({ code: 'ALREADY_BOOKED', message: 'You already have a booking for this event.' });
      const [booking] = await tx
        .insert(schema.parentPtmBookings)
        .values({ institutionId: guardian.institutionId, eventId: slot.eventId, slotId, studentId: input.studentId, guardianUserId: guardian.guardianUserId, status: 'booked', note: input.note ?? null })
        .returning();
      await tx.update(schema.parentPtmSlots).set({ bookedCount: slot.bookedCount + 1 }).where(eq(schema.parentPtmSlots.id, slotId));
      await this.write(ctx, 'parent.ptm.book', booking!.id, { newState: { slotId, studentId: input.studentId } });
      return booking;
    });
  }

  async cancelPtm(ctx: PortalActionContext, guardian: GuardianContext, bookingId: string) {
    return this.db.transaction(async (tx) => {
      const [booking] = await tx.select().from(schema.parentPtmBookings).where(eq(schema.parentPtmBookings.id, bookingId)).limit(1).for('update');
      if (!booking) throw new NotFoundException({ code: 'BOOKING_NOT_FOUND', message: 'Not found.' });
      if (booking.guardianUserId !== guardian.guardianUserId) throw new ForbiddenException({ code: 'NOT_YOUR_BOOKING', message: 'Not your booking.' });
      if (booking.status !== 'booked') return { ok: true, alreadyCancelled: true };
      await tx.update(schema.parentPtmBookings).set({ status: 'cancelled' }).where(eq(schema.parentPtmBookings.id, bookingId));
      const [slot] = await tx.select().from(schema.parentPtmSlots).where(eq(schema.parentPtmSlots.id, booking.slotId)).limit(1).for('update');
      if (slot && slot.bookedCount > 0) await tx.update(schema.parentPtmSlots).set({ bookedCount: slot.bookedCount - 1 }).where(eq(schema.parentPtmSlots.id, slot.id));
      await this.write(ctx, 'parent.ptm.cancel', bookingId);
      return { ok: true };
    });
  }

  // ── Absence notes ───────────────────────────────────────────────────────────
  async createAbsenceNote(ctx: PortalActionContext, guardian: GuardianContext, input: CreateAbsenceNoteInput) {
    const scope = assertWard(guardian, input.studentId);
    const [row] = await this.db
      .insert(schema.parentAbsenceNotes)
      .values({ institutionId: guardian.institutionId, campusId: scope.campusId, studentId: input.studentId, guardianUserId: guardian.guardianUserId, dateFrom: input.dateFrom, dateTo: input.dateTo, reasonCategory: input.reasonCategory, note: input.note ?? null, attachment: input.attachment ?? null, status: 'submitted' })
      .returning();
    await this.write(ctx, 'parent.absence_note.create', row!.id, { newState: { studentId: input.studentId, dateFrom: input.dateFrom } });
    return row;
  }

  async absenceNotes(guardian: GuardianContext, studentId?: string) {
    const ids = studentId ? [assertWard(guardian, studentId).studentId] : guardian.studentIds;
    if (!ids.length) return { items: [] };
    const rows = await this.db.select().from(schema.parentAbsenceNotes).where(inArray(schema.parentAbsenceNotes.studentId, ids)).orderBy(desc(schema.parentAbsenceNotes.createdAt));
    return { items: rows };
  }

  // ── Messages ─────────────────────────────────────────────────────────────────
  async createThread(ctx: PortalActionContext, guardian: GuardianContext, input: CreateParentThreadInput) {
    const scope = assertWard(guardian, input.studentId);
    const since = new Date(Date.now() - 86_400_000);
    const countRows = await this.db
      .select({ c: sql<number>`count(*)::int` })
      .from(schema.parentMessageThreads)
      .where(and(eq(schema.parentMessageThreads.openedByGuardianId, guardian.guardianUserId), gte(schema.parentMessageThreads.createdAt, since)));
    if ((countRows[0]?.c ?? 0) >= MAX_THREADS_PER_DAY) throw new BadRequestException({ code: 'RATE_LIMITED', message: `Limit of ${MAX_THREADS_PER_DAY} new messages per day reached.` });

    // Route class_teacher_note to the ward's class teacher; other categories to a role inbox (unassigned).
    let assignedTo: string | null = null;
    if (input.category === 'class_teacher_note' && scope) {
      const [student] = await this.db.select({ classId: schema.students.classId }).from(schema.students).where(eq(schema.students.id, input.studentId)).limit(1);
      if (student?.classId) {
        const [cls] = await this.db.select({ classTeacherId: schema.classes.classTeacherId }).from(schema.classes).where(eq(schema.classes.id, student.classId)).limit(1);
        const teacherUserId = cls?.classTeacherId
          ? (await this.db.select({ uid: schema.staff.institutionUserId }).from(schema.staff).where(eq(schema.staff.id, cls.classTeacherId)).limit(1))[0]?.uid ?? null
          : null;
        assignedTo = teacherUserId;
      }
    }

    const thread = await this.db.transaction(async (tx) => {
      const [t] = await tx
        .insert(schema.parentMessageThreads)
        .values({ institutionId: guardian.institutionId, campusId: scope.campusId, studentId: input.studentId, openedByGuardianId: guardian.guardianUserId, category: input.category, subject: input.subject, status: 'open', assignedTo, lastMessageAt: new Date() })
        .returning();
      await tx.insert(schema.parentMessages).values({ institutionId: guardian.institutionId, threadId: t!.id, senderType: 'guardian', senderId: guardian.guardianUserId, body: input.body });
      return t!;
    });
    await this.write(ctx, 'parent.message_thread.create', thread.id, { newState: { category: input.category, subject: input.subject } });
    return thread;
  }

  async listThreads(guardian: GuardianContext) {
    const rows = await this.db
      .select()
      .from(schema.parentMessageThreads)
      .where(eq(schema.parentMessageThreads.openedByGuardianId, guardian.guardianUserId))
      .orderBy(desc(schema.parentMessageThreads.lastMessageAt));
    return { items: rows };
  }

  async getThread(guardian: GuardianContext, threadId: string) {
    const [thread] = await this.db.select().from(schema.parentMessageThreads).where(eq(schema.parentMessageThreads.id, threadId)).limit(1);
    if (!thread || thread.openedByGuardianId !== guardian.guardianUserId) throw new NotFoundException({ code: 'THREAD_NOT_FOUND', message: 'Not found.' });
    const messages = await this.db.select().from(schema.parentMessages).where(eq(schema.parentMessages.threadId, threadId)).orderBy(schema.parentMessages.sentAt);
    return { thread, messages };
  }

  async replyThread(ctx: PortalActionContext, guardian: GuardianContext, threadId: string, input: ReplyParentMessageInput) {
    const [thread] = await this.db.select().from(schema.parentMessageThreads).where(eq(schema.parentMessageThreads.id, threadId)).limit(1);
    if (!thread || thread.openedByGuardianId !== guardian.guardianUserId) throw new NotFoundException({ code: 'THREAD_NOT_FOUND', message: 'Not found.' });
    if (thread.status === 'closed') throw new BadRequestException({ code: 'THREAD_CLOSED', message: 'This conversation is closed.' });
    const [msg] = await this.db.insert(schema.parentMessages).values({ institutionId: guardian.institutionId, threadId, senderType: 'guardian', senderId: guardian.guardianUserId, body: input.body }).returning();
    await this.db.update(schema.parentMessageThreads).set({ lastMessageAt: new Date(), status: 'open' }).where(eq(schema.parentMessageThreads.id, threadId));
    await this.write(ctx, 'parent.message.reply', msg!.id, { newState: { threadId } });
    return msg;
  }

  // ── Preferences ────────────────────────────────────────────────────────────
  async updatePreferences(guardian: GuardianContext, input: UpdatePreferencesInput) {
    const [existing] = await this.db.select().from(schema.parentNotificationPreferences).where(eq(schema.parentNotificationPreferences.guardianUserId, guardian.guardianUserId)).limit(1);
    const patch = {
      ...(input.channels ? { channels: { ...(existing?.channels ?? {}), ...input.channels } } : {}),
      ...(input.categoryOverrides ? { categoryOverrides: input.categoryOverrides } : {}),
      ...(input.digestDay !== undefined ? { digestDay: input.digestDay } : {}),
      ...(input.digestEnabled !== undefined ? { digestEnabled: input.digestEnabled } : {}),
      ...(input.quietHours ? { quietHours: input.quietHours } : {}),
      ...(input.language ? { language: input.language } : {}),
    };
    if (existing) {
      const [row] = await this.db.update(schema.parentNotificationPreferences).set(patch).where(eq(schema.parentNotificationPreferences.id, existing.id)).returning();
      return row;
    }
    const [row] = await this.db.insert(schema.parentNotificationPreferences).values({ institutionId: guardian.institutionId, guardianUserId: guardian.guardianUserId, ...patch }).returning();
    return row;
  }

  private async write(ctx: PortalActionContext, action: string, entityId: string, extra: Partial<AuditEventInput> = {}) {
    await this.audit.logAudit({ ...basePortalAudit(ctx), action, module: MODULE, entityType: 'parent_comm', entityId, ...extra } as AuditEventInput);
  }
}
