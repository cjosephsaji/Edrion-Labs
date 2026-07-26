import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import { schema, type Database } from '@edrion/database';
import { DATABASE } from '../../../common/tokens';
import { ownerColumns } from '../core/owner-scope';
import type { StudentPrincipal } from '../student.types';

@Injectable()
export class ExamPrepDiagnosticService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async startDiagnostic(principal: StudentPrincipal, profileKey: string) {
    const owner = ownerColumns(principal);
    const [profile] = await this.db
      .select()
      .from(schema.examProfiles)
      .where(eq(schema.examProfiles.key, profileKey))
      .limit(1);
    if (!profile) throw new BadRequestException({ code: 'NOT_FOUND', message: 'Profile not found.' });
    const [enrollment] = await this.db
      .select()
      .from(schema.prepEnrollments)
      .where(
        and(
          eq(schema.prepEnrollments.examProfileId, profile.id),
          owner.studentId
            ? eq(schema.prepEnrollments.studentId, owner.studentId)
            : eq(schema.prepEnrollments.independentUserId, owner.independentUserId!),
        ),
      )
      .limit(1);
    if (!enrollment) throw new BadRequestException({ code: 'NOT_ENROLLED', message: 'Enroll first.' });
    const [session] = await this.db
      .insert(schema.prepDiagnosticRuns)
      .values({ enrollmentId: enrollment.id, status: 'in_progress' })
      .returning();
    return { sessionId: session!.id, status: session!.status };
  }

  async projectWrongAnswers(principal: StudentPrincipal) {
    const owner = ownerColumns(principal);
    const exams = await this.db
      .select()
      .from(schema.mockExams)
      .where(
        owner.studentId
          ? eq(schema.mockExams.studentId, owner.studentId)
          : eq(schema.mockExams.independentUserId, owner.independentUserId!),
      )
      .orderBy(desc(schema.mockExams.createdAt))
      .limit(10);

    const projected: Array<{ questionId: string; attemptId: string; source: string }> = [];
    for (const exam of exams) {
      const [attempt] = await this.db
        .select()
        .from(schema.mockExamAttempts)
        .where(eq(schema.mockExamAttempts.mockExamId, exam.id))
        .orderBy(desc(schema.mockExamAttempts.finishedAt))
        .limit(1);
      if (!attempt) continue;
      const answers = await this.db
        .select()
        .from(schema.mockExamAnswers)
        .where(eq(schema.mockExamAnswers.attemptId, attempt.id));
      for (const ans of answers) {
        const ev = ans.evaluation as { correct?: boolean } | null;
        if (ev?.correct === false) {
          projected.push({ questionId: ans.questionId, attemptId: attempt.id, source: 'mock_exam' });
        }
      }
    }
    return { items: projected.slice(0, 50) };
  }
}
