import { Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray, schema, sql, type Database } from '@edrion/database';
import type { HomeworkListFilter } from '@edrion/schemas';
import { DATABASE } from '../../../common/tokens';

const teacherName = sql<string>`concat_ws(' ', ${schema.staff.firstName}, ${schema.staff.lastName})`;
const VISIBLE_HOMEWORK_STATUSES = ['assigned', 'closed'];

@Injectable()
export class HomeworkRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async listForStudent(studentId: string, institutionId: string, filter: HomeworkListFilter) {
    const rows = await this.db
      .select({
        id: schema.homework.id,
        title: schema.homework.title,
        dueAt: schema.homework.dueAt,
        subjectName: schema.subjects.name,
        teacherName,
        status: schema.homeworkSubmissions.status,
        submissionId: schema.homeworkSubmissions.id,
        totalMarks: schema.homeworkSubmissions.totalMarks,
        totalMax: schema.homeworkSubmissions.totalMax,
      })
      .from(schema.homeworkSubmissions)
      .innerJoin(schema.homework, eq(schema.homeworkSubmissions.homeworkId, schema.homework.id))
      .leftJoin(schema.subjects, eq(schema.homework.subjectId, schema.subjects.id))
      .leftJoin(schema.staff, eq(schema.homework.teacherId, schema.staff.id))
      .where(
        and(
          eq(schema.homeworkSubmissions.studentId, studentId),
          eq(schema.homework.institutionId, institutionId),
          inArray(schema.homework.status, VISIBLE_HOMEWORK_STATUSES),
        ),
      )
      .orderBy(schema.homework.dueAt);

    return rows.filter((r) => this.matchesFilter(r.status, filter));
  }

  async getDetail(homeworkId: string, studentId: string) {
    return this.db
      .select({
        homework: schema.homework,
        submission: schema.homeworkSubmissions,
        subjectName: schema.subjects.name,
      })
      .from(schema.homeworkSubmissions)
      .innerJoin(schema.homework, eq(schema.homeworkSubmissions.homeworkId, schema.homework.id))
      .leftJoin(schema.subjects, eq(schema.homework.subjectId, schema.subjects.id))
      .where(and(eq(schema.homework.id, homeworkId), eq(schema.homeworkSubmissions.studentId, studentId)))
      .limit(1);
  }

  async listQuestions(homeworkId: string) {
    return this.db
      .select()
      .from(schema.homeworkQuestions)
      .where(eq(schema.homeworkQuestions.homeworkId, homeworkId))
      .orderBy(schema.homeworkQuestions.sequence);
  }

  async listAnswers(submissionId: string) {
    return this.db
      .select()
      .from(schema.homeworkAnswers)
      .where(eq(schema.homeworkAnswers.submissionId, submissionId));
  }

  async upsertAnswer(
    submissionId: string,
    questionId: string,
    input: { mode?: string; answerText?: string | null; answerObjectId?: string | null },
  ) {
    const [existing] = await this.db
      .select({ id: schema.homeworkAnswers.id })
      .from(schema.homeworkAnswers)
      .where(
        and(
          eq(schema.homeworkAnswers.submissionId, submissionId),
          eq(schema.homeworkAnswers.questionId, questionId),
        ),
      )
      .limit(1);
    if (existing) {
      await this.db
        .update(schema.homeworkAnswers)
        .set({
          mode: input.mode ?? 'type',
          answerText: input.answerText ?? null,
          answerObjectId: input.answerObjectId ?? null,
          updatedAt: new Date(),
        })
        .where(eq(schema.homeworkAnswers.id, existing.id));
      return;
    }
    await this.db.insert(schema.homeworkAnswers).values({
      submissionId,
      questionId,
      mode: input.mode ?? 'type',
      answerText: input.answerText ?? null,
      answerObjectId: input.answerObjectId ?? null,
    });
  }

  async setSubmissionStatus(
    submissionId: string,
    status: string,
    patch: { submittedAt?: Date } = {},
  ) {
    await this.db
      .update(schema.homeworkSubmissions)
      .set({ status, ...patch, updatedAt: new Date() })
      .where(eq(schema.homeworkSubmissions.id, submissionId));
  }

  private matchesFilter(status: string, filter: HomeworkListFilter) {
    if (filter === 'all') return true;
    if (filter === 'progress') return ['assigned', 'in_progress'].includes(status);
    if (filter === 'submitted') return status === 'submitted';
    if (filter === 'returned') return ['returned', 'graded'].includes(status);
    return true;
  }
}
