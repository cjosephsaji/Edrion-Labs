import { Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, gte, inArray, isNull, lte, or, schema, sql, type Database } from '@edrion/database';
import { defaultStudentHomePriorities, type StudentHomePriorityKey } from '@edrion/schemas';
import { DATABASE } from '../../../common/tokens';
import type { StudentPrincipal } from '../student.types';
import { StudentMeService, type StudentMeResponse } from '../me/student-me.service';
import { requireInstitutional } from '../surfaces/surface-gate.service';
import {
  rankStudentHomeCards,
  type StudentHomeCandidate,
  type StudentHomeCard,
  type StudentHomePriorityWeights,
} from './student-home-ranking';

type Deadline = {
  id: string;
  title: string;
  dueAt: string;
  kind: 'assignment' | 'homework';
  status: string;
  updatedAt: string;
};

type Continuity = {
  id: string;
  title: string;
  kind: 'assignment' | 'homework';
  href: string;
  dueAt: string | null;
  updatedAt: string;
};

type FeeSummary = {
  amount: number;
  currency: string;
  invoiceCount: number;
  overdueCount: number;
  nextDueDate: string | null;
};

type Announcement = {
  id: string;
  title: string;
  summary: string | null;
  category: string | null;
  pinned: boolean;
  publishedAt: string;
};

type ExamSummary = {
  id: string;
  title: string;
  startsAt: string;
  status: string;
};

type ActiveExam = {
  id: string;
  title: string;
  endsAt: string;
};

export type StudentDashboardResponse = {
  me: StudentMeResponse;
  priorityCards: StudentHomeCard[];
  ranking: { generatedAt: string; weights: StudentHomePriorityWeights };
  todaySlots: Array<{
    id: string;
    start: string;
    end: string;
    subjectName: string;
    teacherName: string | null;
    roomName: string | null;
  }>;
  attendancePct: number | null;
  pendingAssignments: number;
  upcomingDeadlines: Deadline[];
  outstandingFees: FeeSummary | null;
  recentAnnouncements: Announcement[];
  unreadNotifications: number;
  upcomingExams: ExamSummary[];
};

function daysFromNow(value: string, now: Date) {
  return Math.ceil((new Date(value).getTime() - now.getTime()) / 86_400_000);
}

function deadlineSignal(days: number) {
  if (days < 0) return { boost: 100, reason: `${Math.abs(days)} ${Math.abs(days) === 1 ? 'day' : 'days'} overdue` };
  if (days === 0) return { boost: 85, reason: 'Due today' };
  if (days <= 2) return { boost: 55, reason: `Due in ${days} ${days === 1 ? 'day' : 'days'}` };
  if (days <= 7) return { boost: 25, reason: `Due in ${days} days` };
  return { boost: 8, reason: `Due in ${days} days` };
}

function hasPermission(me: StudentMeResponse, key: string) {
  return me.permissions.includes('*') || me.permissions.includes(key);
}

