import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import type { AuditWriter } from '@edrion/audit';
import type { ApiEnv } from '@edrion/config';
import {
  PETROS_SESSION_INTENT_SCHEMA_VERSION,
  petrosAssistantAnswerSchema,
  petrosSessionIntentSchema,
  type PetrosAssistantQuestionInput,
  type PetrosDoorsDashboardQuery,
  type PetrosIntentMetricInput,
  type PetrosSessionIntent,
  type ResolvePetrosSessionIntentInput,
  type StartPetrosSessionIntentInput,
} from '@edrion/schemas';
import { API_ENV, AUDIT_WRITER } from '../../../common/tokens';
import { baseAudit, type ActionContext } from '../../../common/action-context';
import { PetrosAiGatewayService } from '../../petros-ai-routing/petros-ai-gateway.service';
import type { InstitutionalStudentPrincipal } from '../student.types';
import { documentStudyQuestions } from '../petros-document-grounding';
import { PetrosLoopService } from '../petros-loop/petros-loop.service';
import type { PetrosOwnerScope } from '../petros-loop/petros-loop.repository';
import { PetrosSessionIntentRepository } from './petros-session-intent.repository';

type IntentRow = Awaited<ReturnType<PetrosSessionIntentRepository['findIntent']>> extends infer T
  ? NonNullable<T>
  : never;

@Injectable()
export class PetrosSessionIntentService {
  constructor(
    private readonly repo: PetrosSessionIntentRepository,
    private readonly loop: PetrosLoopService,
    private readonly gateway: PetrosAiGatewayService,
    @Inject(API_ENV) private readonly env: ApiEnv,
    @Inject(AUDIT_WRITER) private readonly audit: AuditWriter,
  ) {}

  async resolve(
    principal: InstitutionalStudentPrincipal,
    input: ResolvePetrosSessionIntentInput,
  ): Promise<PetrosSessionIntent> {
    const scope = owner(principal);
    const existing = await this.repo.findIntentByKey(scope, input.idempotencyKey);
    if (existing) return this.dto(existing);
    const started = Date.now();
    try {
      const base = await this.resolveSource(principal, input);
      const id = randomUUID();
      const correlationId = randomUUID();
      const now = new Date();
      const expiresAt = new Date(Math.min(now.getTime() + 30 * 60_000, base.sourceExpiryMs));
      const preferences = await this.repo.preferences(scope);
      const accessibility = [
        ...(preferences?.reducedMotion ? ['reduced_motion'] : []),
        ...(preferences?.textSize && preferences.textSize !== 'M'
          ? [`text_size_${preferences.textSize.toLowerCase()}`]
          : []),
        ...input.accessibility,
      ].filter((value, index, values) => values.indexOf(value) === index);
      const intent = petrosSessionIntentSchema.parse({
        schemaVersion: PETROS_SESSION_INTENT_SCHEMA_VERSION,
        id,
        door: input.door,
        institutionId: principal.institutionId,
        campusId: principal.campusId,
        studentId: principal.studentId,
        permissionContext: principal.permissions
          .filter((permission) => permission.startsWith('student.'))
          .slice(0, 20),
        sessionType: base.sessionType,
        goal: base.goal,
        targetConcepts: base.targetConcepts,
        scope: base.scope,
        time: {
          budgetSeconds: input.timeBudgetSeconds,
          deadline: base.deadline,
          examDate: base.examDate,
        },
        emotionalRegister: base.emotionalRegister,
        registerFactors: base.registerFactors,
        sourceEntityIds: base.sourceEntityIds,
        citations: base.citations,
        language: input.language || preferences?.language || 'en',
        accessibility,
        returnDestination: {
          href: base.returnHref,
          label: base.returnLabel,
          resumeToken: randomUUID(),
        },
        policyDisclosures: base.policyDisclosures,
        homeworkContext: base.homeworkContext ?? null,
        sourceFingerprint: base.sourceFingerprint,
        idempotencyKey: input.idempotencyKey,
        correlationId,
        status: 'resolved',
        expiresAt: expiresAt.toISOString(),
        createdAt: now.toISOString(),
      });
      const row = await this.repo.createIntent({
        id,
        schemaVersion: PETROS_SESSION_INTENT_SCHEMA_VERSION,
        institutionId: principal.institutionId,
        campusId: principal.campusId,
        studentId: principal.studentId,
        door: intent.door,
        sessionType: intent.sessionType,
        sourceEntityIds: intent.sourceEntityIds,
        sourceFingerprint: intent.sourceFingerprint,
        idempotencyKey: input.idempotencyKey,
        correlationId,
        resolvedIntent: intent as unknown as Record<string, unknown>,
        status: 'resolved',
        expiresAt,
      });
      const persisted = row ?? (await this.repo.findIntentByKey(scope, input.idempotencyKey));
      if (!persisted) throw new Error('Resolved Petros intent was not persisted.');
      await this.repo.recordEvent({
        institutionId: scope.institutionId,
        studentId: scope.studentId,
        intentId: persisted.id,
        door: intent.door,
        sessionType: intent.sessionType,
        type: 'impression',
        idempotencyKey: input.idempotencyKey,
        correlationId,
        durationMs: Date.now() - started,
        payload: { schemaVersion: intent.schemaVersion },
      });
      return this.dto(persisted);
    } catch (error) {
      await this.repo.recordFailureEvent({
        institutionId: scope.institutionId,
        studentId: scope.studentId,
        door: input.door,
        sessionType: defaultSessionType(input.door),
        type: 'failure',
        idempotencyKey: input.idempotencyKey,
        correlationId: randomUUID(),
        durationMs: Date.now() - started,
        reasonCode: intentErrorCode(error),
        payload: {},
      });
      throw error;
    }
  }

  async read(principal: InstitutionalStudentPrincipal, intentId: string) {
    const row = await this.repo.findIntent(owner(principal), intentId);
    if (!row) throw intentNotFound();
    return this.dto(row);
  }

