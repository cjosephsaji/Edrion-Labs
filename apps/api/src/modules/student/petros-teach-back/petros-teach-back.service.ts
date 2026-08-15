import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import type { AuditWriter } from '@edrion/audit';
import {
  PETROS_LEARNER_EVIDENCE_SCHEMA_VERSION,
  PETROS_LEARNER_MODEL_ALGORITHM_VERSION,
  PETROS_TEACH_BACK_ANALYSIS_VERSION,
  PETROS_TEACH_BACK_FOLLOW_UP_VERSION,
  PETROS_TEACH_BACK_FUNCTIONS,
  PETROS_TEACH_BACK_STATE_VERSION,
  PETROS_TEACH_BACK_VERDICT_VERSION,
  createPetrosTeachBackSessionSchema,
  petrosTeachBackAnalysisSchema,
  petrosTeachBackFollowUpSchema,
  petrosTeachBackSessionDocumentSchema,
  petrosTeachBackVerdictSchema,
  type CorrectPetrosTeachBackSegmentInput,
  type CreatePetrosTeachBackSessionInput,
  type PetrosTeachBackAnalysis,
  type PetrosTeachBackDashboardQuery,
  type PetrosTeachBackFollowUp,
  type PetrosTeachBackHelpInput,
  type PetrosTeachBackLifecycleInput,
  type PetrosTeachBackVerdict,
  type SubmitPetrosTeachBackSegmentInput,
} from '@edrion/schemas';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { AUDIT_WRITER } from '../../../common/tokens';
import { baseAudit, type ActionContext } from '../../../common/action-context';
import {
  PetrosAiGatewayService,
  type PetrosAiExecuteResult,
} from '../../petros-ai-routing/petros-ai-gateway.service';
import { PetrosLearnerModelService } from '../../petros-learner-model/petros-learner-model.service';
import type { InstitutionalStudentPrincipal } from '../student.types';
import { PetrosArtifactsService } from '../petros-artifacts/petros-artifacts.service';
import type { PetrosOwnerScope } from '../petros-loop/petros-loop.repository';
import { PetrosLoopService } from '../petros-loop/petros-loop.service';
import { PetrosTeachBackRepository } from './petros-teach-back.repository';

type SessionRow = NonNullable<Awaited<ReturnType<PetrosTeachBackRepository['find']>>>;

@Injectable()
export class PetrosTeachBackService {
  constructor(
    private readonly repo: PetrosTeachBackRepository,
    private readonly loop: PetrosLoopService,
    private readonly gateway: PetrosAiGatewayService,
    private readonly artifacts: PetrosArtifactsService,
    private readonly learnerModels: PetrosLearnerModelService,
    @Inject(AUDIT_WRITER) private readonly audit: AuditWriter,
  ) {}

  async create(principal: InstitutionalStudentPrincipal, raw: CreatePetrosTeachBackSessionInput) {
    const input = createPetrosTeachBackSessionSchema.parse(raw);
    const scope = owner(principal);
    const maxMoves = Math.max(2, Math.min(8, input.maxMoves));
    if (input.repeatedFromSessionId) await this.require(scope, input.repeatedFromSessionId);
    const coverage = (input.coverageChecklist ?? defaultCoverage(input.topic)).map((item) => ({
      ...item,
      status: 'unseen' as const,
      evidence: [],
    }));
    const learning = await this.loop.create(principal, {
      clientRequestId: input.idempotencyKey,
      sessionType: 'teach_it_back',
      topic: input.topic,
      goal: `Explain ${input.scope || input.topic} clearly enough to help ${input.audienceLabel}.`,
      timeBudgetSeconds: input.timeBudgetSeconds,
      maxMoves,
      learnerContext: {
        language: input.language,
        teachItBack: true,
        voiceOptional: true,
        voiceProductionDeviceQaPassed: false,
      },
      topicContext: {
        reversedTeaching: true,
        audienceLevel: input.audienceLevel,
        coverageChecklist: coverage.map(({ key, label }) => ({ key, label })),
      },
      sourceContext: {
        door: 'teach_it_back',
        label: 'Teach-it-back session',
        emotionalRegister: 'curious_respectful',
        registerFactors: [
          'Student explains first',
          'One grounded junior question at a time',
          'Two probes maximum per gap',
        ],
        policyDisclosures: [
          'The verdict is not a score and never changes official marks.',
          'Voice is optional; Stage 9 physical microphone and device acceptance remains pending.',
          'Nothing is saved as your artifact until you edit and explicitly save it.',
        ],
        returnHref: '/petros',
        returnLabel: 'Back to Petros',
        sourceFingerprint: digest({
          topic: input.topic,
          scope: input.scope,
          audience: input.audienceLevel,
        }),
      },
      profileContext: {
        topicKey: `teach-back:${digest(input.topic).slice(0, 64)}`,
        subjectLabel: input.topic,
      },
    });
    let row = await this.repo.findByLearningSession(scope, learning.id);
    if (!row) {
      row = await this.repo.create({
        learningSessionId: learning.id,
        institutionId: scope.institutionId,
        studentId: scope.studentId,
        stateVersion: PETROS_TEACH_BACK_STATE_VERSION,
        topic: input.topic,
        scope: input.scope,
        audienceLevel: input.audienceLevel,
        audienceLabel: input.audienceLabel,
        mode: input.mode,
        language: input.language,
        coverageChecklist: coverage,
        maxMoves,
        timeBudgetSeconds: input.timeBudgetSeconds,
        activeSince: new Date(),
        repeatedFromSessionId: input.repeatedFromSessionId,
      });
      row ??= await this.repo.findByLearningSession(scope, learning.id);
    }
    if (!row) throw new Error('Teach-it-back session was not persisted.');
    await this.event(
      row,
      'session_started',
      derivedUuid(input.idempotencyKey, 'teach-back-start'),
      {
        payload: {
          repeated: Boolean(input.repeatedFromSessionId),
          voiceOptional: true,
          voiceProductionDeviceQaPassed: false,
        },
      },
    );
    return this.document(scope, row.id);
  }

  async read(principal: InstitutionalStudentPrincipal, sessionId: string) {
    return this.document(owner(principal), sessionId);
  }

