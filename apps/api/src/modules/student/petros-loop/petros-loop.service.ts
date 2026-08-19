import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { schema } from '@edrion/database';
import type { AuditWriter } from '@edrion/audit';
import {
  PETROS_ANSWER_EVALUATION_FUNCTION_KEY,
  PETROS_EVALUATION_PROMPT_VERSION,
  PETROS_EVALUATION_SCHEMA_VERSION,
  PETROS_HINT_FUNCTION_KEY,
  PETROS_OBSERVATION_SCHEMA_VERSION,
  PETROS_PLAN_FUNCTION_KEY,
  PETROS_PLAN_PROMPT_VERSION,
  PETROS_PLAN_SCHEMA_VERSION,
  PETROS_MOVE_RENDER_FUNCTION_KEYS,
  PETROS_RENDER_PROMPT_VERSION,
  PETROS_RENDER_SCHEMA_VERSION,
  PETROS_SESSION_STATE_VERSION,
  PETROS_LEARNER_EVIDENCE_SCHEMA_VERSION,
  PETROS_LEARNER_MODEL_ALGORITHM_VERSION,
  petrosAnswerEvaluationSchema,
  petrosLearningSessionDocumentSchema,
  petrosPlanDecisionSchema,
  petrosResolvedTopicProfileSchema,
  petrosSessionStateSchema,
  petrosTeachingBlockContentSchema,
  type PetrosCreateLearningSessionInput,
  type PetrosComposerQuestionInput,
  type PetrosDecisionDiagnosticQuery,
  type PetrosAnswerEvaluation,
  type PetrosRequestHintInput,
  type PetrosSubmitAnswerInput,
  type PetrosPlanDecision,
  type PetrosSessionState,
  type PetrosTeachingBlockContent,
} from '@edrion/schemas';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { AUDIT_WRITER } from '../../../common/tokens';
import { baseAudit, type ActionContext } from '../../../common/action-context';
import {
  PetrosAiGatewayService,
  type PetrosAiExecuteResult,
} from '../../petros-ai-routing/petros-ai-gateway.service';
import { PetrosTopicProfilesService } from '../../petros-topic-profiles/petros-topic-profiles.service';
import { PetrosLearnerModelService } from '../../petros-learner-model/petros-learner-model.service';
import { mapLegacyErrorCategory } from '../../petros-learner-model/petros-learner-model.engine';
import { PetrosInstitutionalService } from '../../petros-institutional/petros-institutional.service';
import type { InstitutionalStudentPrincipal } from '../student.types';
import {
  documentQuestionFromSourceContext,
  documentRetryPrompt,
} from '../petros-document-grounding';
import {
  applyRepetitionGuard,
  deterministicPlan,
  deterministicRender,
  PETROS_PLAN_SYSTEM_PROMPT,
  PETROS_RENDER_SYSTEM_PROMPT,
  terminalReason,
} from './petros-loop.policy';
import {
  confidenceFlags,
  deterministicEvaluate,
  ladderTransition,
  safeFallbackEvaluation,
  type LadderTransition,
} from './petros-observation.policy';
import { PetrosLoopRepository, type PetrosOwnerScope } from './petros-loop.repository';

type CompleteInput = {
  idempotencyKey: string;
  blockType: PetrosTeachingBlockContent['type'];
  expectedBlockVersion: number;
  interactionState: Record<string, unknown>;
  observedOutcome: Record<string, unknown>;
};

type PetrosLearningSession = typeof schema.petrosLearningSessions.$inferSelect;
type PetrosPlanningDecisionRow = typeof schema.petrosPlanningDecisions.$inferSelect;
type PetrosQuestionSpec = typeof schema.petrosQuestionSpecs.$inferSelect;
type PetrosEvaluationRow = typeof schema.petrosAnswerEvaluations.$inferSelect;
type PetrosObservationRow = typeof schema.petrosObservations.$inferSelect;
type PetrosStretchRow = typeof schema.petrosStruggleStretches.$inferSelect;
type PetrosDetourRow = typeof schema.petrosSessionDetours.$inferSelect;

const supportResponseSchema = z
  .object({ supportText: z.string().trim().min(3).max(2_000) })
  .strict();

@Injectable()
export class PetrosLoopService {
  constructor(
    private readonly repo: PetrosLoopRepository,
    private readonly gateway: PetrosAiGatewayService,
    private readonly topicProfiles: PetrosTopicProfilesService,
    private readonly learnerModels: PetrosLearnerModelService,
    @Inject(AUDIT_WRITER) private readonly audit: AuditWriter,
    @Optional() private readonly institutional?: PetrosInstitutionalService,
  ) {}

  async createUnresolved(
    principal: InstitutionalStudentPrincipal,
    input: PetrosCreateLearningSessionInput,
  ) {
    if (input.sourceContext && input.sourceContext.door !== 'student_portal') {
      throw new BadRequestException({
        code: 'PETROS_INTENT_REQUIRED',
        message: 'Start this contextual session from its verified preview.',
      });
    }
    return this.create(principal, input);
  }

  async create(principal: InstitutionalStudentPrincipal, input: PetrosCreateLearningSessionInput) {
    const scope = owner(principal);
    const existing = await this.repo.findSessionByRequest(scope, input.clientRequestId);
    if (existing) return this.document(scope, existing.id);
    const maxMoves = input.maxMoves ?? 4;
    const checkpoints = checkpointPlan(maxMoves);
    const resolvedTopicProfile = await this.topicProfiles.resolveForSession({
      institutionId: scope.institutionId,
      topic: input.topic,
      profileContext: input.profileContext ?? {},
    });
    const row = await this.repo.createSession({
      institutionId: scope.institutionId,
      studentId: scope.studentId,
      clientRequestId: input.clientRequestId,
      stateVersion: PETROS_SESSION_STATE_VERSION,
      sessionType: input.sessionType ?? 'repair',
      status: 'active',
      topic: input.topic,
      currentGoal:
        input.goal ??
        `Understand the part of ${input.topic} that cost marks and choose a reliable next step.`,
      timeBudgetSeconds: input.timeBudgetSeconds ?? 480,
      elapsedSeconds: 0,
      activeSince: new Date(),
      maxMoves,
      checkpoints,
      currentCheckpointId: checkpoints[0]!.id,
      learnerContext: input.learnerContext ?? {},
      topicContext: input.topicContext ?? {},
      topicProfileId: resolvedTopicProfile.profileId,
      topicProfileVersionId: resolvedTopicProfile.canonicalVersionId,
      resolvedTopicProfile,
      sourceContext: input.sourceContext ?? null,
      promptVersion: PETROS_PLAN_PROMPT_VERSION,
      outputSchemaVersion: PETROS_PLAN_SCHEMA_VERSION,
    });
    if (this.institutional) {
      const assignment = assignmentFromContext(input.sourceContext);
      const decisions = await this.institutional.sessionDecisions(principal, row.id, {
        topicKey: input.profileContext?.topicKey ?? canonicalConcept(input.topic),
        requestedTopic: input.topic,
        requestedDepth: requestedDepth(input.learnerContext ?? {}),
        subjectId: assignment?.subjectId ?? subjectIdFromContext(input.topicContext ?? {}),
        homework: assignment,
      });
      await this.repo.updateSessionSourceContext(scope, row.id, {
        ...(input.sourceContext ?? { door: 'student_portal' }),
        institutionalDecision: decisions,
      });
    }
    await this.event(scope, row.id, 'session.created', {
      sessionType: row.sessionType,
      door: input.sourceContext?.door ?? 'student_portal',
    });
    return this.document(scope, row.id);
  }

  async document(
    scopeOrPrincipal: PetrosOwnerScope | InstitutionalStudentPrincipal,
    sessionId: string,
  ) {
    const principal = 'kind' in scopeOrPrincipal ? scopeOrPrincipal : null;
    const scope = principal ? owner(principal) : scopeOrPrincipal;
    const [
      session,
      decisions,
      blocks,
      questionSpecs,
      observations,
      evaluations,
      stretches,
      detours,
    ] = await Promise.all([
      this.requireSession(scope, sessionId),
      this.repo.listDecisions(scope, sessionId),
      this.repo.listBlocks(scope, sessionId),
      this.repo.listQuestionSpecs(scope, sessionId),
      this.repo.listObservations(scope, sessionId),
      this.repo.listEvaluations(scope, sessionId),
      this.repo.listStretches(scope, sessionId),
      this.repo.listDetours(scope, sessionId),
    ]);
    const whyByDecision = new Map(
      decisions.map((decision) => [decision.id, decision.studentSafeReason]),
    );
    const fallbackUsed = blocks.some((block) => block.delivery === 'deterministic_fallback');
    const learnerSnapshot = await this.learnerModels.snapshot({
      scope,
      topic: session.topic,
      prerequisiteConceptIds: prerequisiteIds(session.resolvedTopicProfile),
      sessionOverride: sessionOverride(session.learnerContext),
    });
    const institutionalPolicy = this.institutional
      ? (principal
          ? await this.institutional.resolveForStudentSession(principal, sessionId, subjectIdFromContext(session.topicContext))
          : await this.institutional.readSessionPolicy(scope.institutionId, scope.studentId, sessionId))
      : null;
    return petrosLearningSessionDocumentSchema.parse({
      stateVersion: PETROS_SESSION_STATE_VERSION,
      id: session.id,
      version: session.version,
      status: session.status,
      sessionType: session.sessionType,
      topic: session.topic,
      currentGoal: session.currentGoal,
      timeBudgetSeconds: session.timeBudgetSeconds,
      elapsedSeconds: elapsed(session),
      maxMoves: session.maxMoves,
      checkpoints: session.checkpoints,
      currentCheckpointId: session.currentCheckpointId,
      closeReason: session.closeReason,
      sourceContext: session.sourceContext,
      topicProfile: topicProfileSummary(session.resolvedTopicProfile),
      blocks: blocks.map((block) => ({
        id: block.id,
        sessionId: block.sessionId,
        decisionId: block.decisionId,
        sequence: block.sequence,
        status: block.status,
        version: block.version,
        content: petrosTeachingBlockContentSchema.parse(block.content),
        interactionState: block.interactionState,
        observedOutcome: block.observedOutcome,
        questions: publicQuestionStates(
          questionSpecs.filter((question) => question.blockId === block.id),
          observations,
          evaluations,
        ),
        whyThis:
          whyByDecision.get(block.decisionId) ??
          'This move follows the current session checkpoint.',
        correlationId: block.correlationId,
        delivery: block.delivery,
        createdAt: block.createdAt.toISOString(),
        completedAt: block.completedAt?.toISOString() ?? null,
      })),
      detours: detours.map((detour) => ({
        id: detour.id,
        observationId: detour.observationId,
        question: detour.question,
        status: detour.status,
        action: detour.action,
        acknowledgement: detour.acknowledgement,
        routeChange: detour.routeChange,
        returnPlan: detour.returnPlan,
        changedDecisionId: detour.changedDecisionId,
        createdAt: detour.createdAt.toISOString(),
        rejoinedAt: detour.rejoinedAt?.toISOString() ?? null,
      })),
      observationSummary: observationSummary(evaluations, detours, stretches),
      expectedMoveType:
        decisions.find(
          (decision) =>
            (decision.status === 'planned' || decision.status === 'overridden') &&
            !blocks.some((block) => block.decisionId === decision.id),
        )?.selectedMoveType ?? null,
      fallbackNotice: fallbackUsed
        ? 'A reliable built-in teaching step was used while live generation was unavailable. Your session can continue safely.'
        : null,
      personalization: {
        status: learnerSnapshot.stale
          ? 'stale_fallback'
          : learnerSnapshot.neutral
            ? 'neutral'
            : 'history_informed',
        reasons: learnerSnapshot.causalFactors,
        sessionOverride: learnerSnapshot.sessionOverride,
      },
      ...(institutionalPolicy ? {
        institutionalPolicy: {
          snapshotId: institutionalPolicy.snapshotId,
          disclosure: institutionalPolicy.disclosure,
          stableForSession: true,
          midSessionPolicyChangesDeferred: true,
          voiceRequired: false,
          handoffEnabled: institutionalPolicy.config.escalation.enabled && institutionalPolicy.config.visibility.teacher.categories.includes('teacher_handoff'),
          handoffOfferAfterFailedRepairCount: institutionalPolicy.config.escalation.offerAfterFailedRepairCount,
        },
      } : {}),
      createdAt: session.createdAt.toISOString(),
      updatedAt: session.updatedAt.toISOString(),
    });
  }