  async start(
    principal: InstitutionalStudentPrincipal,
    intentId: string,
    input: StartPetrosSessionIntentInput,
  ) {
    const scope = owner(principal);
    const row = await this.repo.findIntent(scope, intentId);
    if (!row) throw intentNotFound();
    if (row.sessionId) {
      return { intent: this.dto(row), session: await this.loop.document(principal, row.sessionId) };
    }
    const intent = this.dto(row);
    if (row.status !== 'resolved') throw staleIntent('This contextual preview is no longer active.');
    if (row.expiresAt.getTime() <= Date.now()) {
      await this.repo.invalidate(scope, row.id, 'expired');
      await this.recordStartFailure(scope, intent, input.idempotencyKey, 'PETROS_INTENT_STALE');
      throw staleIntent('This contextual preview expired. Open it again to use current source data.');
    }
    let currentFingerprint: string;
    try {
      currentFingerprint = await this.currentFingerprint(scope, intent);
    } catch (error) {
      await this.recordStartFailure(scope, intent, input.idempotencyKey, intentErrorCode(error));
      throw error;
    }
    if (currentFingerprint !== intent.sourceFingerprint) {
      await this.repo.invalidate(scope, row.id, 'invalidated');
      await this.recordStartFailure(scope, intent, input.idempotencyKey, 'PETROS_INTENT_STALE');
      throw staleIntent('The source changed after this preview. Review the updated context before starting.');
    }
    const referenceId = intent.sourceEntityIds[0]!;
    const pageCitation = intent.citations.find((citation) => citation.page != null);
    const handoffRouting = await this.handoffRouting(scope, intent);
    const session = await this.loop.create(principal, {
      clientRequestId: intent.id,
      sessionType: intent.sessionType,
      topic: intent.targetConcepts.join(', ').slice(0, 240),
      goal: intent.goal,
      timeBudgetSeconds: intent.time.budgetSeconds,
      maxMoves: intent.time.budgetSeconds <= 600 ? 3 : 5,
      learnerContext: {
        emotionalRegister: intent.emotionalRegister,
        registerFactors: intent.registerFactors,
        language: intent.language,
        accessibility: intent.accessibility,
        ...(intent.door === 'assistant_handoff'
          ? { handoffQuestion: intent.scope.knownFailureDetails[0] }
          : {}),
      },
      topicContext: {
        targetConcepts: intent.targetConcepts,
        curriculum: intent.scope.curriculum,
        scopeBoundaries: intent.scope.boundaries,
        knownFailureDetails: intent.scope.knownFailureDetails,
        learningPathPosition: intent.scope.learningPathPosition,
        door: intent.door,
      },
      sourceContext: {
        door: intent.door,
        intentId: intent.id,
        referenceId,
        label: intent.scope.summary,
        emotionalRegister: intent.emotionalRegister,
        registerFactors: intent.registerFactors,
        citations: intent.citations,
        policyDisclosures: intent.policyDisclosures,
        returnHref: intent.returnDestination.href,
        returnLabel: intent.returnDestination.label,
        resumeToken: intent.returnDestination.resumeToken,
        ...(intent.time.examDate ? { examDate: intent.time.examDate } : {}),
        ...(pageCitation?.page != null ? { pageIndex: pageCitation.page - 1 } : {}),
        ...(intent.scope.learningPathPosition
          ? { pathItemId: intent.scope.learningPathPosition.itemId }
          : {}),
        sourceFingerprint: intent.sourceFingerprint,
        ...(intent.homeworkContext ? { assignmentContext: intent.homeworkContext } : {}),
        ...handoffRouting,
      },
      profileContext: {
        topicKey: `door:${intent.door}:${referenceId}`.slice(0, 160),
        subjectLabel: intent.targetConcepts[0],
      },
    });
    const marked = await this.repo.markStarted(scope, intent.id, session.id);
    const refreshed = marked ?? (await this.repo.findIntent(scope, intent.id));
    if (intent.door === 'reflection_action') {
      await this.repo.markReflectionRecommendationStarted(scope, referenceId, intent.id);
    }
    await this.repo.recordEvent({
      institutionId: scope.institutionId,
      studentId: scope.studentId,
      intentId: intent.id,
      sessionId: session.id,
      door: intent.door,
      sessionType: intent.sessionType,
      type: 'start',
      idempotencyKey: input.idempotencyKey,
      correlationId: intent.correlationId,
      durationMs: Date.now() - row.createdAt.getTime(),
      payload: {},
    });
    if (intent.door === 'assistant_handoff') {
      await this.repo.recordEvent({
        institutionId: scope.institutionId,
        studentId: scope.studentId,
        intentId: intent.id,
        sessionId: session.id,
        door: intent.door,
        sessionType: intent.sessionType,
        type: 'assistant_accepted',
        idempotencyKey: derivedUuid(input.idempotencyKey, 'assistant_accepted'),
        correlationId: intent.correlationId,
        payload: {},
      });
    }
    return { intent: this.dto(refreshed ?? row), session };
  }

  private recordStartFailure(
    scope: PetrosOwnerScope,
    intent: PetrosSessionIntent,
    idempotencyKey: string,
    reasonCode: string,
  ) {
    return this.repo.recordFailureEvent({
      institutionId: scope.institutionId,
      studentId: scope.studentId,
      intentId: intent.id,
      door: intent.door,
      sessionType: intent.sessionType,
      type: 'failure',
      idempotencyKey,
      correlationId: intent.correlationId,
      reasonCode,
      payload: {},
    });
  }

  async metric(
    principal: InstitutionalStudentPrincipal,
    intentId: string,
    input: PetrosIntentMetricInput,
  ) {
    const scope = owner(principal);
    const row = await this.repo.findIntent(scope, intentId);
    if (!row) throw intentNotFound();
    if (input.sessionId && row.sessionId !== input.sessionId) throw intentNotFound();
    const event = await this.repo.recordEvent({
      institutionId: scope.institutionId,
      studentId: scope.studentId,
      intentId: row.id,
      sessionId: input.sessionId ?? row.sessionId,
      door: row.door,
      sessionType: row.sessionType,
      type: input.event,
      idempotencyKey: input.idempotencyKey,
      correlationId: row.correlationId,
      reasonCode: input.reasonCode,
      payload: {},
    });
    return { recorded: Boolean(event), duplicate: !event };
  }

