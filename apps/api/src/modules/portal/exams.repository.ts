import { Inject, Injectable } from '@nestjs/common';
import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  or,
  schema,
  sql,
  type Database,
  type PgColumn,
  type SQL,
} from '@edrion/database';
import type { Exam, ExamSchedule, NewExam, NewExamSchedule, ExamPaperQuestion, NewExamPaperQuestion, ExamAttempt, ExamAnswer } from '@edrion/database';
import type { ExamsListQuery } from '@edrion/schemas';
import { DATABASE } from '../../common/tokens';
import type { CampusFilter, Page } from './academics.repository';
import { scopeConds } from './portal-scope';
import { programmeListFilterConds } from './programme-list-filters';

export interface ExamRow extends Exam {
  academicYearName: string | null;
  termName: string | null;
  scheduleCount: number;
}
export interface ExamScheduleRow extends ExamSchedule {
  className: string | null;
  subjectName: string | null;
}

/** Which referenceable table an FK points at (for friendly-400 pre-checks). */
export type ExamRefTable = 'academicYears' | 'academicTerms' | 'classes' | 'subjects';

/**
 * Typed SQL for the institution-portal exams tables (exams + scheduled papers). Same contract as the
 * other portal repos: every query is confined to one institution; campus-scoped exam reads also
 * include institution-owned (campus_id IS NULL) rows. The service owns scope/version/FK/audit.
 */
