import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, sql, schema, type Database } from '@edrion/database';
import { MOCK_PSYCHOMETRIC_MIN_N, mockLabMocksSettingsSchema } from '@edrion/schemas';
import { DATABASE } from '../../../common/tokens';
import { QuestionBankService } from '../../student/exam-engine/question-bank.service';

@Injectable()
export class PortalMockBanksService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly bank: QuestionBankService,
  ) {}

  async list(institutionId: string) {
    const rows = await this.db
      .select({
        id: schema.questionBank.id,
        topicLabel: schema.questionBank.topicLabel,
        qtype: schema.questionBank.qtype,
        difficulty: schema.questionBank.difficulty,
        source: schema.questionBank.source,
        reviewStatus: schema.questionBank.reviewStatus,
        topicTags: schema.questionBank.topicTags,
        createdAt: schema.questionBank.createdAt,
      })
      .from(schema.questionBank)
      .where(eq(schema.questionBank.institutionId, institutionId))
      .orderBy(desc(schema.questionBank.createdAt))
      .limit(500);

    const pending = rows.filter((r) => r.reviewStatus === 'pending').length;
    return {
      items: rows.map((r) => ({
        ...r,
        createdAt: r.createdAt.toISOString(),
        // Never leak correct keys in list
      })),
      pendingCount: pending,
      totalCount: rows.length,
    };
  }

  async reviewQueue(institutionId: string) {
    const rows = await this.db
      .select({
        id: schema.questionBank.id,
        topicLabel: schema.questionBank.topicLabel,
        qtype: schema.questionBank.qtype,
        difficulty: schema.questionBank.difficulty,
        source: schema.questionBank.source,
        promptHash: schema.questionBank.promptHash,
        payload: schema.questionBank.payload,
        createdAt: schema.questionBank.createdAt,
      })
      .from(schema.questionBank)
      .where(
        and(
          eq(schema.questionBank.institutionId, institutionId),
          eq(schema.questionBank.reviewStatus, 'pending'),
        ),
      )
      .orderBy(schema.questionBank.createdAt)
      .limit(100);

    return {
      items: rows.map((r) => {
        const payload = { ...(r.payload as Record<string, unknown>) };
        // Strip answer keys from review list preview stems only — teachers need keys in editor;
        // keep payload for review but flag source.
        return {
          id: r.id,
          topicLabel: r.topicLabel,
          qtype: r.qtype,
          difficulty: r.difficulty,
          source: r.source,
          promptHash: r.promptHash,
          prompt: typeof payload.prompt === 'string' ? payload.prompt : '',
          payload,
          createdAt: r.createdAt.toISOString(),
        };
      }),
    };
  }

  async bulkReview(
    institutionId: string,
    ids: string[],
    status: 'approved' | 'rejected',
    staffId: string,
  ) {
    const n = await this.bank.setReviewStatus(institutionId, ids, status, staffId);
    return { updated: n, status };
  }

  /** Privacy-thresholded aggregates — never individual voluntary scores. */
  async aggregates(institutionId: string) {
    const settings = await this.loadSettings(institutionId);
    if (!settings.aggregates_enabled) {
      throw new ForbiddenException({ code: 'FEATURE_DISABLED', message: 'Aggregates disabled' });
    }

    const [{ count }] = await this.db
      .select({ count: sql<number>`count(distinct ${schema.mockExams.studentId})::int` })
      .from(schema.mockExams)
      .where(eq(schema.mockExams.institutionId, institutionId));

    if ((count ?? 0) < settings.min_cohort_size) {
      return { status: 'insufficient_cohort' as const, minCohortSize: settings.min_cohort_size };
    }

    const [{ mocks }] = await this.db
      .select({ mocks: sql<number>`count(*)::int` })
      .from(schema.mockExams)
      .where(eq(schema.mockExams.institutionId, institutionId));

    const result: Record<string, unknown> = {
      status: 'ok',
      activity: { distinctStudents: count, mockCount: mocks },
      individual_scores_visible: false,
    };

    if (settings.aggregate_scope === 'activity_and_scores') {
      // Distributions only — no student_id join to scores
      const dist = await this.db.execute(sql`
        SELECT
          percentile_cont(0.5) WITHIN GROUP (ORDER BY (a.results->>'awardedMarks')::float
            / NULLIF((a.results->>'maxMarks')::float, 0)) AS median,
          count(*)::int AS n
        FROM mock_exam_attempts a
        JOIN mock_exams e ON e.id = a.mock_exam_id
        WHERE e.institution_id = ${institutionId}
          AND a.results ? 'awardedMarks'
          AND a.status IN ('scored', 'graded', 'completed')
      `);
      result.scoreDistribution = dist.rows?.[0] ?? dist[0] ?? null;
    }

    return result;
  }

  async itemPsychometrics(questionBankId: string) {
    const [{ n }] = await this.db
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.mockExamAnswers)
      .innerJoin(
        schema.mockExamQuestions,
        eq(schema.mockExamQuestions.id, schema.mockExamAnswers.questionId),
      )
      .where(eq(schema.mockExamQuestions.questionBankId, questionBankId));

    if ((n ?? 0) < MOCK_PSYCHOMETRIC_MIN_N) {
      return { questionBankId, n: n ?? 0, p: null, avgTimeMs: null, effectiveBand: null };
    }

    const [{ p, avgMs }] = await this.db
      .select({
        p: sql<number>`avg(case when (evaluation->>'awardedMarks')::float >= (evaluation->>'maxMarks')::float then 1.0 else 0.0 end)`,
        avgMs: sql<number>`avg(time_spent_ms)::int`,
      })
      .from(schema.mockExamAnswers)
      .innerJoin(
        schema.mockExamQuestions,
        eq(schema.mockExamQuestions.id, schema.mockExamAnswers.questionId),
      )
      .where(eq(schema.mockExamQuestions.questionBankId, questionBankId));

    const pVal = Number(p ?? 0);
    const effectiveBand = pVal > 0.75 ? 'easy' : pVal < 0.4 ? 'hard' : 'medium';
    return {
      questionBankId,
      n,
      p: pVal,
      avgTimeMs: avgMs ?? null,
      effectiveBand,
    };
  }

  private async loadSettings(institutionId: string) {
    const [row] = await this.db
      .select({ value: schema.institutionSettings.value })
      .from(schema.institutionSettings)
      .where(
        and(
          eq(schema.institutionSettings.institutionId, institutionId),
          eq(schema.institutionSettings.category, 'lab_mocks'),
          eq(schema.institutionSettings.key, 'visibility'),
        ),
      )
      .limit(1);
    return mockLabMocksSettingsSchema.parse(row?.value ?? {});
  }
}
