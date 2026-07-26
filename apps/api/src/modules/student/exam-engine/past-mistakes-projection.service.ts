import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, or, sql } from 'drizzle-orm';
import { schema, type Database } from '@edrion/database';
import { DATABASE } from '../../../common/tokens';
import { ownerWhere } from '../core/owner-scope';
import type { StudentPrincipal } from '../student.types';

export interface PastMistakeRow {
  questionId: string;
  mockExamId: string;
  topic: string;
  qtype: string;
  occurredAt: string;
  evaluation: Record<string, unknown>;
  remediationEntry: {
    entryPoint: 'bad_result';
    sessionContext: { mockExamId: string; questionId: string };
  };
}

@Injectable()
export class PastMistakesProjectionService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async listForPrincipal(principal: StudentPrincipal, limit = 50): Promise<PastMistakeRow[]> {
    const owner = ownerWhere(
      principal,
      schema.mockExams.studentId,
      schema.mockExams.independentUserId,
    );

    const rows = await this.db
      .select({
        questionId: schema.mockExamQuestions.id,
        mockExamId: schema.mockExams.id,
        topic: schema.mockExamQuestions.topic,
        qtype: schema.mockExamQuestions.qtype,
        occurredAt: schema.mockExamAttempts.finishedAt,
        evaluation: schema.mockExamAnswers.evaluation,
      })
      .from(schema.mockExamAnswers)
      .innerJoin(
        schema.mockExamAttempts,
        eq(schema.mockExamAnswers.attemptId, schema.mockExamAttempts.id),
      )
      .innerJoin(schema.mockExams, eq(schema.mockExamAttempts.mockExamId, schema.mockExams.id))
      .innerJoin(
        schema.mockExamQuestions,
        eq(schema.mockExamAnswers.questionId, schema.mockExamQuestions.id),
      )
      .where(
        and(
          owner,
          or(
            sql`(${schema.mockExamAnswers.evaluation}->>'correct')::boolean = false`,
            sql`(${schema.mockExamAnswers.evaluation}->>'accepted')::boolean = false`,
          ),
        ),
      )
      .orderBy(desc(schema.mockExamAttempts.finishedAt))
      .limit(limit);

    return rows
      .filter((r) => r.evaluation && r.occurredAt)
      .map((r) => ({
        questionId: r.questionId,
        mockExamId: r.mockExamId,
        topic: r.topic,
        qtype: r.qtype,
        occurredAt: r.occurredAt!.toISOString(),
        evaluation: r.evaluation as Record<string, unknown>,
        remediationEntry: {
          entryPoint: 'bad_result' as const,
          sessionContext: { mockExamId: r.mockExamId, questionId: r.questionId },
        },
      }));
  }
}