  async continue(
    principal: InstitutionalStudentPrincipal,
    sessionId: string,
    idempotencyKey: string,
  ) {
    const scope = owner(principal);
    const session = await this.requireSession(scope, sessionId);
    const command = await this.repo.beginCommand(scope, sessionId, idempotencyKey, 'continue');
    if (command.state === 'completed')
      return petrosLearningSessionDocumentSchema.parse(command.response);
    if (command.state === 'in_flight' || !command.row) throw inFlight();
    try {
      const current = await this.repo.findCurrentBlock(scope, sessionId);
      if (current) return await this.finishWithDocument(scope, sessionId, command.row.id);

      const state = await this.state(scope, session);
      const terminal = terminalReason(state, session.status);
      if (terminal === 'paused')
        throw new ConflictException({
          code: 'PETROS_SESSION_PAUSED',
          message: 'Resume this session before continuing.',
        });
      if (terminal === 'closed')
        return await this.finishWithDocument(scope, sessionId, command.row.id);
      if (terminal) {
        await this.repo.setSessionStatus(scope, sessionId, {
          status: 'closed',
          elapsedSeconds: state.time.elapsedSeconds,
          activeSince: null,
          closeReason: terminal,
          closedAt: new Date(),
        });
        await this.event(scope, sessionId, 'session.closed', { reason: terminal });
        return await this.finishWithDocument(scope, sessionId, command.row.id);
      }

      if (!(await this.repo.acquirePlanning(scope, sessionId))) throw inFlight();
      try {
        // Re-read after acquiring the planning lease so a composer observation can never be skipped
        // by a PLAN call that raced with its submission.
        const planningSession = await this.requireSession(scope, sessionId);
        const planningState = await this.state(scope, planningSession);
        const pending = await this.repo.findPendingDecision(scope, sessionId);
        if (pending) {
          await this.renderDecision(scope, planningState, pending, rowToDecision(pending));
        } else {
          const correlationId = randomUUID();
          const planned = await this.plan(planningState, correlationId);
          const guarded = applyRepetitionGuard(planned.decision, planningState.priorMoves);
          const row = await this.repo.insertDecision({
            sessionId,
            institutionId: scope.institutionId,
            studentId: scope.studentId,
            sequence: planningState.moves.used + 1,
            status: guarded.intervention ? 'overridden' : 'planned',
            selectedMoveType: guarded.decision.selectedMoveType,
            originalMoveType: guarded.intervention ? planned.decision.selectedMoveType : null,
            targetConcept: guarded.decision.targetConcept,
            studentSafeReason: guarded.decision.studentSafeReason,
            decisionFactors: guarded.decision.decisionFactors,
            moveParameters: guarded.decision.moveParameters,
            expectedEvidence: guarded.decision.expectedEvidence,
            progressEffect: guarded.decision.progressEffect,
            canStream: guarded.decision.canStream,
            termination: guarded.decision.termination,
            guessFirst: guarded.decision.guessFirst,
            observationResponse: guarded.decision.observationResponse,
            selectionPolicy: guarded.decision.selectionPolicy,
            policyInterventions: [
              ...(guarded.intervention ? [guarded.intervention] : []),
              ...(guarded.decision.observationResponse.causalObservationIds.length
                ? [
                    {
                      policy: 'observation_response',
                      causalObservationIds:
                        guarded.decision.observationResponse.causalObservationIds,
                      action: guarded.decision.observationResponse.action,
                      routeChange: guarded.decision.observationResponse.routeChange,
                    },
                  ]
                : []),
            ],
            observedOutcome: null,
            source: planned.source,
            functionKey: PETROS_PLAN_FUNCTION_KEY,
            promptVersion: planned.result?.promptVersion ?? PETROS_PLAN_PROMPT_VERSION,
            schemaVersion: planned.result?.schemaVersion ?? PETROS_PLAN_SCHEMA_VERSION,
            routeReference: planned.result ? { plan: routeReference(planned.result) } : null,
            planRequestId: planned.result?.requestId,
            correlationId,
          });
          await this.learnerModels.recordPlanSnapshot({
            sessionId,
            decisionId: row.id,
            scope,
            snapshot: planningState.learnerSnapshot!,
          });
          const activatedDetours = await this.repo.activateDetours(
            scope,
            sessionId,
            row.id,
            guarded.decision.observationResponse,
          );
          await this.event(
            scope,
            sessionId,
            'plan.decision',
            {
              moveType: guarded.decision.selectedMoveType,
              source: planned.source,
              repetitionOverride: Boolean(guarded.intervention),
              causalObservationIds: guarded.decision.observationResponse.causalObservationIds,
              observationAction: guarded.decision.observationResponse.action,
              detourCount: activatedDetours.length,
            },
            correlationId,
            row.id,
          );
          if (planned.source === 'deterministic_fallback') {
            await this.event(
              scope,
              sessionId,
              'fallback.deterministic',
              { step: 'PLAN', studentMessage: 'provider_neutral' },
              correlationId,
              row.id,
            );
          }
          if (guarded.intervention) {
            await this.event(
              scope,
              sessionId,
              'policy.repetition_override',
              guarded.intervention,
              correlationId,
              row.id,
            );
          }
          await this.renderDecision(scope, planningState, row, guarded.decision);
        }
      } finally {
        await this.repo.releasePlanning(scope, sessionId);
      }
      return await this.finishWithDocument(scope, sessionId, command.row.id);
    } catch (error) {
      await this.repo.failCommand(command.row.id, errorCode(error));
      throw error;
    }
  }

  async complete(
    principal: InstitutionalStudentPrincipal,
    sessionId: string,
    blockId: string,
    input: CompleteInput,
  ) {
    const scope = owner(principal);
    const [session, block] = await Promise.all([
      this.requireSession(scope, sessionId),
      this.repo.findBlock(scope, sessionId, blockId),
    ]);
    if (!block) throw notFound();
    if (block.type !== input.blockType)
      throw new ConflictException({
        code: 'PETROS_BLOCK_TYPE_MISMATCH',
        message: 'This block changed. Reload the session and try again.',
      });
    if (block.version !== input.expectedBlockVersion) throw staleBlock();
    const command = await this.repo.beginCommand(
      scope,
      sessionId,
      input.idempotencyKey,
      'complete',
    );
    if (command.state === 'completed')
      return petrosLearningSessionDocumentSchema.parse(command.response);
    if (command.state === 'in_flight' || !command.row) throw inFlight();
    try {
      const decisionRows = await this.repo.listDecisions(scope, sessionId);
      const decision = decisionRows.find((candidate) => candidate.id === block.decisionId);
      if (!decision) throw notFound();
      const [questions, stretches] = await Promise.all([
        this.repo.listQuestionSpecs(scope, sessionId),
        this.repo.listStretches(scope, sessionId),
      ]);
      const blockQuestions = questions.filter((question) => question.blockId === blockId);
      const equivalenceKeys = new Set(blockQuestions.map((question) => question.equivalenceKey));
      const unresolved = [...equivalenceKeys].some(
        (key) =>
          stretches.find((stretch) => stretch.equivalenceKey === key)?.status !== 'recovered',
      );
      if (blockQuestions.some((question) => question.active) || unresolved) {
        throw new ConflictException({
          code: 'PETROS_QUESTION_UNRESOLVED',
          message: 'Finish the active question stretch before completing this block.',
        });
      }
      const checkpoints = advanceCheckpoints(
        session.checkpoints,
        decision.progressEffect as { checkpointId?: string; effect?: string },
      );
      const next =
        checkpoints.find((checkpoint) => checkpoint.status === 'current') ?? checkpoints.at(-1)!;
      const nowElapsed = elapsed(session);
      const shouldClose =
        decision.termination?.recommendation === 'goal_met' ||
        (block.sequence >= session.maxMoves && block.type === 'artifact_commit') ||
        (nowElapsed >= session.timeBudgetSeconds && block.type === 'artifact_commit');
      const closeReason = shouldClose
        ? decision.termination?.recommendation === 'goal_met'
          ? 'goal_met'
          : nowElapsed >= session.timeBudgetSeconds
            ? 'time_up'
            : 'max_moves'
        : undefined;
      const completedBlock = await this.repo.completeBlock(scope, sessionId, blockId, {
        expectedBlockVersion: input.expectedBlockVersion,
        interactionState: input.interactionState,
        observedOutcome: input.observedOutcome,
        checkpoints,
        currentCheckpointId: next.id,
        elapsedSeconds: nowElapsed,
        closeReason,
      });
      if (!completedBlock) throw staleBlock();
      await this.repo.rejoinDecisionDetours(scope, sessionId, block.decisionId);
      await this.observation(scope, sessionId, 'block_completed', {
        blockId: block.id,
        decisionId: block.decisionId,
        targetId: decision.targetConcept,
        payload: { blockType: block.type, closeReason },
        correlationId: block.correlationId,
      });
      await this.event(
        scope,
        sessionId,
        'block.completed',
        { blockType: block.type, closeReason },
        block.correlationId,
        block.decisionId,
        block.id,
      );
      try {
        const engagementAction = learnerEngagementAction(
          input.interactionState,
          input.observedOutcome,
        );
        await this.learnerModels.ingest(scope, {
          schemaVersion: PETROS_LEARNER_EVIDENCE_SCHEMA_VERSION,
          source: 'petros',
          sourceEventId: `block-completed:${block.id}`,
          sourceRecordId: block.id,
          conceptId: canonicalConcept(decision.targetConcept),
          topicId: canonicalConcept(session.topic),
          prerequisiteConceptIds: prerequisiteIds(session.resolvedTopicProfile),
          evidenceKind: 'engagement',
          outcome: engagementAction === 'skip' ? 'skipped' : 'correct',
          creditBasisPoints: engagementAction === 'skip' ? 0 : 10_000,
          moveType: null,
          profileDimension: primaryRepresentation(session.resolvedTopicProfile),
          preEvidenceBasisPoints: null,
          postEvidenceBasisPoints: null,
          responseTimeMs: null,
          hintCount: 0,
          confidenceBefore: null,
          confidenceAfter: null,
          errorCategory: 'none',
          errorConfidenceBasisPoints: 10_000,
          evaluatorVersion: null,
          algorithmVersion: PETROS_LEARNER_MODEL_ALGORITHM_VERSION,
          environment: 'production',
          synthetic: false,
          occurredAt: new Date().toISOString(),
          metadata: {
            action: engagementAction,
            sessionId,
            decisionId: block.decisionId,
            blockType: block.type,
          },
        });
      } catch (error) {
        await this.event(
          scope,
          sessionId,
          'learner_model.update_failed',
          { sourceEventId: `block-completed:${block.id}`, code: errorCode(error) },
          block.correlationId,
          block.decisionId,
          block.id,
        );
      }
      if (closeReason)
        await Promise.all([
          this.event(
            scope,
            sessionId,
            'session.closed',
            { reason: closeReason },
            block.correlationId,
          ),
          this.finishContextualOrigin(scope, session, sessionId, closeReason),
        ]);
      return await this.finishWithDocument(scope, sessionId, command.row.id);
    } catch (error) {
      await this.repo.failCommand(command.row.id, errorCode(error));
      throw error;
    }
  }

