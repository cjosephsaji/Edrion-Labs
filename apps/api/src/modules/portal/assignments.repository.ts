import { Inject, Injectable } from '@nestjs/common';
import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  inArray,
  isNull,
  or,
  schema,
  sql,
  personSqlName,
  type Database,
  type PgColumn,
  type SQL,
} from '@edrion/database';
import type {
  Assignment,
  AssignmentSubmission,
  NewAssignment,
  NewAssignmentSubmission,
  AssignmentQuestion,
  NewAssignmentQuestion,
  AssignmentAttempt,
  AssignmentAnswer,
} from '@edrion/database';
import type { AssignmentsListQuery } from '@edrion/schemas';
import { DATABASE } from '../../common/tokens';
import type { CampusFilter, Page } from './academics.repository';

const teacherDisplayName = personSqlName(schema.staff.firstName, schema.staff.middleName, schema.staff.lastName);
const studentDisplayName = personSqlName(schema.students.firstName, schema.students.middleName, schema.students.lastName);

export interface AssignmentRow extends Assignment {
  className: string | null;
  subjectName: string | null;
  teacherName: string | null;
  submissionCount: number;
  gradedCount: number;
}
export interface AssignmentSubmissionRow extends AssignmentSubmission {
  studentName: string | null;
  admissionNo: string | null;
}

/** Which referenceable table an FK points at (for friendly-400 pre-checks). */
export type AssignmentRefTable = 'classes' | 'subjects' | 'staff' | 'students';

/**
 * Typed SQL for the institution-portal assignments tables (assignments + per-student submissions).
 * Every query is confined to one institution; campus-scoped assignment reads also include
 * institution-owned (campus_id IS NULL) rows. The service owns scope/version/FK/audit.
 */