  async assistant(
    principal: InstitutionalStudentPrincipal,
    input: PetrosAssistantQuestionInput,
  ) {
    const scope = owner(principal);
    const context = await this.quickContext(scope, input.route, input.sourceId);
    const sessionRecommended = requiresSession(input.question);
    const portalContext = await this.repo.assistantContext(scope);
    let response;
    if (this.env.PETROS_AI_MODE !== 'live') {
      response = demoAssistantAnswer({
        question: input.question,
        contextLabel: context.label,
        portalContext,
        sessionRecommended,
        sourceId: input.sourceId ?? safeReturnRoute(input.route),
      });
    } else try {
      const payload = {
        question: input.question,
        visibleRoute: safeReturnRoute(input.route),
        selectedCard: input.selectedCard ?? null,
        visibleContext: {
          label: context.label,
          topic: context.topic,
          publishedFact: context.quickAnswer,
        },
        studentContext: portalContext,
        sessionRecommended,
        sessionSourceId: input.sourceId ?? safeReturnRoute(input.route),
      };
      const result = await this.gateway.execute({
        context: {
          functionKey: 'assistant.context.answer',
          topic: context.topic,
          sessionType: 'doubt',
          inputModality: 'text',
          language: 'en',
          institutionId: scope.institutionId,
          studentId: scope.studentId,
          estimatedTokens: Math.max(300, Math.ceil(JSON.stringify(payload).length / 4)),
          currentCostMicros: 0,
          previousFailures: 0,
          requiredReasoningQuality: sessionRecommended ? 0.65 : 0.45,
        },
        system: `You are Petros, the student's private AI tutor inside their portal. Answer the student's actual question using only the authorized context supplied. The selectedCard field identifies the exact card Petros is visibly pointing at. When the student says "this", "that", "this card", or asks "what is this?", answer about selectedCard rather than describing the whole route. selectedCard text is a navigation cue, not an authoritative database record: corroborate factual claims with visibleContext and studentContext, and say plainly when a detail is not confirmed. Ground priorities in dates, statuses, teacher feedback, published results, attendance, course coverage, and learner evidence when relevant. Never invent a record or expose another student's data. If information is absent, say so plainly. For a small question return mode "quick_answer" and offer null. If an interactive teaching session would materially help, return mode "session_offer", still give a useful personalized first step in answer, and include a concise offer with approximateMinutes between 5 and 30. Respect assignment AI policy: coach, question, outline, and critique when full authorship is not allowed. Write answer and offer descriptions as clean plain text without Markdown markers. Do not mention providers, routing, hidden scores, or chain-of-thought. Return strict JSON only.`,
        input: [{ type: 'text', text: JSON.stringify(payload) }],
        responseSchema: assistantResponseJsonSchema,
        correlationId: input.idempotencyKey,
        metadata: { surface: 'student_context_assistant', routeGroup: routeGroup(input.route) },
        disableCache: true,
      });
      const generated = petrosAssistantAnswerSchema.parse(result.content);
      response = generated.offer
        ? {
            ...generated,
            contextLabel: context.label,
            offer: {
              ...generated.offer,
              approximateMinutes: Math.min(30, Math.max(5, generated.offer.approximateMinutes)),
              sourceId: input.sourceId ?? safeReturnRoute(input.route),
            },
          }
        : { ...generated, contextLabel: context.label };
    } catch {
      response = petrosAssistantAnswerSchema.parse(
        sessionRecommended
          ? {
              mode: 'session_offer',
              answer: `I could not generate the personalized preview just now. I can still open a focused ${context.label} session with the authorized context already here.`,
              contextLabel: context.label,
              offer: {
                description: `Work through “${input.question.slice(0, 160)}” using the current ${context.label.toLowerCase()} context.`,
                approximateMinutes: 15,
                sourceId: input.sourceId ?? safeReturnRoute(input.route),
              },
            }
          : {
              mode: 'quick_answer',
              answer: `${context.quickAnswer} Personalized AI is temporarily unavailable; please try again.`,
              contextLabel: context.label,
              offer: null,
            },
      );
    }
    response = petrosAssistantAnswerSchema.parse(response);
    if (response.mode === 'session_offer') {
      await this.repo.recordEvent({
        institutionId: scope.institutionId,
        studentId: scope.studentId,
        door: 'assistant_handoff',
        sessionType: 'doubt',
        type: 'assistant_offered',
        idempotencyKey: input.idempotencyKey,
        correlationId: randomUUID(),
        payload: { routeGroup: routeGroup(input.route) },
      });
    }
    return response;
  }

  async sources(principal: InstitutionalStudentPrincipal) {
    return { items: await this.repo.listUploadedDocuments(owner(principal)) };
  }

  path(principal: InstitutionalStudentPrincipal) {
    return this.repo.currentPath(owner(principal));
  }

  async dashboard(query: PetrosDoorsDashboardQuery, ctx: ActionContext) {
    const aggregate = await this.repo.dashboard({
      institutionId: query.institutionId,
      door: query.door,
      sessionType: query.sessionType,
      from: query.from ? new Date(query.from) : undefined,
      to: query.to ? new Date(query.to) : undefined,
    });
    await this.audit.logAudit({
      ...baseAudit(ctx),
      action: 'petros.doors.dashboard.view',
      module: 'petros',
      entityType: 'petros_door_aggregate',
      entityId: query.institutionId ?? 'platform',
      newState: { filters: query, buckets: aggregate.events.length },
    } as Parameters<AuditWriter['logAudit']>[0]);
    const doors = [...new Set(aggregate.events.map((event) => event.door))];
    return {
      privacy: 'aggregate_only',
      contentExposed: false,
      byDoor: doors.map((door) => ({
        door,
        sessionTypes: [...new Set(aggregate.events.filter((row) => row.door === door).map((row) => row.sessionType))],
        metrics: Object.fromEntries(
          aggregate.events
            .filter((row) => row.door === door)
            .map((row) => [`${row.sessionType}:${row.type}`, row.count]),
        ),
      })),
      failures: aggregate.failures.filter((row) => row.reasonCode),
      firstContentLatency: {
        averageMs: Math.round(Number(aggregate.latency?.averageMs ?? 0)),
        maximumMs: Number(aggregate.latency?.maximumMs ?? 0),
      },
      usage: {
        attempts: Number(aggregate.cost?.attempts ?? 0),
        estimatedCostMicros: Number(aggregate.cost?.totalMicros ?? 0),
      },
      intentFactors: aggregate.factors,
      initialMoves: aggregate.initialMoves,
      grounding: {
        documentFailures: aggregate.failures
          .filter((row) => row.reasonCode?.includes('DOCUMENT'))
          .reduce((sum, row) => sum + row.count, 0),
        staleOrMissingSources: aggregate.failures
          .filter((row) => row.reasonCode?.includes('STALE') || row.reasonCode?.includes('NOT_FOUND'))
          .reduce((sum, row) => sum + row.count, 0),
      },
      policy: {
        optimization: 'learning_outcomes_only',
        conversionRankings: false,
        manipulativeReengagement: false,
      },
    };
  }

