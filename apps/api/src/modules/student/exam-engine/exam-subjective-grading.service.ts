import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, eq, lt, schema, type Database } from '@edrion/database';
import {
  deriveTopicVerdicts,
  deriveVerdictFromMarks,
  examPatternsOutputSchema,
  labExamQuestionSchema,
  examSubjectiveGradeOutputSchema,
  isExamObjectiveType,
  type ExamPatternObservation,
  type ExamQuestion,
  type ExamQuestionEvaluation,
  type ExamResults,
  type SaveExamAnswerInput,
} from '@edrion/schemas';
import { DATABASE, LEARN_AI_PROVIDER, LEARNING_EVENTS_WRITER } from '../../../common/tokens';
import type { LearnAiProvider } from '../learn-ai/provider';
import { BudgetsService } from '../learn-ai/budgets.service';
import { LearnAiCallLogger } from '../learn-ai/learn-ai-call.logger';
import type { LearningEventsWriter } from '../ledger/learning-events.writer';
import type { StudentPrincipal } from '../student.types';
import { gradeExamObjective } from './exam-grader';
import type { ExamPrincipalRef } from './exam-generation.service';
import { ExamGenerationService } from './exam-generation.service';
import { PATTERNS_SYSTEM, SUBJECTIVE_GRADE_SYSTEM } from './exam-prompts';

/** Attempts expire 24h after ends_at (plan lock). */
export const ATTEMPT_EXPIRE_HOURS = 24;