  async submit(
    principal: InstitutionalStudentPrincipal,
    sessionId: string,
    input: SubmitPetrosTeachBackSegmentInput,
  ) {
    const scope = owner(principal);
    await this.require(scope, sessionId);
    const command = await this.repo.beginCommand(scope, sessionId, input.idempotencyKey, 'segment');
    if (command.state === 'completed')
      return petrosTeachBackSessionDocumentSchema.parse(command.response);
    if (command.state !== 'started' || !command.row) throw inFlight();
    try {
      const session = await this.requireActive(scope, sessionId, input.expectedVersion);
      if (input.source === 'voice') {
        const media = await this.repo.findMedia(scope, input.mediaId!);
        if (!media || media.kind !== 'voice_turn' || media.state !== 'needs_confirmation') {
          throw new ConflictException({
            code: 'PETROS_TEACH_BACK_VOICE_NOT_CONFIRMED',
            message: 'Review and correct the owner-scoped voice transcript before submitting it.',
          });
        }
      }
      const segmentId = randomUUID();
      const correlationId = randomUUID();
      const analysed = await this.analyse(session, segmentId, input.text, {
        uncertainTranscript: input.source === 'voice' && (input.uncertainTranscript ?? false),
        transcriptionConfidence: input.transcriptionConfidence ?? null,
        correlationId,
      });
      const gap = nextGap(session, analysed.value);
      const capHelpApplied = Boolean(
        analysed.value.primaryGap &&
        session.currentGapFingerprint === fingerprintGap(analysed.value.primaryGap) &&
        session.probesOnCurrentGap >= 2,
      );
      const allowedGap = capHelpApplied ? null : gap;
      const follow = allowedGap
        ? await this.followUp(session, analysed.value, allowedGap.probes, correlationId)
        : null;
      const appended = await this.repo.appendSegment({
        scope,
        sessionId,
        expectedVersion: input.expectedVersion,
        segmentId,
        text: input.text,
        originalTextHash: digest(input.text),
        source: input.source,
        mediaId: input.mediaId ?? null,
        transcriptionConfidenceBasisPoints:
          input.transcriptionConfidence == null
            ? null
            : Math.round(input.transcriptionConfidence * 10_000),
        responseToFollowUpId: input.responseToFollowUpId ?? null,
        analysis: analysed.value,
        analysisRequestId: analysed.result?.requestId ?? null,
        analysisRouteReference: routeReference(analysed.result),
        correlationId,
        nextGap: allowedGap,
        followUp: follow?.value ?? null,
        followUpRequestId: follow?.result?.requestId ?? null,
        followUpRouteReference: routeReference(follow?.result ?? null),
        capHelpApplied,
      });
      if (!appended) throw stale();
      await Promise.all([
        this.functionEvent(
          session,
          'analysis_completed',
          input.idempotencyKey,
          PETROS_TEACH_BACK_FUNCTIONS.analyse,
          analysed,
          {
            segmentId,
            gapType: analysed.value.primaryGap?.type ?? 'none',
            uncertaintyBasisPoints: analysed.value.speechRecognitionUncertain ? 10_000 : 0,
          },
        ),
        follow
          ? this.functionEvent(
              session,
              'follow_up_created',
              derivedUuid(input.idempotencyKey, 'follow-up'),
              PETROS_TEACH_BACK_FUNCTIONS.followUp,
              follow,
              {
                segmentId,
                followUpId: appended.followUp?.id,
                gapType: allowedGap?.type,
                payload: { probeNumber: allowedGap?.probes, oneQuestion: true },
              },
            )
          : Promise.resolve(),
        capHelpApplied
          ? this.event(
              session,
              'two_probe_cap_helped',
              derivedUuid(input.idempotencyKey, 'cap-help'),
              {
                segmentId,
                gapType: analysed.value.primaryGap?.type,
                payload: { policyViolation: false, helpDelivered: true },
              },
            )
          : Promise.resolve(),
      ]);
      let document = await this.document(scope, sessionId);
      const elapsedSeconds = elapsed(appended.session);
      if (
        appended.session.movesUsed >= appended.session.maxMoves ||
        elapsedSeconds >= appended.session.timeBudgetSeconds
      ) {
        document = await this.closeInternal(
          principal,
          appended.session,
          appended.session.version,
          derivedUuid(input.idempotencyKey, 'budget-close'),
          appended.session.movesUsed >= appended.session.maxMoves ? 'max_moves' : 'time_up',
        );
      }
      await this.repo.finishCommand(command.row.id, document as unknown as Record<string, unknown>);
      return document;
    } catch (error) {
      const surfaced =
        error instanceof Error && error.message === 'PETROS_TEACH_BACK_MEDIA_CONFIRMATION_RACE'
          ? new ConflictException({
              code: 'PETROS_TEACH_BACK_VOICE_ALREADY_USED',
              message:
                'That confirmed voice turn was already used. Record a new turn or continue in text.',
            })
          : error;
      await this.repo.failCommand(command.row.id, errorCode(surfaced));
      throw surfaced;
    }
  }

  async correct(
    principal: InstitutionalStudentPrincipal,
    sessionId: string,
    segmentId: string,
    input: CorrectPetrosTeachBackSegmentInput,
  ) {
    const scope = owner(principal);
    await this.require(scope, sessionId);
    const command = await this.repo.beginCommand(scope, sessionId, input.idempotencyKey, 'correct');
    if (command.state === 'completed')
      return petrosTeachBackSessionDocumentSchema.parse(command.response);
    if (command.state !== 'started' || !command.row) throw inFlight();
    try {
      const session = await this.requireActive(scope, sessionId, input.expectedVersion);
      const segment = (await this.repo.listSegments(scope, sessionId)).find(
        (item) => item.id === segmentId,
      );
      if (!segment) throw notFound();
      const correlationId = randomUUID();
      const analysed = await this.analyse(session, segmentId, input.text, {
        uncertainTranscript: false,
        transcriptionConfidence: 1,
        correlationId,
      });
      const gap = nextGap(
        { ...session, currentGapFingerprint: null, probesOnCurrentGap: 0 },
        analysed.value,
      );
      const follow = gap
        ? await this.followUp(session, analysed.value, gap.probes, correlationId)
        : null;
      const corrected = await this.repo.correctSegment({
        scope,
        sessionId,
        segmentId,
        expectedVersion: input.expectedVersion,
        text: input.text,
        analysis: analysed.value,
        analysisRequestId: analysed.result?.requestId ?? null,
        analysisRouteReference: routeReference(analysed.result),
        correlationId,
        nextGap: gap,
        followUp: follow?.value ?? null,
        followUpRequestId: follow?.result?.requestId ?? null,
        followUpRouteReference: routeReference(follow?.result ?? null),
      });
      if (!corrected) throw stale();
      await this.event(session, 'transcript_corrected', input.idempotencyKey, {
        segmentId,
        gapType: analysed.value.primaryGap?.type ?? 'none',
        payload: {
          providerTranscriptRetained: false,
          sourceOfTruth: 'student_correction',
        },
      });
      const document = await this.document(scope, sessionId);
      await this.repo.finishCommand(command.row.id, document as unknown as Record<string, unknown>);
      return document;
    } catch (error) {
      await this.repo.failCommand(command.row.id, errorCode(error));
      throw error;
    }
  }