  private async resolveSource(
    principal: InstitutionalStudentPrincipal,
    input: ResolvePetrosSessionIntentInput,
  ) {
    const scope = owner(principal);
    if (input.door === 'result_repair') {
      const result = await this.repo.resultSource(scope, input.sourceId);
      if (!result) throw intentNotFound();
      const percentage = result.maxMarks
        ? Math.round((result.marksObtained / result.maxMarks) * 1000) / 10
        : null;
      const lost = Math.max(0, result.maxMarks - result.marksObtained);
      const topic = result.subjectName ?? result.assessmentName;
      const evidence = result.remarks?.trim()
        ? [`Teacher feedback: ${result.remarks.trim().slice(0, 500)}`]
        : [
            `${lost} of ${result.maxMarks} marks were not earned.`,
            'Question-level evidence is not published, so Petros will check the likely gap before naming it.',
          ];
      return {
        sessionType: 'repair' as const,
        goal: `Find the specific ${topic} gap behind this result, repair it, and check one exam-shaped answer.`,
        targetConcepts: [topic],
        scope: {
          summary: `${result.examName ?? result.assessmentName}: ${result.marksObtained}/${result.maxMarks}${percentage == null ? '' : ` (${percentage}%)`}`,
          boundaries: [
            'Use only this published result and learner evidence the student may access.',
            'Do not change marks or overwrite teacher feedback.',
          ],
          curriculum: [topic],
          knownFailureDetails: evidence,
          learningPathPosition: null,
        },
        deadline: null,
        examDate: null,
        emotionalRegister: 'flat_practical' as const,
        registerFactors: [
          'The student opened Petros after a lower published mark.',
          'Start with what went wrong, a practical first step, and no cheerful hook.',
          `Estimated repair time: ${Math.ceil(input.timeBudgetSeconds / 60)} minutes.`,
        ],
        sourceEntityIds: [result.id],
        citations: [
          {
            sourceType: 'result' as const,
            sourceId: result.id,
            version: String(result.version),
            label: result.examName ?? result.assessmentName,
            page: null,
            section: topic,
            excerpt: result.remarks?.trim().slice(0, 1_200) ?? null,
          },
        ],
        returnHref: '/results',
        returnLabel: 'Results',
        policyDisclosures: [
          'Petros can teach from published evidence but cannot change marks or teacher feedback.',
          'When question-level evidence is missing, Petros checks the gap instead of inventing a diagnosis.',
        ],
        sourceFingerprint: fingerprint({
          id: result.id,
          version: result.version,
          updatedAt: result.updatedAt.toISOString(),
          marksObtained: result.marksObtained,
          maxMarks: result.maxMarks,
          remarks: result.remarks,
        }),
        sourceExpiryMs: Date.now() + 30 * 60_000,
      };
    }
    if (input.door === 'upcoming_exam') {
      const exam = await this.repo.examSource(scope, input.sourceId);
      if (!exam) throw intentNotFound();
      if (exam.examStatus === 'cancelled')
        throw staleIntent('This exam was cancelled. No revision session was started.');
      if (!exam.examDate) throw staleIntent('This exam does not have a published date yet.');
      const examAt = parseExamDate(exam.examDate, exam.startTime);
      if (examAt.getTime() <= Date.now())
        throw staleIntent('This exam is no longer upcoming. Refresh the exam schedule.');
      const topic = exam.subjectName ?? exam.examName;
      return {
        sessionType: 'revise' as const,
        goal: `Recall, contrast, and synthesise the published ${topic} coverage in exam-shaped answers.`,
        targetConcepts: [topic],
        scope: {
          summary: `${exam.examName} · ${topic} · ${examAt.toLocaleString('en-IN')}`,
          boundaries: [
            'Stay within the current published syllabus coverage.',
            'Prefer recall, contrast cases, synthesis, and answer shape over fresh exposition.',
          ],
          curriculum: exam.syllabusNote ? [exam.syllabusNote] : [topic],
          knownFailureDetails: [
            'Mastery and error evidence are resolved from the learner model when PLAN runs.',
            'Mixed-topic recall may feel harder because it strengthens retrieval for the exam.',
          ],
          learningPathPosition: null,
        },
        deadline: examAt.toISOString(),
        examDate: examAt.toISOString(),
        emotionalRegister: 'calm_focused' as const,
        registerFactors: [
          'The exam is upcoming and published.',
          'Use the available time without fake urgency or notification pressure.',
        ],
        sourceEntityIds: [exam.id, exam.examId],
        citations: [
          {
            sourceType: 'exam' as const,
            sourceId: exam.id,
            version: `${exam.scheduleVersion}:${exam.examVersion}`,
            label: `${exam.examName} — ${topic}`,
            page: null,
            section: 'Published syllabus coverage',
            excerpt: exam.syllabusNote?.slice(0, 1_200) ?? null,
          },
        ],
        returnHref: '/exams',
        returnLabel: 'Examinations',
        policyDisclosures: [
          'Revision follows the currently published date and syllabus; schedule changes invalidate this preview.',
          'Petros may mix topics deliberately and will explain why that feels harder.',
        ],
        sourceFingerprint: fingerprint({
          id: exam.id,
          status: exam.examStatus,
          date: exam.examDate,
          time: exam.startTime,
          syllabus: exam.syllabusNote,
          scheduleVersion: exam.scheduleVersion,
          examVersion: exam.examVersion,
        }),
        sourceExpiryMs: Math.min(examAt.getTime(), Date.now() + 30 * 60_000),
      };
    }
    if (input.door === 'active_homework') {
      const source = await this.repo.assignmentSource(scope, input.sourceId);
      if (!source) throw intentNotFound();
      const assignment = source.assignment;
      if (!assignment.dueDate) throw staleIntent('This assignment does not have an active deadline window.');
      const opensAt = assignment.createdAt.toISOString();
      const dueAt = `${assignment.dueDate}T23:59:59.999Z`;
      const status = normalizeHomeworkStatus(source.submission?.status, assignment.dueDate);
      const teacherOverride = assignment.aiPolicy === 'full'
        ? 'allow_solution' as const
        : assignment.aiPolicy === 'off'
          ? 'force_guidance' as const
          : 'inherit' as const;
      return {
        sessionType: 'repair' as const,
        goal: `Work through ${assignment.title} using questions, hints, setup and feedback while the active assignment rule applies.`,
        targetConcepts: [source.subjectName ?? assignment.title],
        scope: {
          summary: `${assignment.title} · due ${assignment.dueDate}`,
          boundaries: [
            'Use the authoritative assignment status and deadline shown here.',
            'Change the teaching shape during an active related window instead of issuing an empty refusal.',
          ],
          curriculum: [source.subjectName ?? assignment.title],
          knownFailureDetails: assignment.instructions?.trim() ? [assignment.instructions.trim().slice(0, 600)] : [],
          learningPathPosition: null,
        },
        deadline: dueAt,
        examDate: null,
        emotionalRegister: 'flat_practical' as const,
        registerFactors: [
          'The student deliberately opened Petros from an assigned piece of work.',
          'The assignment relationship is authoritative, not inferred from surveillance or private content.',
        ],
        sourceEntityIds: [assignment.id],
        citations: [{
          sourceType: 'assignment' as const,
          sourceId: assignment.id,
          version: String(assignment.version),
          label: assignment.title,
          page: null,
          section: source.subjectName,
          excerpt: assignment.instructions?.trim().slice(0, 1_200) ?? null,
        }],
        returnHref: `/assignments/${assignment.id}`,
        returnLabel: 'Assignment',
        policyDisclosures: [
          'While this related assignment is active, Petros uses questions, hints, setup and feedback instead of supplying a final answer.',
          'This rule is based on the published assignment, its deadline and your submission status; an unrelated question is not restricted.',
        ],
        homeworkContext: {
          assignmentId: assignment.id,
          classId: assignment.classId,
          subjectId: assignment.subjectId,
          status,
          opensAt,
          dueAt,
          deadlineDate: assignment.dueDate,
          extendedUntil: null,
          teacherOverride,
          relationBasisPoints: 10_000,
        },
        sourceFingerprint: fingerprint({
          id: assignment.id,
          version: assignment.version,
          updatedAt: assignment.updatedAt,
          status: assignment.status,
          dueDate: assignment.dueDate,
          aiPolicy: assignment.aiPolicy,
          submissionStatus: source.submission?.status ?? 'assigned',
          submissionVersion: source.submission?.version ?? 0,
        }),
        sourceExpiryMs: Math.min(new Date(dueAt).getTime(), Date.now() + 30 * 60_000),
      };
    }
    if (input.door === 'uploaded_document') {
      const document = await this.repo.documentSource(scope, input.sourceId, input.page);
      if (!document) throw intentNotFound();
      if (
        document.item.status !== 'ready' ||
        !document.item.extractedTextReady ||
        !document.item.indexReady
      ) {
        throw new ConflictException({
          code: 'PETROS_DOCUMENT_EXTRACTION_PENDING',
          message:
            document.item.status === 'error'
              ? 'This document could not be extracted. Review the file and retry ingestion.'
              : `This document is still being read (${document.item.pagesDone}/${document.item.pageCount ?? '?'} pages). Try again when extraction is complete.`,
        });
      }
      if (!document.pages.length) throw intentNotFound();
      const selectedPages = document.pages.slice(0, 8);
      const studyQuestions = documentStudyQuestions(selectedPages.map((page) => page.text));
      return {
        sessionType: 'learn' as const,
        goal: `Understand the selected part of ${document.item.title} and explain it using the document's own evidence.`,
        targetConcepts: [document.item.title],
        scope: {
          summary: `${document.item.title}${input.page ? ` · page ${input.page}` : ' · selected pages'}`,
          boundaries: [
            'Ground every document claim in extracted pages the student can access.',
            'Cite exact page numbers and do not reconstruct missing or unextracted content.',
          ],
          curriculum: studyQuestions,
          knownFailureDetails: [],
          learningPathPosition: null,
        },
        deadline: null,
        examDate: null,
        emotionalRegister: 'curious_grounded' as const,
        registerFactors: [
          'The student explicitly asked to be taught from their own uploaded pages.',
          'Keep source grounding visible and separate explanation from quotation.',
        ],
        sourceEntityIds: [document.item.id, ...selectedPages.map((page) => page.id)],
        citations: selectedPages.map((page) => ({
          sourceType: 'document' as const,
          sourceId: document.item.id,
          version: `${document.item.version}:${page.updatedAt.toISOString()}`,
          label: `${document.item.title} (p. ${page.pageIndex + 1})`,
          page: page.pageIndex + 1,
          section: input.section ?? null,
          excerpt: page.text.trim().slice(0, 1_200) || null,
        })),
        returnHref: '/materials',
        returnLabel: 'Study materials',
        policyDisclosures: [
          'Petros uses only extracted pages available to this student and cites their page numbers.',
          'Document teaching is for explanation and limited quotation; the original file remains the source.',
        ],
        sourceFingerprint: fingerprint({
          id: document.item.id,
          version: document.item.version,
          status: document.item.status,
          extraction: document.item.extractedTextReady,
          index: document.item.indexReady,
          pages: selectedPages.map((page) => ({ id: page.id, updatedAt: page.updatedAt })),
        }),
        sourceExpiryMs: Date.now() + 30 * 60_000,
      };
    }
    if (input.door === 'learning_path') {
      const path = await this.repo.pathSource(scope, input.sourceId);
      if (!path) throw intentNotFound();
      if (path.item.status === 'completed' || path.item.status === 'removed')
        throw staleIntent('This path topic is no longer the next active step.');
      const unmet = path.previous.filter((item) => item.status !== 'completed');
      if (unmet.length)
        throw staleIntent('Complete or update the earlier path step before opening this topic.');
      return {
        sessionType: 'learn' as const,
        goal: `Build usable understanding of ${path.topic.title} and demonstrate enough evidence to update the path.`,
        targetConcepts: [path.topic.title],
        scope: {
          summary: `${path.path.title} · step ${path.item.sequence}: ${path.topic.title}`,
          boundaries: [
            'Adapt the teaching moves to learner evidence instead of playing a fixed lesson.',
            'Opening the session does not complete this path step.',
          ],
          curriculum: [path.path.subjectLabel],
          knownFailureDetails: [],
          learningPathPosition: {
            pathId: path.path.id,
            itemId: path.item.id,
            sequence: path.item.sequence,
            prerequisites: path.previous.map((item) => item.title).slice(-12),
          },
        },
        deadline: null,
        examDate: null,
        emotionalRegister: 'progressive_supportive' as const,
        registerFactors: [
          'The student is continuing an owned learning path.',
          'Progress depends on demonstrated evidence, not session opening or time spent.',
        ],
        sourceEntityIds: [path.item.id, path.path.id, path.topic.id],
        citations: [
          {
            sourceType: 'learning_path' as const,
            sourceId: path.item.id,
            version: `${path.path.version}:${path.item.version}`,
            label: `${path.path.title} · ${path.topic.title}`,
            page: null,
            section: `Step ${path.item.sequence}`,
            excerpt: path.item.whyHere?.slice(0, 1_200) ?? null,
          },
        ],
        returnHref: '/learning-path',
        returnLabel: 'Learning path',
        policyDisclosures: [
          'A path topic completes only after demonstrated learning evidence, never because a session opened.',
          'Closing returns to the path with its current evidence-based status.',
        ],
        sourceFingerprint: fingerprint({
          pathId: path.path.id,
          pathVersion: path.path.version,
          itemId: path.item.id,
          itemVersion: path.item.version,
          itemStatus: path.item.status,
          previous: path.previous,
        }),
        sourceExpiryMs: Date.now() + 30 * 60_000,
      };
    }
    if (input.door === 'reflection_action') {
      const source = await this.repo.reflectionSource(scope, input.sourceId);
      if (!source) throw intentNotFound();
      const recommendation = source.recommendation;
      const reasonLabels = recommendation.reasons.map((reason) => reason.label).slice(0, 6);
      return {
        sessionType: recommendation.sessionType as 'learn' | 'revise' | 'repair',
        goal: `${recommendation.actionLabel} using the specific evidence behind this reflection recommendation.`,
        targetConcepts: [recommendation.title],
        scope: {
          summary: recommendation.whyThis,
          boundaries: [
            'Use the existing evidence-linked recommendation; check the prerequisite before assuming it is a fact.',
            'Completing the session must produce new evidence before the map changes.',
          ],
          curriculum: [recommendation.title],
          knownFailureDetails: reasonLabels,
          learningPathPosition: null,
        },
        deadline: null,
        examDate: null,
        emotionalRegister: 'flat_practical' as const,
        registerFactors: [
          'The student explicitly chose an evidence-linked next action from the knowledge map.',
          'Keep the reason visible and practical; do not create urgency or ability labels.',
        ],
        sourceEntityIds: [recommendation.id],
        citations: [
          {
            sourceType: 'reflection' as const,
            sourceId: recommendation.id,
            version: source.snapshot.algorithmVersion,
            label: recommendation.actionLabel,
            page: null,
            section: 'Why this?',
            excerpt: recommendation.whyThis.slice(0, 1_200),
          },
        ],
        returnHref: '/progress',
        returnLabel: 'Learning progress',
        policyDisclosures: [
          'This recommendation is ranked from named factors and linked evidence, not a hidden ability score.',
          'The map changes only after new learner evidence is processed; starting a session is not mastery.',
        ],
        sourceFingerprint: fingerprint({
          id: recommendation.id,
          sourceFingerprint: recommendation.sourceFingerprint,
          algorithmVersion: source.snapshot.algorithmVersion,
        }),
        sourceExpiryMs: Date.now() + 30 * 60_000,
      };
    }
    const route = safeReturnRoute(input.route ?? input.sourceId);
    const context = await this.quickContext(scope, route, input.sourceId);
    return {
      sessionType: 'doubt' as const,
      goal: `Resolve the student's ${context.topic} question without making them repeat it: ${input.question!.slice(0, 400)}`,
      targetConcepts: [context.topic],
      scope: {
        summary: `${context.label} assistant handoff · ${context.topic}`,
        boundaries: [
          'Use only the explicitly permitted current route and resolved visible entity context.',
          'Treat the transferred question as session context, not durable learner memory.',
        ],
        curriculum: [context.topic],
        knownFailureDetails: [input.question!],
        learningPathPosition: null,
      },
      deadline: null,
      examDate: null,
      emotionalRegister: 'responsive_neutral' as const,
      registerFactors: [
        'The student explicitly accepted a deeper session after a contextual assistant question.',
        'Continue from the question without replaying a generic chat history.',
      ],
      sourceEntityIds: [input.sourceId],
      citations: [
        {
          sourceType: 'portal_screen' as const,
          sourceId: input.sourceId,
          version: context.sourceVersion,
          label: context.citationLabel,
          page: null,
          section: route,
          excerpt: null,
        },
      ],
      returnHref: route,
      returnLabel: contextLabel(route),
      policyDisclosures: [
        'The assistant opens a teaching session only after explicit acceptance.',
        'The transferred question and screen context are session context, not generic chat memory.',
      ],
      sourceFingerprint: fingerprint({ route, sourceId: input.sourceId, sourceVersion: context.sourceVersion }),
      sourceExpiryMs: Date.now() + 30 * 60_000,
    };
  }

