import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, gte, isNotNull, isNull, schema, sql, type Database } from '@edrion/database';
import type { ParentDashboardResponse } from '@edrion/schemas';
import { DATABASE } from '../../common/tokens';
import { assertWard } from './guardian-scope.guard';
import type { GuardianContext, GuardianStudentScope } from './guardian-context';

const DAY = 86_400_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Builds the single aggregated `GET /v1/parent/dashboard?studentId=` payload for one ward. */
@Injectable()
export class ParentDashboardService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async dashboard(guardian: GuardianContext, studentId: string): Promise<ParentDashboardResponse> {
    const scope = assertWard(guardian, studentId);
    const [student] = await this.db
      .select({ firstName: schema.students.firstName, classId: schema.students.classId })
      .from(schema.students)
      .where(eq(schema.students.id, studentId))
      .limit(1);
    const firstName = student?.firstName ?? 'your child';
    const classId = student?.classId ?? null;
    const today = new Date();
    const in7 = iso(new Date(today.getTime() + 7 * DAY));
    const todayStr = iso(today);

    const [attendance, assignmentsDue, upcomingExams, fees, recognitions, notices, ptm, library, transport, needsAttention] =
      await Promise.all([
        this.attendance(studentId),
        this.assignmentsDue(studentId, todayStr, in7),
        this.upcomingExams(classId, todayStr),
        this.outstandingFees(scope, studentId),
        this.recognitions(studentId),
        this.notices(guardian.institutionId),
        this.activePtm(guardian.institutionId),
        this.libraryDue(studentId, todayStr),
        this.transport(studentId),
        this.needsAttention(scope, studentId),
      ]);

    const timetable = await this.timetable(classId, today);
    const conversationPrompts = this.prompts(studentId, firstName, assignmentsDue, recognitions);