@Injectable()
export class StudentHomeService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly me: StudentMeService,
  ) {}

  async getHome(principal: StudentPrincipal): Promise<StudentDashboardResponse> {
    const me = await this.me.getMe(principal);
    if (principal.kind !== 'institutional') {
      return {
        me,
        priorityCards: [],
        ranking: { generatedAt: new Date().toISOString(), weights: { ...defaultStudentHomePriorities } },
        todaySlots: [],
        attendancePct: null,
        pendingAssignments: 0,
        upcomingDeadlines: [],
        outstandingFees: null,
        recentAnnouncements: [],
        unreadNotifications: 0,
        upcomingExams: [],
      };
    }
    requireInstitutional(principal);

    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const past30 = new Date(now.getTime() - 30 * 86_400_000).toISOString().slice(0, 10);
    const in14 = new Date(now.getTime() + 14 * 86_400_000).toISOString().slice(0, 10);
    const jsDow = now.getUTCDay();
    const dow = jsDow === 0 ? 7 : jsDow;

    const [student] = await this.db
      .select({ classId: schema.students.classId, campusId: schema.students.campusId })
      .from(schema.students)
      .where(eq(schema.students.id, principal.studentId))
      .limit(1);
    const classId = student?.classId ?? null;
    const canSchedule = hasPermission(me, 'student.classes.view');
    const canAttendance = hasPermission(me, 'student.attendance.view');
    const canAssignments = hasPermission(me, 'student.assignments.view');
    const canHomework = hasPermission(me, 'student.homework.view');
    const canFees = hasPermission(me, 'student.surface.fees.view') && me.surfaces.fees !== false;
    const canExams = hasPermission(me, 'student.exams.view') && me.surfaces.exams !== false;

    const [
      todaySlots,
      attendancePct,
      pendingAssignments,
      upcomingDeadlines,
      outstandingFees,
      recentAnnouncements,
      notificationSummary,
      upcomingExams,
      activeExam,
      continuity,
      policy,
    ] = await Promise.all([
      canSchedule ? this.todaySlots(classId, dow) : Promise.resolve([]),
      canAttendance ? this.attendancePct(principal.studentId, principal.institutionId) : Promise.resolve(null),
      canAssignments || canHomework ? this.pendingWorkCount(principal.studentId) : Promise.resolve(0),
      canAssignments || canHomework ? this.upcomingDeadlines(principal.studentId, past30, in14, canAssignments, canHomework) : Promise.resolve([]),
      canFees ? this.outstandingFees(principal.studentId) : Promise.resolve(null),
      this.recentAnnouncements(principal.institutionId, student?.campusId ?? null),
      this.unreadSummary(principal.studentId),
      canExams ? this.upcomingExams(classId, todayStr) : Promise.resolve([]),
      canExams ? this.activeExam(principal.studentId) : Promise.resolve(null),
      canAssignments || canHomework ? this.learningContinuity(principal.studentId, canAssignments, canHomework) : Promise.resolve(null),
      this.rankingPolicy(principal.institutionId, student?.campusId ?? null),
    ]);

    const priorityCards = rankStudentHomeCards(this.buildCandidates({
      now,
      me,
      todaySlots,
      attendancePct,
      attendanceThreshold: policy.attendanceThreshold,
      deadlines: upcomingDeadlines,
      fees: outstandingFees,
      announcements: recentAnnouncements,
      notificationSummary,
      exams: upcomingExams,
      activeExam,
      continuity,
    }), policy.weights);

    return {
      me,
      priorityCards,
      ranking: { generatedAt: now.toISOString(), weights: policy.weights },
      todaySlots,
      attendancePct,
      pendingAssignments,
      upcomingDeadlines,
      outstandingFees,
      recentAnnouncements,
      unreadNotifications: notificationSummary.count,
      upcomingExams,
    };
  }

  /** Kept for schedule/today route compatibility. */
  async todaySchedule(principal: StudentPrincipal) {
    if (principal.kind !== 'institutional') return [];
    const [student] = await this.db
      .select({ classId: schema.students.classId })
      .from(schema.students)
      .where(eq(schema.students.id, principal.studentId))
      .limit(1);
    const jsDow = new Date().getUTCDay();
    const slots = await this.todaySlots(student?.classId ?? null, jsDow === 0 ? 7 : jsDow);
    return slots.map((slot) => ({ id: slot.id, title: slot.subjectName, time: `${slot.start}–${slot.end}`, room: slot.roomName }));
  }

  private buildCandidates(input: {
    now: Date;
    me: StudentMeResponse;
    todaySlots: StudentDashboardResponse['todaySlots'];
    attendancePct: number | null;
    attendanceThreshold: number;
    deadlines: Deadline[];
    fees: FeeSummary | null;
    announcements: Announcement[];
    notificationSummary: { count: number; latest: { title: string; body: string; deepLink: string; occurredAt: string } | null };
    exams: ExamSummary[];
    activeExam: ActiveExam | null;
    continuity: Continuity | null;
  }): StudentHomeCandidate[] {
    const candidates: StudentHomeCandidate[] = [];
    const continuityKey = input.continuity ? `${input.continuity.kind}:${input.continuity.id}` : null;

    if (input.activeExam) {
      const minutesLeft = Math.max(0, Math.ceil((new Date(input.activeExam.endsAt).getTime() - input.now.getTime()) / 60_000));
      candidates.push({
        id: `active-exam:${input.activeExam.id}`,
        kind: 'exam',
        eyebrow: 'Examination in progress',
        title: input.activeExam.title,
        description: minutesLeft ? `Your timer is running. ${minutesLeft} minutes remain.` : 'The timer has ended. Open the attempt to complete submission.',
        href: `/exams/${input.activeExam.id}/attempt`,
        actionLabel: 'Resume examination',
        reason: 'Active timed attempt',
        metric: `${minutesLeft} min`,
        dynamicBoost: 140,
        source: 'program',
      });
    }

    const nextExam = input.exams.find((exam) => exam.id !== input.activeExam?.id);
    if (nextExam) {
      const days = daysFromNow(nextExam.startsAt, input.now);
      const open = nextExam.status === 'ongoing' || days <= 0;
      candidates.push({
        id: `exam:${nextExam.id}`,
        kind: 'exam',
        eyebrow: open ? 'Examination available' : 'Upcoming examination',
        title: nextExam.title,
        description: open ? 'The published examination window is open.' : `Scheduled for ${new Date(nextExam.startsAt).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}.`,
        href: '/exams',
        actionLabel: open ? 'Attend examination' : 'View examinations',
        reason: open ? 'Open now' : days <= 3 ? `Starts in ${Math.max(1, days)} days` : 'Published by your institution',
        metric: open ? 'Open now' : `${Math.max(1, days)} days`,
        dynamicBoost: open ? 95 : days <= 3 ? 55 : days <= 7 ? 30 : 12,
        source: 'institution',
      });
    }

    if (input.continuity) {
      const due = input.continuity.dueAt ? deadlineSignal(daysFromNow(input.continuity.dueAt, input.now)) : { boost: 0, reason: 'Started earlier' };
      candidates.push({
        id: `continuity:${input.continuity.kind}:${input.continuity.id}`,
        kind: 'learning',
        eyebrow: 'Continue where you stopped',
        title: input.continuity.title,
        description: 'Your saved work is waiting. Continue from the point you last reached.',
        href: input.continuity.href,
        actionLabel: 'Continue work',
        reason: due.boost >= 55 ? due.reason : 'Unfinished work detected',
        metric: input.continuity.kind === 'homework' ? 'Homework' : 'Assignment',
        dynamicBoost: 42 + Math.min(60, due.boost),
        occurredAt: input.continuity.updatedAt,
        source: 'continuity',
      });
    }

    for (const item of input.deadlines.filter((deadline) => `${deadline.kind}:${deadline.id}` !== continuityKey).slice(0, 2)) {
      const signal = deadlineSignal(daysFromNow(item.dueAt, input.now));
      candidates.push({
        id: `due:${item.kind}:${item.id}`,
        kind: 'due_work',
        eyebrow: item.kind === 'homework' ? 'Homework due' : 'Assignment due',
        title: item.title,
        description: signal.reason,
        href: `/${item.kind === 'homework' ? 'homework' : 'assignments'}/${item.id}`,
        actionLabel: item.status === 'in_progress' ? 'Continue work' : 'Open work',
        reason: signal.reason,
        metric: signal.reason,
        dynamicBoost: signal.boost,
        occurredAt: item.updatedAt,
        source: 'program',
      });
    }

    if (input.fees) {
      const dueDays = input.fees.nextDueDate ? daysFromNow(input.fees.nextDueDate, input.now) : null;
      const feeBoost = input.fees.overdueCount > 0 ? 85 : dueDays != null && dueDays <= 3 ? 50 : dueDays != null && dueDays <= 14 ? 25 : 10;
      const reason = input.fees.overdueCount > 0
        ? `${input.fees.overdueCount} overdue ${input.fees.overdueCount === 1 ? 'invoice' : 'invoices'}`
        : dueDays != null && dueDays >= 0 ? `Next payment due in ${dueDays} days` : 'Outstanding balance';
      candidates.push({
        id: 'fees:outstanding',
        kind: 'fees',
        eyebrow: 'Fees and payments',
        title: `${input.fees.currency} ${input.fees.amount.toLocaleString('en-IN')} outstanding`,
        description: `${input.fees.invoiceCount} open ${input.fees.invoiceCount === 1 ? 'invoice needs' : 'invoices need'} attention.`,
        href: '/fees',
        actionLabel: 'View fees',
        reason,
        metric: input.fees.overdueCount ? 'Overdue' : `${input.fees.invoiceCount} open`,
        dynamicBoost: feeBoost,
        source: 'program',
      });
    }

    if (input.attendancePct != null && input.attendancePct < input.attendanceThreshold) {
      const gap = Math.ceil(input.attendanceThreshold - input.attendancePct);
      candidates.push({
        id: 'attendance:risk',
        kind: 'attendance',
        eyebrow: 'Attendance needs attention',
        title: `${Math.round(input.attendancePct)}% attendance`,
        description: `Your institution’s threshold is ${input.attendanceThreshold}%.`,
        href: '/attendance',
        actionLabel: 'Review attendance',
        reason: `${gap} points below threshold`,
        metric: `${Math.round(input.attendancePct)}%`,
        dynamicBoost: 70 + Math.min(40, gap * 2),
        source: 'program',
      });
    }

    if (input.todaySlots.length) {
      const nowMinutes = input.now.getHours() * 60 + input.now.getMinutes();
      const nextSlot = input.todaySlots.find((slot) => {
        const [hours = 0, minutes = 0] = slot.start.split(':').map(Number);
        return hours * 60 + minutes >= nowMinutes;
      });
      const slot = nextSlot ?? input.todaySlots[0]!;
      const [hours = 0, minutes = 0] = slot.start.split(':').map(Number);
      const until = hours * 60 + minutes - nowMinutes;
      const soon = Boolean(nextSlot && until >= 0 && until <= 120);
      candidates.push({
        id: `schedule:${slot.id}`,
        kind: 'schedule',
        eyebrow: nextSlot ? 'Next class' : 'Today’s timetable',
        title: slot.subjectName,
        description: [slot.start && `${slot.start}–${slot.end}`, slot.teacherName, slot.roomName].filter(Boolean).join(' · '),
        href: '/timetable',
        actionLabel: 'View timetable',
        reason: soon ? `Starts in ${Math.max(0, until)} minutes` : `${input.todaySlots.length} ${input.todaySlots.length === 1 ? 'class' : 'classes'} today`,
        metric: slot.start,
        dynamicBoost: soon ? 48 : nextSlot ? 20 : 2,
        source: 'program',
      });
    }

    const announcement = input.announcements.find((item) => item.pinned) ?? input.announcements[0];
    if (announcement) {
      candidates.push({
        id: `announcement:${announcement.id}`,
        kind: 'announcement',
        eyebrow: announcement.pinned ? 'Pinned by your institution' : 'Latest announcement',
        title: announcement.title,
        description: announcement.summary ?? 'Open the announcement for details.',
        href: '/announcements',
        actionLabel: 'Read announcement',
        reason: announcement.pinned ? 'Institution priority' : 'Recently published',
        metric: announcement.category ?? 'Notice',
        dynamicBoost: announcement.pinned ? 68 : 8,
        occurredAt: announcement.publishedAt,
        source: 'institution',
      });
    }

    if (input.notificationSummary.count > 0 && input.notificationSummary.latest) {
      candidates.push({
        id: 'notifications:unread',
        kind: 'notification',
        eyebrow: 'Unread updates',
        title: input.notificationSummary.latest.title,
        description: input.notificationSummary.latest.body,
        href: input.notificationSummary.latest.deepLink || '/notifications',
        actionLabel: 'Open update',
        reason: `${input.notificationSummary.count} unread ${input.notificationSummary.count === 1 ? 'update' : 'updates'}`,
        metric: String(input.notificationSummary.count),
        dynamicBoost: Math.min(35, 8 + input.notificationSummary.count * 4),
        occurredAt: input.notificationSummary.latest.occurredAt,
        source: 'program',
      });
    }

    return candidates;
  }

  private async todaySlots(classId: string | null, dayOfWeek: number) {
    if (!classId) return [];
    const rows = await this.db
      .select({
        id: schema.timetableSlots.id,
        start: schema.timetableSlots.startTime,
        end: schema.timetableSlots.endTime,
        subjectName: schema.subjects.name,
        teacherName: sql<string | null>`nullif(trim(concat_ws(' ', ${schema.staff.firstName}, ${schema.staff.lastName})), '')`,
        roomName: schema.timetableSlots.room,
      })
      .from(schema.timetableSlots)
      .leftJoin(schema.subjects, eq(schema.subjects.id, schema.timetableSlots.subjectId))
      .leftJoin(schema.staff, eq(schema.staff.id, schema.timetableSlots.teacherId))
      .where(and(eq(schema.timetableSlots.classId, classId), eq(schema.timetableSlots.dayOfWeek, dayOfWeek)))
      .orderBy(asc(schema.timetableSlots.startTime))
      .limit(20);
    return rows.map((row) => ({
      id: row.id,
      start: row.start ?? '',
      end: row.end ?? '',
      subjectName: row.subjectName ?? 'Class',
      teacherName: row.teacherName,
      roomName: row.roomName,
    }));
  }

  private async attendancePct(studentId: string, institutionId: string) {
    const [term] = await this.db.select({ id: schema.academicTerms.id }).from(schema.academicTerms)
      .where(and(eq(schema.academicTerms.institutionId, institutionId), eq(schema.academicTerms.isCurrent, true))).limit(1);
    if (!term) return null;
    const [overall] = await this.db.select({ pct: schema.attendanceRollups.pct }).from(schema.attendanceRollups)
      .where(and(eq(schema.attendanceRollups.studentId, studentId), eq(schema.attendanceRollups.termId, term.id), isNull(schema.attendanceRollups.subjectId))).limit(1);
    if (overall?.pct == null) return null;
    const value = Number(overall.pct);
    return value <= 1 ? Math.round(value * 1000) / 10 : Math.round(value * 10) / 10;
  }

  private async pendingWorkCount(studentId: string) {
    const [assignments, homework] = await Promise.all([
      this.db.select({ n: sql<number>`count(*)::int` }).from(schema.assignmentSubmissions)
        .innerJoin(schema.assignments, eq(schema.assignments.id, schema.assignmentSubmissions.assignmentId))
        .where(and(eq(schema.assignmentSubmissions.studentId, studentId), inArray(schema.assignmentSubmissions.status, ['assigned', 'missing']), eq(schema.assignments.status, 'published'))),
      this.db.select({ n: sql<number>`count(*)::int` }).from(schema.homeworkSubmissions)
        .innerJoin(schema.homework, eq(schema.homework.id, schema.homeworkSubmissions.homeworkId))
        .where(and(eq(schema.homeworkSubmissions.studentId, studentId), inArray(schema.homeworkSubmissions.status, ['assigned', 'in_progress']), eq(schema.homework.status, 'assigned'))),
    ]);
    return Number(assignments[0]?.n ?? 0) + Number(homework[0]?.n ?? 0);
  }

  private async upcomingDeadlines(studentId: string, from: string, to: string, includeAssignments: boolean, includeHomework: boolean): Promise<Deadline[]> {
    const [assignmentRows, homeworkRows] = await Promise.all([
      includeAssignments ? this.db.select({
        id: schema.assignments.id,
        title: schema.assignments.title,
        dueAt: schema.assignments.dueDate,
        status: schema.assignmentSubmissions.status,
        updatedAt: schema.assignmentSubmissions.updatedAt,
      }).from(schema.assignmentSubmissions)
        .innerJoin(schema.assignments, eq(schema.assignments.id, schema.assignmentSubmissions.assignmentId))
        .where(and(eq(schema.assignmentSubmissions.studentId, studentId), inArray(schema.assignmentSubmissions.status, ['assigned', 'missing']), eq(schema.assignments.status, 'published'), gte(schema.assignments.dueDate, from), lte(schema.assignments.dueDate, to)))
        .orderBy(asc(schema.assignments.dueDate)).limit(8) : Promise.resolve([]),
      includeHomework ? this.db.select({
        id: schema.homework.id,
        title: schema.homework.title,
        dueAt: schema.homework.dueAt,
        status: schema.homeworkSubmissions.status,
        updatedAt: schema.homeworkSubmissions.updatedAt,
      }).from(schema.homeworkSubmissions)
        .innerJoin(schema.homework, eq(schema.homework.id, schema.homeworkSubmissions.homeworkId))
        .where(and(eq(schema.homeworkSubmissions.studentId, studentId), inArray(schema.homeworkSubmissions.status, ['assigned', 'in_progress']), eq(schema.homework.status, 'assigned'), gte(schema.homework.dueAt, new Date(`${from}T00:00:00`)), lte(schema.homework.dueAt, new Date(`${to}T23:59:59`))))
        .orderBy(asc(schema.homework.dueAt)).limit(8) : Promise.resolve([]),
    ]);
    return [
      ...assignmentRows.filter((row) => row.dueAt).map((row) => ({ id: row.id, title: row.title, dueAt: `${row.dueAt}T23:59:00`, kind: 'assignment' as const, status: row.status, updatedAt: row.updatedAt.toISOString() })),
      ...homeworkRows.map((row) => ({ id: row.id, title: row.title, dueAt: row.dueAt.toISOString(), kind: 'homework' as const, status: row.status, updatedAt: row.updatedAt.toISOString() })),
    ].sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime()).slice(0, 8);
  }

  private async outstandingFees(studentId: string): Promise<FeeSummary | null> {
    const rows = await this.db.select({
      amount: schema.feeInvoices.amount,
      paid: schema.feeInvoices.amountPaid,
      status: schema.feeInvoices.status,
      dueDate: schema.feeInvoices.dueDate,
      currency: schema.institutions.currency,
    }).from(schema.feeInvoices)
      .innerJoin(schema.institutions, eq(schema.institutions.id, schema.feeInvoices.institutionId))
      .where(eq(schema.feeInvoices.studentId, studentId));
    const open = rows.filter((row) => row.status !== 'paid' && row.status !== 'cancelled');
    if (!open.length) return null;
    const dueDates = open.map((row) => row.dueDate).filter((value): value is string => Boolean(value)).sort();
    return {
      amount: open.reduce((sum, row) => sum + Math.max(0, row.amount - row.paid), 0),
      currency: open[0]?.currency ?? 'INR',
      invoiceCount: open.length,
      overdueCount: open.filter((row) => row.status === 'overdue').length,
      nextDueDate: dueDates[0] ?? null,
    };
  }

  private async recentAnnouncements(institutionId: string, campusId: string | null): Promise<Announcement[]> {
    const campusFilter = campusId ? or(isNull(schema.announcements.campusId), eq(schema.announcements.campusId, campusId)) : isNull(schema.announcements.campusId);
    const rows = await this.db.select({
      id: schema.announcements.id,
      title: schema.announcements.title,
      body: schema.announcements.body,
      category: schema.announcements.category,
      pinned: schema.announcements.pinned,
      publishedAt: schema.announcements.publishedAt,
    }).from(schema.announcements).where(and(eq(schema.announcements.institutionId, institutionId), eq(schema.announcements.status, 'published'), inArray(schema.announcements.audience, ['all', 'students']), campusFilter))
      .orderBy(desc(schema.announcements.pinned), desc(schema.announcements.publishedAt)).limit(5);
    return rows.filter((row) => row.publishedAt).map((row) => ({
      id: row.id,
      title: row.title,
      summary: row.body?.slice(0, 220) ?? null,
      category: row.category,
      pinned: row.pinned,
      publishedAt: row.publishedAt!.toISOString(),
    }));
  }

  private async unreadSummary(studentId: string) {
    const [events, prefs] = await Promise.all([
      this.db.select({ id: schema.feedEvents.id, title: schema.feedEvents.title, body: schema.feedEvents.body, deepLink: schema.feedEvents.deepLink, occurredAt: schema.feedEvents.occurredAt })
        .from(schema.feedEvents).where(eq(schema.feedEvents.studentId, studentId)).orderBy(desc(schema.feedEvents.occurredAt)).limit(50),
      this.db.select({ dismissed: schema.todayPreferences.ribbonDismissedIds }).from(schema.todayPreferences).where(eq(schema.todayPreferences.studentId, studentId)).limit(1).then((rows) => rows[0]),
    ]);
    const dismissed = new Set(prefs?.dismissed ?? []);
    const unread = events.filter((event) => !dismissed.has(event.id));
    const latest = unread[0];
    return {
      count: unread.length,
      latest: latest ? { title: latest.title, body: latest.body, deepLink: latest.deepLink, occurredAt: latest.occurredAt.toISOString() } : null,
    };
  }

  private async upcomingExams(classId: string | null, from: string): Promise<ExamSummary[]> {
    if (!classId) return [];
    const rows = await this.db.select({
      id: schema.examSchedules.id,
      title: schema.exams.name,
      subjectName: schema.subjects.name,
      examDate: schema.examSchedules.examDate,
      startTime: schema.examSchedules.startTime,
      status: schema.exams.status,
    }).from(schema.examSchedules)
      .innerJoin(schema.exams, eq(schema.exams.id, schema.examSchedules.examId))
      .leftJoin(schema.subjects, eq(schema.subjects.id, schema.examSchedules.subjectId))
      .where(and(eq(schema.examSchedules.classId, classId), eq(schema.examSchedules.published, true), gte(schema.examSchedules.examDate, from)))
      .orderBy(asc(schema.examSchedules.examDate), asc(schema.examSchedules.startTime)).limit(5);
    return rows.map((row) => ({
      id: row.id,
      title: [row.title, row.subjectName].filter(Boolean).join(' · ') || 'Examination',
      startsAt: `${row.examDate ?? from}T${row.startTime ?? '00:00:00'}`,
      status: row.status,
    }));
  }

  private async activeExam(studentId: string): Promise<ActiveExam | null> {
    const [row] = await this.db.select({
      id: schema.examSchedules.id,
      examName: schema.exams.name,
      subjectName: schema.subjects.name,
      endsAt: schema.examAttempts.endsAt,
    }).from(schema.examAttempts)
      .innerJoin(schema.examSchedules, eq(schema.examSchedules.id, schema.examAttempts.examScheduleId))
      .innerJoin(schema.exams, eq(schema.exams.id, schema.examSchedules.examId))
      .leftJoin(schema.subjects, eq(schema.subjects.id, schema.examSchedules.subjectId))
      .where(and(eq(schema.examAttempts.studentId, studentId), isNull(schema.examAttempts.finishedAt)))
      .orderBy(desc(schema.examAttempts.startedAt)).limit(1);
    return row ? { id: row.id, title: [row.examName, row.subjectName].filter(Boolean).join(' · '), endsAt: row.endsAt.toISOString() } : null;
  }

  private async learningContinuity(studentId: string, includeAssignments: boolean, includeHomework: boolean): Promise<Continuity | null> {
    const [homework, assignment] = await Promise.all([
      includeHomework ? this.db.select({ id: schema.homework.id, title: schema.homework.title, dueAt: schema.homework.dueAt, updatedAt: schema.homeworkSubmissions.updatedAt })
        .from(schema.homeworkSubmissions).innerJoin(schema.homework, eq(schema.homework.id, schema.homeworkSubmissions.homeworkId))
        .where(and(eq(schema.homeworkSubmissions.studentId, studentId), eq(schema.homeworkSubmissions.status, 'in_progress'), eq(schema.homework.status, 'assigned')))
        .orderBy(desc(schema.homeworkSubmissions.updatedAt)).limit(1).then((rows) => rows[0]) : Promise.resolve(undefined),
      includeAssignments ? this.db.select({ id: schema.assignments.id, title: schema.assignments.title, dueAt: schema.assignments.dueDate, updatedAt: schema.assignmentAttempts.startedAt })
        .from(schema.assignmentAttempts).innerJoin(schema.assignments, eq(schema.assignments.id, schema.assignmentAttempts.assignmentId))
        .where(and(eq(schema.assignmentAttempts.studentId, studentId), eq(schema.assignmentAttempts.status, 'in_progress'), isNull(schema.assignmentAttempts.finishedAt)))
        .orderBy(desc(schema.assignmentAttempts.startedAt)).limit(1).then((rows) => rows[0]) : Promise.resolve(undefined),
    ]);
    const candidates: Continuity[] = [];
    if (homework) candidates.push({ id: homework.id, title: homework.title, kind: 'homework', href: `/homework/${homework.id}`, dueAt: homework.dueAt.toISOString(), updatedAt: homework.updatedAt.toISOString() });
    if (assignment) candidates.push({ id: assignment.id, title: assignment.title, kind: 'assignment', href: `/assignments/${assignment.id}`, dueAt: assignment.dueAt ? `${assignment.dueAt}T23:59:00` : null, updatedAt: assignment.updatedAt.toISOString() });
    return candidates.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0] ?? null;
  }

  private async rankingPolicy(institutionId: string, campusId: string | null) {
    const rows = await this.db.select({ campusId: schema.institutionSettings.campusId, key: schema.institutionSettings.key, value: schema.institutionSettings.value })
      .from(schema.institutionSettings)
      .where(and(eq(schema.institutionSettings.institutionId, institutionId), eq(schema.institutionSettings.category, 'student_portal'), inArray(schema.institutionSettings.key, ['home_priorities', 'attendance_threshold']), campusId ? or(isNull(schema.institutionSettings.campusId), eq(schema.institutionSettings.campusId, campusId)) : isNull(schema.institutionSettings.campusId)));
    const setting = (key: string) => rows.find((row) => row.key === key && row.campusId === campusId)?.value ?? rows.find((row) => row.key === key && row.campusId == null)?.value ?? null;
    let weights: Partial<Record<StudentHomePriorityKey, number>> = {};
    try { weights = JSON.parse(setting('home_priorities') ?? '{}') as Partial<Record<StudentHomePriorityKey, number>>; } catch { weights = {}; }
    const normalized = Object.fromEntries(Object.entries(defaultStudentHomePriorities).map(([key, fallback]) => {
      const value = Number(weights[key as StudentHomePriorityKey]);
      return [key, Number.isFinite(value) ? Math.max(0, Math.min(100, Math.round(value))) : fallback];
    })) as StudentHomePriorityWeights;
    const threshold = Number(setting('attendance_threshold'));
    return { weights: normalized, attendanceThreshold: Number.isFinite(threshold) ? threshold : 75 };
  }
}