@Injectable()
export class AssignmentsRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  private scopeConds(
    instCol: PgColumn,
    campusCol: PgColumn,
    institutionId: string,
    campusIds: CampusFilter,
  ): SQL[] {
    const conds: SQL[] = [eq(instCol, institutionId)];
    if (campusIds) {
      const inScope = or(isNull(campusCol), inArray(campusCol, campusIds));
      if (inScope) conds.push(inScope);
    }
    return conds;
  }

  private order(col: PgColumn | undefined, dir: 'asc' | 'desc', fallback: PgColumn): SQL {
    const c = col ?? fallback;
    return dir === 'asc' ? asc(c) : desc(c);
  }

  async existsInInstitution(table: AssignmentRefTable, id: string, institutionId: string): Promise<boolean> {
    const t = schema[table];
    const [row] = await this.db
      .select({ id: t.id })
      .from(t)
      .where(and(eq(t.id, id), eq(t.institutionId, institutionId)))
      .limit(1);
    return !!row;
  }

  // --- assignments -----------------------------------------------------------

  async list(institutionId: string, campusIds: CampusFilter, q: AssignmentsListQuery): Promise<Page<AssignmentRow>> {
    const t = schema.assignments;
    const conds = this.scopeConds(t.institutionId, t.campusId, institutionId, campusIds);
    if (q.classId) conds.push(eq(t.classId, q.classId));
    if (q.status) conds.push(eq(t.status, q.status));
    if (q.search) {
      const s = ilike(t.title, `%${q.search}%`);
      if (s) conds.push(s);
    }
    const where = and(...conds);
    const sortable: Record<string, PgColumn> = {
      title: t.title,
      status: t.status,
      dueDate: t.dueDate,
      createdAt: t.createdAt,
    };
    const limit = q.pageSize;
    const offset = (q.page - 1) * q.pageSize;

    const subCount = sql<number>`(select count(*) from ${schema.assignmentSubmissions} s where s.assignment_id = ${t.id})`;
    const gradedCount = sql<number>`(select count(*) from ${schema.assignmentSubmissions} s where s.assignment_id = ${t.id} and s.status = 'graded')`;

    const rows = await this.db
      .select({
        assignment: t,
        className: schema.classes.name,
        subjectName: schema.subjects.name,
        teacherName: teacherDisplayName,
        submissionCount: subCount,
        gradedCount,
      })
      .from(t)
      .leftJoin(schema.classes, eq(schema.classes.id, t.classId))
      .leftJoin(schema.subjects, eq(schema.subjects.id, t.subjectId))
      .leftJoin(schema.staff, eq(schema.staff.id, t.teacherId))
      .where(where)
      .orderBy(this.order(q.sortBy ? sortable[q.sortBy] : undefined, q.sortDir, t.createdAt))
      .limit(limit)
      .offset(offset);
    const [tot] = await this.db.select({ value: count() }).from(t).where(where);
    return {
      items: rows.map((r) => ({
        ...r.assignment,
        className: r.className,
        subjectName: r.subjectName,
        teacherName: r.teacherName,
        submissionCount: Number(r.submissionCount ?? 0),
        gradedCount: Number(r.gradedCount ?? 0),
      })),
      total: Number(tot?.value ?? 0),
    };
  }

  async find(id: string, institutionId: string): Promise<Assignment | undefined> {
    const t = schema.assignments;
    const [row] = await this.db.select().from(t).where(and(eq(t.id, id), eq(t.institutionId, institutionId))).limit(1);
    return row;
  }

  async insert(values: NewAssignment): Promise<Assignment> {
    const [row] = await this.db.insert(schema.assignments).values(values).returning();
    return row!;
  }

  async update(id: string, version: number, patch: Partial<NewAssignment>): Promise<Assignment | undefined> {
    const t = schema.assignments;
    const [row] = await this.db
      .update(t)
      .set({ ...patch, version: version + 1, updatedAt: new Date() })
      .where(and(eq(t.id, id), eq(t.version, version)))
      .returning();
    return row;
  }

  async delete(id: string, version: number): Promise<boolean> {
    const t = schema.assignments;
    const rows = await this.db.delete(t).where(and(eq(t.id, id), eq(t.version, version))).returning({ id: t.id });
    return rows.length > 0;
  }

  // --- submissions (per student) ---------------------------------------------

  async listSubmissions(assignmentId: string): Promise<AssignmentSubmissionRow[]> {
    const t = schema.assignmentSubmissions;
    const rows = await this.db
      .select({ sub: t, studentName: studentDisplayName, admissionNo: schema.students.admissionNo })
      .from(t)
      .leftJoin(schema.students, eq(schema.students.id, t.studentId))
      .where(eq(t.assignmentId, assignmentId))
      .orderBy(asc(studentDisplayName));
    return rows.map((r) => ({ ...r.sub, studentName: r.studentName, admissionNo: r.admissionNo }));
  }

  /** Upsert one student's submission within an assignment (unique on (assignment, student)). */
  async upsertSubmission(values: NewAssignmentSubmission): Promise<void> {
    const t = schema.assignmentSubmissions;
    await this.db
      .insert(t)
      .values(values)
      .onConflictDoUpdate({
        target: [t.assignmentId, t.studentId],
        set: {
          status: values.status,
          submittedDate: values.submittedDate ?? null,
          pointsAwarded: values.pointsAwarded ?? null,
          feedback: values.feedback ?? null,
          version: sql`${t.version} + 1`,
          updatedBy: values.createdBy ?? null,
          updatedAt: new Date(),
        },
      });
  }

  async findSubmission(id: string, assignmentId: string): Promise<AssignmentSubmission | undefined> {
    const t = schema.assignmentSubmissions;
    const [row] = await this.db.select().from(t).where(and(eq(t.id, id), eq(t.assignmentId, assignmentId))).limit(1);
    return row;
  }

  async deleteSubmission(id: string): Promise<boolean> {
    const t = schema.assignmentSubmissions;
    const rows = await this.db.delete(t).where(eq(t.id, id)).returning({ id: t.id });
    return rows.length > 0;
  }

  // --- questions -------------------------------------------------------------

  async listQuestions(assignmentId: string): Promise<AssignmentQuestion[]> {
    return this.db
      .select()
      .from(schema.assignmentQuestions)
      .where(eq(schema.assignmentQuestions.assignmentId, assignmentId))
      .orderBy(asc(schema.assignmentQuestions.sequence));
  }

  async findQuestion(id: string, assignmentId: string): Promise<AssignmentQuestion | undefined> {
    const [row] = await this.db
      .select()
      .from(schema.assignmentQuestions)
      .where(and(eq(schema.assignmentQuestions.id, id), eq(schema.assignmentQuestions.assignmentId, assignmentId)))
      .limit(1);
    return row;
  }

  async insertQuestion(values: NewAssignmentQuestion): Promise<AssignmentQuestion> {
    const [row] = await this.db.insert(schema.assignmentQuestions).values(values).returning();
    return row!;
  }

  async updateQuestion(id: string, version: number, patch: Partial<NewAssignmentQuestion>): Promise<AssignmentQuestion | undefined> {
    const t = schema.assignmentQuestions;
    const [row] = await this.db
      .update(t)
      .set({ ...patch, version: version + 1, updatedAt: new Date() })
      .where(and(eq(t.id, id), eq(t.version, version)))
      .returning();
    return row;
  }

  async deleteQuestion(id: string, version: number): Promise<boolean> {
    const t = schema.assignmentQuestions;
    const rows = await this.db.delete(t).where(and(eq(t.id, id), eq(t.version, version))).returning({ id: t.id });
    return rows.length > 0;
  }

  // --- quiz attempts (grading) -----------------------------------------------

  async listAttempts(assignmentId: string): Promise<Array<AssignmentAttempt & { studentName: string | null }>> {
    const rows = await this.db
      .select({
        attempt: schema.assignmentAttempts,
        firstName: schema.students.firstName,
        lastName: schema.students.lastName,
      })
      .from(schema.assignmentAttempts)
      .leftJoin(schema.students, eq(schema.students.id, schema.assignmentAttempts.studentId))
      .where(eq(schema.assignmentAttempts.assignmentId, assignmentId))
      .orderBy(desc(schema.assignmentAttempts.startedAt));
    return rows.map((r) => ({
      ...r.attempt,
      studentName: r.firstName ? `${r.firstName} ${r.lastName ?? ''}`.trim() : null,
    }));
  }

  async listAttemptAnswers(attemptId: string): Promise<Array<AssignmentAnswer & { question: AssignmentQuestion }>> {
    const rows = await this.db
      .select({ answer: schema.assignmentAnswers, question: schema.assignmentQuestions })
      .from(schema.assignmentAnswers)
      .innerJoin(schema.assignmentQuestions, eq(schema.assignmentQuestions.id, schema.assignmentAnswers.questionId))
      .where(eq(schema.assignmentAnswers.attemptId, attemptId))
      .orderBy(asc(schema.assignmentQuestions.sequence));
    return rows.map((r) => ({ ...r.answer, question: r.question }));
  }

  async updateAnswerGrade(answerId: string, patch: { teacherMarks?: number | null; teacherFeedback?: string | null }) {
    const [row] = await this.db
      .update(schema.assignmentAnswers)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(schema.assignmentAnswers.id, answerId))
      .returning();
    return row;
  }
}