  async help(
    principal: InstitutionalStudentPrincipal,
    sessionId: string,
    input: PetrosTeachBackHelpInput,
  ) {
    const scope = owner(principal);
    await this.require(scope, sessionId);
    const command = await this.repo.beginCommand(scope, sessionId, input.idempotencyKey, 'help');
    if (command.state === 'completed')
      return petrosTeachBackSessionDocumentSchema.parse(command.response);
    if (command.state !== 'started' || !command.row) throw inFlight();
    try {
      const session = await this.requireActive(scope, sessionId, input.expectedVersion);
      const updated = await this.repo.help({
        scope,
        sessionId,
        expectedVersion: input.expectedVersion,
        followUpId: input.followUpId ?? null,
        action: input.action,
      });
      if (!updated) throw stale();
      await this.event(
        session,
        input.action === 'skip' ? 'follow_up_skipped' : 'help_used',
        input.idempotencyKey,
        {
          followUpId: input.followUpId ?? undefined,
          gapType: session.currentGapType,
          payload: { action: input.action, noVacuumRefusal: true },
        },
      );
      const document = await this.document(scope, sessionId);
      await this.repo.finishCommand(command.row.id, document as unknown as Record<string, unknown>);
      return document;
    } catch (error) {
      await this.repo.failCommand(command.row.id, errorCode(error));
      throw error;
    }
  }

  async pause(
    principal: InstitutionalStudentPrincipal,
    sessionId: string,
    input: PetrosTeachBackLifecycleInput,
  ) {
    const scope = owner(principal);
    await this.require(scope, sessionId);
    const command = await this.repo.beginCommand(scope, sessionId, input.idempotencyKey, 'pause');
    if (command.state === 'completed')
      return petrosTeachBackSessionDocumentSchema.parse(command.response);
    if (command.state !== 'started' || !command.row) throw inFlight();
    try {
      const session = await this.require(scope, sessionId);
      if (session.status !== 'closed') {
        if (session.version !== input.expectedVersion) throw stale();
        const updated = await this.repo.updateLifecycle(scope, sessionId, input.expectedVersion, {
          status: 'paused',
          elapsedSeconds: elapsed(session),
          activeSince: null,
        });
        if (!updated) throw stale();
        await this.event(session, 'session_paused', input.idempotencyKey, {
          payload: { recordingMustStop: true },
        });
      }
      const document = await this.document(scope, sessionId);
      await this.repo.finishCommand(command.row.id, document as unknown as Record<string, unknown>);
      return document;
    } catch (error) {
      await this.repo.failCommand(command.row.id, errorCode(error));
      throw error;
    }
  }

  async resume(
    principal: InstitutionalStudentPrincipal,
    sessionId: string,
    input: PetrosTeachBackLifecycleInput,
  ) {
    const scope = owner(principal);
    await this.require(scope, sessionId);
    const command = await this.repo.beginCommand(scope, sessionId, input.idempotencyKey, 'resume');
    if (command.state === 'completed')
      return petrosTeachBackSessionDocumentSchema.parse(command.response);
    if (command.state !== 'started' || !command.row) throw inFlight();
    try {
      const session = await this.require(scope, sessionId);
      if (session.status !== 'closed') {
        if (session.version !== input.expectedVersion) throw stale();
        const updated = await this.repo.updateLifecycle(scope, sessionId, input.expectedVersion, {
          status: 'active',
          activeSince: new Date(),
        });
        if (!updated) throw stale();
        await this.event(session, 'session_resumed', input.idempotencyKey, {});
      }
      const document = await this.document(scope, sessionId);
      await this.repo.finishCommand(command.row.id, document as unknown as Record<string, unknown>);
      return document;
    } catch (error) {
      await this.repo.failCommand(command.row.id, errorCode(error));
      throw error;
    }
  }

  async close(
    principal: InstitutionalStudentPrincipal,
    sessionId: string,
    input: PetrosTeachBackLifecycleInput,
  ) {
    const session = await this.require(owner(principal), sessionId);
    if (session.status === 'closed') return this.document(owner(principal), sessionId);
    return this.closeInternal(
      principal,
      session,
      input.expectedVersion,
      input.idempotencyKey,
      'student_closed',
    );
  }

  async dashboard(query: PetrosTeachBackDashboardQuery, ctx: ActionContext) {
    const { sessions, events, voiceEvents, artifactEvents } = await this.repo.dashboardRows(query);
    const average = (values: number[]) =>
      values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : 0;
    const byFunction = aggregate(events, (event) => event.functionKey ?? 'non_ai');
    const byProviderModel = aggregate(
      events,
      (event) => `${event.providerKey ?? 'unassigned'}:${event.modelKey ?? 'unassigned'}`,
    );
    const gapTypes = [...new Set(events.map((event) => event.gapType).filter(Boolean))] as string[];
    await this.audit.logAudit({
      ...baseAudit(ctx),
      action: 'petros.teach_back.dashboard.view',
      module: 'petros',
      entityType: 'petros_teach_back_aggregate',
      entityId: query.institutionId ?? 'platform',
      newState: {
        filters: query,
        sessionCount: sessions.length,
        eventCount: events.length,
        contentInspected: false,
      },
    } as Parameters<AuditWriter['logAudit']>[0]);
    return {
      privacy: 'aggregate_only',
      learnerSpeechExposed: false,
      sessions: {
        started: sessions.length,
        completed: sessions.filter((session) => session.status === 'closed').length,
        repeatedVoluntarily: sessions.filter((session) => session.repeatedFromSessionId).length,
        abandonedOrPaused: sessions.filter((session) => session.status === 'paused').length,
        text: sessions.filter((session) => session.mode === 'text').length,
        voice: sessions.filter((session) => session.mode === 'voice').length,
        averageDurationSeconds: average(sessions.map((session) => elapsed(session))),
        averageFollowUps: average(
          sessions.map(
            (session) =>
              events.filter(
                (event) =>
                  event.teachBackSessionId === session.id && event.type === 'follow_up_created',
              ).length,
          ),
        ),
        helpUses: sessions.reduce((sum, session) => sum + session.helpUseCount, 0),
        abandonPoints: [
          ...new Set(
            sessions
              .filter((session) => session.status === 'paused')
              .map((session) => session.movesUsed),
          ),
        ]
          .sort((left, right) => left - right)
          .map((movesUsed) => ({
            movesUsed,
            count: sessions.filter(
              (session) => session.status === 'paused' && session.movesUsed === movesUsed,
            ).length,
          })),
      },
      gaps: gapTypes.map((gapType) => ({
        gapType,
        count: events.filter(
          (event) => event.gapType === gapType && event.type === 'analysis_completed',
        ).length,
      })),
      verdicts: {
        generated: events.filter((event) => event.type === 'verdict_generated').length,
        validationFailures: events.filter(
          (event) =>
            event.functionKey === PETROS_TEACH_BACK_FUNCTIONS.verdict && !event.validationPassed,
        ).length,
        uncertainty: events.filter(
          (event) => event.type === 'verdict_generated' && (event.uncertaintyBasisPoints ?? 0) > 0,
        ).length,
      },
      learnerModelUpdates: events.filter((event) => event.type === 'learner_model_updated').length,
      learnerModelUpdateFailures: events.filter(
        (event) => event.type === 'learner_model_update_failed',
      ).length,
      artifacts: {
        proposed: artifactEvents.filter((event) => event.type === 'proposal.created').length,
        saved: artifactEvents.filter((event) => event.type === 'artifact.saved').length,
      },
      topicGapBuckets: topicGapBuckets(sessions, events),
      twoProbePolicy: {
        capApplied: events.filter((event) => event.type === 'two_probe_cap_helped').length,
        violations: events.filter((event) => event.type === 'two_probe_policy_violation').length,
        target: 0,
      },
      functions: byFunction,
      voiceFunctions: aggregateVoice(voiceEvents),
      providerModels: byProviderModel,
      latency: byFunction.map((row) => ({
        key: row.key,
        averageMs: row.averageMs,
        maximumMs: row.maximumMs,
      })),
      voiceReleaseGate: {
        optional: true,
        stage9PhysicalDeviceQaPassed: false,
        productionReady: false,
      },
    };
  }