    return {
      studentId,
      needsAttention,
      attendance,
      timetableToday: timetable.today,
      timetableTomorrow: timetable.tomorrow,
      assignmentsDue,
      upcomingExams,
      outstandingFees: fees,
      recognitions,
      notices,
      activePtm: ptm,
      libraryDue: library,
      transportStatus: transport,
      conversationPrompts,
    };
  }

  private async attendance(studentId: string): Promise<ParentDashboardResponse['attendance']> {
    const rec = schema.attendanceRecords;
    const ses = schema.attendanceSessions;
    const since = iso(new Date(Date.now() - 30 * DAY));
    const rows = await this.db
      .select({ date: ses.date, status: rec.status })
      .from(rec)
      .innerJoin(ses, eq(ses.id, rec.sessionId))
      .where(and(eq(rec.studentId, studentId), gte(ses.date, since)))
      .orderBy(desc(ses.date));
    const present = rows.filter((r) => r.status === 'present' || r.status === 'late').length;
    const pct = rows.length ? Math.round((present / rows.length) * 100) : null;
    return { last30Pct: pct, lastFive: rows.slice(0, 5).map((r) => ({ date: r.date ?? '', status: r.status })) };
  }

  private async assignmentsDue(studentId: string, from: string, to: string) {
    const sub = schema.assignmentSubmissions;
    const asg = schema.assignments;
    const rows = await this.db
      .select({ id: asg.id, title: asg.title, dueDate: asg.dueDate, subject: schema.subjects.name })
      .from(sub)
      .innerJoin(asg, eq(asg.id, sub.assignmentId))
      .leftJoin(schema.subjects, eq(schema.subjects.id, asg.subjectId))
      .where(and(eq(sub.studentId, studentId), eq(sub.status, 'assigned'), gte(asg.dueDate, from)))
      .orderBy(asg.dueDate)
      .limit(10);
    return rows.filter((r) => !r.dueDate || r.dueDate <= to).map((r) => ({ id: r.id, title: r.title, dueDate: r.dueDate, subject: r.subject }));
  }

  private async upcomingExams(classId: string | null, from: string) {
    if (!classId) return [];
    const es = schema.examSchedules;
    const rows = await this.db
      .select({ id: es.id, subject: schema.subjects.name, examDate: es.examDate, hall: es.hall })
      .from(es)
      .leftJoin(schema.subjects, eq(schema.subjects.id, es.subjectId))
      .where(and(eq(es.classId, classId), eq(es.published, true), gte(es.examDate, from)))
      .orderBy(es.examDate)
      .limit(5);
    return rows;
  }

  private async outstandingFees(scope: GuardianStudentScope, studentId: string): Promise<ParentDashboardResponse['outstandingFees']> {
    if (scope.hidden.fees) return { totalMinor: 0, currency: 'INR', count: 0 };
    const rows = await this.db
      .select({ amount: schema.feeInvoices.amount, paid: schema.feeInvoices.amountPaid, status: schema.feeInvoices.status })
      .from(schema.feeInvoices)
      .where(eq(schema.feeInvoices.studentId, studentId));
    let total = 0;
    let count = 0;
    for (const r of rows) {
      if (r.status !== 'paid' && r.status !== 'cancelled') {
        total += Math.max(0, r.amount - r.paid);
        count += 1;
      }
    }
    return { totalMinor: total, currency: 'INR', count };
  }

  private async recognitions(studentId: string) {
    const rows = await this.db
      .select({ id: schema.studentRecognitions.id, title: schema.studentRecognitions.title, type: schema.studentRecognitions.type, awardedAt: schema.studentRecognitions.awardedAt })
      .from(schema.studentRecognitions)
      .where(eq(schema.studentRecognitions.studentId, studentId))
      .orderBy(desc(schema.studentRecognitions.awardedAt))
      .limit(3);
    return rows.map((r) => ({ id: r.id, title: r.title, type: r.type, awardedAt: r.awardedAt?.toISOString() ?? '' }));
  }

  private async notices(institutionId: string) {
    const rows = await this.db
      .select({ id: schema.parentNotices.id, title: schema.parentNotices.title, priority: schema.parentNotices.priority, publishedAt: schema.parentNotices.publishedAt })
      .from(schema.parentNotices)
      .where(and(eq(schema.parentNotices.institutionId, institutionId), isNotNull(schema.parentNotices.publishedAt)))
      .orderBy(desc(schema.parentNotices.publishedAt))
      .limit(5);
    return rows.map((r) => ({ id: r.id, title: r.title, priority: r.priority, publishedAt: r.publishedAt?.toISOString() ?? null }));
  }

  private async activePtm(institutionId: string) {
    const [row] = await this.db
      .select({ id: schema.parentPtmEvents.id, title: schema.parentPtmEvents.title })
      .from(schema.parentPtmEvents)
      .where(and(eq(schema.parentPtmEvents.institutionId, institutionId), eq(schema.parentPtmEvents.status, 'published')))
      .orderBy(desc(schema.parentPtmEvents.createdAt))
      .limit(1);
    return row ?? null;
  }

  private async libraryDue(studentId: string, today: string) {
    const rows = await this.db
      .select({ id: schema.libraryLoans.id, dueDate: schema.libraryLoans.dueDate, title: schema.libraryBooks.title })
      .from(schema.libraryLoans)
      .leftJoin(schema.libraryBooks, eq(schema.libraryBooks.id, schema.libraryLoans.bookId))
      .where(and(eq(schema.libraryLoans.studentId, studentId), eq(schema.libraryLoans.status, 'issued')))
      .orderBy(schema.libraryLoans.dueDate)
      .limit(10);
    return rows.map((r) => ({ id: r.id, title: r.title ?? 'Book', dueDate: r.dueDate, overdue: !!r.dueDate && r.dueDate < today }));
  }

  private async transport(studentId: string): Promise<ParentDashboardResponse['transportStatus']> {
    const [asg] = await this.db
      .select({ routeId: schema.transportAssignments.routeId })
      .from(schema.transportAssignments)
      .where(and(eq(schema.transportAssignments.studentId, studentId), eq(schema.transportAssignments.status, 'active')))
      .limit(1);
    if (!asg) return null;
    const [route] = await this.db
      .select({ name: schema.transportRoutes.name })
      .from(schema.transportRoutes)
      .where(eq(schema.transportRoutes.id, asg.routeId))
      .limit(1);
    const [incident] = await this.db
      .select({ description: schema.transportIncidents.description })
      .from(schema.transportIncidents)
      .where(and(eq(schema.transportIncidents.routeId, asg.routeId), eq(schema.transportIncidents.status, 'open')))
      .orderBy(desc(schema.transportIncidents.createdAt))
      .limit(1);
    return { routeName: route?.name ?? null, activeIncident: incident?.description ?? null };
  }

  private async needsAttention(
    scope: GuardianStudentScope,
    studentId: string,
  ): Promise<ParentDashboardResponse['needsAttention']> {
    const items: ParentDashboardResponse['needsAttention'] = [];

    // Overdue fees (if visible).
    if (!scope.hidden.fees) {
      const [row] = await this.db
        .select({ c: sql<number>`count(*)::int` })
        .from(schema.feeInvoices)
        .where(and(eq(schema.feeInvoices.studentId, studentId), eq(schema.feeInvoices.status, 'overdue')));
      if ((row?.c ?? 0) > 0) items.push({ type: 'fee_overdue', title: 'Overdue fee', detail: `${row!.c} invoice(s) overdue`, deepLink: `/child/${studentId}/fees` });
    }
    // Pending pickup authorization verification.
    const [pickup] = await this.db
      .select({ c: sql<number>`count(*)::int` })
      .from(schema.pickupAuthorizations)
      .where(and(eq(schema.pickupAuthorizations.studentId, studentId), eq(schema.pickupAuthorizations.status, 'pending_school_verification')));
    if ((pickup?.c ?? 0) > 0) items.push({ type: 'pickup_pending', title: 'Pickup authorization pending', detail: 'Awaiting school verification', deepLink: `/child/${studentId}/pickup` });

    // Published behaviour incident awaiting acknowledgement.
    const [beh] = await this.db
      .select({ c: sql<number>`count(*)::int` })
      .from(schema.studentIncidents)
      .where(and(eq(schema.studentIncidents.studentId, studentId), eq(schema.studentIncidents.parentAckRequired, true), isNull(schema.studentIncidents.parentAcknowledgedAt)));
    if ((beh?.c ?? 0) > 0) items.push({ type: 'behavior_ack', title: 'Behaviour note to acknowledge', detail: null, deepLink: `/child/${studentId}/behavior` });

    // Document request ready.
    const [doc] = await this.db
      .select({ c: sql<number>`count(*)::int` })
      .from(schema.documentRequests)
      .where(and(eq(schema.documentRequests.studentId, studentId), eq(schema.documentRequests.status, 'ready')));
    if ((doc?.c ?? 0) > 0) items.push({ type: 'document_ready', title: 'Document ready', detail: 'A requested document is ready', deepLink: `/child/${studentId}/documents` });

    // Unexplained absence in the last 7 days.
    const rec = schema.attendanceRecords;
    const ses = schema.attendanceSessions;
    const since = iso(new Date(Date.now() - 7 * DAY));
    const absents = await this.db
      .select({ date: ses.date })
      .from(rec)
      .innerJoin(ses, eq(ses.id, rec.sessionId))
      .where(and(eq(rec.studentId, studentId), eq(rec.status, 'absent'), gte(ses.date, since)));
    if (absents.length) {
      const notes = await this.db
        .select({ from: schema.parentAbsenceNotes.dateFrom, to: schema.parentAbsenceNotes.dateTo })
        .from(schema.parentAbsenceNotes)
        .where(and(eq(schema.parentAbsenceNotes.studentId, studentId), eq(schema.parentAbsenceNotes.status, 'acknowledged')));
      const unexplained = absents.filter((a) => a.date && !notes.some((n) => n.from <= a.date! && n.to >= a.date!));
      if (unexplained.length) items.push({ type: 'absence_unexplained', title: 'Unexplained absence', detail: `${unexplained.length} day(s)`, deepLink: `/child/${studentId}/attendance` });
    }
    return items;
  }

  private async timetable(classId: string | null, today: Date) {
    if (!classId) return { today: [], tomorrow: [] };
    const t = schema.timetableSlots;
    const rows = await this.db
      .select({ dayOfWeek: t.dayOfWeek, startTime: t.startTime, endTime: t.endTime, room: t.room, subject: schema.subjects.name })
      .from(t)
      .leftJoin(schema.subjects, eq(schema.subjects.id, t.subjectId))
      .where(eq(t.classId, classId))
      .orderBy(t.startTime);
    const map = (dow: number) =>
      rows.filter((r) => r.dayOfWeek === dow).map((r) => ({ subject: r.subject ?? '', startTime: r.startTime, endTime: r.endTime, room: r.room }));
    return { today: map(today.getDay()), tomorrow: map((today.getDay() + 1) % 7) };
  }

  private prompts(
    studentId: string,
    firstName: string,
    assignments: Array<{ title: string; dueDate: string | null }>,
    recognitions: Array<{ title: string }>,
  ): ParentDashboardResponse['conversationPrompts'] {
    const out: ParentDashboardResponse['conversationPrompts'] = [];
    if (assignments[0]) {
      out.push({ studentId, text: `Ask ${firstName} about “${assignments[0].title}”${assignments[0].dueDate ? ` due ${assignments[0].dueDate}` : ''}.` });
    }
    if (recognitions[0] && out.length < 2) {
      out.push({ studentId, text: `Celebrate ${firstName}’s achievement: ${recognitions[0].title}! 🎉` });
    }
    return out.slice(0, 2);
  }
}