  async updateInteraction(
    principal: InstitutionalStudentPrincipal,
    sessionId: string,
    blockId: string,
    interactionState: Record<string, unknown>,
  ) {
    const scope = owner(principal);
    const session = await this.requireSession(scope, sessionId);
    const block = await this.repo.updateBlockInteraction(
      scope,
      sessionId,
      blockId,
      interactionState,
    );
    if (!block) throw notFound();
    const requested = interactionState.requestedAction;
    if (requested === 'simpler' || requested === 'deeper') {
      const override = {
        pace: null,
        depth: requested === 'deeper' ? ('deep' as const) : ('concise' as const),
        source: 'student_current_session' as const,
        updatedAt: new Date().toISOString(),
      };
      await this.repo.updateSessionLearnerContext(scope, sessionId, {
        ...session.learnerContext,
        sessionOverride: override,
      });
      await this.observation(scope, sessionId, 'depth_changed', {
        blockId,
        decisionId: block.decisionId,
        targetId: session.currentCheckpointId,
        payload: { requested, override, durablePreferenceUpdated: false },
        correlationId: block.correlationId,
      });
    }
    return { ok: true, updatedAt: block.updatedAt.toISOString() };
  }

  async submitAnswer(
    principal: InstitutionalStudentPrincipal,
    sessionId: string,
    blockId: string,
    input: PetrosSubmitAnswerInput,
  ) {
    const scope = owner(principal);
    const [session, block, question] = await Promise.all([
      this.requireSession(scope, sessionId),
      this.repo.findBlock(scope, sessionId, blockId),
      this.repo.findQuestionSpec(scope, sessionId, blockId, input.questionId),
    ]);
    if (!block || !question) throw notFound();
    if (session.status !== 'active')
      throw new ConflictException({
        code: 'PETROS_SESSION_NOT_ACTIVE',
        message: 'Resume this session before answering.',
      });
    if (!question.active)
      throw new ConflictException({
        code: 'PETROS_ANSWER_LOCKED',
        message: 'This answer is already locked. Use the active equivalent question.',
      });
    if (block.version !== input.expectedBlockVersion) throw staleBlock();
    const command = await this.repo.beginCommand(
      scope,
      sessionId,
      input.idempotencyKey,
      `answer:${question.id}`,
    );
    if (command.state === 'completed')
      return petrosLearningSessionDocumentSchema.parse(command.response);
    if (command.state === 'in_flight' || !command.row) throw inFlight();

    try {
      const correlationId = randomUUID();
      const evaluated = await this.evaluateAnswer(session, question, input.answer, correlationId);
      const stretches = await this.repo.listStretches(scope, sessionId);
      const currentStretch = stretches.find(
        (stretch) => stretch.equivalenceKey === question.equivalenceKey,
      );
      let transition = ladderTransition(
        currentStretch?.wrongAttemptCount ?? 0,
        currentStretch?.status,
        evaluated.evaluation,
        question,
      );
      if (transition.supportKind === 'worked_solution' && guidedHomework(session)) {
        transition = {
          ...transition,
          supportKind: 'missing_step',
          supportText: question.missingStep,
          needsFollowupQuestion: true,
        };
      }
      const generatedSupport =
        transition.supportKind === 'none'
          ? undefined
          : await this.generateSupport(session, question, transition, correlationId);
      if (generatedSupport?.text)
        transition = { ...transition, supportText: generatedSupport.text };
      const flags = confidenceFlags(evaluated.evaluation.correctness, input.confidence);
      const observationId = randomUUID();
      const occurredAt = new Date();
      const followupQuestion = transition.needsFollowupQuestion
        ? followupQuestionSpec(question, transition, scope)
        : undefined;
      const committed = await this.repo.commitAnswer({
        scope,
        sessionId,
        blockId,
        expectedBlockVersion: input.expectedBlockVersion,
        question,
        observation: {
          id: observationId,
          sessionId,
          institutionId: scope.institutionId,
          studentId: scope.studentId,
          decisionId: block.decisionId,
          blockId,
          questionId: question.id,
          type: 'answer_submitted',
          targetId: question.targetId,
          rawAnswer: input.answer,
          confidence: input.confidence,
          schemaVersion: PETROS_OBSERVATION_SCHEMA_VERSION,
          occurredAt,
          correlationId,
          payload: {
            correctness: evaluated.evaluation.correctness,
            credit: evaluated.evaluation.credit,
            ladderLevel: transition.ladderLevel,
            supportKind: transition.supportKind,
            supportText: transition.supportText,
            highValueMisconception: flags.highValueMisconception,
            fragileSuccess: flags.fragileSuccess,
            recovery: transition.recovery,
            evaluator: evaluated.source,
            evaluationRequestId: evaluated.result?.requestId ?? null,
            supportRequestId: generatedSupport?.result?.requestId ?? null,
          },
        },
        confidenceObservation: {
          sessionId,
          institutionId: scope.institutionId,
          studentId: scope.studentId,
          decisionId: block.decisionId,
          blockId,
          questionId: question.id,
          type: 'confidence_selected',
          targetId: question.targetId,
          confidence: input.confidence,
          schemaVersion: PETROS_OBSERVATION_SCHEMA_VERSION,
          occurredAt,
          correlationId,
          payload: { ...flags },
        },
        ...(input.responseTimeMs == null
          ? {}
          : {
              responseTimeObservation: {
                sessionId,
                institutionId: scope.institutionId,
                studentId: scope.studentId,
                decisionId: block.decisionId,
                blockId,
                questionId: question.id,
                type: 'response_time_recorded',
                targetId: question.targetId,
                schemaVersion: PETROS_OBSERVATION_SCHEMA_VERSION,
                occurredAt,
                correlationId,
                payload: { responseTimeMs: input.responseTimeMs },
              },
            }),
        evaluation: {
          sessionId,
          institutionId: scope.institutionId,
          studentId: scope.studentId,
          questionId: question.id,
          correctness: evaluated.evaluation.correctness,
          creditBasisPoints: Math.round(evaluated.evaluation.credit * 10_000),
          evidence: evaluated.evaluation.evidence,
          errorClass: evaluated.evaluation.errorClass,
          misconception: evaluated.evaluation.misconception,
          feedback: evaluated.evaluation.feedback,
          safeNextHint: evaluated.evaluation.safeNextHint,
          highValueMisconception: flags.highValueMisconception,
          fragileSuccess: flags.fragileSuccess,
          evaluator: evaluated.source,
          functionKey: evaluated.source === 'ai' ? PETROS_ANSWER_EVALUATION_FUNCTION_KEY : null,
          promptVersion: evaluated.result?.promptVersion ?? PETROS_EVALUATION_PROMPT_VERSION,
          schemaVersion: evaluated.result?.schemaVersion ?? PETROS_EVALUATION_SCHEMA_VERSION,
          requestId: evaluated.result?.requestId,
          routeReference: evaluated.result ? routeReference(evaluated.result) : null,
          correlationId,
        },
        ladder: transition,
        rewordedQuestion: followupQuestion,
      });
      if (committed.state === 'stale') throw staleBlock();
      if (committed.state === 'already_answered')
        throw new ConflictException({
          code: 'PETROS_ANSWER_LOCKED',
          message: 'This answer is already locked.',
        });
      await this.event(
        scope,
        sessionId,
        'observation.answer',
        {
          observationId,
          correctness: evaluated.evaluation.correctness,
          confidence: input.confidence,
          ladderLevel: transition.ladderLevel,
          changedNextAction: true,
        },
        correlationId,
        block.decisionId,
        block.id,
      );
      try {
        await this.learnerModels.ingest(scope, {
          schemaVersion: PETROS_LEARNER_EVIDENCE_SCHEMA_VERSION,
          source: 'petros',
          sourceEventId: observationId,
          sourceRecordId: question.id,
          conceptId: canonicalConcept(question.targetId),
          topicId: canonicalConcept(session.topic),
          prerequisiteConceptIds: prerequisiteIds(session.resolvedTopicProfile),
          evidenceKind:
            question.purpose === 'recall'
              ? 'recall'
              : question.purpose === 'guess_first'
                ? 'prerequisite'
                : 'application',
          outcome:
            evaluated.evaluation.correctness === 'incorrect'
              ? 'wrong'
              : evaluated.evaluation.correctness === 'invalid'
                ? 'invalid'
                : evaluated.evaluation.correctness,
          creditBasisPoints: Math.round(evaluated.evaluation.credit * 10_000),
          moveType: block.type as never,
          profileDimension: primaryRepresentation(session.resolvedTopicProfile),
          preEvidenceBasisPoints: null,
          postEvidenceBasisPoints: Math.round(evaluated.evaluation.credit * 10_000),
          responseTimeMs: input.responseTimeMs ?? null,
          hintCount: Math.max(0, transition.ladderLevel),
          confidenceBefore: null,
          confidenceAfter: input.confidence,
          errorCategory: mapLegacyErrorCategory(evaluated.evaluation.errorClass),
          errorConfidenceBasisPoints:
            evaluated.source === 'deterministic'
              ? 9_000
              : evaluated.source === 'ai'
                ? 7_500
                : 2_000,
          evaluatorVersion: evaluated.result?.schemaVersion ?? PETROS_EVALUATION_SCHEMA_VERSION,
          algorithmVersion: PETROS_LEARNER_MODEL_ALGORITHM_VERSION,
          environment: 'production',
          synthetic: false,
          occurredAt: occurredAt.toISOString(),
          metadata: {
            sessionId,
            decisionId: block.decisionId,
            questionPurpose: question.purpose,
            recovery: transition.recovery,
            subjectId: subjectIdFromSession(session),
          },
        });
      } catch (error) {
        await this.event(
          scope,
          sessionId,
          'learner_model.update_failed',
          { sourceEventId: observationId, code: errorCode(error) },
          correlationId,
          block.decisionId,
          block.id,
        );
      }
      return await this.finishWithDocument(scope, sessionId, command.row.id);
    } catch (error) {
      await this.repo.failCommand(command.row.id, errorCode(error));
      throw error;
    }
  }

