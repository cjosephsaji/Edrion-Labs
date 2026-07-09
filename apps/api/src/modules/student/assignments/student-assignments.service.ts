import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, inArray, or, schema, sql, type Database } from '@edrion/database';
import type { AssignmentListFilter, SubmitAssignmentInput } from '@edrion/schemas';
import { DATABASE, LEARNING_EVENTS_WRITER } from '../../../common/tokens';
import type { LearningEventsWriter } from '../ledger/learning-events.writer';
import type { InstitutionalStudentPrincipal } from '../student.types';

const profName = sql<string>`concat_ws(' ', ${schema.staff.firstName}, ${schema.staff.lastName})`;

@Injectable()
export class StudentAssignmentsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(LEARNING_EVENTS_WRITER) private readonly ledger: LearningEventsWriter,
  ) {}

  async list(principal: InstitutionalStudentPrincipal, filter: AssignmentListFilter) {
    const [student] = await this.db
      .select({ classId: schema.students.classId })
      .from(schema.students)
      .where(eq(schema.students.id, principal.studentId))
      .limit(1);

    const enrolled = await this.db
      .select({ courseId: schema.courseEnrollments.courseId })
      .from(schema.courseEnrollments)
      .where(eq(schema.courseEnrollments.studentId, principal.studentId));
    const courseIds = enrolled.map((e) => e.courseId);

    const t = schema.assignments;
    const classAssigneeIds = await this.db
      .select({ assignmentId: schema.assignmentAssignees.assignmentId })
      .from(schema.assignmentAssignees)
      .where(eq(schema.assignmentAssignees.studentId, principal.studentId));
    const assigneeIds = classAssigneeIds.map((a) => a.assignmentId);

    const visibilityParts = [
      student?.classId ? eq(t.classId, student.classId) : undefined,
      courseIds.length ? inArray(t.courseId, courseIds) : undefined,
      assigneeIds.length ? inArray(t.id, assigneeIds) : undefined,
    ].filter((c): c is NonNullable<typeof c> => !!c);
    if (!visibilityParts.length) return { items: [] };
    const visibility = visibilityParts.length === 1 ? visibilityParts[0]! : or(...visibilityParts);

    const rows = await this.db
      .select({
        id: t.id,
        title: t.title,
        dueDate: t.dueDate,
        latePolicy: t.latePolicy,
        courseCode: schema.courses.code,
        professorName: profName,
        status: schema.assignmentSubmissions.status,
        submittedDate: schema.assignmentSubmissions.submittedDate,
        deliveryMode: t.deliveryMode,
      })
      .from(t)
      .leftJoin(schema.courses, eq(t.courseId, schema.courses.id))
      .leftJoin(schema.staff, eq(t.teacherId, schema.staff.id))
      .leftJoin(
        schema.assignmentSubmissions,
        and(eq(schema.assignmentSubmissions.assignmentId, t.id), eq(schema.assignmentSubmissions.studentId, principal.studentId)),
      )
      .where(and(eq(t.status, 'published'), visibility))
      .orderBy(t.dueDate);

    const items = rows
      .filter((r) => this.matchesFilter(r.status, filter))
      .map((r) => {
        const late = this.isLate(r.dueDate, r.status);
        const penalty = this.latePenaltyLabel(r.dueDate, r.latePolicy, r.status);
        return {
          id: r.id,
          title: r.title,
          courseCode: r.courseCode,
          professorName: r.professorName,
          dueLabel: r.dueDate ? `Due ${r.dueDate}` : 'No due date',
          badge: { label: r.status ?? 'assigned', tone: late ? 'warning' : 'neutral' },
          status: r.status ?? 'assigned',
          late,
          latePenaltyLabel: penalty,
          deliveryMode: r.deliveryMode,
        };
      });
    return { items };
  }

  async detail(principal: InstitutionalStudentPrincipal, assignmentId: string) {
    const [row] = await this.db
      .select({ assignment: schema.assignments, course: schema.courses })
      .from(schema.assignments)
      .leftJoin(schema.courses, eq(schema.assignments.courseId, schema.courses.id))
      .where(eq(schema.assignments.id, assignmentId))
      .limit(1);
    if (!row) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Assignment not found' });

    const [student] = await this.db
      .select({ classId: schema.students.classId })
      .from(schema.students)
      .where(eq(schema.students.id, principal.studentId))
      .limit(1);
    const [assignee] = await this.db
      .select({ id: schema.assignmentAssignees.id })
      .from(schema.assignmentAssignees)
      .where(and(eq(schema.assignmentAssignees.assignmentId, assignmentId), eq(schema.assignmentAssignees.studentId, principal.studentId)))
      .limit(1);
    const classMatch = student?.classId === row.assignment.classId;
    let courseMatch = false;
    if (row.assignment.courseId) {
      const [enrolled] = await this.db
        .select({ id: schema.courseEnrollments.id })
        .from(schema.courseEnrollments)
        .where(and(eq(schema.courseEnrollments.courseId, row.assignment.courseId), eq(schema.courseEnrollments.studentId, principal.studentId)))
        .limit(1);
      courseMatch = !!enrolled;
    }
    if (!assignee && !classMatch && !courseMatch) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Assignment not found' });
    }

    if (row.assignment.deliveryMode === 'quiz') {
      return {
        id: row.assignment.id,
        title: row.assignment.title,
        deliveryMode: 'quiz' as const,
        dueDate: row.assignment.dueDate,
        maxPoints: row.assignment.maxPoints,
        instructions: row.assignment.instructions,
      };
    }

    const [sub] = await this.db
      .select()
      .from(schema.assignmentSubmissions)
      .where(and(eq(schema.assignmentSubmissions.assignmentId, assignmentId), eq(schema.assignmentSubmissions.studentId, principal.studentId)))
      .limit(1);

    const versions = sub
      ? await this.db
          .select()
          .from(schema.assignmentSubmissionVersions)
          .where(eq(schema.assignmentSubmissionVersions.submissionId, sub.id))
          .orderBy(desc(schema.assignmentSubmissionVersions.versionNo))
      : [];

    const attachments = (row.assignment.attachmentObjectIds ?? []).map((objectId) => ({
      objectId,
      url: `/v1/student/storage/${objectId}`,
    }));

    return {
      id: row.assignment.id,
      title: row.assignment.title,
      deliveryMode: 'file' as const,
      instructions: row.assignment.instructions,
      dueDate: row.assignment.dueDate,
      maxPoints: row.assignment.maxPoints,
      aiPolicy: row.assignment.aiPolicy,
      attachmentUrls: attachments,
      latePolicyLine: this.latePolicyLine(row.assignment.dueDate, row.assignment.latePolicy),
      allowResubmission: row.assignment.allowResubmission,
      status: sub?.status ?? 'assigned',
      versions: versions.map((v) => ({
        versionNo: v.versionNo,
        submittedAt: v.submittedAt.toISOString(),
        late: v.late,
        note: v.note,
      })),
      pointsAwarded: sub?.pointsAwarded ?? null,
      feedback: sub?.feedback ?? null,
    };
  }

  async submit(principal: InstitutionalStudentPrincipal, assignmentId: string, input: SubmitAssignmentInput) {
    const detail = await this.detail(principal, assignmentId);
    const [existing] = await this.db
      .select()
      .from(schema.assignmentSubmissions)
      .where(and(eq(schema.assignmentSubmissions.assignmentId, assignmentId), eq(schema.assignmentSubmissions.studentId, principal.studentId)))
      .limit(1);

    let submissionId = existing?.id;
    if (!submissionId) {
      const [ins] = await this.db
        .insert(schema.assignmentSubmissions)
        .values({
          institutionId: principal.institutionId,
          assignmentId,
          studentId: principal.studentId,
          status: 'submitted',
          submittedDate: new Date().toISOString().slice(0, 10),
        })
        .returning({ id: schema.assignmentSubmissions.id });
      submissionId = ins!.id;
    } else if (existing!.status === 'graded' && !detail.allowResubmission) {
      throw new BadRequestException({ code: 'RESUBMIT_BLOCKED', message: 'Resubmission not allowed' });
    } else if (existing!.status === 'graded' && detail.allowResubmission) {
      // ok
    } else if (!detail.allowResubmission && existing!.status !== 'assigned') {
      const vers = await this.db
        .select({ c: sql<number>`count(*)` })
        .from(schema.assignmentSubmissionVersions)
        .where(eq(schema.assignmentSubmissionVersions.submissionId, submissionId));
      if (Number(vers[0]?.c ?? 0) >= 1) {
        throw new BadRequestException({ code: 'RESUBMIT_BLOCKED', message: 'Resubmission not allowed' });
      }
    }

    const vers = await this.db
      .select({ max: sql<number>`coalesce(max(${schema.assignmentSubmissionVersions.versionNo}), 0)` })
      .from(schema.assignmentSubmissionVersions)
      .where(eq(schema.assignmentSubmissionVersions.submissionId, submissionId!));
    const versionNo = Number(vers[0]?.max ?? 0) + 1;
    const late = this.isLate(detail.dueDate, existing?.status ?? 'assigned');

    await this.db.insert(schema.assignmentSubmissionVersions).values({
      submissionId: submissionId!,
      versionNo,
      fileObjectIds: input.fileObjectIds,
      note: input.note ?? null,
      late,
    });
    await this.db
      .update(schema.assignmentSubmissions)
      .set({ status: late ? 'late' : 'submitted', submittedDate: new Date().toISOString().slice(0, 10) })
      .where(eq(schema.assignmentSubmissions.id, submissionId!));

    await this.ledger.log({
      eventType: 'assignment.submitted',
      payload: { assignmentId, versionNo },
      contextType: 'assignment',
      contextId: assignmentId,
      principal,
    });
    return { submitted: true, versionNo };
  }

  private matchesFilter(status: string | null, filter: AssignmentListFilter) {
    const s = status ?? 'assigned';
    if (filter === 'all') return true;
    if (filter === 'progress') return ['assigned', 'in_progress'].includes(s);
    if (filter === 'submitted') return ['submitted', 'late'].includes(s);
    if (filter === 'returned') return s === 'graded';
    return true;
  }

  private isLate(dueDate: string | null, status: string | null) {
    if (!dueDate || status === 'graded') return false;
    return dueDate < new Date().toISOString().slice(0, 10) && !['submitted', 'late', 'graded'].includes(status ?? '');
  }

  private latePenaltyLabel(dueDate: string | null, policy: { penaltyPercentPerDay: number; maxLateDays: number } | null, status: string | null) {
    if (!dueDate || !policy || status === 'graded') return null;
    const today = new Date();
    const due = new Date(dueDate);
    const daysLate = Math.floor((today.getTime() - due.getTime()) / 86400000);
    if (daysLate <= 0) return null;
    const capped = Math.min(daysLate, policy.maxLateDays);
    if (daysLate > policy.maxLateDays) return 'Missed';
    return `Late · −${capped * policy.penaltyPercentPerDay}%`;
  }

  private latePolicyLine(dueDate: string | null, policy: { penaltyPercentPerDay: number; maxLateDays: number } | null) {
    if (!policy) return null;
    const day = dueDate ? Math.max(0, Math.floor((Date.now() - new Date(dueDate).getTime()) / 86400000)) : 0;
    return `Late policy: −${policy.penaltyPercentPerDay}% per day, max ${policy.maxLateDays} days.${day > 0 ? ` This is on day ${Math.min(day, policy.maxLateDays)}.` : ''}`;
  }
}
