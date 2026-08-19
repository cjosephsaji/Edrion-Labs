import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, gte, inArray, lte, schema, sql, type Database } from '@edrion/database';
import {
  PETROS_COMPANION_SCHEMA_VERSION,
  petrosBriefingSchema,
  type PetrosBriefing,
  type PetrosBriefingItem,
} from '@edrion/schemas';
import { DATABASE } from '../../../common/tokens';
import { SurfaceGateService } from '../surfaces/surface-gate.service';
import type { InstitutionalStudentPrincipal } from '../student.types';
import { PetrosActionRegistryService } from './petros-action-registry.service';
import { PetrosCompanionRepository } from './petros-companion.repository';
import { PetrosStudentContextService } from './petros-student-context.service';

/**
 * Priority bands. Lower sorts first. These are fixed constants, not model output:
 * the same facts must always produce the same ordering.
 */
const PRIORITY = {
  activeSession: 10,
  overdueWork: 20,
  examToday: 30,
  workDueToday: 40,
  examThisWeek: 50,
  dueReview: 60,
  workDueThisWeek: 70,
  plannerToday: 80,
  attendanceWarning: 90,
  reflection: 100,
} as const;

const DAY_MS = 86_400_000;

@Injectable()
export class PetrosBriefingService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly surfaceGate: SurfaceGateService,
    private readonly actions: PetrosActionRegistryService,
    private readonly repo: PetrosCompanionRepository,
    private readonly context: PetrosStudentContextService,
  ) {}

  private has(principal: InstitutionalStudentPrincipal, permission: string) {
    return principal.permissions.includes(permission) || principal.permissions.includes('*');
  }

  /**
   * Assembles the briefing from database facts only. No AI request is made here, so
   * navigating between pages never costs a model call.
   */
  async build(principal: InstitutionalStudentPrincipal, now = new Date()): Promise<PetrosBriefing> {
    const scope = { institutionId: principal.institutionId, studentId: principal.studentId };

    // The student's own settings decide whether Petros speaks first at all. Returning an
    // empty list without saying why would read as "nothing is urgent", which is a different
    // and possibly false claim.
    const preferences = await this.repo.findPreferences(scope);
    const mutedBy = preferences?.quietMode
      ? ('quiet_mode' as const)
      : preferences && !preferences.proactiveCheckIns
        ? ('check_ins_off' as const)
        : null;
    if (mutedBy) {
      return petrosBriefingSchema.parse({
        schemaVersion: PETROS_COMPANION_SCHEMA_VERSION,
        generatedAt: now.toISOString(),
        headline:
          mutedBy === 'quiet_mode'
            ? 'Quiet mode is on. Ask me whenever you want.'
            : 'Check-ins are off. Ask me whenever you want.',
        items: [],
        quiet: true,
        mutedBy,
      });
    }

    const suppressed = new Set(
      (await this.repo.listSuppressedNudges(scope)).map((row) => row.nudgeKey),
    );

    const items: PetrosBriefingItem[] = [];
    const push = (item: PetrosBriefingItem) => {
      const key = `${item.kind}:${item.entityId ?? item.title}`;
      if (!suppressed.has(key)) items.push(item);
    };

    const session = await this.actions.activeSession(principal);
    if (session) {
      push({
        kind: 'active_session',
        title: `Continue ${session.topic}`,
        detail: `Your ${session.status} session is still open.`,
        href: `/petros/session?session=${session.id}`,
        priority: PRIORITY.activeSession,
        entityType: 'petros_session',
        entityId: session.id,
      });
    }

    if (this.has(principal, 'student.assignments.view')) {
      for (const row of await this.dueAssignments(principal)) {
        const due = row.dueDate ? new Date(`${row.dueDate}T23:59:59`) : null;
        push({
          kind: 'due_work',
          title: row.title,
          detail: describeDue(due, now, row.subject),
          href: `/assignments/${row.id}`,
          priority: bandForDue(due, now, PRIORITY),
          entityType: 'assignment',
          entityId: row.id,
        });
      }
    }

    if (this.has(principal, 'student.homework.view')) {
      for (const row of await this.dueHomework(principal)) {
        push({
          kind: 'due_work',
          title: row.title,
          detail: describeDue(row.dueAt, now, row.subject),
          href: `/homework/${row.id}`,
          priority: bandForDue(row.dueAt, now, PRIORITY),
          entityType: 'homework',
          entityId: row.id,
        });
      }
    }

    if (
      this.has(principal, 'student.exams.view') &&
      (await this.surfaceGate.isSurfaceEnabled(principal, 'exams'))
    ) {
      for (const row of await this.upcomingExams(principal)) {
        const date = row.examDate ? new Date(`${row.examDate}T${row.startTime ?? '09:00'}`) : null;
        const days = date ? Math.floor((date.getTime() - now.getTime()) / DAY_MS) : 99;
        push({
          kind: 'exam',
          title: `${row.subject ?? 'Exam'} — ${row.examName}`,
          detail: row.syllabus
            ? `${describeWhen(date, now)} · covers ${row.syllabus.slice(0, 120)}`
            : describeWhen(date, now),
          href: '/exams',
          priority: days <= 0 ? PRIORITY.examToday : PRIORITY.examThisWeek,
          entityType: 'exam_schedule',
          entityId: row.id,
        });
      }
    }

    if (this.has(principal, 'student.learn.use')) {
      const review = await this.actions.nextDueReview(principal);
      if (review) {
        push({
          kind: 'review',
          title: `Review ${review.title}`,
          detail: 'This one is due for a spaced review.',
          href: `/petros/artifacts?artifact=${review.id}`,
          priority: PRIORITY.dueReview,
          entityType: 'artifact',
          entityId: review.id,
        });
      }
    }

    for (const row of await this.plannerToday(principal, now)) {
      push({
        kind: 'planner',
        title: row.title,
        detail: `You planned this for ${formatTime(row.dueAt)}.`,
        href: '/calendar',
        priority: PRIORITY.plannerToday,
        entityType: 'planner_item',
        entityId: row.id,
      });
    }

    if (
      this.has(principal, 'student.attendance.view') &&
      (await this.surfaceGate.isSurfaceEnabled(principal, 'attendance'))
    ) {
      const attendance = await this.attendanceWarning(principal);
      if (attendance) {
        push({
          kind: 'attendance',
          title: `${attendance.subject ?? 'Attendance'} is at ${attendance.pct}%`,
          detail: 'Worth keeping an eye on.',
          href: '/attendance',
          priority: PRIORITY.attendanceWarning,
          entityType: 'attendance_summary',
          entityId: null,
        });
      }
    }

    items.sort((a, b) => a.priority - b.priority || a.title.localeCompare(b.title));
    const top = items.slice(0, 6);

    return petrosBriefingSchema.parse({
      schemaVersion: PETROS_COMPANION_SCHEMA_VERSION,
      generatedAt: now.toISOString(),
      headline: top.length ? headlineFor(top[0]!) : 'Nothing urgent right now.',
      items: top,
      // "Nothing urgent" is calm availability, never invented work.
      quiet: top.length === 0,
      mutedBy: null,
    });
  }

  async dismiss(principal: InstitutionalStudentPrincipal, nudgeKey: string) {
    const suppressUntil = new Date(Date.now() + DAY_MS);
    await this.repo.dismissNudge(
      { institutionId: principal.institutionId, studentId: principal.studentId },
      nudgeKey,
      suppressUntil,
    );
    return { nudgeKey, suppressedUntil: suppressUntil.toISOString() };
  }

  /**
   * Both queries reuse the portal's own visibility rules. Anything stricter would make the
   * briefing quietly omit work the student can plainly see on their own list.
   */
  private async dueAssignments(principal: InstitutionalStudentPrincipal) {
    const visibility = await this.context.assignmentVisibility(principal);
    if (!visibility) return [];
    return this.db
      .select({
        id: schema.assignments.id,
        title: schema.assignments.title,
        subject: schema.subjects.name,
        dueDate: schema.assignments.dueDate,
      })
      .from(schema.assignments)
      .leftJoin(schema.subjects, eq(schema.subjects.id, schema.assignments.subjectId))
      .leftJoin(
        schema.assignmentSubmissions,
        and(
          eq(schema.assignmentSubmissions.assignmentId, schema.assignments.id),
          eq(schema.assignmentSubmissions.studentId, principal.studentId),
        ),
      )
      .where(
        and(
          eq(schema.assignments.institutionId, principal.institutionId),
          eq(schema.assignments.status, 'published'),
          visibility,
          sql`coalesce(${schema.assignmentSubmissions.status}, 'assigned') in ('assigned','in_progress','missing','late')`,
        ),
      )
      .orderBy(asc(schema.assignments.dueDate))
      .limit(5);
  }

  private dueHomework(principal: InstitutionalStudentPrincipal) {
    return this.db
      .select({
        id: schema.homework.id,
        title: schema.homework.title,
        subject: schema.subjects.name,
        dueAt: schema.homework.dueAt,
      })
      .from(schema.homeworkSubmissions)
      .innerJoin(schema.homework, eq(schema.homework.id, schema.homeworkSubmissions.homeworkId))
      .leftJoin(schema.subjects, eq(schema.subjects.id, schema.homework.subjectId))
      .where(
        and(
          eq(schema.homeworkSubmissions.studentId, principal.studentId),
          eq(schema.homework.institutionId, principal.institutionId),
          inArray(schema.homework.status, ['assigned', 'closed']),
          sql`${schema.homeworkSubmissions.status} in ('assigned','in_progress','missing','late')`,
        ),
      )
      .orderBy(asc(schema.homework.dueAt))
      .limit(5);
  }

  private async upcomingExams(principal: InstitutionalStudentPrincipal) {
    const [student] = await this.db
      .select({ classId: schema.students.classId })
      .from(schema.students)
      .where(
        and(
          eq(schema.students.id, principal.studentId),
          eq(schema.students.institutionId, principal.institutionId),
        ),
      )
      .limit(1);
    if (!student?.classId) return [];
    return this.db
      .select({
        id: schema.examSchedules.id,
        examName: schema.exams.name,
        subject: schema.subjects.name,
        examDate: schema.examSchedules.examDate,
        startTime: schema.examSchedules.startTime,
        syllabus: schema.examSchedules.syllabusNote,
      })
      .from(schema.examSchedules)
      .innerJoin(schema.exams, eq(schema.exams.id, schema.examSchedules.examId))
      .leftJoin(schema.subjects, eq(schema.subjects.id, schema.examSchedules.subjectId))
      .where(
        and(
          eq(schema.examSchedules.institutionId, principal.institutionId),
          eq(schema.examSchedules.classId, student.classId),
          eq(schema.examSchedules.published, true),
          gte(schema.examSchedules.examDate, new Date().toISOString().slice(0, 10)),
        ),
      )
      .orderBy(asc(schema.examSchedules.examDate))
      .limit(3);
  }

  private plannerToday(principal: InstitutionalStudentPrincipal, now: Date) {
    const endOfDay = new Date(now);
    endOfDay.setHours(23, 59, 59, 999);
    return this.db
      .select({
        id: schema.userObligations.id,
        title: schema.userObligations.title,
        dueAt: schema.userObligations.dueAt,
      })
      .from(schema.userObligations)
      .where(
        and(
          eq(schema.userObligations.studentId, principal.studentId),
          eq(schema.userObligations.status, 'pending'),
          gte(schema.userObligations.dueAt, now),
          lte(schema.userObligations.dueAt, endOfDay),
        ),
      )
      .orderBy(asc(schema.userObligations.dueAt))
      .limit(3);
  }

  private attendanceWarning(principal: InstitutionalStudentPrincipal) {
    return this.db
      .select({
        subject: schema.subjects.name,
        pct: schema.attendanceRollups.pct,
        zone: schema.attendanceRollups.zone,
      })
      .from(schema.attendanceRollups)
      .leftJoin(schema.subjects, eq(schema.subjects.id, schema.attendanceRollups.subjectId))
      .where(
        and(
          eq(schema.attendanceRollups.studentId, principal.studentId),
          eq(schema.attendanceRollups.institutionId, principal.institutionId),
          sql`${schema.attendanceRollups.zone} in ('warning','critical')`,
        ),
      )
      .orderBy(asc(schema.attendanceRollups.pct))
      .limit(1)
      .then((rows) => rows[0]);
  }
}