  async requestHint(
    principal: InstitutionalStudentPrincipal,
    sessionId: string,
    blockId: string,
    input: PetrosRequestHintInput,
  ) {
    const scope = owner(principal);
    const [session, block, question] = await Promise.all([
      this.requireSession(scope, sessionId),
      this.repo.findBlock(scope, sessionId, blockId),
      this.repo.findQuestionSpec(scope, sessionId, blockId, input.questionId),
    ]);
    if (!block || !question) throw notFound();
    if (block.version !== input.expectedBlockVersion) throw staleBlock();
    const command = await this.repo.beginCommand(
      scope,
      sessionId,
      input.idempotencyKey,
      `hint:${question.id}`,
    );
    if (command.state === 'completed')
      return petrosLearningSessionDocumentSchema.parse(command.response);
    if (command.state === 'in_flight' || !command.row) throw inFlight();
    try {
      const correlationId = randomUUID();
      const support = await this.generateSupport(
        session,
        question,
        {
          countedWrong: false,
          wrongAttemptCount: 0,
          ladderLevel: 0,
          status: 'active',
          supportKind: 'hint',
          supportText: question.hint,
          needsRewordedQuestion: false,
          needsFollowupQuestion: false,
          recovery: false,
        },
        correlationId,
      );
      const updated = await this.repo.recordHint({
        scope,
        sessionId,
        blockId,
        expectedBlockVersion: input.expectedBlockVersion,
        observation: {
          sessionId,
          institutionId: scope.institutionId,
          studentId: scope.studentId,
          decisionId: block.decisionId,
          blockId,
          questionId: question.id,
          type: 'hint_requested',
          targetId: question.targetId,
          schemaVersion: PETROS_OBSERVATION_SCHEMA_VERSION,
          occurredAt: new Date(),
          correlationId,
          payload: { hint: support.text, requestId: support.result?.requestId ?? null },
        },
      });
      if (!updated) throw staleBlock();
      return await this.finishWithDocument(scope, sessionId, command.row.id);
    } catch (error) {
      await this.repo.failCommand(command.row.id, errorCode(error));
      throw error;
    }
  }

  async composerQuestion(
    principal: InstitutionalStudentPrincipal,
    sessionId: string,
    input: PetrosComposerQuestionInput,
  ) {
    const scope = owner(principal);
    const session = await this.requireSession(scope, sessionId);
    if (session.version !== input.expectedSessionVersion) throw staleSession();
    const command = await this.repo.beginCommand(
      scope,
      sessionId,
      input.idempotencyKey,
      'composer_question',
    );
    if (command.state === 'completed')
      return petrosLearningSessionDocumentSchema.parse(command.response);
    if (command.state === 'in_flight' || !command.row) throw inFlight();
    try {
      const correlationId = randomUUID();
      const created = await this.repo.createDetour({
        scope,
        sessionId,
        expectedSessionVersion: input.expectedSessionVersion,
        question: input.question,
        observation: {
          sessionId,
          institutionId: scope.institutionId,
          studentId: scope.studentId,
          type: 'question_asked',
          targetId: session.currentCheckpointId,
          payload: { question: input.question, composer: true },
          schemaVersion: PETROS_OBSERVATION_SCHEMA_VERSION,
          occurredAt: new Date(),
          correlationId,
        },
      });
      if (!created) throw staleSession();
      await this.event(
        scope,
        sessionId,
        'composer.redirect_requested',
        { observation: 'question_asked' },
        correlationId,
      );
      return await this.finishWithDocument(scope, sessionId, command.row.id);
    } catch (error) {
      await this.repo.failCommand(command.row.id, errorCode(error));
      throw error;
    }
  }

  async pause(principal: InstitutionalStudentPrincipal, sessionId: string, idempotencyKey: string) {
    return this.lifecycle(principal, sessionId, idempotencyKey, 'pause');
  }

  async resume(
    principal: InstitutionalStudentPrincipal,
    sessionId: string,
    idempotencyKey: string,
  ) {
    return this.lifecycle(principal, sessionId, idempotencyKey, 'resume');
  }

  async close(
    principal: InstitutionalStudentPrincipal,
    sessionId: string,
    input: { idempotencyKey: string; reason: 'student_stopped' | 'goal_met' },
  ) {
    return this.lifecycle(principal, sessionId, input.idempotencyKey, 'close', input.reason);
  }

  async reason(principal: InstitutionalStudentPrincipal, sessionId: string, blockId: string) {
    const scope = owner(principal);
    const block = await this.repo.findBlock(scope, sessionId, blockId);
    if (!block) throw notFound();
    const decisions = await this.repo.listDecisions(scope, sessionId);
    const decision = decisions.find((candidate) => candidate.id === block.decisionId);
    if (!decision) throw notFound();
    return { blockId, reason: decision.studentSafeReason };
  }

