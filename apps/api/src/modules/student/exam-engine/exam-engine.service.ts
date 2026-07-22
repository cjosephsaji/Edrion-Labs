import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, desc, eq, inArray, isNull, or, schema, type Database } from '@edrion/database';
import { z } from 'zod';
import {
  createExamBlueprintInputSchema,
  createMockExamSchema,
  createMockFromWizardSchema,
  defaultBlueprintForTemplate,
  deriveBlueprintOrigin,
  examBlueprintSchema,
  examBlueprintTotalMarks,
  examBlueprintTotalQuestions,
  examBlueprintSectionSchema,
  generateExamInputSchema,
  checkExamTopicInputSchema,
  MOCK_ANSWER_GRACE_MS,
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
    const skin = parsed.skin ?? parsed.blueprint.skin ?? 'standard';
    const gradingStyle = parsed.gradingStyle ?? parsed.blueprint.gradingStyle ?? 'auto';
    const [row] = await this.db
      .insert(schema.examBlueprints)
      .values({
        ...owner,
        sourceKind: parsed.blueprint.sourceKind,
        paperPatternId: parsed.blueprint.paperPatternId ?? null,
        blueprint: { ...parsed.blueprint, skin, gradingStyle } as unknown as Record<string, unknown>,
        skin,
        gradingStyle,
        examProfileKey: parsed.examProfileKey ?? parsed.blueprint.examProfileKey ?? null,
        isPublished: false,
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
    const skin = parsed.skin ?? parsed.blueprint.skin ?? row.skin;
    const gradingStyle = parsed.gradingStyle ?? parsed.blueprint.gradingStyle ?? row.gradingStyle;
    const [updated] = await this.db
      .update(schema.examBlueprints)
      .set({
        blueprint: { ...parsed.blueprint, skin, gradingStyle } as unknown as Record<string, unknown>,
        sourceKind: parsed.blueprint.sourceKind,
        paperPatternId: parsed.blueprint.paperPatternId ?? null,
        skin,
        gradingStyle,
        examProfileKey:
          parsed.examProfileKey !== undefined
            ? parsed.examProfileKey
            : (parsed.blueprint.examProfileKey ?? row.examProfileKey),
        version: row.version + 1,
        updatedAt: new Date(),
      })
      .where(eq(schema.examBlueprints.id, id))
      .returning();
    return this.blueprintDto(updated!);
  }

  /** List blueprints for wizard: personal + published institution + patterns separately via listPatterns. */
  async listWizardBlueprints(principal: StudentPrincipal) {
    const personal = await this.db
      .select()
      .from(schema.examBlueprints)
      .where(
        and(
          ownerWhere(principal, schema.examBlueprints.studentId, schema.examBlueprints.independentUserId),
          isNull(schema.examBlueprints.archivedAt),
        ),
      )
      .orderBy(desc(schema.examBlueprints.updatedAt))
      .limit(40);

    let institution: (typeof schema.examBlueprints.$inferSelect)[] = [];
    if (principal.kind === 'institutional') {
      institution = await this.db
        .select()
        .from(schema.examBlueprints)
        .where(
          and(
            eq(schema.examBlueprints.institutionId, principal.institutionId),
            isNull(schema.examBlueprints.studentId),
            isNull(schema.examBlueprints.independentUserId),
            eq(schema.examBlueprints.isPublished, true),
            isNull(schema.examBlueprints.archivedAt),
          ),
        )
        .orderBy(desc(schema.examBlueprints.updatedAt))
        .limit(40);
    }

    return {
      personal: personal.map((b) => this.blueprintDto(b)),
      institution: institution.map((b) => this.blueprintDto(b)),
      quickMock: defaultBlueprintForTemplate('quick_check', {
        subjectLabel: 'Quick mock',
        topicWeights: [{ topicLabel: 'General', weight: 5 }],
        sourceKind: 'studied',
      }),
    };
  }

  async duplicateFromPattern(principal: StudentPrincipal, patternKey: string) {
    const [pattern] = await this.db
      .select()
      .from(schema.examPaperPatterns)
      .where(eq(schema.examPaperPatterns.key, patternKey))
      .limit(1);
    if (!pattern) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Pattern not found' });
    const sections = z.array(examBlueprintSectionSchema).parse(pattern.sections);
    const skin =
      pattern.board === 'NTA' ? 'nta' : pattern.key.startsWith('cbse') || pattern.key.includes('university') || pattern.key.startsWith('ap')
        ? 'paper'
        : 'standard';
    const gradingStyle =
      skin === 'paper' ? 'ai_assisted' : ('auto' as const);
    const blueprint = examBlueprintSchema.parse({
      template: 'board_pattern',
      title: pattern.name,
      subjectLabel: pattern.name,
      durationMin: pattern.durationMin,
      difficultyCurve: 'exam_level',
      sections,
      topicWeights: [{ topicLabel: pattern.name, weight: 5 }],
      paperPatternId: pattern.id,
      sourceKind: 'preset',
      skin,
      gradingStyle,
    });
    return this.createBlueprint(principal, { blueprint, skin, gradingStyle });
  }

  async checkTopic(principal: StudentPrincipal, body: unknown) {
    const parsed = checkExamTopicInputSchema.parse(body);
    return this.topicality.check(principal, parsed.topic, parsed.subjectLabel);
  }

  async generate(principal: StudentPrincipal, body: unknown) {
    const { blueprintId } = generateExamInputSchema.parse(body);
    const bp = await this.requireBlueprintReadable(principal, blueprintId);
    const blueprint = examBlueprintSchema.parse(bp.blueprint);
    const owner = ownerColumns(principal);
    const snapshot = {
      ...blueprint,
      skin: (bp.skin as ExamBlueprint['skin']) ?? blueprint.skin ?? 'standard',
      gradingStyle: (bp.gradingStyle as ExamBlueprint['gradingStyle']) ?? blueprint.gradingStyle ?? 'auto',
      resolvedTotalMarks: examBlueprintTotalMarks(blueprint),
      resolvedTotalQuestions: examBlueprintTotalQuestions(blueprint),
      snapshotAt: new Date().toISOString(),
    };
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
        blueprintSnapshot: snapshot as unknown as Record<string, unknown>,
        blueprintVersion: bp.version,
        strictMode: false,
      })
      .returning();

    await this.processor.enqueueGenerate({
      examId: exam!.id,
      principalRef: this.principalRef(principal),
    });
    return this.get(principal, exam!.id);
  }

  /** Wizard create — persists full snapshot before queue (Part B §4). */
  async createFromWizard(principal: StudentPrincipal, body: unknown) {
    const parsed = createMockFromWizardSchema.parse(body);
    const owner = ownerColumns(principal);

    let bpRow: typeof schema.examBlueprints.$inferSelect | null = null;
    let blueprint: ExamBlueprint;
    if (parsed.quickMock) {
      const topics =
        parsed.scope.kind === 'topics'
          ? parsed.scope.topicLabels
          : ['General'];
      blueprint = defaultBlueprintForTemplate('quick_check', {
        subjectLabel: topics[0] ?? 'Quick mock',
        topicWeights: topics.map((t) => ({ topicLabel: t, weight: 5 as const })),
        sourceKind: 'studied',
      });
    } else if (parsed.blueprintId) {
      bpRow = await this.requireBlueprintReadable(principal, parsed.blueprintId);
      blueprint = examBlueprintSchema.parse(bpRow.blueprint);
    } else if (parsed.paperPatternKey) {
      const dup = await this.duplicateFromPattern(principal, parsed.paperPatternKey);
      bpRow = await this.requireBlueprint(principal, dup.id);
      blueprint = examBlueprintSchema.parse(bpRow.blueprint);
    } else {
      throw new ForbiddenException({ code: 'BLUEPRINT_REQUIRED', message: 'Select a blueprint or Quick mock.' });
    }

    const topicLabels =
      parsed.scope.kind === 'topics'
        ? parsed.scope.topicLabels
        : blueprint.topicWeights.map((t) => t.topicLabel);

    const snapshot = {
      ...blueprint,
      skin: (bpRow?.skin as ExamBlueprint['skin']) ?? blueprint.skin ?? 'standard',
      gradingStyle:
        (bpRow?.gradingStyle as ExamBlueprint['gradingStyle']) ?? blueprint.gradingStyle ?? 'auto',
      resolvedTotalMarks: examBlueprintTotalMarks(blueprint),
      resolvedTotalQuestions: examBlueprintTotalQuestions(blueprint),
      snapshotAt: new Date().toISOString(),
    };

    const [exam] = await this.db
      .insert(schema.mockExams)
      .values({
        ...owner,
        title: parsed.title ?? blueprint.title,
        subjectLabel: blueprint.subjectLabel,
        topics: topicLabels,
        context: {
          level: 'current',
          board: blueprint.paperPatternId ? 'preset' : 'general',
          mix: blueprint.template,
          difficulty: parsed.difficulty,
          durationMin: blueprint.durationMin,
          hintsOff: true,
        },
        blueprintId: bpRow?.id ?? null,
        sourceKind: blueprint.sourceKind,
        status: 'generating',
        scope: parsed.scope as unknown as Record<string, unknown>,
        difficulty: parsed.difficulty,
        scheduledFor: parsed.scheduledFor ? new Date(parsed.scheduledFor) : null,
        strictMode: parsed.strictMode,
        blueprintSnapshot: snapshot as unknown as Record<string, unknown>,
        blueprintVersion: bpRow?.version ?? 1,
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
    let skinFromBp: string | undefined;
    if (exam.blueprintId) {
      const [bp] = await this.db
        .select()
        .from(schema.examBlueprints)
        .where(eq(schema.examBlueprints.id, exam.blueprintId))
        .limit(1);
      if (bp) {
        const p = examBlueprintSchema.safeParse(bp.blueprint);
        if (p.success) blueprint = p.data;
        skinFromBp = bp.skin ?? (p.success ? p.data.skin : undefined);
      }
    }

    const snapParsed = exam.blueprintSnapshot
      ? examBlueprintSchema.safeParse(exam.blueprintSnapshot)
      : null;
    const skin =
      (snapParsed?.success ? snapParsed.data.skin : undefined) ??
      skinFromBp ??
      blueprint?.skin ??
      'standard';

    return {
      id: exam.id,
      title: exam.title,
      subjectLabel: exam.subjectLabel,
      topics: exam.topics as string[],
      context: exam.context as MockExamDto['context'],
      status: exam.status as MockExamDto['status'],
      blueprintId: exam.blueprintId,
      blueprint,
      blueprintSnapshot: snapParsed?.success ? snapParsed.data : undefined,
      blueprintVersion: exam.blueprintVersion ?? undefined,
      skin: skin as MockExamDto['skin'],
      strictMode: exam.strictMode,
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
    if (!['ready', 'scheduled', 'in_progress'].includes(exam.status)) {
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
      return {
        attemptId: existing[0].id,
        endsAt: existing[0].endsAt.toISOString(),
        sectionDeadlines: existing[0].sectionDeadlines,
        currentSectionId: existing[0].currentSectionId,
      };
    }

    // One-time recovery for legacy paused rows — resume without extending beyond original endsAt wall clock.
    const paused = await this.db
      .select()
      .from(schema.mockExamAttempts)
      .where(
        and(eq(schema.mockExamAttempts.mockExamId, exam.id), eq(schema.mockExamAttempts.status, 'paused')),
      )
      .limit(1);
    if (paused[0]) {
      await this.db
        .update(schema.mockExamAttempts)
        .set({ status: 'in_progress', pausedAt: null })
        .where(eq(schema.mockExamAttempts.id, paused[0].id));
      await this.db
        .update(schema.mockExams)
        .set({ status: 'in_progress', updatedAt: new Date() })
        .where(eq(schema.mockExams.id, exam.id));
      return {
        attemptId: paused[0].id,
        endsAt: paused[0].endsAt.toISOString(),
        sectionDeadlines: paused[0].sectionDeadlines,
        currentSectionId: paused[0].currentSectionId,
      };
    }

    const snap = exam.blueprintSnapshot
      ? examBlueprintSchema.safeParse(exam.blueprintSnapshot)
      : null;
    const durationMin =
      snap?.success
        ? snap.data.durationMin
        : (exam.context as { durationMin: number }).durationMin;
    const startedAt = new Date();
    const endsAt = new Date(startedAt.getTime() + durationMin * 60_000);

    let sectionDeadlines: Record<string, string> | null = null;
    let currentSectionId: string | null = null;
    if (snap?.success) {
      const secs = snap.data.sections;
      if (secs.every((s) => s.sectionTimeSec != null)) {
        sectionDeadlines = {};
        let cursor = startedAt.getTime();
        for (const s of secs) {
          cursor += (s.sectionTimeSec ?? 0) * 1000;
          sectionDeadlines[s.id] = new Date(cursor).toISOString();
        }
        currentSectionId = secs[0]?.id ?? null;
      }
    }

    const maxNo = await this.db
      .select({ attemptNo: schema.mockExamAttempts.attemptNo })
      .from(schema.mockExamAttempts)
      .where(eq(schema.mockExamAttempts.mockExamId, exam.id))
      .orderBy(desc(schema.mockExamAttempts.attemptNo))
      .limit(1);
    const attemptNo = (maxNo[0]?.attemptNo ?? 0) + 1;
    const [attempt] = await this.db
      .insert(schema.mockExamAttempts)
      .values({
        mockExamId: exam.id,
        attemptNo,
        startedAt,
        endsAt,
        status: 'in_progress',
        strictModeSnapshot: exam.strictMode,
        sectionDeadlines,
        currentSectionId,
        tabSwitches: 0,
      })
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
    return {
      attemptId: attempt!.id,
      endsAt: endsAt.toISOString(),
      sectionDeadlines,
      currentSectionId,
    };
  }

  /** Pause removed from new flows — timer never pauses (PLAN §2.2). */
  async pause(_principal: StudentPrincipal, _id: string) {
    throw new ForbiddenException({
      code: 'PAUSE_DISABLED',
      message: 'The timer never pauses. Leave and resume later — the clock keeps running.',
    });
  }

  async recordTabSwitch(principal: StudentPrincipal, id: string, body: unknown) {
    const clientEventId =
      typeof body === 'object' && body && 'clientEventId' in body
        ? String((body as { clientEventId: string }).clientEventId)
        : null;
    const exam = await this.requireExam(principal, id);
    const [attempt] = await this.db
      .select()
      .from(schema.mockExamAttempts)
      .where(
        and(eq(schema.mockExamAttempts.mockExamId, exam.id), eq(schema.mockExamAttempts.status, 'in_progress')),
      )
      .limit(1);
    if (!attempt) throw new ForbiddenException({ code: 'NO_ACTIVE_ATTEMPT', message: 'No active attempt.' });
    if (!attempt.strictModeSnapshot) return { ok: true, tabSwitches: attempt.tabSwitches };
    // Dedup via results meta bag when clientEventId present
    const meta = (attempt.results as { _tabEvents?: string[] } | null) ?? {};
    const seen = new Set(meta._tabEvents ?? []);
    if (clientEventId && seen.has(clientEventId)) {
      return { ok: true, tabSwitches: attempt.tabSwitches };
    }
    if (clientEventId) seen.add(clientEventId);
    const next = attempt.tabSwitches + 1;
    await this.db
      .update(schema.mockExamAttempts)
      .set({
        tabSwitches: next,
        results: { ...(attempt.results as object), _tabEvents: [...seen].slice(-50) },
      })
      .where(eq(schema.mockExamAttempts.id, attempt.id));
    return { ok: true, tabSwitches: next };
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
    const grace = new Date(attempt.endsAt.getTime() + MOCK_ANSWER_GRACE_MS);
    if (new Date() > grace) {
      throw new ConflictException({ code: 'EXAM_OVER', message: 'Exam time including grace has ended.' });
    }

    // Reject writes to expired sections
    if (attempt.sectionDeadlines && attempt.currentSectionId) {
      const [q] = await this.db
        .select()
        .from(schema.mockExamQuestions)
        .where(eq(schema.mockExamQuestions.id, questionId))
        .limit(1);
      if (q?.sectionId) {
        const deadline = (attempt.sectionDeadlines as Record<string, string>)[q.sectionId];
        if (deadline && new Date() > new Date(deadline)) {
          throw new ForbiddenException({
            code: 'SECTION_LOCKED',
            message: 'Section time is over — you cannot change answers in this section.',
          });
        }
      }
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
    const state =
      parsed.state ??
      (parsed.flagged
        ? existing?.choiceKey || existing?.answerText
          ? 'marked_answered'
          : 'marked'
        : 'answered');
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
        state,
        timeSpentMs: parsed.timeSpentMs ?? 0,
        answerMode: parsed.answerMode ?? 'type',
        photoRefs: parsed.photoRefs ?? null,
        photoObjectId: parsed.photoObjectId ?? null,
      })
      .onConflictDoUpdate({
        target: [schema.mockExamAnswers.attemptId, schema.mockExamAnswers.questionId],
        set: {
          choiceKey: parsed.choiceKey ?? (parsed.choiceKeys ? parsed.choiceKeys.join(',') : null),
          answerText: parsed.text ?? (parsed.value != null ? String(parsed.value) : null),
          flagged: parsed.flagged ?? false,
          answerPayload,
          clientUpdatedAt,
          state,
          timeSpentMs: parsed.timeSpentMs ?? existing?.timeSpentMs ?? 0,
          answerMode: parsed.answerMode ?? existing?.answerMode ?? 'type',
          photoRefs: parsed.photoRefs ?? existing?.photoRefs ?? null,
          photoObjectId: parsed.photoObjectId ?? existing?.photoObjectId ?? null,
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
      await this.db
        .update(schema.mockExamAttempts)
        .set({
          status: 'submitted',
          submittedAt: new Date(),
          finishedAt: new Date(),
        })
        .where(eq(schema.mockExamAttempts.id, attempt.id));
      await this.grading.gradeSubjective(exam.id, attempt.id, this.principalRef(principal));
      return this.get(principal, id, { includeKeys: true });
    }

    // Subjective: objective scored; student must self-grade before AI comparator.
    await this.db
      .update(schema.mockExamAttempts)
      .set({
        status: 'awaiting_self_grade',
        submittedAt: new Date(),
        finishedAt: new Date(),
        results: {
          awardedMarks,
          maxMarks,
          objectiveAwarded: awardedMarks,
          objectiveMax: maxMarks,
          awaitingSelfGradeCount: evaluations.filter((e) => !e.objective).length,
          bySection: [],
          byTopic: [],
          patterns: [],
          evaluations,
          suggestion: 'Grade your written answers — your grade counts.',
        },
      })
      .where(eq(schema.mockExamAttempts.id, attempt.id));
    await this.db
      .update(schema.mockExams)
      .set({
        gradingStatus: 'awaiting_self_grade',
        status: 'awaiting_self_grade',
        updatedAt: new Date(),
      })
      .where(eq(schema.mockExams.id, exam.id));

    return this.get(principal, id, { includeKeys: true });
  }

  /** Owner-only past-mistakes projection (no shadow table). */
  async listPastMistakes(principal: StudentPrincipal, windowDays: number) {
    const since =
      windowDays === 0 ? null : new Date(Date.now() - windowDays * 24 * 3600_000);
    const exams = await this.db
      .select({ id: schema.mockExams.id })
      .from(schema.mockExams)
      .where(ownerWhere(principal, schema.mockExams.studentId, schema.mockExams.independentUserId));
    const examIds = exams.map((e) => e.id);
    if (!examIds.length) return { items: [], count: 0 };

    const attempts = await this.db
      .select()
      .from(schema.mockExamAttempts)
      .where(inArray(schema.mockExamAttempts.mockExamId, examIds))
      .orderBy(desc(schema.mockExamAttempts.finishedAt))
      .limit(80);

    const ownedAttempts = attempts.filter(
      (a) =>
        ['scored', 'graded', 'completed', 'awaiting_self_grade'].includes(a.status) &&
        (!since || (a.finishedAt && a.finishedAt >= since)),
    );
    const items: Array<Record<string, unknown>> = [];
    for (const att of ownedAttempts.slice(0, 40)) {
      const answers = await this.db
        .select()
        .from(schema.mockExamAnswers)
        .where(eq(schema.mockExamAnswers.attemptId, att.id));
      for (const a of answers) {
        const ev = a.evaluation as {
          verdict?: string;
          awardedMarks?: number;
          maxMarks?: number;
          final_source?: string;
        } | null;
        if (!ev || (ev.verdict !== 'missed' && ev.verdict !== 'slipped')) continue;
        const [q] = await this.db
          .select()
          .from(schema.mockExamQuestions)
          .where(eq(schema.mockExamQuestions.id, a.questionId))
          .limit(1);
        if (!q) continue;
        items.push({
          id: `${att.id}:${a.questionId}`,
          mockExamId: att.mockExamId,
          attemptId: att.id,
          questionId: a.questionId,
          topicLabel: q.topic,
          qtype: q.qtype,
          prompt: q.prompt,
          verdict: ev.verdict,
          awardedMarks: ev.awardedMarks ?? 0,
          maxMarks: ev.maxMarks ?? q.marks,
          answeredAt: a.updatedAt?.toISOString?.() ?? att.finishedAt?.toISOString(),
        });
      }
    }
    return { items, count: items.length };
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
      skin: row.skin,
      gradingStyle: row.gradingStyle,
      examProfileKey: row.examProfileKey,
      isPublished: row.isPublished,
      archivedAt: row.archivedAt?.toISOString() ?? null,
      origin: deriveBlueprintOrigin({
        institutionId: row.institutionId,
        studentId: row.studentId,
        independentUserId: row.independentUserId,
      }),
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

  /** Own blueprints or published institution blueprints. */
  private async requireBlueprintReadable(principal: StudentPrincipal, id: string) {
    try {
      return await this.requireBlueprint(principal, id);
    } catch {
      if (principal.kind !== 'institutional') throw new NotFoundException({ code: 'NOT_FOUND', message: 'Blueprint not found' });
      const [row] = await this.db
        .select()
        .from(schema.examBlueprints)
        .where(
          and(
            eq(schema.examBlueprints.id, id),
            eq(schema.examBlueprints.institutionId, principal.institutionId),
            isNull(schema.examBlueprints.studentId),
            eq(schema.examBlueprints.isPublished, true),
            isNull(schema.examBlueprints.archivedAt),
          ),
        )
        .limit(1);
      if (!row) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Blueprint not found' });
      return row;
    }
  }
}