  private async closeInternal(
    principal: InstitutionalStudentPrincipal,
    session: SessionRow,
    expectedVersion: number,
    idempotencyKey: string,
    reason: string,
  ) {
    const scope = owner(principal);
    const command = await this.repo.beginCommand(scope, session.id, idempotencyKey, 'close');
    if (command.state === 'completed')
      return petrosTeachBackSessionDocumentSchema.parse(command.response);
    if (command.state !== 'started' || !command.row) throw inFlight();
    try {
      const segments = await this.repo.listSegments(scope, session.id);
      if (!segments.length) {
        throw new ConflictException({
          code: 'PETROS_TEACH_BACK_EXPLANATION_REQUIRED',
          message: 'Explain at least one part before asking for a verdict.',
        });
      }
      const correlationId = randomUUID();
      const verdict = await this.verdict(session, segments, correlationId);
      const block = await this.repo.createArtifactBlock({
        scope,
        learningSessionId: session.learningSessionId,
        topic: session.topic,
        verdict: verdict.value,
        correlationId,
      });
      let artifactBundleId: string | null = null;
      if (verdict.value.recapProposal && block) {
        try {
          const bundle = await this.artifacts.bundle(principal, session.learningSessionId);
          artifactBundleId = bundle.id;
        } catch {
          // The verdict remains valid; the editable proposal can be retried independently.
        }
      }
      const elapsedSeconds = elapsed(session);
      const closed = await this.repo.updateLifecycle(scope, session.id, expectedVersion, {
        status: 'closed',
        verdict: verdict.value,
        artifactBundleId,
        elapsedSeconds,
        activeSince: null,
        closeReason: reason,
        closedAt: new Date(),
      });
      if (!closed) throw stale();
      await this.repo.closeLearningSession(scope, session.learningSessionId, elapsedSeconds);
      await this.functionEvent(
        session,
        'verdict_generated',
        idempotencyKey,
        PETROS_TEACH_BACK_FUNCTIONS.verdict,
        verdict,
        {
          gapType: verdict.value.mostImportantGap?.type ?? 'none',
          artifactBlockId: block?.id,
          uncertaintyBasisPoints: verdict.value.uncertaintyDisclosure ? 5_000 : 0,
          payload: { numericScore: false, officialAssessmentChanged: false },
        },
      );
      if (artifactBundleId) {
        await this.event(
          session,
          'artifact_proposed',
          derivedUuid(idempotencyKey, 'artifact-proposed'),
          {
            artifactBlockId: block?.id,
            payload: { autoSaved: false, explicitEditAndSaveRequired: true },
          },
        );
      }
      try {
        await this.updateLearnerModel(scope, closed, verdict.value);
      } catch (error) {
        await this.event(
          session,
          'learner_model_update_failed',
          derivedUuid(session.id, 'learner-model-failed'),
          {
            gapType: verdict.value.mostImportantGap?.type ?? 'none',
            errorCode: errorCode(error),
            validationPassed: false,
            payload: {
              coreVerdictPreserved: true,
              officialAssessmentChanged: false,
            },
          },
        ).catch(() => undefined);
      }
      const document = await this.document(scope, session.id);
      await this.repo.finishCommand(command.row.id, document as unknown as Record<string, unknown>);
      return document;
    } catch (error) {
      await this.repo.failCommand(command.row.id, errorCode(error));
      throw error;
    }
  }

  private async analyse(
    session: SessionRow,
    segmentId: string,
    text: string,
    options: {
      uncertainTranscript: boolean;
      transcriptionConfidence: number | null;
      correlationId: string;
    },
  ) {
    if (options.uncertainTranscript) {
      return {
        value: uncertainSpeechAnalysis(session, segmentId),
        result: null,
        source: 'deterministic_fallback' as const,
      };
    }
    try {
      const result = await this.gateway.execute({
        context: {
          functionKey: PETROS_TEACH_BACK_FUNCTIONS.analyse,
          topic: session.topic,
          sessionType: 'teach_it_back',
          inputModality: 'text',
          language: session.language,
          institutionId: session.institutionId,
          studentId: session.studentId,
          estimatedTokens: Math.ceil(text.length / 4),
          currentCostMicros: 0,
          previousFailures: 0,
          requiredReasoningQuality: 0.7,
        },
        system: analysisPrompt,
        input: [
          {
            type: 'text',
            text: JSON.stringify({
              topic: session.topic,
              scope: session.scope,
              audience: session.audienceLabel,
              segmentId,
              coverageChecklist: session.coverageChecklist,
              studentExplanation: text,
            }),
          },
        ],
        responseSchema: zodToJsonSchema(petrosTeachBackAnalysisSchema, {
          $refStrategy: 'none',
        }) as Record<string, unknown>,
        sessionId: session.learningSessionId,
        correlationId: options.correlationId,
        metadata: {
          mode: 'teach_it_back',
          step: 'ANALYSE',
          rawContentInAggregateEvents: false,
        },
      });
      return {
        value: petrosTeachBackAnalysisSchema.parse(result.content),
        result,
        source: 'ai' as const,
      };
    } catch {
      return {
        value: deterministicAnalysis(session, segmentId, text),
        result: null,
        source: 'deterministic_fallback' as const,
      };
    }
  }