  private async currentFingerprint(scope: PetrosOwnerScope, intent: PetrosSessionIntent) {
    const sourceId = intent.sourceEntityIds[0]!;
    if (intent.door === 'result_repair') {
      const result = await this.repo.resultSource(scope, sourceId);
      if (!result) throw intentNotFound();
      return fingerprint({
        id: result.id,
        version: result.version,
        updatedAt: result.updatedAt.toISOString(),
        marksObtained: result.marksObtained,
        maxMarks: result.maxMarks,
        remarks: result.remarks,
      });
    }
    if (intent.door === 'upcoming_exam') {
      const exam = await this.repo.examSource(scope, sourceId);
      if (!exam || !exam.examDate || exam.examStatus === 'cancelled') throw intentNotFound();
      return fingerprint({
        id: exam.id,
        status: exam.examStatus,
        date: exam.examDate,
        time: exam.startTime,
        syllabus: exam.syllabusNote,
        scheduleVersion: exam.scheduleVersion,
        examVersion: exam.examVersion,
      });
    }
    if (intent.door === 'active_homework') {
      const source = await this.repo.assignmentSource(scope, sourceId);
      if (!source) throw intentNotFound();
      return fingerprint({
        id: source.assignment.id,
        version: source.assignment.version,
        updatedAt: source.assignment.updatedAt,
        status: source.assignment.status,
        dueDate: source.assignment.dueDate,
        aiPolicy: source.assignment.aiPolicy,
        submissionStatus: source.submission?.status ?? 'assigned',
        submissionVersion: source.submission?.version ?? 0,
      });
    }
    if (intent.door === 'uploaded_document') {
      const selectedPage = intent.citations.find((citation) => citation.page)?.page;
      const document = await this.repo.documentSource(scope, sourceId, selectedPage ?? undefined);
      if (!document) throw intentNotFound();
      return fingerprint({
        id: document.item.id,
        version: document.item.version,
        status: document.item.status,
        extraction: document.item.extractedTextReady,
        index: document.item.indexReady,
        pages: document.pages.slice(0, 8).map((page) => ({ id: page.id, updatedAt: page.updatedAt })),
      });
    }
    if (intent.door === 'learning_path') {
      const path = await this.repo.pathSource(scope, sourceId);
      if (!path) throw intentNotFound();
      return fingerprint({
        pathId: path.path.id,
        pathVersion: path.path.version,
        itemId: path.item.id,
        itemVersion: path.item.version,
        itemStatus: path.item.status,
        previous: path.previous,
      });
    }
    if (intent.door === 'reflection_action') {
      const source = await this.repo.reflectionSource(scope, sourceId);
      if (!source) throw intentNotFound();
      return fingerprint({
        id: source.recommendation.id,
        sourceFingerprint: source.recommendation.sourceFingerprint,
        algorithmVersion: source.snapshot.algorithmVersion,
      });
    }
    const context = await this.quickContext(scope, intent.returnDestination.href, sourceId);
    return fingerprint({
      route: intent.returnDestination.href,
      sourceId,
      sourceVersion: context.sourceVersion,
    });
  }

