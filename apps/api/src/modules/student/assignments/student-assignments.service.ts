import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, inArray, or, schema, sql, type Database } from '@edrion/database';
import type { AssignmentListFilter, SubmitAssignmentInput } from '@edrion/schemas';
import { DATABASE, LEARNING_EVENTS_WRITER } from '../../../common/tokens';
import type { LearningEventsWriter } from '../ledger/learning-events.writer';
import type { InstitutionalStudentPrincipal } from '../student.types';

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

    const assigneeIds = (
      await this.db
        .select({ assignmentId: schema.assignmentAssignees.assignmentId })
        .from(schema.assignmentAssignees)
        .where(eq(schema.assignmentAssignees.studentId, principal.studentId))
    ).map((a) => a.assignmentId);

    const t = schema.assignments;
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
        subjectName: schema.subjects.name,
        status: schema.assignmentSubmissions.status,
      })
      .from(t)
      .leftJoin(schema.subjects, eq(t.subjectId, schema.subjects.id))
      .leftJoin(
        schema.assignmentSubmissions,
        and(
          eq(schema.assignmentSubmissions.assignmentId, t.id),
          eq(schema.assignmentSubmissions.studentId, principal.studentId),
        ),
      )
      .where(and(eq(t.institutionId,principal.institutionId),eq(t.status, 'published'), visibility,sql`edrion_petros_assignment_active(${t.id})`))
      .orderBy(t.dueDate);

    return {
      items: rows
        .filter((r) => this.matchesFilter(r.status, filter))
        .map((r) => ({
          id: r.id,
          title: r.title,
          subjectName: r.subjectName,
          dueAt: r.dueDate,
          status: r.status ?? 'assigned',
        })),
    };
  }

  async detail(principal: InstitutionalStudentPrincipal, assignmentId: string) {
    const row = await this.loadVisibleAssignment(principal, assignmentId);
    const [sub] = await this.db
      .select()
      .from(schema.assignmentSubmissions)
      .where(
        and(
          eq(schema.assignmentSubmissions.assignmentId, assignmentId),
          eq(schema.assignmentSubmissions.studentId, principal.studentId),
        ),
      )
      .limit(1);

    const versions = sub
      ? await this.db
          .select()
          .from(schema.assignmentSubmissionVersions)
          .where(eq(schema.assignmentSubmissionVersions.submissionId, sub.id))
          .orderBy(schema.assignmentSubmissionVersions.versionNo)
      : [];

    return {
      id: row.assignment.id,
      title: row.assignment.title,
      instructions: row.assignment.instructions,
      dueAt: row.assignment.dueDate,
      maxPoints: row.assignment.maxPoints,
      aiPolicy: row.assignment.aiPolicy,
      allowResubmission: row.assignment.allowResubmission,
      status: sub?.status ?? 'assigned',
      pointsAwarded: sub?.pointsAwarded ?? null,
      feedback: sub?.feedback ?? null,
      versions: versions.map((v) => ({
        versionNo: v.versionNo,
        submittedAt: v.submittedAt.toISOString(),
        late: v.late,
        note: v.note,
      })),
    };
  }

  async submit(principal: InstitutionalStudentPrincipal, assignmentId: string, input: SubmitAssignmentInput) {
    const row = await this.loadVisibleAssignment(principal, assignmentId);
    const detail = await this.detail(principal, assignmentId);

    const [existing] = await this.db
      .select()
      .from(schema.assignmentSubmissions)
      .where(
        and(
          eq(schema.assignmentSubmissions.assignmentId, assignmentId),
          eq(schema.assignmentSubmissions.studentId, principal.studentId),
        ),
      )
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
    const late = this.isLate(row.assignment.dueDate, existing?.status ?? 'assigned');

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

  private async loadVisibleAssignment(principal: InstitutionalStudentPrincipal, assignmentId: string) {
    const [admission]=await this.db.execute<{active:boolean}>(sql`select edrion_petros_assignment_active(${assignmentId}::uuid) as active`);
    if(!admission?.active)throw new NotFoundException('Assignment unavailable');

    const [row] = await this.db
      .select({ assignment: schema.assignments })
      .from(schema.assignments)
      .where(and(eq(schema.assignments.id, assignmentId), eq(schema.assignments.status, 'published')))
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
      .where(
        and(
          eq(schema.assignmentAssignees.assignmentId, assignmentId),
          eq(schema.assignmentAssignees.studentId, principal.studentId),
        ),
      )
      .limit(1);
    const classMatch = student?.classId === row.assignment.classId;
    let courseMatch = false;
    if (row.assignment.courseId) {
      const [enrolled] = await this.db
        .select({ id: schema.courseEnrollments.id })
        .from(schema.courseEnrollments)
        .where(
          and(
            eq(schema.courseEnrollments.courseId, row.assignment.courseId),
            eq(schema.courseEnrollments.studentId, principal.studentId),
          ),
        )
        .limit(1);
      courseMatch = !!enrolled;
    }
    if (!assignee && !classMatch && !courseMatch) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Assignment not found' });
    }
    return row;
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
}
