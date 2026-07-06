import { Inject, Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import { schema, type Database } from '@edrion/database';
import {
  createMockExamSchema,
  mockAnswerUpdateSchema,
  mockGenerationOutputSchema,
  type MockResultsDto,
} from '@edrion/schemas';
import { MOCK_WEAK_TOPIC_THRESHOLD } from '@edrion/shared-types';
import { DATABASE, LEARNING_EVENTS_WRITER, LEARN_AI_PROVIDER } from '../../../common/tokens';
import type { LearnAiProvider } from '../learn-ai/provider';
import { BudgetsService } from '../learn-ai/budgets.service';
import { EvaluatorService } from '../learn-ai/evaluator.service';
import { LearnAiCallLogger } from '../learn-ai/learn-ai-call.logger';
import type { LearningEventsWriter } from '../ledger/learning-events.writer';
import { StudentStorageService } from '../storage/student-storage.service';
import type { StudentPrincipal } from '../student.types';
import { ownerColumns, ownerWhere } from '../core/owner-scope';

function questionCount(durationMin: number): number {
  if (durationMin <= 30) return 10;
  if (durationMin <= 60) return 20;
  return 30;
}

@Injectable()
export class LabMockService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(LEARN_AI_PROVIDER) private readonly ai: LearnAiProvider,
    private readonly budgets: BudgetsService,
    private readonly callLog: LearnAiCallLogger,
    private readonly evaluator: EvaluatorService,
    private readonly storage: StudentStorageService,
    @Inject(LEARNING_EVENTS_WRITER) private readonly ledger: LearningEventsWriter,
  ) {}

  async defaults(principal: StudentPrincipal) {
    const topics = await this.db
      .select({ title: schema.learnTopics.title })
      .from(schema.learnTopics)
      .limit(12);
    return {
      subjectLabel: principal.kind === 'institutional' ? 'Your subjects' : 'Your path',
      topics: topics.map((t) => t.title),
    };
  }

  async create(principal: StudentPrincipal, body: unknown) {
    const parsed = createMockExamSchema.parse(body);
    const owner = ownerColumns(principal);
    const title = parsed.title ?? `${parsed.subjectLabel} mock`;
    const [exam] = await this.db
      .insert(schema.mockExams)
      .values({
        ...owner,
        title,
        subjectLabel: parsed.subjectLabel,
        topics: parsed.topics,
        context: parsed.context,
        referenceObjectId: parsed.referenceObjectId ?? null,
        examGoalId: parsed.examGoalId ?? null,
        status: 'draft',
      })
      .returning();
    await this.generateQuestions(principal, exam!);
    return this.get(principal, exam!.id);
  }

  async get(principal: StudentPrincipal, id: string) {
    const exam = await this.requireExam(principal, id);
    const questions = await this.db
      .select()
      .from(schema.mockExamQuestions)
      .where(eq(schema.mockExamQuestions.mockExamId, exam.id))
      .orderBy(schema.mockExamQuestions.sequence);
    const attempts = await this.db
      .select()
      .from(schema.mockExamAttempts)
      .where(eq(schema.mockExamAttempts.mockExamId, exam.id))
      .orderBy(desc(schema.mockExamAttempts.attemptNo))
      .limit(1);
    const attempt = attempts[0];
    return {
      id: exam.id,
      title: exam.title,
      subjectLabel: exam.subjectLabel,
      topics: exam.topics,
      context: exam.context,
      status: exam.status,
      questions: questions.map((q) => ({
        id: q.id,
        sequence: q.sequence,
        topic: q.topic,
        qtype: q.qtype,
        prompt: q.prompt,
        options: q.options,
        marks: q.marks,
      })),
      attempt: attempt
        ? {
            id: attempt.id,
            attemptNo: attempt.attemptNo,
            startedAt: attempt.startedAt.toISOString(),
            endsAt: attempt.endsAt.toISOString(),
            finishedAt: attempt.finishedAt?.toISOString() ?? null,
          }
        : undefined,
      results: attempt?.results ?? undefined,
    };
  }

  async start(principal: StudentPrincipal, id: string) {
    const exam = await this.requireExam(principal, id);
    if (exam.status !== 'ready') {
      throw new ForbiddenException({ code: 'NOT_READY', message: 'Mock is not ready to start.' });
    }
    const ctx = exam.context as { durationMin: number };
    const endsAt = new Date(Date.now() + ctx.durationMin * 60_000);
    const [attempt] = await this.db
      .insert(schema.mockExamAttempts)
      .values({ mockExamId: exam.id, attemptNo: 1, endsAt })
      .returning();
    await this.db
      .update(schema.mockExams)
      .set({ status: 'in_progress', updatedAt: new Date() })
      .where(eq(schema.mockExams.id, exam.id));
    return { attemptId: attempt!.id, endsAt: endsAt.toISOString() };
  }

  async saveAnswer(principal: StudentPrincipal, examId: string, questionId: string, body: unknown) {
    const parsed = mockAnswerUpdateSchema.parse(body);
    const exam = await this.requireExam(principal, examId);
    const [attempt] = await this.db
      .select()
      .from(schema.mockExamAttempts)
      .where(eq(schema.mockExamAttempts.mockExamId, exam.id))
      .orderBy(desc(schema.mockExamAttempts.attemptNo))
      .limit(1);
    if (!attempt || attempt.finishedAt) {
      throw new ForbiddenException({ code: 'NO_ACTIVE_ATTEMPT', message: 'No active attempt.' });
    }
    const grace = new Date(attempt.endsAt.getTime() + 30_000);
    if (new Date() > grace) {
      throw new ForbiddenException({ code: 'TIME_EXPIRED', message: 'Time is up for this attempt.' });
    }
    await this.db
      .insert(schema.mockExamAnswers)
      .values({
        attemptId: attempt.id,
        questionId,
        choiceKey: parsed.choiceKey ?? null,
        answerText: parsed.answerText ?? null,
        photoObjectId: parsed.photoObjectId ?? null,
        flagged: parsed.flagged ?? false,
      })
      .onConflictDoUpdate({
        target: [schema.mockExamAnswers.attemptId, schema.mockExamAnswers.questionId],
        set: {
          choiceKey: parsed.choiceKey ?? null,
          answerText: parsed.answerText ?? null,
          photoObjectId: parsed.photoObjectId ?? null,
          flagged: parsed.flagged ?? false,
          updatedAt: new Date(),
        },
      });
    return { ok: true };
  }

  async finish(principal: StudentPrincipal, id: string) {
    const exam = await this.requireExam(principal, id);
    const [attempt] = await this.db
      .select()
      .from(schema.mockExamAttempts)
      .where(eq(schema.mockExamAttempts.mockExamId, exam.id))
      .orderBy(desc(schema.mockExamAttempts.attemptNo))
      .limit(1);
    if (!attempt) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Attempt not found' });

    const questions = await this.db
      .select()
      .from(schema.mockExamQuestions)
      .where(eq(schema.mockExamQuestions.mockExamId, exam.id));
    const answers = await this.db
      .select()
      .from(schema.mockExamAnswers)
      .where(eq(schema.mockExamAnswers.attemptId, attempt.id));

    const images = new Map<string, { base64: string; mimeType: string }>();
    for (const a of answers) {
      if (a.photoObjectId) {
        const row = await this.storage.getOwned(principal, a.photoObjectId);
        const buf = await new Promise<Buffer>((resolve, reject) => {
          const chunks: Buffer[] = [];
          this.storage.stream(row.storageKey).on('data', (c) => chunks.push(c as Buffer)).on('end', () => resolve(Buffer.concat(chunks))).on('error', reject);
        });
        images.set(a.photoObjectId, { base64: buf.toString('base64'), mimeType: row.mimeType });
      }
    }

    const evalInput = questions.map((q) => {
      const ans = answers.find((a) => a.questionId === q.id);
      return {
        qtype: q.qtype as 'mcq' | 'short' | 'long',
        prompt: q.prompt,
        correctKey: q.correctKey,
        markingNote: q.markingNote,
        choiceKey: ans?.choiceKey,
        answerText: ans?.answerText,
        photoObjectId: ans?.photoObjectId,
      };
    });
    const evals = await this.evaluator.evaluateMockBatch(principal, evalInput, images);

    for (let i = 0; i < questions.length; i++) {
      const q = questions[i]!;
      const ev = evals[i]!;
      const ans = answers.find((a) => a.questionId === q.id);
      if (ans) {
        await this.db
          .update(schema.mockExamAnswers)
          .set({ evaluation: { correct: ev.correct, note: ev.note } })
          .where(eq(schema.mockExamAnswers.id, ans.id));
      }
    }

    const total = questions.length;
    const correct = evals.filter((e) => e.correct).length;
    const byTopicMap = new Map<string, { total: number; correct: number; notes: string[] }>();
    questions.forEach((q, i) => {
      const bucket = byTopicMap.get(q.topic) ?? { total: 0, correct: 0, notes: [] };
      bucket.total += 1;
      if (evals[i]?.correct) bucket.correct += 1;
      if (evals[i]?.note) bucket.notes.push(evals[i]!.note!);
      byTopicMap.set(q.topic, bucket);
    });
    const byTopic = [...byTopicMap.entries()].map(([topic, v]) => ({
      topic,
      total: v.total,
      correct: v.correct,
      note: v.notes[0],
    }));
    const results: MockResultsDto = {
      total,
      correct,
      byTopic,
      suggestion: this.buildSuggestion(byTopic),
    };

    await this.db
      .update(schema.mockExamAttempts)
      .set({ finishedAt: new Date(), results })
      .where(eq(schema.mockExamAttempts.id, attempt.id));
    await this.db
      .update(schema.mockExams)
      .set({ status: 'completed', updatedAt: new Date() })
      .where(eq(schema.mockExams.id, exam.id));

    await this.ledger.log({
      eventType: 'mock.completed',
      payload: {
        mockExamId: exam.id,
        attemptId: attempt.id,
        total,
        correct,
        byTopic: byTopic.map((t) => ({ topic: t.topic, total: t.total, correct: t.correct })),
      },
      principal,
    });
    return results;
  }

  async retakeWeak(principal: StudentPrincipal, id: string) {
    const exam = await this.requireExam(principal, id);
    const [attempt] = await this.db
      .select()
      .from(schema.mockExamAttempts)
      .where(eq(schema.mockExamAttempts.mockExamId, exam.id))
      .orderBy(desc(schema.mockExamAttempts.attemptNo))
      .limit(1);
    const results = attempt?.results as MockResultsDto | null;
    if (!results) throw new ForbiddenException({ code: 'NO_RESULTS', message: 'Finish a mock first.' });
    const weak = results.byTopic
      .filter((t) => t.total > 0 && t.correct / t.total < MOCK_WEAK_TOPIC_THRESHOLD)
      .map((t) => t.topic);
    const topics = weak.length ? weak : exam.topics;
    return this.create(principal, {
      subjectLabel: exam.subjectLabel,
      topics,
      context: exam.context,
      title: 'Retake — weak areas',
    });
  }

  private async generateQuestions(principal: StudentPrincipal, exam: typeof schema.mockExams.$inferSelect) {
    const ctx = exam.context as { durationMin: number; mix: string; difficulty: string };
    const count = questionCount(ctx.durationMin);
    let questions: Array<{
      topic: string;
      qtype: 'mcq' | 'short' | 'long';
      prompt: string;
      options?: { key: string; label: string }[];
      correctKey?: string;
      markingNote?: string;
      marks: number;
    }> = [];

    if (this.ai.available) {
      await this.budgets.spend(principal, 'mock_gen', 4000);
      try {
        const { result, usage } = await this.ai.completeJson({
          purpose: 'mock_gen',
          tier: 'large',
          system: 'Generate fresh mock exam questions with varied numbers.',
          user: `Subject: ${exam.subjectLabel}\nTopics: ${(exam.topics as string[]).join(', ')}\nCount: ${count}\nMix: ${ctx.mix}\nDifficulty: ${ctx.difficulty}`,
          schema: mockGenerationOutputSchema,
          schemaName: 'mock_questions',
          maxOutputTokens: 6000,
        });
        await this.callLog.log(principal, 'mock_gen', usage);
        questions = result.questions.map((q) => ({ ...q, marks: q.marks ?? 1 }));
      } catch {
        questions = [];
      }
    }

    if (!questions.length) {
      questions = Array.from({ length: Math.min(count, 5) }, (_, i) => ({
        topic: (exam.topics as string[])[i % (exam.topics as string[]).length]!,
        qtype: i % 2 === 0 ? ('mcq' as const) : ('short' as const),
        prompt: `Question ${i + 1} on ${(exam.topics as string[])[0]}`,
        options: i % 2 === 0 ? [{ key: 'A', label: 'Option A' }, { key: 'B', label: 'Option B' }] : undefined,
        correctKey: i % 2 === 0 ? 'A' : undefined,
        markingNote: 'Accept reasonable answers.',
        marks: 1,
      }));
    }

    await this.db.insert(schema.mockExamQuestions).values(
      questions.map((q, i) => ({
        mockExamId: exam.id,
        sequence: i + 1,
        topic: q.topic,
        qtype: q.qtype,
        prompt: q.prompt,
        options: q.options ?? null,
        correctKey: q.correctKey ?? null,
        markingNote: q.markingNote ?? null,
        marks: q.marks ?? 1,
      })),
    );
    await this.db
      .update(schema.mockExams)
      .set({ status: 'ready', generatedAt: new Date(), updatedAt: new Date() })
      .where(eq(schema.mockExams.id, exam.id));
  }

  private buildSuggestion(byTopic: MockResultsDto['byTopic']) {
    const weakest = [...byTopic].sort((a, b) => a.correct / a.total - b.correct / b.total)[0];
    if (!weakest) return 'Keep practicing — consistency builds confidence.';
    return `Focus your next short session on ${weakest.topic} — ${weakest.note ?? 'a few slips showed up there.'}`;
  }

  private async requireExam(principal: StudentPrincipal, id: string) {
    const [exam] = await this.db
      .select()
      .from(schema.mockExams)
      .where(
        and(eq(schema.mockExams.id, id), ownerWhere(principal, schema.mockExams.studentId, schema.mockExams.independentUserId)),
      )
      .limit(1);
    if (!exam) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Mock exam not found' });
    return exam;
  }
}