  private async handoffRouting(scope: PetrosOwnerScope, intent: PetrosSessionIntent) {
    if (intent.homeworkContext) {
      return { classId: intent.homeworkContext.classId, subjectId: intent.homeworkContext.subjectId };
    }
    const classId = await this.repo.studentClassId(scope);
    if (!classId) return {};
    const sourceId = intent.sourceEntityIds[0]!;
    if (intent.door === 'result_repair') {
      const result = await this.repo.resultSource(scope, sourceId);
      return result?.subjectId ? { classId, subjectId: result.subjectId } : {};
    }
    if (intent.door === 'upcoming_exam') {
      const exam = await this.repo.examSource(scope, sourceId);
      return exam?.subjectId ? { classId, subjectId: exam.subjectId } : {};
    }
    return {};
  }

  private async assertAssistantContext(scope: PetrosOwnerScope, route: string, sourceId?: string) {
    if (!sourceId || sourceId.startsWith('/')) return;
    if (route.startsWith('/results') && !(await this.repo.resultSource(scope, sourceId)))
      throw intentNotFound();
    if (route.startsWith('/assignments') && !(await this.repo.assignmentSource(scope, sourceId)))
      throw intentNotFound();
    if (route.startsWith('/exams') && !(await this.repo.examSource(scope, sourceId)))
      throw intentNotFound();
    if (route.startsWith('/materials') && !(await this.repo.documentSource(scope, sourceId)))
      throw intentNotFound();
    if (route.startsWith('/learning-path') && !(await this.repo.pathSource(scope, sourceId)))
      throw intentNotFound();
  }

