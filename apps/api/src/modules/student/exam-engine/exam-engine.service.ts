import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, desc, eq, schema, type Database } from '@edrion/database';
import {
  createExamBlueprintInputSchema,
  createMockExamSchema,
  defaultBlueprintForTemplate,
  examBlueprintSchema,
  examTemplateAllowsPause,
  generateExamInputSchema,
  checkExamTopicInputSchema,
  pushRevisionTopicsInputSchema,
  saveExamAnswerSchema,
  updateExamBlueprintInputSchema,
  type ExamBlueprint,
  type ExamResults,
  type MockExamDto,
} from '@edrion/schemas';
import { DATABASE, LEARNING_EVENTS_WRITER } from '../../../common/tokens';
import type { LearningEventsWriter } from '../ledger/learning-events.writer';
import type { StudentPrincipal } from '../student.types';
import { ownerColumns, ownerWhere } from '../core/owner-scope';
import { ExamTopicalityService } from './exam-topicality.service';
import { ExamEngineProcessor } from './exam-engine.processor';
import { ExamSubjectiveGradingService } from './exam-subjective-grading.service';
import { stripAnswerKeys } from './exam-grader';
import { labExamQuestionSchema } from '@edrion/schemas';
import type { ExamPrincipalRef } from './exam-generation.service';

