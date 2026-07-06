import { Inject, Injectable } from '@nestjs/common';
import { and, asc, count, eq, inArray, schema, sql, type Database } from '@edrion/database';

import { DATABASE } from '../../../common/tokens';

const teacherName = sql<string>`concat_ws(' ', ${schema.staff.firstName}, ${schema.staff.lastName})`;

@Injectable()
export class HomeworkRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  listForStudent(studentId: string, institutionId: string, filter: string) {
    const t = schema.homework;
    const s = schema.homeworkSubmissions;
    const conds = [
      eq(s.studentId, studentId),
      eq(t.institutionId, institutionId),
      inArray(t.status, ['assigned', 'closed']),
    ];
    if (filter === 'progress') conds.push(inArray(s.status, ['assigned', 'in_progress']));
    else if (filter === 'submitted') conds.push(eq(s.status, 'submitted'));
    else if (filter === 'returned') conds.push(eq(s.status, 'returned'));

    return this.db
      .select({
        id: t.id,
        title: t.title,
        dueAt: t.dueAt,
        subjectName: schema.subjects.name,
        teacherName,
        status: s.status,
        submissionId: s.id,
        totalMarks: s.totalMarks,
        totalMax: s.totalMax,
      })
      .from(s)
      .innerJoin(t, eq(s.homeworkId, t.id))
      .leftJoin(schema.subjects, eq(t.subjectId, schema.subjects.id))
      .leftJoin(schema.staff, eq(t.teacherId, schema.staff.id))
      .where(and(...conds))
      .orderBy(asc(t.dueAt));
  }

  async questionCount(homeworkId: string): Promise<number> {
    const [r] = await this.db
      .select({ c: count() })
      .from(schema.homeworkQuestions)
      .where(eq(schema.homeworkQuestions.homeworkId, homeworkId));
    return Number(r?.c ?? 0);
  }

  async answeredCount(submissionId: string): Promise<number> {
    const [r] = await this.db
      .select({ c: count() })
      .from(schema.homeworkAnswers)
      .where(
        and(
          eq(schema.homeworkAnswers.submissionId, submissionId),
          sql`(${schema.homeworkAnswers.answerText} IS NOT NULL OR ${schema.homeworkAnswers.answerObjectId} IS NOT NULL)`,
        ),
      );
    return Number(r?.c ?? 0);
  }

  getDetail(homeworkId: string, studentId: string) {
    return this.db
      .select({
        homework: schema.homework,
        submission: schema.homeworkSubmissions,
      })
      .from(schema.homeworkSubmissions)
      .innerJoin(schema.homework, eq(schema.homeworkSubmissions.homeworkId, schema.homework.id))
      .where(and(eq(schema.homework.id, homeworkId), eq(schema.homeworkSubmissions.studentId, studentId)))
      .limit(1);
  }

  listQuestions(homeworkId: string) {
    return this.db
      .select()
      .from(schema.homeworkQuestions)
      .where(eq(schema.homeworkQuestions.homeworkId, homeworkId))
      .orderBy(asc(schema.homeworkQuestions.sequence));
  }

  listAnswers(submissionId: string) {
    return this.db.select().from(schema.homeworkAnswers).where(eq(schema.homeworkAnswers.submissionId, submissionId));
  }

  async upsertAnswer(
    submissionId: string,
    questionId: string,
    data: { mode: string; answerText?: string | null; answerObjectId?: string | null },
  ) {
    const existing = await this.db
      .select({ id: schema.homeworkAnswers.id })
      .from(schema.homeworkAnswers)
      .where(and(eq(schema.homeworkAnswers.submissionId, submissionId), eq(schema.homeworkAnswers.questionId, questionId)))
      .limit(1);
    if (existing[0]) {
      await this.db
        .update(schema.homeworkAnswers)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(schema.homeworkAnswers.id, existing[0].id));
      return;
    }
    await this.db.insert(schema.homeworkAnswers).values({ submissionId, questionId, ...data });
  }

  async setSubmissionStatus(submissionId: string, status: string, extra?: { submittedAt?: Date }) {
    await this.db
      .update(schema.homeworkSubmissions)
      .set({ status, updatedAt: new Date(), ...extra })
      .where(eq(schema.homeworkSubmissions.id, submissionId));
  }
}