  private async quickContext(scope: PetrosOwnerScope, route: string, sourceId?: string) {
    const safeRoute = safeReturnRoute(route);
    await this.assertAssistantContext(scope, safeRoute, sourceId);
    if (safeRoute.startsWith('/assignments') && sourceId) {
      const source = await this.repo.assignmentSource(scope, sourceId);
      if (source)
        return {
          label: 'Published assignment',
          topic: source.subjectName ?? source.assignment.title,
          citationLabel: source.assignment.title,
          sourceVersion: fingerprint({
            version: source.assignment.version,
            updatedAt: source.assignment.updatedAt,
            dueDate: source.assignment.dueDate,
            status: source.assignment.status,
            submissionStatus: source.submission?.status ?? 'assigned',
          }).slice(0, 16),
          quickAnswer: `${source.assignment.title}${source.subjectName ? ` for ${source.subjectName}` : ''}${source.assignment.dueDate ? ` is due ${source.assignment.dueDate}` : ' has no published due date'}. ${source.assignment.instructions?.trim() || 'No additional instructions are published.'}${source.submission?.feedback ? ` Teacher feedback: ${source.submission.feedback}` : ''}`,
        };
    }
    if (safeRoute.startsWith('/results') && sourceId) {
      const result = await this.repo.resultSource(scope, sourceId);
      if (result)
        return {
          label: 'Published result',
          topic: result.subjectName ?? result.assessmentName,
          citationLabel: `${result.assessmentName} · ${result.subjectName ?? 'Result'}`,
          sourceVersion: fingerprint({
            version: result.version,
            updatedAt: result.updatedAt,
            marksObtained: result.marksObtained,
            maxMarks: result.maxMarks,
            remarks: result.remarks,
          }).slice(0, 16),
          quickAnswer: `${result.assessmentName}: ${result.marksObtained}/${result.maxMarks}${result.remarks ? `. Teacher feedback: ${result.remarks}` : '. No question-level feedback is published.'}`,
        };
    }
    if (safeRoute.startsWith('/exams') && sourceId) {
      const exam = await this.repo.examSource(scope, sourceId);
      if (exam)
        return {
          label: 'Examination',
          topic: exam.subjectName ?? exam.examName,
          citationLabel: `${exam.examName} · ${exam.subjectName ?? 'Examination'}`,
          sourceVersion: fingerprint({
            scheduleVersion: exam.scheduleVersion,
            examVersion: exam.examVersion,
            examStatus: exam.examStatus,
            examDate: exam.examDate,
            startTime: exam.startTime,
            syllabusNote: exam.syllabusNote,
          }).slice(0, 16),
          quickAnswer: `${exam.examName} is scheduled for ${exam.examDate ?? 'a date not yet published'}${exam.syllabusNote ? `. Published coverage: ${exam.syllabusNote}` : '. No syllabus note is published yet.'}`,
        };
    }
    if (safeRoute.startsWith('/materials') && sourceId) {
      const document = await this.repo.documentSource(scope, sourceId);
      if (document)
        return {
          label: 'Study material',
          topic: document.item.title,
          citationLabel: document.item.title,
          sourceVersion: fingerprint({
            version: document.item.version,
            status: document.item.status,
            pagesDone: document.item.pagesDone,
            pageCount: document.item.pageCount,
            extractedTextReady: document.item.extractedTextReady,
            indexReady: document.item.indexReady,
          }).slice(0, 16),
          quickAnswer: document.item.extractedTextReady
            ? `${document.item.title} is ready, with ${document.item.pageCount ?? document.pages.length} pages available.`
            : `${document.item.title} is still being extracted (${document.item.pagesDone}/${document.item.pageCount ?? '?'} pages).`,
        };
    }
    return {
      label: contextLabel(safeRoute),
      topic: contextLabel(safeRoute),
      citationLabel: contextLabel(safeRoute),
      sourceVersion: fingerprint({ route: safeRoute }).slice(0, 16),
      quickAnswer: `I can use the visible ${contextLabel(safeRoute).toLowerCase()} context on this screen. Ask for a specific published detail, or accept a focused session when the question needs teaching depth.`,
    };
  }

  private dto(row: IntentRow): PetrosSessionIntent {
    return petrosSessionIntentSchema.parse({
      ...row.resolvedIntent,
      status: row.status,
      expiresAt: row.expiresAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
    });
  }
}

const assistantResponseJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['mode', 'answer', 'contextLabel', 'offer'],
  properties: {
    mode: { type: 'string', enum: ['quick_answer', 'session_offer'] },
    answer: { type: 'string', minLength: 1, maxLength: 2500 },
    contextLabel: { type: 'string', minLength: 1, maxLength: 240 },
    offer: {
      anyOf: [
        { type: 'null' },
        {
          type: 'object',
          additionalProperties: false,
          required: ['description', 'approximateMinutes', 'sourceId'],
          properties: {
            description: { type: 'string', minLength: 1, maxLength: 240 },
            approximateMinutes: { type: 'integer', minimum: 5, maximum: 30 },
            sourceId: { type: 'string', minLength: 1, maxLength: 500 },
          },
        },
      ],
    },
  },
} as const;

type AssistantPortalContext = Awaited<ReturnType<PetrosSessionIntentRepository['assistantContext']>>;