  private async followUp(
    session: SessionRow,
    analysis: PetrosTeachBackAnalysis,
    probeNumber: number,
    correlationId: string,
  ) {
    const gap = analysis.primaryGap!;
    try {
      const result = await this.gateway.execute({
        context: {
          functionKey: PETROS_TEACH_BACK_FUNCTIONS.followUp,
          topic: session.topic,
          sessionType: 'teach_it_back',
          inputModality: 'text',
          language: session.language,
          institutionId: session.institutionId,
          studentId: session.studentId,
          estimatedTokens: 500,
          currentCostMicros: 0,
          previousFailures: 0,
          requiredResponseMs: 8_000,
        },
        system: followUpPrompt,
        input: [
          {
            type: 'text',
            text: JSON.stringify({
              gap,
              probeNumber,
              audience: session.audienceLabel,
            }),
          },
        ],
        responseSchema: zodToJsonSchema(petrosTeachBackFollowUpSchema, {
          $refStrategy: 'none',
        }) as Record<string, unknown>,
        sessionId: session.learningSessionId,
        correlationId,
        metadata: { mode: 'teach_it_back', step: 'FOLLOW_UP', probeNumber },
      });
      return {
        value: petrosTeachBackFollowUpSchema.parse(result.content),
        result,
        source: 'ai' as const,
      };
    } catch {
      return {
        value: deterministicFollowUp(gap, probeNumber),
        result: null,
        source: 'deterministic_fallback' as const,
      };
    }
  }

  private async verdict(
    session: SessionRow,
    segments: Awaited<ReturnType<PetrosTeachBackRepository['listSegments']>>,
    correlationId: string,
  ) {
    const compact = segments.map((segment) => ({
      id: segment.id,
      text: segment.text,
      analysis: segment.analysis,
    }));
    try {
      const result = await this.gateway.execute({
        context: {
          functionKey: PETROS_TEACH_BACK_FUNCTIONS.verdict,
          topic: session.topic,
          sessionType: 'teach_it_back',
          inputModality: 'text',
          language: session.language,
          institutionId: session.institutionId,
          studentId: session.studentId,
          estimatedTokens: Math.ceil(JSON.stringify(compact).length / 4),
          currentCostMicros: 0,
          previousFailures: 0,
          requiredReasoningQuality: 0.7,
        },
        system: verdictPrompt,
        input: [
          {
            type: 'text',
            text: JSON.stringify({
              topic: session.topic,
              audience: session.audienceLabel,
              coverage: session.coverageChecklist,
              segments: compact,
            }),
          },
        ],
        responseSchema: zodToJsonSchema(petrosTeachBackVerdictSchema, {
          $refStrategy: 'none',
        }) as Record<string, unknown>,
        sessionId: session.learningSessionId,
        correlationId,
        metadata: {
          mode: 'teach_it_back',
          step: 'VERDICT',
          officialAssessmentMutation: false,
        },
      });
      return {
        value: petrosTeachBackVerdictSchema.parse(result.content),
        result,
        source: 'ai' as const,
      };
    } catch {
      return {
        value: deterministicVerdict(session, segments),
        result: null,
        source: 'deterministic_fallback' as const,
      };
    }
  }

  private async updateLearnerModel(
    scope: PetrosOwnerScope,
    session: SessionRow,
    verdict: PetrosTeachBackVerdict,
  ) {
    const gap = verdict.mostImportantGap;
    const rawCredit =
      verdict.audienceFit === 'likely_helpful'
        ? 7_500
        : verdict.audienceFit === 'helpful_after_revision'
          ? 5_500
          : 3_500;
    const uncertainty = verdict.uncertaintyDisclosure ? 5_000 : 2_500;
    const weightedCredit = Math.round(5_000 + (rawCredit - 5_000) * (1 - uncertainty / 10_000));
    const evidence = await this.learnerModels.ingest(scope, {
      schemaVersion: PETROS_LEARNER_EVIDENCE_SCHEMA_VERSION,
      source: 'petros',
      sourceEventId: `teach-back:${session.id}:verdict`,
      sourceRecordId: session.id,
      conceptId: canonical(session.topic),
      topicId: canonical(session.topic),
      prerequisiteConceptIds: [],
      evidenceKind: 'application',
      outcome: weightedCredit >= 6_500 ? 'correct' : weightedCredit >= 4_500 ? 'partial' : 'wrong',
      creditBasisPoints: weightedCredit,
      moveType: 'synthesis',
      profileDimension: 'explanation_transfer',
      preEvidenceBasisPoints: null,
      postEvidenceBasisPoints: weightedCredit,
      responseTimeMs: elapsed(session) * 1_000,
      hintCount: session.helpUseCount,
      confidenceBefore: null,
      confidenceAfter: null,
      errorCategory: gap?.type === 'misconception' ? 'concept_gap' : gap ? 'other' : 'none',
      errorConfidenceBasisPoints: gap ? 10_000 - uncertainty : 0,
      evaluatorVersion: PETROS_TEACH_BACK_VERDICT_VERSION,
      algorithmVersion: PETROS_LEARNER_MODEL_ALGORITHM_VERSION,
      environment: 'production',
      synthetic: false,
      occurredAt: new Date().toISOString(),
      metadata: {
        evidenceType: 'explanation_transfer',
        uncertaintyBasisPoints: uncertainty,
        officialAssessmentChanged: false,
        singleSessionWeighting: 'conservative_toward_neutral',
      },
    });
    await this.event(session, 'learner_model_updated', derivedUuid(session.id, 'learner-model'), {
      gapType: gap?.type ?? 'none',
      payload: {
        duplicate: evidence.accepted ? evidence.duplicate : false,
        weightedCredit,
        officialAssessmentChanged: false,
      },
    });
  }