@Injectable()
export class ExamEngineService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(LEARNING_EVENTS_WRITER) private readonly ledger: LearningEventsWriter,
    private readonly topicality: ExamTopicalityService,
    private readonly processor: ExamEngineProcessor,
    private readonly grading: ExamSubjectiveGradingService,
  ) {}

  principalRef(principal: StudentPrincipal): ExamPrincipalRef {
    if (principal.kind === 'institutional') {
      return {
        kind: 'institutional',
        institutionId: principal.institutionId,
        studentId: principal.studentId,
        campusId: principal.campusId,
      };
    }
    return { kind: 'independent', independentUserId: principal.independentUserId };
  }

  async defaults(principal: StudentPrincipal) {
    const events = await this.db
      .select({
        topicKey: schema.learningEvents.topicKey,
        subjectLabel: schema.learningEvents.subjectLabel,
        payload: schema.learningEvents.payload,
      })
      .from(schema.learningEvents)
      .where(
        ownerWhere(principal, schema.learningEvents.studentId, schema.learningEvents.independentUserId),
      )
      .orderBy(desc(schema.learningEvents.occurredAt))
      .limit(80);

    const seen = new Map<string, { label: string; topicId?: string | null }>();
    for (const e of events) {
      const label =
        e.topicKey ||
        (typeof e.payload === 'object' && e.payload && 'topicKey' in e.payload
          ? String((e.payload as { topicKey?: string }).topicKey ?? '')
          : '');
      if (!label || seen.has(label.toLowerCase())) continue;
      seen.set(label.toLowerCase(), { label });
      if (seen.size >= 12) break;
    }

    // Prefer learn_topics titles when available
    const topics = await this.db.select({ id: schema.learnTopics.id, title: schema.learnTopics.title }).from(schema.learnTopics).limit(24);
    for (const t of topics) {
      if (seen.size >= 16) break;
      if (!seen.has(t.title.toLowerCase())) seen.set(t.title.toLowerCase(), { label: t.title, topicId: t.id });
    }

    return {
      subjectLabel: principal.kind === 'institutional' ? 'Your subjects' : 'Your path',
      topics: [...seen.values()].map((t) => t.label),
      studiedTopics: [...seen.values()],
    };
  }

  async listPatterns() {
    const rows = await this.db.select().from(schema.examPaperPatterns).orderBy(schema.examPaperPatterns.name);
    return {
      patterns: rows.map((r) => ({
        id: r.id,
        key: r.key,
        name: r.name,
        board: r.board,
        levelLabel: r.levelLabel,
        durationMin: r.durationMin,
        totalMarks: r.totalMarks,
        sections: r.sections,
        description: r.description ?? undefined,
      })),
    };
  }

  async listExams(principal: StudentPrincipal) {
    const exams = await this.db
      .select()
      .from(schema.mockExams)
      .where(ownerWhere(principal, schema.mockExams.studentId, schema.mockExams.independentUserId))
      .orderBy(desc(schema.mockExams.createdAt))
      .limit(50);
    const blueprints = await this.db
      .select()
      .from(schema.examBlueprints)
      .where(ownerWhere(principal, schema.examBlueprints.studentId, schema.examBlueprints.independentUserId))
      .orderBy(desc(schema.examBlueprints.updatedAt))
      .limit(30);

    return {
      exams: exams.map((e) => ({
        id: e.id,
        title: e.title,
        subjectLabel: e.subjectLabel,
        status: e.status,
        blueprintId: e.blueprintId,
        createdAt: e.createdAt.toISOString(),
      })),
      blueprints: blueprints.map((b) => ({
        id: b.id,
        blueprint: b.blueprint,
        version: b.version,
        createdAt: b.createdAt.toISOString(),
        updatedAt: b.updatedAt.toISOString(),
      })),
    };
  }

  async createBlueprint(principal: StudentPrincipal, body: unknown) {
    const parsed = createExamBlueprintInputSchema.parse(body);
    const owner = ownerColumns(principal);
    const [row] = await this.db
      .insert(schema.examBlueprints)
      .values({
        ...owner,
        sourceKind: parsed.blueprint.sourceKind,
        paperPatternId: parsed.blueprint.paperPatternId ?? null,
        blueprint: parsed.blueprint as unknown as Record<string, unknown>,
      })
      .returning();
    await this.ledger.log({
      eventType: 'exam.blueprint_created',
      payload: {
        blueprintId: row!.id,
        template: parsed.blueprint.template,
        sourceKind: parsed.blueprint.sourceKind,
      },
      principal,
    });
    return this.blueprintDto(row!);
  }

  async getBlueprint(principal: StudentPrincipal, id: string) {
    const row = await this.requireBlueprint(principal, id);
    return this.blueprintDto(row);
  }

  async updateBlueprint(principal: StudentPrincipal, id: string, body: unknown) {
    const parsed = updateExamBlueprintInputSchema.parse(body);
    const row = await this.requireBlueprint(principal, id);
    if (row.version !== parsed.version) {
      throw new ForbiddenException({ code: 'VERSION_CONFLICT', message: 'Blueprint was updated elsewhere.' });
    }
    const [updated] = await this.db
      .update(schema.examBlueprints)
      .set({
        blueprint: parsed.blueprint as unknown as Record<string, unknown>,
        sourceKind: parsed.blueprint.sourceKind,
        paperPatternId: parsed.blueprint.paperPatternId ?? null,
        version: row.version + 1,
        updatedAt: new Date(),
      })
      .where(eq(schema.examBlueprints.id, id))
      .returning();
    return this.blueprintDto(updated!);
  }

  async checkTopic(principal: StudentPrincipal, body: unknown) {
    const parsed = checkExamTopicInputSchema.parse(body);
    return this.topicality.check(principal, parsed.topic, parsed.subjectLabel);
  }

  async generate(principal: StudentPrincipal, body: unknown) {
    const { blueprintId } = generateExamInputSchema.parse(body);
    const bp = await this.requireBlueprint(principal, blueprintId);
    const blueprint = examBlueprintSchema.parse(bp.blueprint);
    const owner = ownerColumns(principal);
    const [exam] = await this.db
      .insert(schema.mockExams)
      .values({
        ...owner,
        title: blueprint.title,
        subjectLabel: blueprint.subjectLabel,
        topics: blueprint.topicWeights.map((t) => t.topicLabel),
        context: {
          level: 'current',
          board: blueprint.paperPatternId ? 'preset' : 'general',
          mix: blueprint.template,
          difficulty: blueprint.difficultyCurve,
          durationMin: blueprint.durationMin,
          hintsOff: true,
        },
        blueprintId,
        sourceKind: blueprint.sourceKind,
        status: 'generating',
        blueprintSnapshot: blueprint,
        blueprintVersion: bp.version,
      })
      .returning();

    await this.processor.enqueueGenerate({
      examId: exam!.id,
      principalRef: this.principalRef(principal),
    });
    return this.get(principal, exam!.id);
  }

  /** Legacy sync create — builds a chapter_test blueprint then generates. */
  async createLegacy(principal: StudentPrincipal, body: unknown) {
    const parsed = createMockExamSchema.parse(body);
    if (parsed.blueprintId) return this.generate(principal, { blueprintId: parsed.blueprintId });
    const blueprint = defaultBlueprintForTemplate('chapter_test', {
      subjectLabel: parsed.subjectLabel,
      topicWeights: parsed.topics.map((t) => ({ topicLabel: t, weight: 5 as const })),
      sourceKind: 'studied',
    });
    blueprint.durationMin = Math.min(240, Math.max(5, parsed.context.durationMin));
    if (parsed.title) blueprint.title = parsed.title;
    const created = await this.createBlueprint(principal, { blueprint });
    return this.generate(principal, { blueprintId: created.id });
  }

  async get(principal: StudentPrincipal, id: string, opts?: { includeKeys?: boolean }): Promise<MockExamDto> {
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
    const includeKeys = opts?.includeKeys || attempt?.status === 'graded' || exam.status === 'completed';

    let answers:
      | Array<{
          questionId: string;
          flagged: boolean;
          payload?: Record<string, unknown> | null;
          choiceKey?: string | null;
          answerText?: string | null;
          evaluation?: Record<string, unknown> | null;
          clientUpdatedAt?: string | null;
        }>
      | undefined;
    if (attempt) {
      const rows = await this.db
        .select()
        .from(schema.mockExamAnswers)
        .where(eq(schema.mockExamAnswers.attemptId, attempt.id));
      answers = rows.map((a) => ({
        questionId: a.questionId,
        flagged: a.flagged,
        payload: a.answerPayload,
        choiceKey: a.choiceKey,
        answerText: a.answerText,
        evaluation: includeKeys ? a.evaluation : undefined,
        clientUpdatedAt: a.clientUpdatedAt?.toISOString() ?? null,
      }));
    }

    let blueprint: ExamBlueprint | undefined;
    if (exam.blueprintId) {
      const [bp] = await this.db
        .select()
        .from(schema.examBlueprints)
        .where(eq(schema.examBlueprints.id, exam.blueprintId))
        .limit(1);
      if (bp) {
        const p = examBlueprintSchema.safeParse(bp.blueprint);
        if (p.success) blueprint = p.data;
      }
    }

    return {
      id: exam.id,
      title: exam.title,
      subjectLabel: exam.subjectLabel,
      topics: exam.topics as string[],
      context: exam.context as MockExamDto['context'],
      status: exam.status as MockExamDto['status'],
      blueprintId: exam.blueprintId,
      blueprint,
      sourceKind: (exam.sourceKind as MockExamDto['sourceKind']) ?? undefined,
      generationNotice: exam.generationNotice,
      gradingStatus: (exam.gradingStatus as MockExamDto['gradingStatus']) ?? undefined,
      questions: questions.map((q) => {
        const payload = q.payload ? labExamQuestionSchema.safeParse(q.payload) : null;
        const stripped =
          payload?.success && !includeKeys
            ? stripAnswerKeys(payload.data)
            : payload?.success
              ? (payload.data as unknown as Record<string, unknown>)
              : undefined;
        return {
          id: q.id,
          sequence: q.sequence,
          topic: q.topic,
          qtype: q.qtype as never,
          prompt: q.prompt,
          options: includeKeys ? q.options : q.options?.map((o) => ({ key: o.key, label: o.label })) ?? null,
          marks: q.marks,
          sectionId: q.sectionId ?? undefined,
          difficulty: q.difficulty ?? undefined,
          payload: stripped,
        };
      }),
      attempt: attempt
        ? {
            id: attempt.id,
            attemptNo: attempt.attemptNo,
            startedAt: attempt.startedAt.toISOString(),
            endsAt: attempt.endsAt.toISOString(),
            finishedAt: attempt.finishedAt?.toISOString() ?? null,
            status: attempt.status as never,
            pausedAt: attempt.pausedAt?.toISOString() ?? null,
          }
        : undefined,
      answers,
      results: includeKeys ? ((attempt?.results as ExamResults | null) ?? undefined) : undefined,
    };
  }

  async start(principal: StudentPrincipal, id: string) {
    const exam = await this.requireExam(principal, id);
    if (exam.status !== 'ready' && exam.status !== 'in_progress') {
      throw new ForbiddenException({ code: 'NOT_READY', message: 'Exam is not ready to start.' });
    }
    const existing = await this.db
      .select()
      .from(schema.mockExamAttempts)
      .where(
        and(
          eq(schema.mockExamAttempts.mockExamId, exam.id),
          eq(schema.mockExamAttempts.status, 'in_progress'),
        ),
      )
      .limit(1);
    if (existing[0]) {
      return { attemptId: existing[0].id, endsAt: existing[0].endsAt.toISOString() };
    }
    // Resume paused
    const paused = await this.db
      .select()
      .from(schema.mockExamAttempts)
      .where(
        and(eq(schema.mockExamAttempts.mockExamId, exam.id), eq(schema.mockExamAttempts.status, 'paused')),
      )
      .limit(1);
    if (paused[0]) {
      const remaining = Math.max(0, paused[0].endsAt.getTime() - (paused[0].pausedAt?.getTime() ?? Date.now()));
      const endsAt = new Date(Date.now() + remaining);
      await this.db
        .update(schema.mockExamAttempts)
        .set({ status: 'in_progress', pausedAt: null, endsAt, startedAt: new Date() })
        .where(eq(schema.mockExamAttempts.id, paused[0].id));
      await this.db
        .update(schema.mockExams)
        .set({ status: 'in_progress', updatedAt: new Date() })
        .where(eq(schema.mockExams.id, exam.id));
      return { attemptId: paused[0].id, endsAt: endsAt.toISOString() };
    }

    const ctx = exam.context as { durationMin: number };
    const endsAt = new Date(Date.now() + ctx.durationMin * 60_000);
    const maxNo = await this.db
      .select({ attemptNo: schema.mockExamAttempts.attemptNo })
      .from(schema.mockExamAttempts)
      .where(eq(schema.mockExamAttempts.mockExamId, exam.id))
      .orderBy(desc(schema.mockExamAttempts.attemptNo))
      .limit(1);
    const attemptNo = (maxNo[0]?.attemptNo ?? 0) + 1;
    const [attempt] = await this.db
      .insert(schema.mockExamAttempts)
      .values({ mockExamId: exam.id, attemptNo, endsAt, status: 'in_progress' })
      .returning();
    await this.db
      .update(schema.mockExams)
      .set({ status: 'in_progress', updatedAt: new Date() })
      .where(eq(schema.mockExams.id, exam.id));
    await this.ledger.log({
      eventType: 'exam.attempt_started',
      payload: { examId: exam.id, attemptId: attempt!.id },
      principal,
    });
    return { attemptId: attempt!.id, endsAt: endsAt.toISOString() };
  }

  async pause(principal: StudentPrincipal, id: string) {
    const exam = await this.requireExam(principal, id);
    let template = 'chapter_test';
    if (exam.blueprintId) {
      const [bp] = await this.db
        .select()
        .from(schema.examBlueprints)
        .where(eq(schema.examBlueprints.id, exam.blueprintId))
        .limit(1);
      const parsed = examBlueprintSchema.safeParse(bp?.blueprint);
      if (parsed.success) template = parsed.data.template;
    }
    if (!examTemplateAllowsPause(template as never)) {
      throw new ForbiddenException({ code: 'PAUSE_DENIED', message: 'Pause is only allowed for Quick check.' });
    }
    const [attempt] = await this.db
      .select()
      .from(schema.mockExamAttempts)
      .where(
        and(eq(schema.mockExamAttempts.mockExamId, exam.id), eq(schema.mockExamAttempts.status, 'in_progress')),
      )
      .limit(1);
    if (!attempt) throw new ForbiddenException({ code: 'NO_ACTIVE_ATTEMPT', message: 'No active attempt.' });
    await this.db
      .update(schema.mockExamAttempts)
      .set({ status: 'paused', pausedAt: new Date() })
      .where(eq(schema.mockExamAttempts.id, attempt.id));
    return this.get(principal, id);
  }

  async saveAnswer(principal: StudentPrincipal, examId: string, questionId: string, body: unknown) {
    const parsed = saveExamAnswerSchema.parse(body);
    const exam = await this.requireExam(principal, examId);
    const [attempt] = await this.db
      .select()
      .from(schema.mockExamAttempts)
      .where(
        and(eq(schema.mockExamAttempts.mockExamId, exam.id), eq(schema.mockExamAttempts.status, 'in_progress')),
      )
      .limit(1);
    if (!attempt) throw new ForbiddenException({ code: 'NO_ACTIVE_ATTEMPT', message: 'No active attempt.' });
    const grace = new Date(attempt.endsAt.getTime() + 30_000);
    if (new Date() > grace) {
      throw new ForbiddenException({ code: 'TIME_EXPIRED', message: 'Time is up for this attempt.' });
    }

    const clientUpdatedAt = new Date(parsed.clientUpdatedAt);
    const [existing] = await this.db
      .select()
      .from(schema.mockExamAnswers)
      .where(
        and(
          eq(schema.mockExamAnswers.attemptId, attempt.id),
          eq(schema.mockExamAnswers.questionId, questionId),
        ),
      )
      .limit(1);
    if (existing?.clientUpdatedAt && existing.clientUpdatedAt > clientUpdatedAt) {
      return { ok: true, skipped: true };
    }

    const answerPayload = { ...parsed } as Record<string, unknown>;
    await this.db
      .insert(schema.mockExamAnswers)
      .values({
        attemptId: attempt.id,
        questionId,
        choiceKey: parsed.choiceKey ?? (parsed.choiceKeys ? parsed.choiceKeys.join(',') : null),
        answerText: parsed.text ?? (parsed.value != null ? String(parsed.value) : null),
        flagged: parsed.flagged ?? false,
        answerPayload,
        clientUpdatedAt,
      })
      .onConflictDoUpdate({
        target: [schema.mockExamAnswers.attemptId, schema.mockExamAnswers.questionId],
        set: {
          choiceKey: parsed.choiceKey ?? (parsed.choiceKeys ? parsed.choiceKeys.join(',') : null),
          answerText: parsed.text ?? (parsed.value != null ? String(parsed.value) : null),
          flagged: parsed.flagged ?? false,
          answerPayload,
          clientUpdatedAt,
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

    await this.ledger.log({
      eventType: 'exam.attempt_submitted',
      payload: { examId: exam.id, attemptId: attempt.id },
      principal,
    });

    const { evaluations, needsSubjective, maxMarks, awardedMarks } = await this.grading.gradeObjectivePass(
      exam.id,
      attempt.id,
    );

    if (!needsSubjective) {
      await this.grading.gradeSubjective(exam.id, attempt.id, this.principalRef(principal));
      return this.get(principal, id, { includeKeys: true });
    }

    await this.db
      .update(schema.mockExamAttempts)
      .set({
        status: 'grading',
        finishedAt: new Date(),
        results: {
          awardedMarks,
          maxMarks,
          bySection: [],
          byTopic: [],
          patterns: [],
          evaluations,
          suggestion: 'Grading your written answers…',
        },
      })
      .where(eq(schema.mockExamAttempts.id, attempt.id));
    await this.db
      .update(schema.mockExams)
      .set({ gradingStatus: 'grading', status: 'completed', updatedAt: new Date() })
      .where(eq(schema.mockExams.id, exam.id));

    await this.processor.enqueueGrade({
      examId: exam.id,
      attemptId: attempt.id,
      principalRef: this.principalRef(principal),
    });
    return this.get(principal, id, { includeKeys: true });
  }

  async retakeWeak(principal: StudentPrincipal, id: string) {
    const exam = await this.requireExam(principal, id);
    const [attempt] = await this.db
      .select()
      .from(schema.mockExamAttempts)
      .where(eq(schema.mockExamAttempts.mockExamId, exam.id))
      .orderBy(desc(schema.mockExamAttempts.attemptNo))
      .limit(1);
    const results = attempt?.results as ExamResults | null;
    if (!results?.byTopic?.length) {
      throw new ForbiddenException({ code: 'NO_RESULTS', message: 'Finish and grade a mock first.' });
    }
    const weak = results.byTopic
      .filter((t) => t.verdict === 'missed' || t.verdict === 'slipped')
      .map((t) => t.topicLabel);
    const topics = weak.length ? weak : (exam.topics as string[]);
    const blueprint = defaultBlueprintForTemplate('quick_check', {
      subjectLabel: exam.subjectLabel,
      topicWeights: topics.map((t) => ({ topicLabel: t, weight: 5 as const })),
      sourceKind: 'studied',
    });
    blueprint.title = 'Retake — weak areas';
    const created = await this.createBlueprint(principal, { blueprint });
    const next = await this.generate(principal, { blueprintId: created.id });
    await this.ledger.log({
      eventType: 'exam.retake_weak_started',
      payload: { sourceExamId: exam.id, newExamId: next.id, topics },
      principal,
    });
    return next;
  }

  async pushRevision(principal: StudentPrincipal, body: unknown) {
    const parsed = pushRevisionTopicsInputSchema.parse(body);
    const queued: string[] = [];
    for (const label of parsed.topicLabels) {
      const [topic] = await this.db
        .select()
        .from(schema.learnTopics)
        .where(eq(schema.learnTopics.title, label))
        .limit(1);
      let topicId = topic?.id;
      if (!topicId) {
        const topicKey = label.toLowerCase().replace(/\s+/g, '-').slice(0, 80);
        const [created] = await this.db
          .insert(schema.learnTopics)
          .values({
            topicKey,
            title: label,
            subjectLabel: 'Exam',
          })
          .onConflictDoNothing()
          .returning();
        topicId = created?.id;
        if (!topicId) {
          const [again] = await this.db
            .select()
            .from(schema.learnTopics)
            .where(eq(schema.learnTopics.topicKey, topicKey))
            .limit(1);
          topicId = again?.id;
        }
      }
      if (!topicId) continue;
      await this.markRevisionDue(principal, topicId, label, parsed.attemptId);
      queued.push(label);
    }
    await this.ledger.log({
      eventType: 'exam.topics_pushed_to_revision',
      payload: { attemptId: parsed.attemptId, topicLabels: queued },
      principal,
    });
    return { ok: true, queued: queued.length };
  }

  private async markRevisionDue(
    principal: StudentPrincipal,
    topicId: string,
    title: string,
    attemptId: string,
  ) {
    const now = new Date();
    const base =
      principal.kind === 'institutional'
        ? { studentId: principal.studentId, independentUserId: null as string | null }
        : { studentId: null as string | null, independentUserId: principal.independentUserId };
    const reason = {
      contextType: 'visual_canvas' as const,
      contextId: attemptId,
      nodeId: 'exam',
      title,
      reason: 'memory_missing' as const,
      queuedAt: now.toISOString(),
    };
    await this.db
      .insert(schema.revisionStates)
      .values({
        ...base,
        topicId,
        freshness: 'due',
        lastEvidenceAt: now,
        manualDueAt: now,
        manualReasons: [reason],
        computedAt: now,
      })
      .onConflictDoUpdate({
        target:
          principal.kind === 'institutional'
            ? [schema.revisionStates.studentId, schema.revisionStates.topicId]
            : [schema.revisionStates.independentUserId, schema.revisionStates.topicId],
        set: {
          freshness: 'due',
          manualDueAt: now,
          manualReasons: [reason],
          computedAt: now,
        },
      });
  }

  private blueprintDto(row: typeof schema.examBlueprints.$inferSelect) {
    return {
      id: row.id,
      blueprint: examBlueprintSchema.parse(row.blueprint),
      version: row.version,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private async requireExam(principal: StudentPrincipal, id: string) {
    const [exam] = await this.db
      .select()
      .from(schema.mockExams)
      .where(
        and(
          eq(schema.mockExams.id, id),
          ownerWhere(principal, schema.mockExams.studentId, schema.mockExams.independentUserId),
        ),
      )
      .limit(1);
    if (!exam) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Mock exam not found' });
    return exam;
  }

  private async requireBlueprint(principal: StudentPrincipal, id: string) {
    const [row] = await this.db
      .select()
      .from(schema.examBlueprints)
      .where(
        and(
          eq(schema.examBlueprints.id, id),
          ownerWhere(principal, schema.examBlueprints.studentId, schema.examBlueprints.independentUserId),
        ),
      )
      .limit(1);
    if (!row) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Blueprint not found' });
    return row;
  }
}