@Injectable()
export class ExamsRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  private scopeConds(
    instCol: PgColumn,
    campusCol: PgColumn,
    institutionId: string,
    campusIds: CampusFilter,
  ): SQL[] {
    return scopeConds(instCol, campusCol, institutionId, campusIds);
  }

  private order(col: PgColumn | undefined, dir: 'asc' | 'desc', fallback: PgColumn): SQL {
    const c = col ?? fallback;
    return dir === 'asc' ? asc(c) : desc(c);
  }

  async existsInInstitution(table: ExamRefTable, id: string, institutionId: string): Promise<boolean> {
    const t = schema[table];
    const [row] = await this.db
      .select({ id: t.id })
      .from(t)
      .where(and(eq(t.id, id), eq(t.institutionId, institutionId)))
      .limit(1);
    return !!row;
  }

  // --- exams -----------------------------------------------------------------

  async list(institutionId: string, campusIds: CampusFilter, q: ExamsListQuery): Promise<Page<ExamRow>> {
    const t = schema.exams;
    const conds = this.scopeConds(t.institutionId, t.campusId, institutionId, campusIds);
    if (q.status) conds.push(eq(t.status, q.status));
    if (q.examType) conds.push(eq(t.examType, q.examType));
    conds.push(
      ...programmeListFilterConds(this.db, q, {
        academicYearId: t.academicYearId,
        termId: t.termId,
      }),
    );
    if (q.search) {
      const s = or(ilike(t.name, `%${q.search}%`), ilike(t.termLabel, `%${q.search}%`));
      if (s) conds.push(s);
    }
    const where = and(...conds);
    const sortable: Record<string, PgColumn> = {
      name: t.name,
      examType: t.examType,
      status: t.status,
      startDate: t.startDate,
      createdAt: t.createdAt,
    };
    const limit = q.pageSize;
    const offset = (q.page - 1) * q.pageSize;

    const scheduleCount = sql<number>`(select count(*) from ${schema.examSchedules} es where es.exam_id = ${t.id})`;
    const rows = await this.db
      .select({ exam: t, academicYearName: schema.academicYears.name, termName: schema.academicTerms.name, scheduleCount })
      .from(t)
      .leftJoin(schema.academicYears, eq(schema.academicYears.id, t.academicYearId))
      .leftJoin(schema.academicTerms, eq(schema.academicTerms.id, t.termId))
      .where(where)
      .orderBy(this.order(q.sortBy ? sortable[q.sortBy] : undefined, q.sortDir, t.createdAt))
      .limit(limit)
      .offset(offset);
    const [tot] = await this.db.select({ value: count() }).from(t).where(where);
    return {
      items: rows.map((r) => ({
        ...r.exam,
        academicYearName: r.academicYearName,
        termName: r.termName,
        scheduleCount: Number(r.scheduleCount ?? 0),
      })),
      total: Number(tot?.value ?? 0),
    };
  }

  async find(id: string, institutionId: string): Promise<Exam | undefined> {
    const t = schema.exams;
    const [row] = await this.db.select().from(t).where(and(eq(t.id, id), eq(t.institutionId, institutionId))).limit(1);
    return row;
  }

  async insert(values: NewExam): Promise<Exam> {
    const [row] = await this.db.insert(schema.exams).values(values).returning();
    return row!;
  }

  async update(id: string, version: number, patch: Partial<NewExam>): Promise<Exam | undefined> {
    const t = schema.exams;
    const [row] = await this.db
      .update(t)
      .set({ ...patch, version: version + 1, updatedAt: new Date() })
      .where(and(eq(t.id, id), eq(t.version, version)))
      .returning();
    return row;
  }

  async delete(id: string, version: number): Promise<boolean> {
    const t = schema.exams;
    const rows = await this.db.delete(t).where(and(eq(t.id, id), eq(t.version, version))).returning({ id: t.id });
    return rows.length > 0;
  }

  // --- schedules (papers) ----------------------------------------------------

  async listSchedules(examId: string): Promise<ExamScheduleRow[]> {
    const t = schema.examSchedules;
    const rows = await this.db
      .select({ sched: t, className: schema.classes.name, subjectName: schema.subjects.name })
      .from(t)
      .leftJoin(schema.classes, eq(schema.classes.id, t.classId))
      .leftJoin(schema.subjects, eq(schema.subjects.id, t.subjectId))
      .where(eq(t.examId, examId))
      .orderBy(asc(schema.classes.name), asc(schema.subjects.name));
    return rows.map((r) => ({ ...r.sched, className: r.className, subjectName: r.subjectName }));
  }

  /** A paper already exists for this (exam, class, subject)? (friendly 409 instead of a 500). */
  async findScheduleByKey(examId: string, classId: string, subjectId: string): Promise<ExamSchedule | undefined> {
    const t = schema.examSchedules;
    const [row] = await this.db
      .select()
      .from(t)
      .where(and(eq(t.examId, examId), eq(t.classId, classId), eq(t.subjectId, subjectId)))
      .limit(1);
    return row;
  }

  async findSchedule(id: string, examId: string): Promise<ExamSchedule | undefined> {
    const t = schema.examSchedules;
    const [row] = await this.db.select().from(t).where(and(eq(t.id, id), eq(t.examId, examId))).limit(1);
    return row;
  }

  async insertSchedule(values: NewExamSchedule): Promise<ExamSchedule> {
    const [row] = await this.db.insert(schema.examSchedules).values(values).returning();
    return row!;
  }

  async updateSchedule(id: string, version: number, patch: Partial<NewExamSchedule>): Promise<ExamSchedule | undefined> {
    const t = schema.examSchedules;
    const [row] = await this.db
      .update(t)
      .set({ ...patch, version: version + 1, updatedAt: new Date() })
      .where(and(eq(t.id, id), eq(t.version, version)))
      .returning();
    return row;
  }

  async deleteSchedule(id: string, version: number): Promise<boolean> {
    const t = schema.examSchedules;
    const rows = await this.db.delete(t).where(and(eq(t.id, id), eq(t.version, version))).returning({ id: t.id });
    return rows.length > 0;
  }

  // --- paper questions -------------------------------------------------------

  async listQuestions(scheduleId: string): Promise<ExamPaperQuestion[]> {
    return this.db
      .select()
      .from(schema.examPaperQuestions)
      .where(eq(schema.examPaperQuestions.examScheduleId, scheduleId))
      .orderBy(asc(schema.examPaperQuestions.sequence));
  }

  async findQuestion(id: string, scheduleId: string): Promise<ExamPaperQuestion | undefined> {
    const [row] = await this.db
      .select()
      .from(schema.examPaperQuestions)
      .where(and(eq(schema.examPaperQuestions.id, id), eq(schema.examPaperQuestions.examScheduleId, scheduleId)))
      .limit(1);
    return row;
  }

  async insertQuestion(values: NewExamPaperQuestion): Promise<ExamPaperQuestion> {
    const [row] = await this.db.insert(schema.examPaperQuestions).values(values).returning();
    return row!;
  }

  async updateQuestion(id: string, version: number, patch: Partial<NewExamPaperQuestion>): Promise<ExamPaperQuestion | undefined> {
    const t = schema.examPaperQuestions;
    const [row] = await this.db
      .update(t)
      .set({ ...patch, version: version + 1, updatedAt: new Date() })
      .where(and(eq(t.id, id), eq(t.version, version)))
      .returning();
    return row;
  }

  async deleteQuestion(id: string, version: number): Promise<boolean> {
    const t = schema.examPaperQuestions;
    const rows = await this.db.delete(t).where(and(eq(t.id, id), eq(t.version, version))).returning({ id: t.id });
    return rows.length > 0;
  }

  /**
   * Atomic insert of exam + optional schedules + questions. Used by the single-page builder.
   * Returns the exam row; schedules/questions are persisted in the same transaction.
   */
  async insertFull(
    examValues: NewExam,
    schedules: Array<{
      schedule: Omit<NewExamSchedule, 'examId'>;
      questions: Array<Omit<NewExamPaperQuestion, 'examScheduleId'>>;
    }>,
  ): Promise<Exam> {
    return this.db.transaction(async (tx) => {
      const [exam] = await tx.insert(schema.exams).values(examValues).returning();
      for (const block of schedules) {
        const [sched] = await tx
          .insert(schema.examSchedules)
          .values({ ...block.schedule, examId: exam!.id })
          .returning();
        if (block.questions.length > 0) {
          await tx.insert(schema.examPaperQuestions).values(
            block.questions.map((q) => ({ ...q, examScheduleId: sched!.id })),
          );
        }
      }
      return exam!;
    });
  }

  /**
   * Atomic reconcile: update exam fields, then create/update/delete schedules and questions
   * to match the payload. Version-guards the exam; schedule/question versions are checked when provided.
   */
  async reconcileFull(args: {
    examId: string;
    examVersion: number;
    examPatch: Partial<NewExam>;
    schedules: Array<{
      id?: string;
      version?: number;
      classId: string;
      subjectId: string;
      examDate: string | null;
      startTime: string | null;
      endTime: string | null;
      maxMarks: number;
      passMarks: number | null;
      room: string | null;
      /** When true, paper is visible on the student datesheet. */
      published?: boolean;
      actorId: string | null;
      institutionId: string;
      questions: Array<{
        id?: string;
        version?: number;
        sequence: number;
        qtype: string;
        prompt: string;
        promptImageObjectId: string | null;
        options: NewExamPaperQuestion['options'];
        correctKey: string | null;
        markingNote: string | null;
        marks: number;
        config: Record<string, unknown> | null;
        actorId: string | null;
      }>;
    }>;
  }): Promise<Exam | undefined> {
    return this.db.transaction(async (tx) => {
      const [exam] = await tx
        .update(schema.exams)
        .set({ ...args.examPatch, version: args.examVersion + 1, updatedAt: new Date() })
        .where(and(eq(schema.exams.id, args.examId), eq(schema.exams.version, args.examVersion)))
        .returning();
      if (!exam) return undefined;

      const existingSchedules = await tx
        .select()
        .from(schema.examSchedules)
        .where(eq(schema.examSchedules.examId, args.examId));
      const keepScheduleIds = new Set(args.schedules.map((s) => s.id).filter(Boolean) as string[]);

      for (const old of existingSchedules) {
        if (!keepScheduleIds.has(old.id)) {
          await tx.delete(schema.examSchedules).where(eq(schema.examSchedules.id, old.id));
        }
      }

      for (const block of args.schedules) {
        let scheduleId = block.id;
        if (scheduleId) {
          const existing = existingSchedules.find((s) => s.id === scheduleId);
          if (!existing) throw new Error('SCHEDULE_NOT_FOUND');
          const ver = block.version ?? existing.version;
          const [updated] = await tx
            .update(schema.examSchedules)
            .set({
              classId: block.classId,
              subjectId: block.subjectId,
              examDate: block.examDate,
              startTime: block.startTime,
              endTime: block.endTime,
              maxMarks: block.maxMarks,
              passMarks: block.passMarks,
              room: block.room,
              ...(block.published !== undefined ? { published: block.published } : {}),
              updatedBy: block.actorId,
              version: ver + 1,
              updatedAt: new Date(),
            })
            .where(and(eq(schema.examSchedules.id, scheduleId), eq(schema.examSchedules.version, ver)))
            .returning();
          if (!updated) throw new Error('SCHEDULE_VERSION_CONFLICT');
        } else {
          const [created] = await tx
            .insert(schema.examSchedules)
            .values({
              institutionId: block.institutionId,
              examId: args.examId,
              classId: block.classId,
              subjectId: block.subjectId,
              examDate: block.examDate,
              startTime: block.startTime,
              endTime: block.endTime,
              maxMarks: block.maxMarks,
              passMarks: block.passMarks,
              room: block.room,
              published: block.published ?? false,
              createdBy: block.actorId,
            })
            .returning();
          scheduleId = created!.id;
        }

        const existingQs = await tx
          .select()
          .from(schema.examPaperQuestions)
          .where(eq(schema.examPaperQuestions.examScheduleId, scheduleId));
        const keepQIds = new Set(block.questions.map((q) => q.id).filter(Boolean) as string[]);
        for (const old of existingQs) {
          if (!keepQIds.has(old.id)) {
            await tx.delete(schema.examPaperQuestions).where(eq(schema.examPaperQuestions.id, old.id));
          }
        }

        for (const q of block.questions) {
          if (q.id) {
            const existing = existingQs.find((x) => x.id === q.id);
            if (!existing) throw new Error('QUESTION_NOT_FOUND');
            const ver = q.version ?? existing.version;
            const [updated] = await tx
              .update(schema.examPaperQuestions)
              .set({
                sequence: q.sequence,
                qtype: q.qtype,
                prompt: q.prompt,
                promptImageObjectId: q.promptImageObjectId,
                options: q.options,
                correctKey: q.correctKey,
                markingNote: q.markingNote,
                marks: q.marks,
                config: q.config,
                updatedBy: q.actorId,
                version: ver + 1,
                updatedAt: new Date(),
              })
              .where(and(eq(schema.examPaperQuestions.id, q.id), eq(schema.examPaperQuestions.version, ver)))
              .returning();
            if (!updated) throw new Error('QUESTION_VERSION_CONFLICT');
          } else {
            await tx.insert(schema.examPaperQuestions).values({
              examScheduleId: scheduleId,
              sequence: q.sequence,
              qtype: q.qtype,
              prompt: q.prompt,
              promptImageObjectId: q.promptImageObjectId,
              options: q.options,
              correctKey: q.correctKey,
              markingNote: q.markingNote,
              marks: q.marks,
              config: q.config,
              createdBy: q.actorId,
            });
          }
        }
      }

      return exam;
    });
  }

  // --- attempts (grading) ----------------------------------------------------

  async listAttempts(scheduleId: string): Promise<Array<ExamAttempt & { studentName: string | null }>> {
    const rows = await this.db
      .select({
        attempt: schema.examAttempts,
        firstName: schema.students.firstName,
        lastName: schema.students.lastName,
      })
      .from(schema.examAttempts)
      .leftJoin(schema.students, eq(schema.students.id, schema.examAttempts.studentId))
      .where(eq(schema.examAttempts.examScheduleId, scheduleId))
      .orderBy(desc(schema.examAttempts.startedAt));
    return rows.map((r) => ({
      ...r.attempt,
      studentName: r.firstName ? `${r.firstName} ${r.lastName ?? ''}`.trim() : null,
    }));
  }

  async listAttemptAnswers(attemptId: string): Promise<Array<ExamAnswer & { question: ExamPaperQuestion }>> {
    const rows = await this.db
      .select({ answer: schema.examAnswers, question: schema.examPaperQuestions })
      .from(schema.examAnswers)
      .innerJoin(schema.examPaperQuestions, eq(schema.examPaperQuestions.id, schema.examAnswers.questionId))
      .where(eq(schema.examAnswers.attemptId, attemptId))
      .orderBy(asc(schema.examPaperQuestions.sequence));
    return rows.map((r) => ({ ...r.answer, question: r.question }));
  }

  async updateAnswerGrade(answerId: string, patch: { teacherMarks?: number | null; teacherFeedback?: string | null }) {
    const [row] = await this.db
      .update(schema.examAnswers)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(schema.examAnswers.id, answerId))
      .returning();
    return row;
  }
}