@Injectable()
export class ExamSubjectiveGradingService {
  private readonly logger = new Logger(ExamSubjectiveGradingService.name);

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(LEARN_AI_PROVIDER) private readonly ai: LearnAiProvider,
    private readonly budgets: BudgetsService,
    private readonly callLog: LearnAiCallLogger,
    private readonly gen: ExamGenerationService,
    @Inject(LEARNING_EVENTS_WRITER) private readonly ledger: LearningEventsWriter,
  ) {}

  /** Sync objective grades + enqueue path entry for subjective. Returns partial results. */
  async gradeObjectivePass(
    examId: string,
    attemptId: string,
  ): Promise<{ evaluations: ExamQuestionEvaluation[]; needsSubjective: boolean; maxMarks: number; awardedMarks: number }> {
    const questions = await this.db
      .select()
      .from(schema.mockExamQuestions)
      .where(eq(schema.mockExamQuestions.mockExamId, examId))
      .orderBy(schema.mockExamQuestions.sequence);
    const answers = await this.db
      .select()
      .from(schema.mockExamAnswers)
      .where(eq(schema.mockExamAnswers.attemptId, attemptId));

    const evaluations: ExamQuestionEvaluation[] = [];
    let needsSubjective = false;
    let awardedMarks = 0;
    let maxMarks = 0;

    for (const qRow of questions) {
      const q = this.parseQuestion(qRow);
      maxMarks += q.marks;
      const ans = answers.find((a) => a.questionId === qRow.id);
      const payload = (ans?.answerPayload ?? {
        choiceKey: ans?.choiceKey,
        text: ans?.answerText,
        flagged: ans?.flagged,
      }) as SaveExamAnswerInput;

      if (isExamObjectiveType(q.type)) {
        // Numerical with workingText + stepRubric → also needs subjective for steps
        const needsSteps =
          q.type === 'numerical' &&
          'stepRubric' in q &&
          Array.isArray(q.stepRubric) &&
          q.stepRubric.length > 0 &&
          typeof (payload as { workingText?: string }).workingText === 'string' &&
          (payload as { workingText?: string }).workingText!.trim().length > 0;

        const obj = gradeExamObjective(q, payload);
        if (needsSteps) {
          needsSubjective = true;
          evaluations.push({
            questionId: qRow.id,
            sequence: qRow.sequence,
            awardedMarks: obj.awardedMarks,
            maxMarks: obj.maxMarks,
            verdict: obj.verdict,
            note: obj.note,
            objective: false,
          });
        } else {
          awardedMarks += obj.awardedMarks;
          evaluations.push({
            questionId: qRow.id,
            sequence: qRow.sequence,
            awardedMarks: obj.awardedMarks,
            maxMarks: obj.maxMarks,
            verdict: obj.verdict,
            note: obj.note,
            distractorRationale: obj.distractorRationale,
            objective: true,
          });
          if (ans) {
            await this.db
              .update(schema.mockExamAnswers)
              .set({
                evaluation: {
                  awardedMarks: obj.awardedMarks,
                  maxMarks: obj.maxMarks,
                  verdict: obj.verdict,
                  note: obj.note,
                  distractorRationale: obj.distractorRationale,
                  objective: true,
                },
              })
              .where(eq(schema.mockExamAnswers.id, ans.id));
          }
        }
      } else {
        needsSubjective = true;
        evaluations.push({
          questionId: qRow.id,
          sequence: qRow.sequence,
          awardedMarks: 0,
          maxMarks: q.marks,
          verdict: 'missed',
          note: 'Awaiting written grading…',
          objective: false,
        });
      }
    }

    return { evaluations, needsSubjective, maxMarks, awardedMarks };
  }

  async gradeSubjective(examId: string, attemptId: string, principalRef: ExamPrincipalRef): Promise<void> {
    const principal = this.gen.toPrincipal(principalRef);
    const questions = await this.db
      .select()
      .from(schema.mockExamQuestions)
      .where(eq(schema.mockExamQuestions.mockExamId, examId))
      .orderBy(schema.mockExamQuestions.sequence);
    const answers = await this.db
      .select()
      .from(schema.mockExamAnswers)
      .where(eq(schema.mockExamAnswers.attemptId, attemptId));

    const evaluations: ExamQuestionEvaluation[] = [];

    for (const qRow of questions) {
      const q = this.parseQuestion(qRow);
      const ans = answers.find((a) => a.questionId === qRow.id);
      const payload = (ans?.answerPayload ?? {
        choiceKey: ans?.choiceKey,
        text: ans?.answerText,
      }) as SaveExamAnswerInput;

      if (isExamObjectiveType(q.type) && !(q.type === 'numerical' && 'stepRubric' in q && q.stepRubric?.length)) {
        const obj = gradeExamObjective(q, payload);
        evaluations.push({
          questionId: qRow.id,
          sequence: qRow.sequence,
          awardedMarks: obj.awardedMarks,
          maxMarks: obj.maxMarks,
          verdict: obj.verdict,
          note: obj.note,
          distractorRationale: obj.distractorRationale,
          objective: true,
        });
        if (ans) {
          await this.db
            .update(schema.mockExamAnswers)
            .set({
              evaluation: {
                awardedMarks: obj.awardedMarks,
                maxMarks: obj.maxMarks,
                verdict: obj.verdict,
                note: obj.note,
                distractorRationale: obj.distractorRationale,
                objective: true,
                final_source: 'objective',
              },
            })
            .where(eq(schema.mockExamAnswers.id, ans.id));
        }
        continue;
      }

      // Subjective: do not AI-grade here — self-grade is authoritative (recordSelfGrade).
      evaluations.push({
        questionId: qRow.id,
        sequence: qRow.sequence,
        awardedMarks: 0,
        maxMarks: q.marks,
        verdict: 'missed',
        note: 'Awaiting your self-grade.',
        objective: false,
      });
    }

    const subjectiveLeft = evaluations.filter((e) => !e.objective).length;
    if (subjectiveLeft > 0) {
      const awardedMarks = evaluations.filter((e) => e.objective).reduce((s, e) => s + e.awardedMarks, 0);
      const maxMarks = evaluations.reduce((s, e) => s + e.maxMarks, 0);
      await this.db
        .update(schema.mockExamAttempts)
        .set({
          status: 'awaiting_self_grade',
          results: {
            awardedMarks,
            maxMarks,
            awaitingSelfGradeCount: subjectiveLeft,
            evaluations,
            bySection: [],
            byTopic: [],
            patterns: [],
            suggestion: 'Grade your written answers — your grade counts.',
          },
        })
        .where(eq(schema.mockExamAttempts.id, attemptId));
      await this.db
        .update(schema.mockExams)
        .set({ status: 'awaiting_self_grade', gradingStatus: 'awaiting_self_grade', updatedAt: new Date() })
        .where(eq(schema.mockExams.id, examId));
      return;
    }

    const patterns = await this.buildPatterns(principal, questions, evaluations);
    const byTopic = deriveTopicVerdicts(
      evaluations.map((e, i) => ({
        topicLabel: questions[i]?.topic ?? 'General',
        awardedMarks: e.awardedMarks,
        maxMarks: e.maxMarks,
      })),
    );

    const sectionMap = new Map<string, { sectionId: string; sectionName: string; awarded: number; max: number }>();
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i]!;
      const e = evaluations[i]!;
      const sid = q.sectionId ?? 'default';
      const cur = sectionMap.get(sid) ?? {
        sectionId: sid,
        sectionName: sid,
        awarded: 0,
        max: 0,
      };
      cur.awarded += e.awardedMarks;
      cur.max += e.maxMarks;
      sectionMap.set(sid, cur);
    }

    const awardedMarks = evaluations.reduce((s, e) => s + e.awardedMarks, 0);
    const maxMarks = evaluations.reduce((s, e) => s + e.maxMarks, 0);
    const results: ExamResults = {
      awardedMarks,
      maxMarks,
      bySection: [...sectionMap.values()].map((s) => ({
        sectionId: s.sectionId,
        sectionName: s.sectionName,
        awardedMarks: s.awarded,
        maxMarks: s.max,
      })),
      byTopic,
      patterns,
      evaluations,
      suggestion: this.suggestion(byTopic),
    };

    await this.db
      .update(schema.mockExamAttempts)
      .set({
        status: 'scored',
        scoringVersion: 'mock-scorer-v1',
        results: results as unknown as Record<string, unknown>,
        finishedAt: new Date(),
        submittedAt: new Date(),
      })
      .where(eq(schema.mockExamAttempts.id, attemptId));
    await this.db
      .update(schema.mockExams)
      .set({ status: 'scored', gradingStatus: 'graded', updatedAt: new Date() })
      .where(eq(schema.mockExams.id, examId));

    await this.ledger.log({
      eventType: 'exam.graded',
      payload: { examId, attemptId, awardedMarks, maxMarks },
      principal,
    });
    await this.ledger.log({
      eventType: 'mock.completed',
      payload: {
        mockId: examId,
        total: maxMarks,
        correct: Math.round(awardedMarks),
        byTopic: byTopic.map((t) => ({
          topicKey: t.topicLabel,
          total: t.maxMarks,
          correct: Math.round(t.awardedMarks),
        })),
      },
      principal,
    });
  }

  /**
   * Self-grade is authoritative. AI runs only after self and is stored as comparator.
   * Header copy: "AI-graded — review the rubric. Your grade counts."
   */
  async recordSelfGrade(
    principal: StudentPrincipal,
    examId: string,
    questionId: string,
    body: unknown,
  ) {
    const { mockSelfGradeInputSchema } = await import('@edrion/schemas');
    const parsed = mockSelfGradeInputSchema.parse(body);
    const [exam] = await this.db
      .select()
      .from(schema.mockExams)
      .where(eq(schema.mockExams.id, examId))
      .limit(1);
    if (!exam) throw new Error('Exam not found');
    const [attempt] = await this.db
      .select()
      .from(schema.mockExamAttempts)
      .where(eq(schema.mockExamAttempts.mockExamId, examId))
      .orderBy(schema.mockExamAttempts.attemptNo)
      .limit(1);
    if (!attempt) throw new Error('Attempt not found');

    const [qRow] = await this.db
      .select()
      .from(schema.mockExamQuestions)
      .where(eq(schema.mockExamQuestions.id, questionId))
      .limit(1);
    if (!qRow) throw new Error('Question not found');
    const q = this.parseQuestion(qRow);
    const [ans] = await this.db
      .select()
      .from(schema.mockExamAnswers)
      .where(
        and(
          eq(schema.mockExamAnswers.attemptId, attempt.id),
          eq(schema.mockExamAnswers.questionId, questionId),
        ),
      )
      .limit(1);

    const selfAwarded = parsed.criteria.reduce((s, c) => s + c.marksAwarded, 0);
    const maxMarks = q.marks;
    const awarded = Math.min(maxMarks, Math.max(0, selfAwarded));
    const onPaper = ans?.answerMode === 'on_paper';

    let ai: Record<string, unknown> | undefined;
    if (!onPaper && this.ai.available) {
      ai = await this.runAiComparatorEnsemble(principal, q, ans);
    } else if (onPaper) {
      ai = { confidence: 'n_a', awardedMarks: 0, criteria: [], note: 'On paper — no AI grade.' };
    }

    const evaluation = {
      awardedMarks: awarded,
      maxMarks,
      verdict: deriveVerdictFromMarks(awarded, maxMarks),
      objective: false,
      self: parsed,
      ai,
      final_source: 'self' as const,
      note: 'AI-graded — review the rubric. Your grade counts.',
    };

    if (ans) {
      await this.db
        .update(schema.mockExamAnswers)
        .set({ evaluation: evaluation as unknown as Record<string, unknown> })
        .where(eq(schema.mockExamAnswers.id, ans.id));
    }

    await this.recomputeResultsAfterSelfGrade(examId, attempt.id, principal);
    return { ok: true, evaluation };
  }

  private async runAiComparatorEnsemble(
    principal: StudentPrincipal,
    q: ExamQuestion,
    ans: typeof schema.mockExamAnswers.$inferSelect | undefined,
  ): Promise<Record<string, unknown>> {
    const text = ans?.answerText ?? '';
    const samples: number[] = [];
    const criteriaSamples: Array<Array<{ criterionId: string; marksAwarded: number }>> = [];
    for (let i = 0; i < 3; i++) {
      try {
        await this.budgets.spend(principal, 'mock_eval', 400);
        const { result, usage } = await this.ai.completeJson({
          purpose: 'mock_eval',
          tier: 'small',
          system: SUBJECTIVE_GRADE_SYSTEM,
          user: `Prompt: ${q.prompt}\nStudent answer:\n${text.slice(0, 6000)}`,
          schema: examSubjectiveGradeOutputSchema,
          schemaName: 'exam_subjective_grade',
          maxOutputTokens: 1200,
        });
        await this.callLog.log(principal, 'mock_eval', usage);
        samples.push(result.awardedMarks);
        criteriaSamples.push(
          result.criteria.map((c) => ({
            criterionId: c.criterionId,
            marksAwarded: c.marksAwarded,
          })),
        );
      } catch {
        break;
      }
    }
    const unanimous =
      samples.length === 3 && samples.every((s) => s === samples[0]) &&
      criteriaSamples.every((c) =>
        c.every((crit, idx) => crit.marksAwarded === criteriaSamples[0]![idx]?.marksAwarded),
      );
    const confidence =
      ans?.answerMode === 'photo' ? 'low' : samples.length < 2 ? 'low' : unanimous ? 'high' : 'medium';
    const awardedMarks =
      samples.length > 0
        ? Math.round(samples.reduce((a, b) => a + b, 0) / samples.length)
        : 0;
    return {
      awardedMarks,
      confidence,
      samples: samples.length,
      criteria: criteriaSamples[0] ?? [],
      note: 'Comparator only — student self-grade is final.',
    };
  }

  private async recomputeResultsAfterSelfGrade(
    examId: string,
    attemptId: string,
    principal: StudentPrincipal,
  ) {
    const answers = await this.db
      .select()
      .from(schema.mockExamAnswers)
      .where(eq(schema.mockExamAnswers.attemptId, attemptId));
    const questions = await this.db
      .select()
      .from(schema.mockExamQuestions)
      .where(eq(schema.mockExamQuestions.mockExamId, examId));

    let awaiting = 0;
    let awardedMarks = 0;
    let maxMarks = 0;
    for (const q of questions) {
      maxMarks += q.marks;
      const a = answers.find((x) => x.questionId === q.id);
      const ev = a?.evaluation as { awardedMarks?: number; objective?: boolean; final_source?: string } | null;
      if (!ev) {
        const parsed = this.parseQuestion(q);
        if (!isExamObjectiveType(parsed.type)) awaiting += 1;
        continue;
      }
      awardedMarks += ev.awardedMarks ?? 0;
      if (ev.objective === false && ev.final_source !== 'self') awaiting += 1;
      if (ev.objective === false && !ev.final_source) awaiting += 1;
    }

    // Count subjective without self
    awaiting = 0;
    for (const q of questions) {
      const parsed = this.parseQuestion(q);
      if (isExamObjectiveType(parsed.type)) continue;
      const a = answers.find((x) => x.questionId === q.id);
      const ev = a?.evaluation as { final_source?: string } | null;
      if (ev?.final_source !== 'self') awaiting += 1;
    }

    const status = awaiting === 0 ? 'scored' : 'awaiting_self_grade';
    const prev = (await this.db
      .select({ results: schema.mockExamAttempts.results })
      .from(schema.mockExamAttempts)
      .where(eq(schema.mockExamAttempts.id, attemptId))
      .limit(1))[0]?.results as Record<string, unknown> | null;

    await this.db
      .update(schema.mockExamAttempts)
      .set({
        status,
        results: {
          ...(prev ?? {}),
          awardedMarks,
          maxMarks,
          awaitingSelfGradeCount: awaiting,
          scoringVersion: 'mock-scorer-v1',
        },
      })
      .where(eq(schema.mockExamAttempts.id, attemptId));
    await this.db
      .update(schema.mockExams)
      .set({
        status,
        gradingStatus: awaiting === 0 ? 'graded' : 'awaiting_self_grade',
        updatedAt: new Date(),
      })
      .where(eq(schema.mockExams.id, examId));

    if (awaiting === 0) {
      await this.ledger.log({
        eventType: 'exam.graded',
        payload: { examId, attemptId, awardedMarks, maxMarks },
        principal,
      });
    }
  }

  async pruneExpiredAttempts(): Promise<{ itemsProcessed: number }> {
    const cutoff = new Date(Date.now() - ATTEMPT_EXPIRE_HOURS * 3600_000);
    const rows = await this.db
      .update(schema.mockExamAttempts)
      .set({ status: 'expired' })
      .where(
        and(
          eq(schema.mockExamAttempts.status, 'in_progress'),
          lt(schema.mockExamAttempts.endsAt, cutoff),
        ),
      )
      .returning({ id: schema.mockExamAttempts.id });
    return { itemsProcessed: rows.length };
  }

  private async gradeOneSubjective(
    principal: StudentPrincipal,
    q: ExamQuestion,
    qRow: typeof schema.mockExamQuestions.$inferSelect,
    payload: SaveExamAnswerInput,
  ): Promise<ExamQuestionEvaluation> {
    const text =
      typeof payload.text === 'string'
        ? payload.text
        : typeof payload.workingText === 'string'
          ? payload.workingText
          : '';
    if (!text.trim()) {
      return {
        questionId: qRow.id,
        sequence: qRow.sequence,
        awardedMarks: 0,
        maxMarks: q.marks,
        verdict: 'missed',
        note: 'No written answer.',
        objective: false,
      };
    }

    const rubric =
      q.type === 'short_answer'
        ? q.expectedPoints.map((p) => ({ criterionId: p.pointId, description: p.description, marks: p.marks }))
        : q.type === 'long_answer'
          ? q.rubric.map((c) => ({ criterionId: c.criterionId, description: c.description, marks: c.marks }))
          : q.type === 'numerical' && q.stepRubric
            ? q.stepRubric.map((s) => ({ criterionId: s.stepId, description: s.description, marks: s.marks }))
            : [{ criterionId: 'overall', description: q.explanation, marks: q.marks }];

    if (!this.ai.available) {
      return {
        questionId: qRow.id,
        sequence: qRow.sequence,
        awardedMarks: 0,
        maxMarks: q.marks,
        verdict: 'slipped',
        note: 'Answer recorded — review against the model answer.',
        objective: false,
      };
    }

    let user = `Prompt: ${q.prompt}\nRubric: ${JSON.stringify(rubric)}\nStudent answer:\n${text.slice(0, 8000)}`;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        await this.budgets.spend(principal, 'mock_eval', 800);
        const { result, usage } = await this.ai.completeJson({
          purpose: 'mock_eval',
          tier: 'small',
          system: SUBJECTIVE_GRADE_SYSTEM,
          user,
          schema: examSubjectiveGradeOutputSchema,
          schemaName: 'exam_subjective_grade',
          maxOutputTokens: 1500,
        });
        await this.callLog.log(principal, 'mock_eval', usage);
        const awarded = Math.min(q.marks, Math.max(0, result.awardedMarks));
        return {
          questionId: qRow.id,
          sequence: qRow.sequence,
          awardedMarks: awarded,
          maxMarks: q.marks,
          verdict: deriveVerdictFromMarks(awarded, q.marks),
          note: result.note,
          rubricEvidence: result.criteria,
          objective: false,
        };
      } catch (e) {
        this.logger.warn(`subjective grade retry: ${e instanceof Error ? e.message : e}`);
        user += '\nPrevious grading output was invalid — repair and include evidenceQuote per criterion.';
      }
    }
    return {
      questionId: qRow.id,
      sequence: qRow.sequence,
      awardedMarks: 0,
      maxMarks: q.marks,
      verdict: 'slipped',
      note: 'Answer recorded — review against the model answer.',
      objective: false,
    };
  }

  private async buildPatterns(
    principal: StudentPrincipal,
    questions: Array<typeof schema.mockExamQuestions.$inferSelect>,
    evaluations: ExamQuestionEvaluation[],
  ): Promise<ExamPatternObservation[]> {
    const summary = evaluations.map((e, i) => ({
      n: questions[i]?.sequence ?? i + 1,
      topic: questions[i]?.topic,
      verdict: e.verdict,
      awarded: e.awardedMarks,
      max: e.maxMarks,
      note: e.note,
    }));
    const fallback = (): ExamPatternObservation[] => {
      const missed = summary.filter((s) => s.verdict === 'missed');
      const slipped = summary.filter((s) => s.verdict === 'slipped');
      const out: ExamPatternObservation[] = [];
      if (missed.length >= 2) {
        out.push({
          text: 'A few questions need another look at the source material.',
          questionNumbers: missed.slice(0, 6).map((m) => m.n),
        });
      }
      if (slipped.length >= 2) {
        out.push({
          text: 'Several answers were close — tighten wording against the model answer.',
          questionNumbers: slipped.slice(0, 6).map((m) => m.n),
        });
      }
      if (!out.length) {
        out.push({
          text: 'You stayed close to the expected answers throughout.',
          questionNumbers: summary.slice(0, 3).map((m) => m.n),
        });
        out.push({
          text: 'Keep practising timed papers to lock in pace.',
          questionNumbers: summary.slice(0, 2).map((m) => m.n),
        });
      }
      while (out.length < 2) {
        out.push({
          text: 'Review flagged items before the next attempt.',
          questionNumbers: [summary[0]?.n ?? 1],
        });
      }
      return out.slice(0, 4);
    };

    if (!this.ai.available) return fallback();
    try {
      await this.budgets.spend(principal, 'mock_eval', 600);
      const { result, usage } = await this.ai.completeJson({
        purpose: 'mock_eval',
        tier: 'small',
        system: PATTERNS_SYSTEM,
        user: JSON.stringify(summary),
        schema: examPatternsOutputSchema,
        schemaName: 'exam_patterns',
        maxOutputTokens: 800,
      });
      await this.callLog.log(principal, 'mock_eval', usage);
      return result.observations.slice(0, 4);
    } catch {
      return fallback();
    }
  }

  private parseQuestion(row: typeof schema.mockExamQuestions.$inferSelect): ExamQuestion {
    if (row.payload) {
      const parsed = labExamQuestionSchema.safeParse(row.payload);
      if (parsed.success) return parsed.data;
    }
    // Legacy fallback
    return labExamQuestionSchema.parse({
      id: row.id,
      type: row.qtype === 'mcq' ? 'mcq_single' : row.qtype === 'short' ? 'short_answer' : row.qtype === 'long' ? 'long_answer' : row.qtype,
      topicLabel: row.topic,
      difficulty: row.difficulty ?? 'balanced',
      marks: row.marks,
      blueprintSectionId: row.sectionId ?? 'sec-1',
      explanation: row.markingNote ?? 'See marking note.',
      schemaVersion: 1,
      prompt: row.prompt,
      options: row.options ?? [
        { key: 'a', label: 'A' },
        { key: 'b', label: 'B' },
        { key: 'c', label: 'C' },
        { key: 'd', label: 'D' },
      ],
      correctKey: row.correctKey ?? 'a',
      expectedPoints: [{ pointId: 'p1', description: row.markingNote ?? 'Key point', marks: row.marks }],
      rubric: [{ criterionId: 'c1', description: row.markingNote ?? 'Overall', marks: row.marks }],
    });
  }

  private suggestion(byTopic: ReturnType<typeof deriveTopicVerdicts>): string {
    const weak = byTopic.find((t) => t.verdict === 'missed') ?? byTopic.find((t) => t.verdict === 'slipped');
    if (!weak) return 'Solid paper — keep the pace with another timed set soon.';
    return `Focus your next short session on ${weak.topicLabel}.`;
  }
}