function bandForDue(due: Date | null, now: Date, priority: typeof PRIORITY) {
  if (!due) return priority.workDueThisWeek;
  const diff = due.getTime() - now.getTime();
  if (diff < 0) return priority.overdueWork;
  if (diff <= DAY_MS) return priority.workDueToday;
  return priority.workDueThisWeek;
}

function describeDue(due: Date | null, now: Date, subject: string | null) {
  const prefix = subject ? `${subject} · ` : '';
  if (!due) return `${prefix}no due date set`;
  const diff = due.getTime() - now.getTime();
  const days = Math.round(diff / DAY_MS);
  if (diff < 0) return `${prefix}overdue by ${Math.abs(days) || 1} day${Math.abs(days) === 1 ? '' : 's'}`;
  if (diff <= DAY_MS) return `${prefix}due today`;
  return `${prefix}due in ${days} day${days === 1 ? '' : 's'}`;
}

/** Exams happen, they are not "due". */
function describeWhen(at: Date | null, now: Date) {
  if (!at) return 'date not published';
  const diff = at.getTime() - now.getTime();
  const days = Math.round(diff / DAY_MS);
  if (diff < 0) return 'already sat';
  if (diff <= DAY_MS) return 'today';
  if (days === 1) return 'tomorrow';
  return `in ${days} days`;
}

function headlineFor(item: PetrosBriefingItem) {
  switch (item.kind) {
    case 'active_session':
      return 'You have a session still open.';
    case 'exam':
      return 'An exam is coming up.';
    case 'due_work':
      return item.detail.includes('overdue') ? 'Something is overdue.' : 'Work is due soon.';
    case 'review':
      return 'A review is due.';
    default:
      return 'Here is what matters next.';
  }
}

function formatTime(date: Date) {
  return date.toISOString().slice(11, 16);
}