  async diagnostics(query: PetrosDecisionDiagnosticQuery, ctx?: ActionContext) {
    const rows = await this.repo.listDecisionDiagnostics(query);
    if (ctx) await this.auditDiagnosticRead(ctx, 'planning_decisions', query, rows.length);
    return rows.map((row) => ({
      id: row.id,
      sessionId: row.sessionId,
      institutionRef: redact(row.institutionId),
      studentRef: redact(row.studentId),
      sequence: row.sequence,
      moveType: row.selectedMoveType,
      originalMoveType: row.originalMoveType,
      status: row.status,
      studentSafeReason: row.studentSafeReason,
      decisionFactors: row.decisionFactors,
      expectedEvidence: row.expectedEvidence,
      policyInterventions: row.policyInterventions,
      selectionPolicy: row.selectionPolicy,
      guessFirst: row.guessFirst,
      observationResponse: row.observationResponse,
      source: row.source,
      functionKey: row.functionKey,
      promptVersion: row.promptVersion,
      schemaVersion: row.schemaVersion,
      routeReference: row.routeReference,
      planRequestId: row.planRequestId,
      renderRequestId: row.renderRequestId,
      resultingBlockId: row.resultingBlockId,
      correlationId: row.correlationId,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async observationDiagnostics(query: PetrosDecisionDiagnosticQuery, ctx?: ActionContext) {
    const rows = await this.repo.listObservationDiagnostics(query);
    if (ctx) await this.auditDiagnosticRead(ctx, 'observations', query, rows.length);
    return rows.map(({ observation, evaluation }) => ({
      id: observation.id,
      sessionId: observation.sessionId,
      institutionRef: redact(observation.institutionId),
      studentRef: redact(observation.studentId),
      type: observation.type,
      targetId: observation.targetId,
      decisionId: observation.decisionId,
      blockId: observation.blockId,
      questionId: observation.questionId,
      confidence: observation.confidence,
      correctness: evaluation?.correctness ?? null,
      credit: evaluation ? evaluation.creditBasisPoints / 10_000 : null,
      highValueMisconception: evaluation?.highValueMisconception ?? false,
      fragileSuccess: evaluation?.fragileSuccess ?? false,
      errorClass: evaluation?.errorClass ?? null,
      evaluator: evaluation?.evaluator ?? null,
      functionKey:
        evaluation?.functionKey ??
        (observation.type === 'hint_requested' ? PETROS_HINT_FUNCTION_KEY : null),
      promptVersion: evaluation?.promptVersion ?? null,
      schemaVersion: evaluation?.schemaVersion ?? observation.schemaVersion,
      requestId: evaluation?.requestId ?? stringPayload(observation.payload, 'requestId'),
      routeReference: evaluation?.routeReference ?? null,
      correlationId: observation.correlationId,
      ladderLevel: numericPayload(observation.payload, 'ladderLevel'),
      supportKind: stringPayload(observation.payload, 'supportKind'),
      occurredAt: observation.occurredAt.toISOString(),
    }));
  }

  private auditDiagnosticRead(
    ctx: ActionContext,
    view: string,
    query: PetrosDecisionDiagnosticQuery,
    rowCount: number,
  ) {
    return this.audit.logAudit({
      ...baseAudit(ctx),
      action: 'petros.diagnostics.view',
      module: 'petros',
      entityType: 'petros_diagnostic_view',
      entityId: query.sessionId,
      newState: {
        view,
        rowCount,
        filters: { ...query, sessionId: query.sessionId ? redact(query.sessionId) : undefined },
      },
    } as Parameters<AuditWriter['logAudit']>[0]);
  }

  private async evaluateAnswer(
    session: PetrosLearningSession,
    question: PetrosQuestionSpec,
    answer: string,
    correlationId: string,
  ): Promise<{
    evaluation: PetrosAnswerEvaluation;
    source: 'deterministic' | 'ai' | 'safe_fallback';
    result?: PetrosAiExecuteResult;
  }> {
    if (question.evaluationMode === 'deterministic') {
      return { evaluation: deterministicEvaluate(question, answer), source: 'deterministic' };
    }
    try {
      const requestId = randomUUID();
      const result = await this.gateway.execute({
        context: {
          requestId,
          functionKey: PETROS_ANSWER_EVALUATION_FUNCTION_KEY,
          topic: session.topic,
          sessionType: session.sessionType,
          inputModality: 'text',
          institutionId: session.institutionId,
          studentId: session.studentId,
          estimatedTokens: Math.ceil(
            JSON.stringify({ question: question.prompt, rubric: question.rubric, answer }).length /
              4,
          ),
          currentCostMicros: 0,
          previousFailures: 0,
        },
        system: `Evaluate one committed learner answer. Return strict JSON only. Distinguish correct, incorrect, partial, and invalid input. Give concise evidence, the most precise safe error class available, effort-aware feedback, and a next hint that does not expose hidden reasoning. Never mention providers, models, internal scores, or chain-of-thought.`,
        input: [
          {
            type: 'text',
            text: JSON.stringify({
              prompt: question.prompt,
              responseType: question.responseType,
              choices: question.choices,
              rubric: question.rubric,
              acceptableAnswers: question.acceptableAnswers,
              committedAnswer: answer,
            }),
          },
        ],
        responseSchema: zodToJsonSchema(petrosAnswerEvaluationSchema, {
          $refStrategy: 'none',
        }) as Record<string, unknown>,
        sessionId: session.id,
        correlationId,
        metadata: {
          stage: 3,
          loopStep: 'ANSWER_EVALUATION',
          questionId: question.id,
          door: session.sourceContext?.door ?? 'student_portal',
          sessionType: session.sessionType,
        },
        cacheTtlSeconds: 0,
      });
      return {
        evaluation: petrosAnswerEvaluationSchema.parse(result.content),
        source: 'ai',
        result,
      };
    } catch {
      return { evaluation: safeFallbackEvaluation(answer), source: 'safe_fallback' };
    }
  }

  private async generateSupport(
    session: PetrosLearningSession,
    question: PetrosQuestionSpec,
    transition: LadderTransition,
    correlationId: string,
  ): Promise<{ text: string; result?: PetrosAiExecuteResult }> {
    const fallback =
      transition.supportKind === 'missing_step'
        ? question.missingStep
        : transition.supportKind === 'worked_solution'
          ? question.workedSolution
          : transition.supportKind === 'stuck_path'
            ? (transition.supportText ?? question.workedSolution)
            : question.hint;
    try {
      const requestId = randomUUID();
      const result = await this.gateway.execute({
        context: {
          requestId,
          functionKey: PETROS_HINT_FUNCTION_KEY,
          topic: session.topic,
          sessionType: session.sessionType,
          inputModality: 'text',
          institutionId: session.institutionId,
          studentId: session.studentId,
          estimatedTokens: Math.ceil(
            JSON.stringify({ prompt: question.prompt, transition: transition.supportKind }).length /
              4,
          ),
          currentCostMicros: 0,
          previousFailures: 0,
        },
        system: `Return strict JSON with supportText. For hint, do not reveal the complete answer. For missing_step, name the precise missing concept or step. For worked_solution, show the full solution only when the supplied session policy permits it. Active guided-homework policy never permits a complete or final answer: use the next setup step and a reattempt prompt instead. Never reveal chain-of-thought, provider details, or an answer before the requested ladder level.`,
        input: [
          {
            type: 'text',
            text: JSON.stringify({
              question: question.prompt,
              supportLevel: transition.supportKind,
              registeredFallback: fallback,
              workedSolution:
                transition.supportKind === 'worked_solution' && !guidedHomework(session)
                  ? question.workedSolution
                  : undefined,
              homeworkMode: guidedHomework(session) ? 'guided_homework' : 'normal',
            }),
          },
        ],
        responseSchema: zodToJsonSchema(supportResponseSchema, { $refStrategy: 'none' }) as Record<
          string,
          unknown
        >,
        sessionId: session.id,
        correlationId,
        metadata: {
          stage: 3,
          loopStep: 'HINT_GENERATION',
          questionId: question.id,
          ladderLevel: transition.ladderLevel,
          door: session.sourceContext?.door ?? 'student_portal',
          sessionType: session.sessionType,
        },
        cacheTtlSeconds: 0,
      });
      return { text: supportResponseSchema.parse(result.content).supportText, result };
    } catch {
      return { text: fallback };
    }
  }

  private async state(
    scope: PetrosOwnerScope,
    session: PetrosLearningSession,
  ): Promise<PetrosSessionState> {
    const [decisions, blocks, observations, evaluations, stretches, detours, learnerSnapshot] =
      await Promise.all([
        this.repo.listDecisions(scope, session.id),
        this.repo.listBlocks(scope, session.id),
        this.repo.listObservations(scope, session.id),
        this.repo.listEvaluations(scope, session.id),
        this.repo.listStretches(scope, session.id),
        this.repo.listDetours(scope, session.id),
        this.learnerModels.snapshot({
          scope,
          topic: session.topic,
          prerequisiteConceptIds: prerequisiteIds(session.resolvedTopicProfile),
          sessionOverride: sessionOverride(session.learnerContext),
        }),
      ]);
    const blockByDecision = new Map(blocks.map((block) => [block.decisionId, block]));
    const elapsedSeconds = elapsed(session);
    return petrosSessionStateSchema.parse({
      stateVersion: PETROS_SESSION_STATE_VERSION,
      sessionId: session.id,
      studentId: session.studentId,
      institutionId: session.institutionId,
      sessionType: session.sessionType,
      topic: session.topic,
      currentGoal: session.currentGoal,
      time: {
        budgetSeconds: session.timeBudgetSeconds,
        elapsedSeconds,
        remainingSeconds: Math.max(0, session.timeBudgetSeconds - elapsedSeconds),
      },
      moves: {
        maximum: session.maxMoves,
        used: decisions.length,
        remaining: Math.max(0, session.maxMoves - decisions.length),
      },
      checkpointPlan: session.checkpoints,
      currentCheckpointId: session.currentCheckpointId,
      priorMoves: decisions.map((decision) => {
        const block = blockByDecision.get(decision.id);
        return {
          decisionId: decision.id,
          sequence: decision.sequence,
          decision: rowToDecision(decision),
          renderedBlockReference: block ? { id: block.id, type: block.type } : null,
          status: decision.status,
          observedOutcome: decision.observedOutcome,
        };
      }),
      learnerContext: session.learnerContext,
      learnerSnapshot,
      topicContext: session.topicContext,
      resolvedTopicProfile: session.resolvedTopicProfile,
      sourceContext: session.sourceContext,
      observations: {
        recent: recentObservationState(observations, evaluations),
        summarizedOutcomes: observationSummary(evaluations, detours, stretches),
      },
      promptVersion: PETROS_PLAN_PROMPT_VERSION,
      outputSchemaVersion: PETROS_PLAN_SCHEMA_VERSION,
    });
  }

  private async plan(
    state: PetrosSessionState,
    correlationId: string,
  ): Promise<{
    decision: PetrosPlanDecision;
    source: 'ai' | 'deterministic_fallback';
    result?: PetrosAiExecuteResult;
  }> {
    if (
      state.moves.remaining <= 0 &&
      !state.priorMoves.some((move) => move.decision.selectedMoveType === 'artifact_commit')
    ) {
      return { decision: deterministicPlan(state), source: 'deterministic_fallback' };
    }
    try {
      const requestId = randomUUID();
      const result = await this.gateway.execute({
        context: {
          requestId,
          functionKey: PETROS_PLAN_FUNCTION_KEY,
          topic: state.topic,
          sessionType: state.sessionType,
          inputModality: 'text',
          institutionId: state.institutionId,
          studentId: state.studentId,
          estimatedTokens: Math.ceil(JSON.stringify(state).length / 4),
          currentCostMicros: 0,
          previousFailures: 0,
        },
        system: PETROS_PLAN_SYSTEM_PROMPT,
        input: [{ type: 'text', text: JSON.stringify(state) }],
        responseSchema: zodToJsonSchema(petrosPlanDecisionSchema, {
          $refStrategy: 'none',
        }) as Record<string, unknown>,
        sessionId: state.sessionId,
        correlationId,
        metadata: {
          stage: 3,
          loopStep: 'PLAN',
          observationCount: state.observations.recent.length,
          door: state.sourceContext?.door ?? 'student_portal',
          sessionType: state.sessionType,
        },
        cacheTtlSeconds: 0,
      });
      return { decision: petrosPlanDecisionSchema.parse(result.content), source: 'ai', result };
    } catch {
      return { decision: deterministicPlan(state), source: 'deterministic_fallback' };
    }
  }

  private async renderDecision(
    scope: PetrosOwnerScope,
    state: PetrosSessionState,
    row: PetrosPlanningDecisionRow,
    decision: PetrosPlanDecision,
  ) {
    let content: PetrosTeachingBlockContent;
    let delivery: 'ai' | 'deterministic_fallback' = 'ai';
    let result: PetrosAiExecuteResult | undefined;
    try {
      const requestId = randomUUID();
      result = await this.gateway.execute({
        context: {
          requestId,
          functionKey: PETROS_MOVE_RENDER_FUNCTION_KEYS[decision.selectedMoveType],
          topic: state.topic,
          sessionType: state.sessionType,
          inputModality: 'text',
          institutionId: state.institutionId,
          studentId: state.studentId,
          estimatedTokens: Math.ceil(JSON.stringify({ decision, state }).length / 4),
          currentCostMicros: 0,
          previousFailures: 0,
        },
        system: PETROS_RENDER_SYSTEM_PROMPT,
        input: [{ type: 'text', text: JSON.stringify({ decision, sessionState: state }) }],
        responseSchema: zodToJsonSchema(petrosTeachingBlockContentSchema, {
          $refStrategy: 'none',
        }) as Record<string, unknown>,
        sessionId: state.sessionId,
        correlationId: row.correlationId,
        metadata: {
          stage: 4,
          loopStep: 'RENDER',
          decisionId: row.id,
          moveType: decision.selectedMoveType,
          door: state.sourceContext?.door ?? 'student_portal',
          sessionType: state.sessionType,
        },
        cacheTtlSeconds: 0,
      });
      content = petrosTeachingBlockContentSchema.parse(result.content);
      if (content.type !== decision.selectedMoveType) throw new Error('RENDER_MOVE_MISMATCH');
    } catch {
      content = deterministicRender(decision, state);
      delivery = 'deterministic_fallback';
    }
    const latestSession = await this.requireSession(scope, state.sessionId);
    if (latestSession.status !== 'active') {
      await this.event(
        scope,
        state.sessionId,
        'render.cancelled',
        { reason: latestSession.status },
        row.correlationId,
        row.id,
      );
      return;
    }
    const priorRoute =
      row.routeReference && typeof row.routeReference === 'object' ? row.routeReference : {};
    const blockId = randomUUID();
    const questions = buildQuestionSpecs(content, {
      blockId,
      sessionId: state.sessionId,
      institutionId: scope.institutionId,
      studentId: scope.studentId,
      decision,
      deterministic: delivery === 'deterministic_fallback',
      sourceContext: state.sourceContext,
      moveSequence: row.sequence,
    });
    const block = await this.repo.insertRenderedBlock(
      row.id,
      {
        id: blockId,
        sessionId: state.sessionId,
        decisionId: row.id,
        institutionId: scope.institutionId,
        studentId: scope.studentId,
        sequence: row.sequence,
        type: content.type,
        status: 'current',
        content,
        interactionState: initialInteraction(content),
        observedOutcome: null,
        delivery,
        functionKey: PETROS_MOVE_RENDER_FUNCTION_KEYS[decision.selectedMoveType],
        promptVersion: result?.promptVersion ?? PETROS_RENDER_PROMPT_VERSION,
        schemaVersion: result?.schemaVersion ?? PETROS_RENDER_SCHEMA_VERSION,
        routeReference: result ? routeReference(result) : null,
        correlationId: row.correlationId,
      },
      {
        renderRequestId: result?.requestId,
        routeReference: {
          ...priorRoute,
          render: result ? routeReference(result) : { source: 'deterministic_fallback' },
        },
      },
      questions,
    );
    await this.event(
      scope,
      state.sessionId,
      'render.block',
      { blockType: content.type, delivery },
      row.correlationId,
      row.id,
      block.id,
    );
    if (delivery === 'deterministic_fallback') {
      await this.event(
        scope,
        state.sessionId,
        'fallback.deterministic',
        { step: 'RENDER', studentMessage: 'provider_neutral' },
        row.correlationId,
        row.id,
        block.id,
      );
    }
  }

  private async lifecycle(
    principal: InstitutionalStudentPrincipal,
    sessionId: string,
    idempotencyKey: string,
    action: 'pause' | 'resume' | 'close',
    closeReason: 'student_stopped' | 'goal_met' = 'student_stopped',
  ) {
    const scope = owner(principal);
    const session = await this.requireSession(scope, sessionId);
    const command = await this.repo.beginCommand(scope, sessionId, idempotencyKey, action);
    if (command.state === 'completed')
      return petrosLearningSessionDocumentSchema.parse(command.response);
    if (command.state === 'in_flight' || !command.row) throw inFlight();
    try {
      if (action === 'pause' && session.status === 'active') {
        await this.repo.setSessionStatus(scope, sessionId, {
          status: 'paused',
          elapsedSeconds: elapsed(session),
          activeSince: null,
        });
      } else if (action === 'resume' && session.status === 'paused') {
        await this.repo.setSessionStatus(scope, sessionId, {
          status: 'active',
          elapsedSeconds: session.elapsedSeconds,
          activeSince: new Date(),
        });
      } else if (action === 'close' && session.status !== 'closed') {
        await this.repo.setSessionStatus(scope, sessionId, {
          status: 'closed',
          elapsedSeconds: elapsed(session),
          activeSince: null,
          closeReason,
          closedAt: new Date(),
        });
      }
      await this.observation(
        scope,
        sessionId,
        action === 'pause'
          ? 'session_paused'
          : action === 'resume'
            ? 'session_resumed'
            : 'session_abandoned',
        { payload: action === 'close' ? { reason: closeReason } : {} },
      );
      await this.event(
        scope,
        sessionId,
        `session.${action}`,
        action === 'close' ? { reason: closeReason } : {},
      );
      if (action === 'pause')
        await this.repo.recordDoorLifecycle(scope, sessionId, 'paused');
      if (action === 'close')
        await this.finishContextualOrigin(scope, session, sessionId, closeReason);
      return await this.finishWithDocument(scope, sessionId, command.row.id);
    } catch (error) {
      await this.repo.failCommand(command.row.id, errorCode(error));
      throw error;
    }
  }

  private async requireSession(scope: PetrosOwnerScope, sessionId: string) {
    let session = await this.repo.findSession(scope, sessionId);
    if (!session) throw notFound();
    if (!petrosResolvedTopicProfileSchema.safeParse(session.resolvedTopicProfile).success) {
      const resolved = await this.topicProfiles.resolveForSession({
        institutionId: scope.institutionId,
        topic: session.topic,
        profileContext: session.topicContext,
      });
      const upgraded = await this.repo.attachResolvedTopicProfile(scope, sessionId, {
        topicProfileId: resolved.profileId,
        topicProfileVersionId: resolved.canonicalVersionId,
        resolvedTopicProfile: resolved,
        stateVersion: PETROS_SESSION_STATE_VERSION,
        promptVersion: PETROS_PLAN_PROMPT_VERSION,
        outputSchemaVersion: PETROS_PLAN_SCHEMA_VERSION,
      });
      if (!upgraded) throw notFound();
      session = upgraded;
    }
    return session;
  }

  private async finishWithDocument(scope: PetrosOwnerScope, sessionId: string, commandId: string) {
    const document = await this.document(scope, sessionId);
    await this.repo.finishCommand(commandId, document as unknown as Record<string, unknown>);
    return document;
  }

  private async finishContextualOrigin(
    scope: PetrosOwnerScope,
    session: PetrosLearningSession,
    sessionId: string,
    reason: string,
  ) {
    const completed = reason === 'goal_met' || reason === 'max_moves' || reason === 'time_up';
    await this.repo.recordDoorLifecycle(
      scope,
      sessionId,
      completed ? 'completed' : 'abandoned',
      reason,
    );
    const pathItemId =
      session.sourceContext && typeof session.sourceContext.pathItemId === 'string'
        ? session.sourceContext.pathItemId
        : null;
    if (pathItemId && reason === 'goal_met')
      await this.repo.completePathItemFromEvidence(scope, sessionId, pathItemId);
  }

  private event(
    scope: PetrosOwnerScope,
    sessionId: string,
    type: string,
    payload: Record<string, unknown>,
    correlationId: string = randomUUID(),
    decisionId?: string,
    blockId?: string,
  ) {
    return this.repo.recordEvent({
      sessionId,
      institutionId: scope.institutionId,
      studentId: scope.studentId,
      decisionId,
      blockId,
      type,
      payload,
      correlationId,
    });
  }

  private observation(
    scope: PetrosOwnerScope,
    sessionId: string,
    type: (typeof schema.petrosObservations.$inferInsert)['type'],
    values: {
      decisionId?: string;
      blockId?: string;
      questionId?: string;
      targetId?: string;
      payload?: Record<string, unknown>;
      correlationId?: string;
    } = {},
  ) {
    return this.repo.recordObservation({
      sessionId,
      institutionId: scope.institutionId,
      studentId: scope.studentId,
      decisionId: values.decisionId,
      blockId: values.blockId,
      questionId: values.questionId,
      type,
      targetId: values.targetId,
      payload: values.payload ?? {},
      schemaVersion: PETROS_OBSERVATION_SCHEMA_VERSION,
      occurredAt: new Date(),
      correlationId: values.correlationId ?? randomUUID(),
    });
  }
}

function owner(principal: InstitutionalStudentPrincipal): PetrosOwnerScope {
  return { institutionId: principal.institutionId, studentId: principal.studentId };
}

function elapsed(session: PetrosLearningSession) {
  const active =
    session.status === 'active' && session.activeSince
      ? Math.max(0, Math.floor((Date.now() - session.activeSince.getTime()) / 1_000))
      : 0;
  return Math.max(0, session.elapsedSeconds + active);
}

function checkpointPlan(maxMoves: number) {
  const labels = ['Find the useful entry', 'Build the idea', 'Bring it back', 'Make it yours'];
  return Array.from({ length: maxMoves }, (_, index) => ({
    id: `checkpoint-${index + 1}`,
    label: labels[index] ?? `Checkpoint ${index + 1}`,
    status: index === 0 ? ('current' as const) : ('pending' as const),
  }));
}

function advanceCheckpoints(
  checkpoints: PetrosLearningSession['checkpoints'],
  effect: { checkpointId?: string; effect?: string },
) {
  const index = Math.max(
    0,
    checkpoints.findIndex((checkpoint) => checkpoint.id === effect.checkpointId),
  );
  return checkpoints.map((checkpoint, candidate) => ({
    ...checkpoint,
    status:
      candidate <= index
        ? ('complete' as const)
        : candidate === index + 1
          ? ('current' as const)
          : ('pending' as const),
  }));
}

function rowToDecision(row: PetrosPlanningDecisionRow): PetrosPlanDecision {
  return petrosPlanDecisionSchema.parse({
    schemaVersion: PETROS_PLAN_SCHEMA_VERSION,
    selectedMoveType: row.selectedMoveType,
    targetConcept: row.targetConcept,
    studentSafeReason: row.studentSafeReason,
    decisionFactors: row.decisionFactors,
    moveParameters: row.moveParameters,
    expectedEvidence: row.expectedEvidence,
    progressEffect: row.progressEffect,
    canStream: row.canStream,
    termination: row.termination,
    guessFirst: row.guessFirst,
    observationResponse: row.observationResponse,
    selectionPolicy: row.selectionPolicy,
  });
}

function routeReference(result: PetrosAiExecuteResult) {
  return {
    providerKey: result.providerKey,
    modelKey: result.modelKey,
    fallbackTier: result.fallbackTier,
    cached: result.cached,
  };
}

function topicProfileSummary(value: Record<string, unknown>) {
  const resolved = petrosResolvedTopicProfileSchema.parse(value);
  return {
    profileId: resolved.profileId,
    canonicalVersionId: resolved.canonicalVersionId,
    canonicalVersion: resolved.canonicalVersion,
    resolution: resolved.resolution,
    overrideVersion: resolved.overrideVersion,
    knowledgeTypes: resolved.profile.dimensions.knowledgeTypes.map((item) => item.type),
    representations: resolved.profile.dimensions.representations.map((item) => item.type),
    cacheKey: resolved.profile.cache.key,
  };
}

function initialInteraction(content: PetrosTeachingBlockContent): Record<string, unknown> {
  if (content.type === 'layered_explanation') return { expandedLayerIds: [] };
  if (content.type === 'worked_example' || content.type === 'derivation')
    return { revealedStepCount: 1 };
  if (content.type === 'story') return { revealedEventCount: 1 };
  if (content.type === 'hook' || content.type === 'predict_then_reveal') return { revealed: false };
  if (content.type === 'diagram') return { diagramExpanded: false, diagramNodeLabels: {} };
  if (content.type === 'artifact_commit')
    return { selectedProposalIds: [], artifactsDeclined: false };
  if (content.type === 'recall_check') return { answers: {} };
  return { response: '' };
}

function buildQuestionSpecs(
  content: PetrosTeachingBlockContent,
  context: {
    blockId: string;
    sessionId: string;
    institutionId: string;
    studentId: string;
    decision: PetrosPlanDecision;
    deterministic: boolean;
    sourceContext: Record<string, unknown> | null;
    moveSequence: number;
  },
): Array<typeof schema.petrosQuestionSpecs.$inferInsert> {
  if (context.decision.guessFirst.status !== 'required') return [];
  const targetBase = context.decision.guessFirst.targetId ?? context.decision.targetConcept;
  const documentQuestion =
    content.type === 'recall_check'
      ? null
      : documentQuestionFromSourceContext(context.sourceContext, context.moveSequence);
  const common = (values: {
    key: string;
    prompt: string;
    responseType: 'short_answer' | 'single_choice';
    choices?: Array<{ id: string; label: string }>;
    purpose: 'guess_first' | 'recall';
    correctChoiceId?: string;
    acceptableAnswers?: string[];
    hint: string;
    missingStep: string;
    workedSolution: string;
    rewordedPrompt: string;
  }) => {
    const id = randomUUID();
    const prompt = documentQuestion ?? values.prompt;
    const responseType = documentQuestion ? 'short_answer' : values.responseType;
    const rewordedPrompt = documentQuestion
      ? documentRetryPrompt(documentQuestion)
      : values.rewordedPrompt;
    return {
      id,
      sessionId: context.sessionId,
      blockId: context.blockId,
      institutionId: context.institutionId,
      studentId: context.studentId,
      rootQuestionId: id,
      parentQuestionId: null,
      targetId: `${targetBase}:${values.key}`.slice(0, 160),
      equivalenceKey: createHash('sha256')
        .update(`${context.sessionId}:${context.decision.targetConcept}:${values.key}`)
        .digest('hex')
        .slice(0, 48),
      prompt,
      responseType,
      choices: documentQuestion ? null : (values.choices ?? null),
      purpose: values.purpose,
      evaluationMode:
        !documentQuestion &&
        context.deterministic &&
        (Boolean(values.correctChoiceId) || Boolean(values.acceptableAnswers?.length))
          ? 'deterministic'
          : 'ai',
      acceptableAnswers: documentQuestion ? [] : (values.acceptableAnswers ?? []),
      correctChoiceId: documentQuestion ? null : (values.correctChoiceId ?? null),
      rubric: documentQuestion
        ? `Evaluate whether the learner makes a relevant, source-grounded attempt to answer: “${documentQuestion}” Partial credit must not count as a conceptual failure.`
        : `Evaluate whether the learner identifies the useful relationship or decision for ${context.decision.targetConcept}. Partial credit must not count as a conceptual failure.`,
      hint: values.hint,
      missingStep: values.missingStep,
      workedSolution: values.workedSolution,
      rewordedPrompt,
      attemptOrdinal: 1,
      active: true,
    };
  };

  if (content.type === 'layered_explanation') {
    return [
      common(
        context.deterministic
          ? {
              key: 'guess',
              prompt: `Before opening the explanation, which approach best finds the central relationship in ${context.decision.targetConcept}?`,
              responseType: 'single_choice',
              choices: [
                {
                  id: 'relationship',
                  label: 'Name what changes, what stays fixed, and how they connect.',
                },
                {
                  id: 'details',
                  label: 'List every detail first and decide on the relationship afterward.',
                },
                {
                  id: 'length',
                  label: 'Choose the longest explanation because it is probably the most complete.',
                },
              ],
              purpose: 'guess_first',
              correctChoiceId: 'relationship',
              hint: 'Look for the choice that identifies a relationship before collecting details.',
              missingStep:
                'The missing step is identifying what changes and what stays fixed before listing details.',
              workedSolution: content.firstLayer,
              rewordedPrompt: `For ${context.decision.targetConcept}, which method keeps the central relationship visible?`,
            }
          : {
              key: 'guess',
              prompt: `Before opening the explanation, what do you think the central relationship in ${context.decision.targetConcept} is? A rough guess is enough.`,
              responseType: 'short_answer',
              purpose: 'guess_first',
              hint: 'Name what changes, what stays fixed, and how the two are connected.',
              missingStep:
                'The missing step is identifying the relationship before listing details.',
              workedSolution: content.firstLayer,
              rewordedPrompt: `What relationship would you use to explain ${context.decision.targetConcept} to someone seeing it for the first time?`,
            },
      ),
    ];
  }
  if (content.type === 'worked_example') {
    const firstPrediction = content.steps.find((step) => step.predictionPrompt)?.predictionPrompt;
    return [
      common(
        context.deterministic
          ? {
              key: 'first-step',
              prompt: `Which first move best fits this problem? ${content.problemStatement}`,
              responseType: 'single_choice',
              choices: [
                {
                  id: 'demand',
                  label: `Start by ${content.steps[0]?.title.toLocaleLowerCase() ?? 'identifying the demand'}.`,
                },
                { id: 'finish', label: 'Write a final answer before selecting the method.' },
                {
                  id: 'longest',
                  label: 'Use the longest available method without checking the prompt.',
                },
              ],
              purpose: 'guess_first',
              correctChoiceId: 'demand',
              hint: 'Start with the command word and the information the problem actually gives you.',
              missingStep: `The missing step is ${content.steps[0]?.title.toLocaleLowerCase() ?? 'identifying the demand'} before choosing a method.`,
              workedSolution: content.steps
                .map((step, index) => `${index + 1}. ${step.title}: ${step.explanation}`)
                .join('\n'),
              rewordedPrompt: `For an equivalent ${context.decision.targetConcept} problem, what should happen before a method is selected?`,
            }
          : {
              key: 'first-step',
              prompt:
                firstPrediction ??
                `Commit to the first useful step for this problem: ${content.problemStatement}`,
              responseType: 'short_answer',
              purpose: 'guess_first',
              hint: 'Start with the command word and the information the problem actually gives you.',
              missingStep: `The missing step is ${content.steps[0]?.title.toLocaleLowerCase() ?? 'identifying the demand'} before choosing a method.`,
              workedSolution: content.steps
                .map((step, index) => `${index + 1}. ${step.title}: ${step.explanation}`)
                .join('\n'),
              rewordedPrompt: `For an equivalent ${context.decision.targetConcept} problem, which clue would you inspect before selecting the first step?`,
            },
      ),
    ];
  }
  if (content.type === 'prerequisite_check') {
    return content.prerequisites.map((prerequisite) =>
      common({
        key: prerequisite.key,
        prompt: `Which statement best shows that ${prerequisite.label} is ready to use?`,
        responseType: context.deterministic ? 'single_choice' : 'short_answer',
        ...(context.deterministic
          ? {
              choices: [
                {
                  id: 'ready',
                  label: `I can state the controlling idea in ${prerequisite.label} and apply it.`,
                },
                {
                  id: 'seen',
                  label: `I recognise the name ${prerequisite.label}, so no application is needed.`,
                },
                {
                  id: 'skip',
                  label: 'It is safe to skip any prerequisite when the new topic begins.',
                },
              ],
              correctChoiceId: 'ready',
            }
          : {}),
        purpose: 'guess_first',
        hint: `Name the controlling relationship or decision in ${prerequisite.label}.`,
        missingStep: `The missing foundation is applying ${prerequisite.label}, not only recognising its name.`,
        workedSolution: `A ready prerequisite can be stated precisely and applied to a small example.`,
        rewordedPrompt: `Show one small use of ${prerequisite.label} before ${context.decision.targetConcept}.`,
      }),
    );
  }
  if (content.type === 'misconception_demolition') {
    return [
      common({
        key: 'misconception-commitment',
        prompt: content.commitmentPrompt,
        responseType: 'single_choice',
        choices: [
          { id: 'agree', label: 'Agree' },
          { id: 'disagree', label: 'Disagree' },
          { id: 'unsure', label: 'Not sure yet' },
        ],
        purpose: 'guess_first',
        correctChoiceId: 'disagree',
        hint: 'Test the claim against where the matter and energy in the process come from.',
        missingStep:
          'The missing step is tracing the matter or mechanism instead of trusting the familiar wording.',
        workedSolution: `${content.correction} Evidence: ${content.evidence.join('; ')}`,
        rewordedPrompt: `After checking the evidence, is this claim reliable: “${content.misconception}”?`,
      }),
    ];
  }
  if (content.type === 'diagram') {
    const centre = content.nodes[0];
    return [
      common({
        key: 'diagram-centre',
        prompt: `Before opening the diagram, which concept do you expect to sit at the centre of ${context.decision.targetConcept}?`,
        responseType: 'single_choice',
        choices: content.nodes.slice(0, 4).map((node) => ({ id: node.id, label: node.label })),
        purpose: 'guess_first',
        correctChoiceId: centre?.id,
        hint: 'Choose the node that the other relationships support or flow through.',
        missingStep: 'The missing step is finding the hub that organises the other concepts.',
        workedSolution: content.fallbackText,
        rewordedPrompt: `Which node organises the relationships in the ${context.decision.targetConcept} diagram?`,
      }),
    ];
  }
  if (content.type === 'recall_check')
    return content.questions.map((question) => {
      const registeredChoice =
        context.deterministic && question.id === 'key-idea'
          ? 'key'
          : context.deterministic && question.id === 'first-step'
            ? 'clue'
            : undefined;
      const workedSolution = registeredChoice
        ? `A complete response is: ${question.choices?.find((choice) => choice.id === registeredChoice)?.label ?? registeredChoice}`
        : `Build the response around the exact clue or relationship asked for in: “${question.prompt}”`;
      return common({
        key: question.id,
        prompt: question.prompt,
        responseType: question.responseType,
        ...(question.choices ? { choices: question.choices } : {}),
        purpose: 'recall',
        ...(registeredChoice ? { correctChoiceId: registeredChoice } : {}),
        hint: 'Bring back one precise relationship or decision; do not list the whole chapter.',
        missingStep: 'The missing step is selecting the clue that directly answers the prompt.',
        workedSolution,
        rewordedPrompt: `Same target, new wording: ${question.prompt}`,
      });
    });
  const prompt = commitmentPrompt(content, context.decision.targetConcept);
  return [
    common(
      context.deterministic
        ? {
            key: 'commitment',
            prompt,
            responseType: 'single_choice',
            choices: [
              {
                id: 'relationship',
                label: 'Use the controlling relationship or clue before collecting details.',
              },
              {
                id: 'surface',
                label: 'Choose from surface wording without checking the relationship.',
              },
              { id: 'length', label: 'Prefer the longest method regardless of the demand.' },
            ],
            purpose: 'guess_first',
            correctChoiceId: 'relationship',
            hint: 'Look for the option driven by the controlling relationship.',
            missingStep:
              'The missing step is identifying the controlling clue before choosing a response.',
            workedSolution: teachingSummary(content),
            rewordedPrompt: `For ${context.decision.targetConcept}, which clue should control the next move?`,
          }
        : {
            key: 'commitment',
            prompt,
            responseType: 'short_answer',
            purpose: 'guess_first',
            hint: 'Name one controlling relationship or clue. A rough attempt is enough.',
            missingStep:
              'The missing step is naming the controlling clue before seeing the teaching.',
            workedSolution: teachingSummary(content),
            rewordedPrompt: `What clue controls ${context.decision.targetConcept}?`,
          },
    ),
  ];
}

function commitmentPrompt(content: PetrosTeachingBlockContent, topic: string) {
  if (content.type === 'hook' || content.type === 'predict_then_reveal') return content.prompt;
  if (content.type === 'misconception_demolition') return content.commitmentPrompt;
  if (content.type === 'socratic_probe') return content.prompt;
  if (content.type === 'contrast_case')
    return `Before comparing them, what clue could make these two ${topic} cases need different methods?`;
  if (content.type === 'diagram')
    return `Before opening the diagram, which concept do you expect to sit at the centre of ${topic}?`;
  return `Before this ${content.type.replace(/_/g, ' ')}, what do you think controls the main relationship in ${topic}?`;
}

function teachingSummary(content: PetrosTeachingBlockContent) {
  if (content.type === 'hook' || content.type === 'predict_then_reveal') return content.reveal;
  if (content.type === 'misconception_demolition') return content.correction;
  if (content.type === 'socratic_probe') return content.explanationAfterCap;
  if (content.type === 'contrast_case') return content.keyDistinction;
  if (content.type === 'diagram') return content.fallbackText;
  if (content.type === 'analogy')
    return `${content.targetIdea}: ${content.mappings.map((item) => `${item.familiar} maps to ${item.target}`).join('; ')}`;
  if (content.type === 'story') return content.takeaway;
  if (content.type === 'derivation') return content.conclusion;
  if (content.type === 'apply_to_your_world') return content.examples.join('; ');
  return `Use the controlling relationship in ${content.title}.`;
}

function followupQuestionSpec(
  question: PetrosQuestionSpec,
  transition: LadderTransition,
  scope: PetrosOwnerScope,
): typeof schema.petrosQuestionSpecs.$inferInsert {
  return {
    id: randomUUID(),
    sessionId: question.sessionId,
    blockId: question.blockId,
    institutionId: scope.institutionId,
    studentId: scope.studentId,
    rootQuestionId: question.rootQuestionId,
    parentQuestionId: question.id,
    targetId: question.targetId,
    equivalenceKey: question.equivalenceKey,
    prompt: question.rewordedPrompt,
    responseType: question.responseType,
    choices: question.choices,
    purpose: transition.needsRewordedQuestion ? 'reworded_success' : 'equivalent_retry',
    evaluationMode: question.evaluationMode,
    acceptableAnswers: question.acceptableAnswers,
    correctChoiceId: question.correctChoiceId,
    rubric: question.rubric,
    hint: question.hint,
    missingStep: question.missingStep,
    workedSolution: question.workedSolution,
    rewordedPrompt: question.rewordedPrompt,
    attemptOrdinal: question.attemptOrdinal + 1,
    active: true,
  };
}

function publicQuestionStates(
  questions: PetrosQuestionSpec[],
  observations: PetrosObservationRow[],
  evaluations: PetrosEvaluationRow[],
) {
  const evaluationByObservation = new Map(
    evaluations.map((evaluation) => [evaluation.observationId, evaluation]),
  );
  return questions.map((question) => {
    const answerObservations = observations.filter(
      (observation) =>
        observation.questionId === question.id && observation.type === 'answer_submitted',
    );
    const hints = observations.filter(
      (observation) =>
        observation.questionId === question.id && observation.type === 'hint_requested',
    );
    return {
      id: question.id,
      rootQuestionId: question.rootQuestionId,
      parentQuestionId: question.parentQuestionId,
      targetId: question.targetId,
      equivalenceKey: question.equivalenceKey,
      prompt: question.prompt,
      responseType: question.responseType,
      choices: question.choices,
      purpose: question.purpose,
      active: question.active,
      locked: answerObservations.length > 0,
      hints: hints.map((hint) => ({
        observationId: hint.id,
        text: stringPayload(hint.payload, 'hint') ?? 'A hint was requested.',
        createdAt: hint.occurredAt.toISOString(),
      })),
      attempts: answerObservations.map((observation) => {
        const evaluation = evaluationByObservation.get(observation.id);
        return {
          observationId: observation.id,
          questionId: question.id,
          rawAnswer: observation.rawAnswer ?? '',
          confidence: observation.confidence,
          correctness: evaluation?.correctness ?? 'partial',
          credit: evaluation ? evaluation.creditBasisPoints / 10_000 : 0,
          feedback: evaluation?.feedback ?? 'Your response was recorded.',
          why: evaluation?.evidence ?? [],
          errorClass: evaluation?.errorClass ?? 'unknown',
          submittedAt: observation.occurredAt.toISOString(),
          ladderLevel: numericPayload(observation.payload, 'ladderLevel') ?? 0,
          supportKind: stringPayload(observation.payload, 'supportKind') ?? 'none',
          supportText: stringPayload(observation.payload, 'supportText'),
          highValueMisconception: booleanPayload(observation.payload, 'highValueMisconception'),
          fragileSuccess: booleanPayload(observation.payload, 'fragileSuccess'),
          recovery: booleanPayload(observation.payload, 'recovery'),
        };
      }),
    };
  });
}

function observationSummary(
  evaluations: PetrosEvaluationRow[],
  detours: PetrosDetourRow[],
  stretches: PetrosStretchRow[],
) {
  return {
    answered: evaluations.length,
    correct: evaluations.filter((evaluation) => evaluation.correctness === 'correct').length,
    incorrect: evaluations.filter((evaluation) => evaluation.correctness === 'incorrect').length,
    partial: evaluations.filter((evaluation) => evaluation.correctness === 'partial').length,
    highValueMisconceptions: evaluations.filter((evaluation) => evaluation.highValueMisconception)
      .length,
    fragileSuccesses: evaluations.filter((evaluation) => evaluation.fragileSuccess).length,
    openDetours: detours.filter(
      (detour) => detour.status !== 'rejoined' && detour.status !== 'parked',
    ).length,
    activeStruggleLevel: stretches
      .filter((stretch) => stretch.status !== 'recovered')
      .reduce((maximum, stretch) => Math.max(maximum, stretch.ladderLevel), 0),
    activeWrongAttemptCount: stretches
      .filter((stretch) => stretch.status !== 'recovered')
      .reduce((maximum, stretch) => Math.max(maximum, stretch.wrongAttemptCount), 0),
  };
}

function recentObservationState(
  observations: PetrosObservationRow[],
  evaluations: PetrosEvaluationRow[],
) {
  const evaluationByObservation = new Map(
    evaluations.map((evaluation) => [evaluation.observationId, evaluation]),
  );
  return observations.slice(-24).map((observation) => {
    const evaluation = evaluationByObservation.get(observation.id);
    const question = stringPayload(observation.payload, 'question');
    const summary =
      observation.type === 'answer_submitted'
        ? `Answer evaluated ${evaluation?.correctness ?? 'without a final score'} with confidence ${observation.confidence ?? 'not recorded'}.`
        : observation.type === 'question_asked'
          ? `Composer question: ${question ?? 'The learner asked a question.'}`
          : observation.type.replace(/_/g, ' ');
    return {
      id: observation.id,
      type: observation.type,
      blockId: observation.blockId,
      decisionId: observation.decisionId,
      targetId: observation.targetId,
      summary: summary.slice(0, 500),
      occurredAt: observation.occurredAt.toISOString(),
    };
  });
}

function stringPayload(payload: Record<string, unknown>, key: string) {
  return typeof payload[key] === 'string' ? payload[key] : null;
}

function numericPayload(payload: Record<string, unknown>, key: string) {
  return typeof payload[key] === 'number' ? payload[key] : null;
}

function booleanPayload(payload: Record<string, unknown>, key: string) {
  return payload[key] === true;
}

function redact(value: string) {
  return `ref_${createHash('sha256').update(value).digest('hex').slice(0, 12)}`;
}

function notFound() {
  return new NotFoundException({ code: 'PETROS_SESSION_NOT_FOUND', message: 'Session not found.' });
}

function inFlight() {
  return new ConflictException({
    code: 'PETROS_CONTINUE_IN_FLIGHT',
    message: 'The next teaching block is already being prepared.',
  });
}

function staleBlock() {
  return new ConflictException({
    code: 'PETROS_BLOCK_STALE',
    message: 'This question changed. Reload the session before retrying.',
  });
}

function staleSession() {
  return new ConflictException({
    code: 'PETROS_SESSION_STALE',
    message: 'The session changed. Reload it before submitting this question.',
  });
}

function errorCode(error: unknown) {
  return error instanceof Error ? error.name.slice(0, 80) : 'PETROS_COMMAND_FAILED';
}

function canonicalConcept(value: string) {
  return (
    value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 180) || 'unknown-concept'
  );
}

function learnerEngagementAction(
  interactionState: Record<string, unknown>,
  observedOutcome: Record<string, unknown>,
): 'skip' | 'expand' | 'read' {
  if (observedOutcome.skipped === true || interactionState.skipped === true) return 'skip';
  const expandedLayers = Array.isArray(interactionState.expandedLayerIds)
    ? interactionState.expandedLayerIds.length
    : 0;
  const revealedSteps = Number(interactionState.revealedStepCount ?? 0);
  const revealedEvents = Number(interactionState.revealedEventCount ?? 0);
  if (
    expandedLayers > 0 ||
    interactionState.diagramExpanded === true ||
    interactionState.revealed === true ||
    revealedSteps > 1 ||
    revealedEvents > 1
  )
    return 'expand';
  return 'read';
}

function prerequisiteIds(value: Record<string, unknown>) {
  const parsed = petrosResolvedTopicProfileSchema.safeParse(value);
  return parsed.success
    ? parsed.data.profile.dimensions.prerequisites.map((item) => item.conceptKey).slice(0, 12)
    : [];
}

function primaryRepresentation(value: Record<string, unknown>) {
  const parsed = petrosResolvedTopicProfileSchema.safeParse(value);
  const primary = parsed.success
    ? [...parsed.data.profile.dimensions.representations].sort(
        (a, b) => b.weightBasisPoints - a.weightBasisPoints,
      )[0]
    : undefined;
  return primary ? `representation:${primary.type}` : null;
}

function sessionOverride(value: Record<string, unknown>) {
  return value.sessionOverride;
}

function subjectIdFromContext(value: Record<string, unknown>) {
  return typeof value.subjectId === 'string' && /^[0-9a-f-]{36}$/i.test(value.subjectId)
    ? value.subjectId
    : null;
}

function subjectIdFromSession(session: PetrosLearningSession) {
  const direct = subjectIdFromContext(session.topicContext);
  if (direct) return direct;
  const source = session.sourceContext;
  if (!source || typeof source !== 'object' || Array.isArray(source)) return null;
  const assignment = source.assignmentContext;
  if (!assignment || typeof assignment !== 'object' || Array.isArray(assignment)) return null;
  const subjectId = (assignment as Record<string, unknown>).subjectId;
  return typeof subjectId === 'string' && /^[0-9a-f-]{36}$/i.test(subjectId) ? subjectId : null;
}

function requestedDepth(context: Record<string, unknown>) {
  if (context.depth === 'deep' || context.wantsDepth === true) return 4;
  if (context.depth === 'concise') return 1;
  return 2;
}

function assignmentFromContext(source: PetrosCreateLearningSessionInput['sourceContext']) {
  const context = source?.assignmentContext;
  if (!context) return null;
  return {
    assignmentId: context.assignmentId,
    subjectId: context.subjectId,
    relationBasisPoints: context.relationBasisPoints,
    status: context.status,
    opensAt: context.opensAt,
    dueAt: context.dueAt,
    deadlineDate: context.deadlineDate,
    extendedUntil: context.extendedUntil,
    teacherOverride: context.teacherOverride,
  };
}

function guidedHomework(session: PetrosLearningSession) {
  const context = session.sourceContext;
  if (!context || typeof context !== 'object' || Array.isArray(context)) return false;
  const institutional = context.institutionalDecision;
  if (!institutional || typeof institutional !== 'object' || Array.isArray(institutional)) return false;
  const homework = (institutional as Record<string, unknown>).homework;
  return Boolean(
    homework &&
      typeof homework === 'object' &&
      !Array.isArray(homework) &&
      (homework as Record<string, unknown>).mode === 'guided_homework',
  );
}