  private async document(scope: PetrosOwnerScope, sessionId: string) {
    const session = await this.require(scope, sessionId);
    const [segments, followUps] = await Promise.all([
      this.repo.listSegments(scope, sessionId),
      this.repo.listFollowUps(scope, sessionId),
    ]);
    return petrosTeachBackSessionDocumentSchema.parse({
      stateVersion: PETROS_TEACH_BACK_STATE_VERSION,
      id: session.id,
      learningSessionId: session.learningSessionId,
      version: session.version,
      status: session.status,
      topic: session.topic,
      scope: session.scope,
      audience: { level: session.audienceLevel, label: session.audienceLabel },
      mode: session.mode,
      language: session.language,
      coverageChecklist: session.coverageChecklist,
      segments: segments.map((segment) => ({
        id: segment.id,
        ordinal: segment.ordinal,
        source: segment.source,
        text: segment.text,
        corrected: segment.corrected,
        transcriptionConfidence:
          segment.transcriptionConfidenceBasisPoints == null
            ? null
            : segment.transcriptionConfidenceBasisPoints / 10_000,
        responseToFollowUpId: segment.responseToFollowUpId,
        analysis: segment.analysis,
        createdAt: segment.createdAt.toISOString(),
        updatedAt: segment.updatedAt.toISOString(),
      })),
      followUps: followUps.map((followUp) => ({
        id: followUp.id,
        segmentId: followUp.segmentId,
        status: followUp.status,
        followUp: followUp.content,
        createdAt: followUp.createdAt.toISOString(),
        resolvedAt: followUp.resolvedAt?.toISOString() ?? null,
      })),
      progress: {
        movesUsed: session.movesUsed,
        maxMoves: session.maxMoves,
        elapsedSeconds: elapsed(session),
        timeBudgetSeconds: session.timeBudgetSeconds,
        openFollowUpId: followUps.find((followUp) => followUp.status === 'open')?.id ?? null,
        currentGapType: session.currentGapType,
        probesOnCurrentGap: session.probesOnCurrentGap,
        helpUseCount: session.helpUseCount,
      },
      opening: 'Explain this to Petros as if teaching a junior.',
      verdict: session.verdict,
      artifactBundleId: session.artifactBundleId,
      voice: {
        optional: true,
        productionDeviceQaPassed: false,
        textAlternativeAvailable: true,
        disclosure:
          'Voice capture is optional and remains pre-release until the inherited Stage 9 physical microphone, headset, interruption, background-stop, pronunciation, and mixed-language device QA passes.',
      },
      repeatedFromSessionId: session.repeatedFromSessionId,
      createdAt: session.createdAt.toISOString(),
      updatedAt: session.updatedAt.toISOString(),
    });
  }

  private async require(scope: PetrosOwnerScope, sessionId: string) {
    const row = await this.repo.find(scope, sessionId);
    if (!row) throw notFound();
    return row;
  }

  private async requireActive(scope: PetrosOwnerScope, sessionId: string, expectedVersion: number) {
    const row = await this.require(scope, sessionId);
    if (row.version !== expectedVersion) throw stale();
    if (row.status === 'paused') {
      throw new ConflictException({
        code: 'PETROS_TEACH_BACK_PAUSED',
        message: 'Resume before continuing.',
      });
    }
    if (row.status === 'closed') {
      throw new ConflictException({
        code: 'PETROS_TEACH_BACK_CLOSED',
        message: 'This verdict is already final.',
      });
    }
    if (row.movesUsed >= row.maxMoves || elapsed(row) >= row.timeBudgetSeconds) {
      throw new ConflictException({
        code: 'PETROS_TEACH_BACK_BUDGET_REACHED',
        message: 'This finite explanation budget is complete. Finish for the verdict.',
      });
    }
    return row;
  }

  private functionEvent<T>(
    session: SessionRow,
    type: string,
    idempotencyKey: string,
    functionKey: string,
    call: {
      value: T;
      result: PetrosAiExecuteResult | null;
      source: 'ai' | 'deterministic_fallback';
    },
    patch: Partial<typeof schemaEventPatch> = {},
  ) {
    return this.event(session, type, derivedUuid(idempotencyKey, functionKey), {
      ...patch,
      functionKey,
      providerKey: call.result?.providerKey,
      modelKey: call.result?.modelKey,
      durationMs: call.result?.responseTimeMs ?? 0,
      estimatedCostMicros: call.result?.estimatedCostMicros ?? 0,
      retryCount: call.result?.retryCount ?? 0,
      fallbackTier: call.result?.fallbackTier,
      validationPassed: call.source === 'ai',
      errorCode: call.source === 'ai' ? undefined : 'PETROS_TEACH_BACK_PROVIDER_NEUTRAL_FALLBACK',
      payload: {
        ...patch.payload,
        source: call.source,
        cacheHit: call.result?.cached ?? false,
      },
    });
  }

  private event(
    session: SessionRow,
    type: string,
    idempotencyKey: string,
    patch: {
      segmentId?: string;
      followUpId?: string;
      artifactBlockId?: string;
      gapType?: string;
      functionKey?: string;
      providerKey?: string;
      modelKey?: string;
      durationMs?: number;
      estimatedCostMicros?: number;
      actualCostMicros?: number;
      retryCount?: number;
      fallbackTier?: number;
      validationPassed?: boolean;
      uncertaintyBasisPoints?: number;
      errorCode?: string;
      payload?: Record<string, unknown>;
    },
  ) {
    return this.repo.recordEvent({
      teachBackSessionId: session.id,
      institutionId: session.institutionId,
      studentId: session.studentId,
      type,
      mode: session.mode,
      idempotencyKey,
      correlationId: randomUUID(),
      validationPassed: patch.validationPassed ?? true,
      estimatedCostMicros: patch.estimatedCostMicros ?? 0,
      retryCount: patch.retryCount ?? 0,
      payload: patch.payload ?? {},
      ...patch,
    });
  }
}

const schemaEventPatch = {} as {
  segmentId?: string;
  followUpId?: string;
  artifactBlockId?: string;
  gapType?: string;
  uncertaintyBasisPoints?: number;
  payload?: Record<string, unknown>;
};

const analysisPrompt = `Analyse only the student's explanation. Return concise structured facts, not hidden reasoning. Ground every claim and gap in a supplied segment excerpt. Select at most one high-value gap. Do not manufacture a gap when the explanation is complete. Never treat speech-recognition uncertainty as a misconception. Do not reveal a hidden answer rubric. Return every required schema field; use empty arrays when there are no claims or examples, and null when there is no gap or uncertainty disclosure.`;
const followUpPrompt = `Play a respectful, genuinely confused junior. Ask exactly one natural question grounded in the selected gap and excerpt. Never mock, flatter ability, lecture, or ask an impossible question. This is one of at most two probes for this stuck point. Always include concise helpAfterCap so the learner can request help immediately.`;
const verdictPrompt = `Return one respectful human-readable verdict, never a numeric score, grade, marks, or rating. Cite student segment evidence for what was clear and for the single most important gap. State audience fit and one useful improvement. Notice effort without flattering ability. Include an editable recap or card proposal, set officialAssessmentChanged false, and disclose uncertainty.`;

function defaultCoverage(topic: string) {
  const clean = topic.trim();
  return [
    { key: 'core_idea', label: `What ${clean} means` },
    { key: 'causal_link', label: `Why or how ${clean} works` },
    { key: 'example', label: `A concrete example of ${clean}` },
    {
      key: 'boundary',
      label: `A limit, exception, or common confusion about ${clean}`,
    },
  ];
}