function demoAssistantAnswer(input: {
  question: string;
  contextLabel: string;
  portalContext: AssistantPortalContext;
  sessionRecommended: boolean;
  sourceId: string;
}) {
  const lower = input.question.toLowerCase();
  const activeExam = input.portalContext.exams.find((exam) => exam.status === 'ongoing');
  const nextExam = activeExam ?? input.portalContext.exams[0];
  const feedback = [
    ...input.portalContext.homework
      .filter((item) => item.teacherNote)
      .map((item) => ({ title: item.title, note: item.teacherNote! })),
    ...input.portalContext.assignments
      .filter((item) => item.teacherFeedback)
      .map((item) => ({ title: item.title, note: item.teacherFeedback! })),
  ][0];
  const attendanceRisk = input.portalContext.attendance.find(
    (item) => item.zone === 'warning' || item.zone === 'below' || item.zone === 'unrecoverable',
  );
  const pendingWork = [
    ...input.portalContext.homework
      .filter((item) => item.status !== 'returned')
      .map((item) => ({ title: item.title, dueAt: item.dueAt, kind: 'homework' })),
    ...input.portalContext.assignments
      .filter((item) => item.status !== 'graded' && item.status !== 'submitted')
      .map((item) => ({ title: item.title, dueAt: item.dueDate, kind: 'assignment' })),
  ]
    .filter((item) => item.dueAt)
    .sort((left, right) => new Date(left.dueAt!).getTime() - new Date(right.dueAt!).getTime());
  const nextWork = pendingWork[0];

  let answer: string;
  if (lower.includes('feedback') || lower.includes('teacher') || lower.includes('kubernetes')) {
    answer = feedback
      ? `Demo mode — Your teacher's feedback on ${feedback.title} says: ${feedback.note}`
      : 'Demo mode — I could not find any published teacher feedback for your account.';
  } else if (lower.includes('attendance')) {
    answer = attendanceRisk
      ? `Demo mode — ${attendanceRisk.subject ?? 'Your overall attendance'} is at ${attendanceRisk.percentage ?? 'an unpublished percentage'}% and is in the ${attendanceRisk.zone} zone. This is the attendance item to protect first.`
      : 'Demo mode — I could not find a current attendance warning in your published records.';
  } else if (lower.includes('exam') || lower.includes('test') || lower.includes('revision')) {
    answer = nextExam
      ? `Demo mode — ${nextExam.exam}${nextExam.subject ? ` for ${nextExam.subject}` : ''} is ${nextExam.status}${nextExam.date ? ` on ${formatDemoDate(nextExam.date)}` : ''}. ${nextExam.syllabus ? `Published coverage: ${nextExam.syllabus}` : 'No syllabus note is published yet.'}`
      : 'Demo mode — I could not find a published upcoming examination for your class.';
  } else {
    const priorities: string[] = [];
    if (activeExam) priorities.push(`${activeExam.exam} is currently ongoing`);
    if (nextWork?.dueAt)
      priorities.push(
        `${nextWork.title} is the nearest unfinished ${nextWork.kind}, due ${formatDemoDate(nextWork.dueAt)}`,
      );
    if (feedback) priorities.push(`your ${feedback.title} feedback still needs a follow-up`);
    if (attendanceRisk)
      priorities.push(
        `${attendanceRisk.subject ?? 'attendance'} is at ${attendanceRisk.percentage ?? '?'}% in the ${attendanceRisk.zone} zone`,
      );
    answer = priorities.length
      ? `Demo mode — Here's what I'd watch first: ${priorities.slice(0, 4).join('; ')}. Start with the active exam or nearest deadline, then spend a short block fixing the teacher-feedback item.`
      : 'Demo mode — Your published records do not show anything urgent right now. A short review session is enough for today.';
  }

  return petrosAssistantAnswerSchema.parse(
    input.sessionRecommended
      ? {
          mode: 'session_offer',
          answer,
          contextLabel: `${input.contextLabel} · Demo`,
          offer: {
            description: 'Open a no-cost demo teaching session using this same student context.',
            approximateMinutes: 15,
            sourceId: input.sourceId,
          },
        }
      : {
          mode: 'quick_answer',
          answer,
          contextLabel: `${input.contextLabel} · Demo`,
          offer: null,
        },
  );
}

function formatDemoDate(value: string | Date) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'on its published date';
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function owner(principal: InstitutionalStudentPrincipal): PetrosOwnerScope {
  return { institutionId: principal.institutionId, studentId: principal.studentId };
}

function fingerprint(value: unknown) {
  return createHash('sha256').update(stableJson(value)).digest('hex');
}

function stableJson(value: unknown): string {
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => `${JSON.stringify(key)}:${stableJson(nested)}`)
      .join(',')}}`;
  return JSON.stringify(value);
}

function parseExamDate(date: string, time: string | null) {
  const parsed = new Date(`${date}T${time ?? '09:00'}:00`);
  if (Number.isNaN(parsed.getTime())) throw staleIntent('This exam schedule is not valid.');
  return parsed;
}

function safeReturnRoute(route: string) {
  const clean = route.split('#')[0]!.split('?')[0]!;
  const allowed = [
    '/home',
    '/assignments',
    '/homework',
    '/announcements',
    '/notifications',
    '/courses',
    '/timetable',
    '/attendance',
    '/results',
    '/exams',
    '/calendar',
    '/materials',
    '/documents',
    '/learning-path',
    '/progress',
  ];
  return allowed.find((candidate) => clean === candidate || clean.startsWith(`${candidate}/`)) ?? '/home';
}

function contextLabel(route: string) {
  if (route.startsWith('/assignments')) return 'Assignments';
  if (route.startsWith('/homework')) return 'Homework';
  if (route.startsWith('/announcements')) return 'Announcements';
  if (route.startsWith('/notifications')) return 'Notifications';
  if (route.startsWith('/courses')) return 'Courses';
  if (route.startsWith('/timetable')) return 'Timetable';
  if (route.startsWith('/attendance')) return 'Attendance';
  if (route.startsWith('/results')) return 'Results';
  if (route.startsWith('/exams')) return 'Examinations';
  if (route.startsWith('/calendar')) return 'Calendar';
  if (route.startsWith('/materials')) return 'Study materials';
  if (route.startsWith('/documents')) return 'Documents';
  if (route.startsWith('/learning-path')) return 'Learning path';
  if (route.startsWith('/progress')) return 'Learning progress';
  return 'Student portal';
}

function routeGroup(route: string) {
  return safeReturnRoute(route).split('/')[1] || 'home';
}

function requiresSession(question: string) {
  const words = question.trim().split(/\s+/).filter(Boolean).length;
  return (
    words > 14 ||
    /\b(?:teach|explain|understand|step[- ]by[- ]step|compare|derive|show me how|why does|why is)\b/i.test(
      question,
    )
  );
}

function defaultSessionType(door: ResolvePetrosSessionIntentInput['door']) {
  if (door === 'result_repair') return 'repair';
  if (door === 'upcoming_exam') return 'revise';
  if (door === 'assistant_handoff') return 'doubt';
  if (door === 'reflection_action') return 'repair';
  if (door === 'active_homework') return 'repair';
  return 'learn';
}

function normalizeHomeworkStatus(status: string | undefined, dueDate: string) {
  if (status === 'submitted' || status === 'graded' || status === 'late' || status === 'missing') return status;
  return dueDate < new Date().toISOString().slice(0, 10) ? 'late' as const : 'assigned' as const;
}

function derivedUuid(value: string, purpose: string) {
  const hex = createHash('sha256').update(`${value}:${purpose}`).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function intentNotFound() {
  return new NotFoundException({
    code: 'PETROS_INTENT_SOURCE_NOT_FOUND',
    message: 'This source is unavailable or you do not have access to it.',
  });
}

function staleIntent(message: string) {
  return new ConflictException({ code: 'PETROS_INTENT_STALE', message });
}

function intentErrorCode(error: unknown) {
  if (error instanceof NotFoundException) return 'PETROS_INTENT_SOURCE_NOT_FOUND';
  if (error instanceof ConflictException) {
    const response = error.getResponse();
    if (response && typeof response === 'object' && 'code' in response)
      return String((response as { code: unknown }).code).slice(0, 120);
    return 'PETROS_INTENT_CONFLICT';
  }
  return 'PETROS_INTENT_RESOLUTION_FAILED';
}