function uncertainSpeechAnalysis(session: SessionRow, segmentId: string): PetrosTeachBackAnalysis {
  return petrosTeachBackAnalysisSchema.parse({
    schemaVersion: PETROS_TEACH_BACK_ANALYSIS_VERSION,
    coverage: session.coverageChecklist,
    claims: [],
    examples: [],
    primaryGap: null,
    completeEnough: false,
    needsFollowUp: false,
    speechRecognitionUncertain: true,
    uncertaintyDisclosure: `Petros is not confident the transcript reflects segment ${segmentId}. Correct it before conceptual analysis.`,
  });
}

function deterministicAnalysis(
  session: SessionRow,
  segmentId: string,
  text: string,
): PetrosTeachBackAnalysis {
  const normalized = text.toLowerCase();
  const causal =
    /\b(?:because|therefore|so that|which causes|leads to|results in|as a result|works by)\b/i.test(
      text,
    );
  const example = /\b(?:for example|for instance|imagine|suppose|such as)\b/i.test(text);
  const coverage = (session.coverageChecklist as Array<{ key: string; label: string }>).map(
    (item, index) => {
      const tokens = item.label
        .toLowerCase()
        .split(/\W+/)
        .filter((token) => token.length > 4);
      const present = tokens.some((token) => normalized.includes(token));
      const inferred =
        index === 0
          ? text.length >= 60
          : index === 1
            ? causal
            : index === 2
              ? example
              : /\b(?:except|unless|limit|confus|however)\b/i.test(text);
      return {
        ...item,
        status: present || inferred ? ('covered' as const) : ('missing' as const),
        evidence: present || inferred ? [{ segmentId, excerpt: excerpt(text) }] : [],
      };
    },
  );
  const covered = coverage.filter((item) => item.status === 'covered').length;
  const completeEnough =
    text.length >= 180 && causal && covered >= Math.ceil(coverage.length * 0.6);
  const primaryGap = completeEnough
    ? null
    : {
        type: !causal
          ? ('missing_causal_link' as const)
          : text.length < 80
            ? ('scope_gap' as const)
            : !example
              ? ('weak_example' as const)
              : ('undefined_term' as const),
        description: !causal
          ? 'The explanation names the idea but does not yet connect the cause to the result.'
          : !example
            ? 'The explanation would be easier for a junior to test with one concrete example.'
            : 'One important part still needs a plain-language definition.',
        evidence: { segmentId, excerpt: excerpt(text) },
        confidence: 0.62,
      };
  return petrosTeachBackAnalysisSchema.parse({
    schemaVersion: PETROS_TEACH_BACK_ANALYSIS_VERSION,
    coverage,
    claims: [
      {
        claim: excerpt(text),
        status: 'unverifiable',
        evidence: { segmentId, excerpt: excerpt(text) },
      },
    ],
    examples: example ? [{ segmentId, excerpt: excerpt(text) }] : [],
    primaryGap,
    completeEnough,
    needsFollowUp: Boolean(primaryGap),
    speechRecognitionUncertain: false,
    uncertaintyDisclosure:
      'A built-in analysis was used while live analysis was unavailable; factual correctness still needs configured model validation.',
  });
}

function deterministicFollowUp(
  gap: NonNullable<PetrosTeachBackAnalysis['primaryGap']>,
  probeNumber: number,
): PetrosTeachBackFollowUp {
  const questions: Record<string, string> = {
    missing_causal_link: 'I follow the result, but what makes that result happen?',
    undefined_term: 'I am new to this—what does that term mean in plain language?',
    unhandled_exception: 'Would this still work in the exception you mentioned?',
    weak_example: 'Could you show me one concrete example so I can test whether I understood?',
    contradiction: 'These two parts sound different to me—how can they both be true?',
    misconception: 'What evidence would help me choose between that idea and the alternative?',
    scope_gap: 'Which part should a beginner understand first before the rest?',
  };
  return petrosTeachBackFollowUpSchema.parse({
    schemaVersion: PETROS_TEACH_BACK_FOLLOW_UP_VERSION,
    gapType: gap.type,
    question: questions[gap.type],
    groundedIn: gap.evidence,
    probeNumber,
    juniorTransition: `Your junior is confused about ${gap.description.toLowerCase()}`,
    helpAfterCap: `Here is the missing bridge: ${gap.description} Try adding one sentence that explicitly links the starting idea to the result, then continue in your own words.`,
    tone: probeNumber === 2 ? 'playfully_persistent' : 'curious',
  });
}

function deterministicVerdict(
  session: SessionRow,
  segments: Awaited<ReturnType<PetrosTeachBackRepository['listSegments']>>,
): PetrosTeachBackVerdict {
  const last = segments.at(-1)!;
  const analyses = segments.map((segment) => petrosTeachBackAnalysisSchema.parse(segment.analysis));
  const gap = [...analyses].reverse().find((analysis) => analysis.primaryGap)?.primaryGap ?? null;
  const clearEvidence = analyses
    .flatMap((analysis) => analysis.coverage)
    .find((item) => item.status === 'covered' && item.evidence.length)?.evidence[0] ?? {
    segmentId: last.id,
    excerpt: excerpt(last.text),
  };
  const uncertainty = analyses.some((analysis) => analysis.uncertaintyDisclosure)
    ? 'Some analysis used a provider-neutral fallback, so treat the factual verdict as provisional.'
    : null;
  const fit = gap ? 'helpful_after_revision' : 'likely_helpful';
  return petrosTeachBackVerdictSchema.parse({
    schemaVersion: PETROS_TEACH_BACK_VERDICT_VERSION,
    oneLine: gap
      ? `Your explanation gives a usable starting picture, and one clearer bridge would make it work for ${session.audienceLabel}.`
      : `Your explanation connects the main idea clearly enough to help ${session.audienceLabel}.`,
    clear: [
      {
        detail: 'You put the idea into your own teaching sequence.',
        evidence: clearEvidence,
      },
    ],
    mostImportantGap: gap
      ? { type: gap.type, detail: gap.description, evidence: gap.evidence }
      : null,
    suggestedImprovement: gap
      ? `Add one short sentence that resolves this: ${gap.description}`
      : 'Add one contrasting example to make the explanation easier to transfer.',
    audienceFit: fit,
    audienceReason: gap
      ? 'A junior could follow the outline after the identified bridge is made explicit.'
      : 'The sequence supplies a clear idea, connection, and learner-facing explanation.',
    uncertaintyDisclosure: uncertainty,
    recapProposal: {
      kind: 'note',
      title: `${session.topic}: my teach-it-back recap`,
      body: segments
        .map((segment) => segment.text)
        .join('\n\n')
        .slice(0, 4_000),
    },
    officialAssessmentChanged: false,
  });
}

function nextGap(
  session: Pick<SessionRow, 'currentGapFingerprint' | 'probesOnCurrentGap'>,
  analysis: PetrosTeachBackAnalysis,
) {
  if (!analysis.primaryGap || !analysis.needsFollowUp || analysis.speechRecognitionUncertain)
    return null;
  const fingerprint = fingerprintGap(analysis.primaryGap);
  const same = session.currentGapFingerprint === fingerprint;
  const probes = same ? session.probesOnCurrentGap + 1 : 1;
  return probes > 2 ? null : { type: analysis.primaryGap.type, fingerprint, probes };
}

function fingerprintGap(gap: NonNullable<PetrosTeachBackAnalysis['primaryGap']>) {
  return digest({
    type: gap.type,
    description: gap.description.toLowerCase().replace(/\s+/g, ' '),
  });
}

function routeReference(result: PetrosAiExecuteResult | null | undefined) {
  return result
    ? {
        requestId: result.requestId,
        functionKey: result.functionKey,
        promptVersion: result.promptVersion,
        schemaVersion: result.schemaVersion,
        fallbackTier: result.fallbackTier,
      }
    : null;
}

function aggregate(
  events: Awaited<ReturnType<PetrosTeachBackRepository['dashboardRows']>>['events'],
  key: (event: (typeof events)[number]) => string,
) {
  return [...new Set(events.map(key))].map((value) => {
    const matching = events.filter((event) => key(event) === value);
    const durations = matching
      .map((event) => event.durationMs)
      .filter((item): item is number => item != null);
    return {
      key: value,
      calls: matching.length,
      failures: matching.filter((event) => event.errorCode || !event.validationPassed).length,
      retries: matching.reduce((sum, event) => sum + event.retryCount, 0),
      fallbacks: matching.filter(
        (event) =>
          (event.fallbackTier ?? 0) > 0 || event.payload.source === 'deterministic_fallback',
      ).length,
      estimatedCostMicros: matching.reduce((sum, event) => sum + event.estimatedCostMicros, 0),
      actualCostMicros: matching.reduce((sum, event) => sum + (event.actualCostMicros ?? 0), 0),
      averageMs: durations.length
        ? Math.round(durations.reduce((sum, item) => sum + item, 0) / durations.length)
        : 0,
      maximumMs: durations.length ? Math.max(...durations) : 0,
    };
  });
}

function aggregateVoice(
  events: Awaited<ReturnType<PetrosTeachBackRepository['dashboardRows']>>['voiceEvents'],
) {
  return [...new Set(events.map((event) => event.functionKey ?? 'voice.non_ai'))].map((key) => {
    const matching = events.filter((event) => (event.functionKey ?? 'voice.non_ai') === key);
    const durations = matching
      .map((event) => event.durationMs)
      .filter((item): item is number => item != null);
    return {
      key,
      calls: matching.length,
      failures: matching.filter((event) => event.errorCode || event.type.includes('failed')).length,
      retries: matching.reduce((sum, event) => sum + event.retryCount, 0),
      fallbacks: matching.filter((event) => (event.fallbackTier ?? 0) > 0).length,
      estimatedCostMicros: matching.reduce((sum, event) => sum + event.estimatedCostMicros, 0),
      actualCostMicros: matching.reduce((sum, event) => sum + (event.actualCostMicros ?? 0), 0),
      averageMs: durations.length
        ? Math.round(durations.reduce((sum, item) => sum + item, 0) / durations.length)
        : 0,
      maximumMs: durations.length ? Math.max(...durations) : 0,
      providerModels: [
        ...new Set(
          matching.map(
            (event) => `${event.providerKey ?? 'unassigned'}:${event.modelKey ?? 'unassigned'}`,
          ),
        ),
      ],
    };
  });
}

function topicGapBuckets(
  sessions: Awaited<ReturnType<PetrosTeachBackRepository['dashboardRows']>>['sessions'],
  events: Awaited<ReturnType<PetrosTeachBackRepository['dashboardRows']>>['events'],
) {
  const buckets = new Map<string, { topicRef: string; gapType: string; count: number }>();
  for (const session of sessions) {
    const topicRef = digest(canonical(session.topic)).slice(0, 12);
    for (const event of events.filter(
      (item) =>
        item.teachBackSessionId === session.id &&
        item.type === 'analysis_completed' &&
        item.gapType &&
        item.gapType !== 'none',
    )) {
      const key = `${topicRef}:${event.gapType}`;
      const current = buckets.get(key);
      buckets.set(key, {
        topicRef,
        gapType: event.gapType!,
        count: (current?.count ?? 0) + 1,
      });
    }
  }
  return [...buckets.values()].sort((left, right) => right.count - left.count);
}

function owner(principal: InstitutionalStudentPrincipal): PetrosOwnerScope {
  return {
    institutionId: principal.institutionId,
    studentId: principal.studentId,
  };
}

function elapsed(session: Pick<SessionRow, 'elapsedSeconds' | 'activeSince' | 'status'>) {
  return Math.max(
    0,
    session.elapsedSeconds +
      (session.status === 'active' && session.activeSince
        ? Math.floor((Date.now() - session.activeSince.getTime()) / 1_000)
        : 0),
  );
}

function excerpt(value: string) {
  return value.trim().replace(/\s+/g, ' ').slice(0, 320) || 'No usable excerpt.';
}

function canonical(value: string) {
  return (
    value
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 180) || 'teach-it-back'
  );
}

function digest(value: unknown) {
  return createHash('sha256')
    .update(typeof value === 'string' ? value : JSON.stringify(value))
    .digest('hex');
}

function derivedUuid(value: string, purpose: string) {
  const hex = createHash('sha256').update(`${value}:${purpose}`).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function notFound() {
  return new NotFoundException({
    code: 'PETROS_TEACH_BACK_NOT_FOUND',
    message: 'This Teach-it-back session is unavailable or belongs to another learner.',
  });
}

function stale() {
  return new ConflictException({
    code: 'PETROS_TEACH_BACK_STALE',
    message: 'This explanation changed. Reload before continuing.',
  });
}

function inFlight() {
  return new ConflictException({
    code: 'PETROS_TEACH_BACK_IN_FLIGHT',
    message: 'This Teach-it-back action is already being processed.',
  });
}

function errorCode(error: unknown) {
  if (error && typeof error === 'object' && 'getResponse' in error) {
    const response = (error as { getResponse(): unknown }).getResponse();
    if (response && typeof response === 'object' && 'code' in response)
      return String(response.code).slice(0, 120);
  }
  return error instanceof Error ? error.name.slice(0, 120) : 'PETROS_TEACH_BACK_FAILED';
}
