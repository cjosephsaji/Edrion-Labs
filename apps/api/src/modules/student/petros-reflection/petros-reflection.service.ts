import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { AuditWriter } from '@edrion/audit';
import {
  PETROS_REFLECTION_ALGORITHM_VERSION,
  PETROS_REFLECTION_FUNCTIONS,
  PETROS_REFLECTION_SCHEMA_VERSION,
  PETROS_REFLECTION_THRESHOLDS,
  petrosGapAlarmContentSchema,
  petrosReflectionSurfaceSchema,
  petrosSessionRecapContentSchema,
  type PetrosCalibrationLifecycleInput,
  type PetrosGapAlarm,
  type PetrosGapAlarmLifecycleInput,
  type PetrosRecapFeedbackInput,
  type PetrosReflectionDashboardQuery,
  type PetrosReflectionEvidenceQuery,
  type PetrosReflectionRecommendationIntentInput,
  type PetrosReflectionRecommendationLifecycleInput,
  type PetrosReflectionRebuildInput,
  type PetrosReflectionSurface,
  type PetrosSessionRecap,
  type ResolvePetrosSessionIntentInput,
} from '@edrion/schemas';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { ZodError } from 'zod';
import { AUDIT_WRITER } from '../../../common/tokens';
import { baseAudit, type ActionContext } from '../../../common/action-context';
import {
  PetrosAiGatewayService,
  type PetrosAiExecuteResult,
} from '../../petros-ai-routing/petros-ai-gateway.service';
import type { InstitutionalStudentPrincipal } from '../student.types';
import type { PetrosOwnerScope } from '../petros-loop/petros-loop.repository';
import { PetrosSessionIntentService } from '../petros-session-intent/petros-session-intent.service';
import {
  deriveCalibration,
  deriveGapCandidates,
  deriveKnowledgeMap,
  deriveSessionRecap,
  digest,
  isReflectionStale,
} from './petros-reflection.engine';
import { PetrosReflectionRepository } from './petros-reflection.repository';

@Injectable()
export class PetrosReflectionService {
  constructor(
    private readonly repo: PetrosReflectionRepository,
    private readonly gateway: PetrosAiGatewayService,
    private readonly intents: PetrosSessionIntentService,
    @Inject(AUDIT_WRITER) private readonly audit: AuditWriter,
  ) {}

  async read(principal: InstitutionalStudentPrincipal): Promise<PetrosReflectionSurface> {
    const scope = owner(principal);
    let snapshot = await this.repo.latestSnapshot(scope);
    if (!snapshot) {
      await this.rebuild(principal, { idempotencyKey: randomUUID() });
      snapshot = await this.repo.latestSnapshot(scope);
    }
    if (!snapshot) throw new Error('Reflection derivation did not produce a snapshot.');
    const sources = await this.repo.sourceBundle(scope);
    return this.surface(scope, snapshot.id, sources.sourceThroughAt, sources.graphUpdatedAt);
  }

  async rebuild(
    principal: InstitutionalStudentPrincipal,
    input: PetrosReflectionRebuildInput,
  ) {
    const scope = owner(principal);
    const started = Date.now();
    const sources = await this.repo.sourceBundle(scope);
    const completedRecommendations = await this.repo.completeRecommendationsFromEvidence(
      scope,
      sources.evidence,
    );
    for (const completed of completedRecommendations) {
      await this.event(scope, randomUUID(), 'recommendation_completed', {
        snapshotId: completed.recommendation.snapshotId,
        entityType: 'recommendation',
        entityId: completed.recommendation.id,
        payload: {
          outcome: completed.outcome.outcome,
          creditBasisPoints: completed.outcome.creditBasisPoints,
          sourceEventId: completed.outcome.sourceEventId,
          engagementOptimized: false,
        },
      });
    }
    const sourceHash = digest({
      algorithmVersion: PETROS_REFLECTION_ALGORITHM_VERSION,
      topics: sources.topics,
      mastery: sources.mastery,
      evidence: sources.evidence.map((row) => ({
        id: row.id,
        outcome: row.outcome,
        confidenceAfter: row.confidenceAfter,
        occurredAt: row.occurredAt,
      })),
      sessions: sources.sessions.map((session) => ({
        sessionId: session.sessionId,
        moves: session.moves.map((move) => move.id),
        observations: session.observations.map((observation) => observation.id),
      })),
      sourceThroughAt: sources.sourceThroughAt,
      graphUpdatedAt: sources.graphUpdatedAt,
    });
    const existing = await this.repo.findSnapshotBySource(
      scope,
      PETROS_REFLECTION_ALGORITHM_VERSION,
      sourceHash,
    );
    if (existing) {
      await this.event(scope, input.idempotencyKey, 'rebuild_reused', {
        snapshotId: existing.id,
        durationMs: Date.now() - started,
        payload: { idempotent: true },
      });
      return this.surface(
        scope,
        existing.id,
        sources.sourceThroughAt,
        sources.graphUpdatedAt,
      );
    }

    const baseMap = deriveKnowledgeMap({
      topics: sources.topics,
      mastery: sources.mastery,
      evidence: sources.evidence,
      now: new Date(),
    });
    const recommendationIds = new Map(
      baseMap.recommendations.map((row) => [
        row.id,
        derivedUuid(sourceHash, `recommendation:${row.conceptId}:${row.sessionType}`),
      ]),
    );
    const map = {
      ...baseMap,
      recommendations: baseMap.recommendations.map((row) => ({
        ...row,
        id: recommendationIds.get(row.id) ?? row.id,
      })),
      topics: baseMap.topics.map((row) => ({
        ...row,
        recommendationId: row.recommendationId
          ? recommendationIds.get(row.recommendationId) ?? row.recommendationId
          : null,
      })),
    };
    const fragileAction =
      map.recommendations.find((row) =>
        row.reasons.some((reason) => reason.code === 'fragile_knowledge'),
      )?.id ?? null;
    const calibration = {
      ...deriveCalibration(sources.evidence, new Date(), fragileAction),
      id: derivedUuid(sourceHash, 'calibration'),
    };
    const deterministicRecaps = sources.sessions.map(deriveSessionRecap);
    const deterministicAlarms = deriveGapCandidates({
      topics: sources.topics,
      evidence: sources.evidence,
      recommendations: map.recommendations,
      now: new Date(),
    });
    const recapResults = await Promise.all(
      deterministicRecaps.map((recap) => this.enhanceRecap(scope, recap)),
    );
    const alarmResults = await Promise.all(
      deterministicAlarms.map((alarm) => this.enhanceAlarm(scope, alarm)),
    );
    const recaps = recapResults.map((row) => row.value);
    const alarms = alarmResults.map((row) => row.value);
    const validationFailureCount = [
      ...recapResults,
      ...alarmResults,
    ].filter((row) => !row.validationPassed).length;
    const fallbackCount = [...recapResults, ...alarmResults].filter(
      (row) => row.value.generation.source !== 'ai',
    ).length;
    const snapshot = await this.repo.persist({
      scope,
      schemaVersion: PETROS_REFLECTION_SCHEMA_VERSION,
      algorithmVersion: PETROS_REFLECTION_ALGORITHM_VERSION,
      sourceHash,
      idempotencyKey: input.idempotencyKey,
      sourceThroughAt: sources.sourceThroughAt,
      graphUpdatedAt: sources.graphUpdatedAt,
      topics: map.topics,
      recommendations: map.recommendations,
      calibration,
      recaps,
      alarms,
      missingSyllabusLinks: map.missingSyllabusLinks,
      validationFailureCount,
      fallbackCount,
    });
    const persisted = snapshot ?? (await this.repo.findSnapshotBySource(
      scope,
      PETROS_REFLECTION_ALGORITHM_VERSION,
      sourceHash,
    ));
    if (!persisted) throw new Error('Reflection snapshot was not persisted.');
    await this.event(scope, derivedUuid(input.idempotencyKey, 'reflection-rebuild'), 'rebuild_completed', {
      snapshotId: persisted.id,
      durationMs: Date.now() - started,
      payload: {
        mapStates: map.topics.length,
        recommendations: map.recommendations.length,
        recaps: recaps.length,
        alarms: alarms.length,
        validationFailureCount,
        fallbackCount,
        noRawChainOfThought: true,
      },
    });
    for (const result of recapResults) {
      await this.functionEvent(scope, persisted.id, result);
    }
    for (const result of alarmResults) {
      await this.functionEvent(scope, persisted.id, result);
    }
    return this.surface(
      scope,
      persisted.id,
      sources.sourceThroughAt,
      sources.graphUpdatedAt,
    );
  }

  async recommendationIntent(
    principal: InstitutionalStudentPrincipal,
    recommendationId: string,
    input: PetrosReflectionRecommendationIntentInput,
  ) {
    const scope = owner(principal);
    const recommendation = await this.repo.findRecommendation(scope, recommendationId);
    if (!recommendation) throw notFound();
    const intent = await this.intents.resolve(principal, {
      door: 'reflection_action',
      sourceId: recommendation.id,
      idempotencyKey: input.idempotencyKey,
      timeBudgetSeconds: recommendation.sessionType === 'repair' ? 900 : 720,
      language: 'en',
      accessibility: [],
    } satisfies ResolvePetrosSessionIntentInput);
    await this.repo.attachRecommendationIntent(scope, recommendation.id, intent.id);
    await this.event(scope, input.idempotencyKey, 'recommendation_intent_created', {
      snapshotId: recommendation.snapshotId,
      entityType: 'recommendation',
      entityId: recommendation.id,
      payload: { sessionType: recommendation.sessionType, door: 'reflection_action' },
    });
    return intent;
  }

  async recommendationLifecycle(
    principal: InstitutionalStudentPrincipal,
    recommendationId: string,
    input: PetrosReflectionRecommendationLifecycleInput,
  ) {
    const scope = owner(principal);
    const row = await this.repo.updateRecommendation(scope, recommendationId, 'dismissed');
    if (!row) throw notFound();
    await this.event(scope, input.idempotencyKey, 'recommendation_dismissed', {
      snapshotId: row.snapshotId,
      entityType: 'recommendation',
      entityId: row.id,
      payload: { learnerControlled: true },
    });
    return { status: row.status };
  }

  async calibrationLifecycle(
    principal: InstitutionalStudentPrincipal,
    id: string,
    input: PetrosCalibrationLifecycleInput,
  ) {
    const scope = owner(principal);
    const quietUntil = input.action === 'quiet'
      ? new Date(Date.now() + (input.quietDays ?? 30) * 86_400_000)
      : null;
    const row = await this.repo.updateCalibration(scope, id, {
      status: input.action === 'quiet' ? 'quieted' : 'dismissed',
      quietUntil,
    });
    if (!row) throw notFound();
    await this.event(scope, input.idempotencyKey, `calibration_${input.action}`, {
      snapshotId: row.snapshotId,
      entityType: 'calibration',
      entityId: row.id,
      payload: { quietDays: input.action === 'quiet' ? input.quietDays : null },
    });
    return { status: row.status, quietUntil: row.quietUntil?.toISOString() ?? null };
  }

  async recapFeedback(
    principal: InstitutionalStudentPrincipal,
    id: string,
    input: PetrosRecapFeedbackInput,
  ) {
    const scope = owner(principal);
    const row = await this.repo.updateRecap(
      scope,
      id,
      input.action === 'correct' ? 'corrected' : 'dismissed',
      input.action === 'correct' ? input.correction ?? null : null,
    );
    if (!row) throw notFound();
    await this.event(scope, input.idempotencyKey, `recap_${input.action}`, {
      snapshotId: row.snapshotId,
      entityType: 'recap',
      entityId: row.id,
      payload: {
        correctionStoredOwnerPrivately: input.action === 'correct',
        correctionIncludedInAggregate: false,
      },
    });
    return { status: row.status, correctedText: row.correctedText };
  }

  async alarmLifecycle(
    principal: InstitutionalStudentPrincipal,
    id: string,
    input: PetrosGapAlarmLifecycleInput,
  ) {
    const scope = owner(principal);
    const row = await this.repo.updateAlarm(scope, id, {
      status: input.action === 'false_positive' ? 'false_positive' : `${input.action}d`,
      snoozedUntil:
        input.action === 'snooze'
        ? new Date(Date.now() + (input.snoozeDays ?? 14) * 86_400_000)
          : null,
      resolutionReason: input.reason,
      falsePositive: input.action === 'false_positive',
    });
    if (!row) throw notFound();
    await this.event(scope, input.idempotencyKey, `alarm_${input.action}`, {
      snapshotId: row.snapshotId,
      entityType: 'alarm',
      entityId: row.id,
      payload: {
        snoozeDays: input.action === 'snooze' ? input.snoozeDays : null,
        falsePositive: input.action === 'false_positive',
        freeTextReasonInAggregate: false,
      },
    });
    return { status: row.status, snoozedUntil: row.snoozedUntil?.toISOString() ?? null };
  }

  export(principal: InstitutionalStudentPrincipal) {
    return this.repo.export(owner(principal));
  }

  async delete(principal: InstitutionalStudentPrincipal) {
    const scope = owner(principal);
    await this.repo.delete(scope);
    return { deleted: true, sourceLearnerEvidenceDeleted: false };
  }

  async dashboard(query: PetrosReflectionDashboardQuery, ctx: ActionContext) {
    const data = await this.repo.dashboard(query);
    await this.audit.logAudit({
      ...baseAudit(ctx),
      action: 'petros.reflection.dashboard.view',
      module: 'petros',
      entityType: 'petros_reflection_aggregate',
      entityId: query.institutionId ?? 'platform',
      newState: { filters: query, contentInspected: false },
    } as Parameters<AuditWriter['logAudit']>[0]);
    const eventsByType = counts(data.events.map((row) => row.type));
    const functionRows = Object.values(PETROS_REFLECTION_FUNCTIONS).map((functionKey) => {
      const rows = data.events.filter((row) => row.functionKey === functionKey);
      return {
        functionKey,
        calls: rows.length,
        validationFailures: rows.filter((row) => !row.validationPassed).length,
        retries: rows.reduce((sum, row) => sum + row.retryCount, 0),
        fallbacks: rows.filter((row) => row.type.endsWith('_fallback')).length,
        averageLatencyMs: average(rows.map((row) => row.durationMs ?? 0)),
        estimatedCostMicros: rows.reduce((sum, row) => sum + row.estimatedCostMicros, 0),
        actualCostMicros: rows.reduce((sum, row) => sum + (row.actualCostMicros ?? 0), 0),
      };
    });
    return {
      privacy: 'aggregate_only',
      individualComparison: false,
      contentExposed: false,
      snapshots: {
        completed: data.snapshots.filter((row) => row.status === 'completed').length,
        failed: data.snapshots.filter((row) => row.status === 'failed').length,
        latestCompletedAt: data.snapshots[0]?.completedAt.toISOString() ?? null,
        algorithms: [...new Set(data.snapshots.map((row) => row.algorithmVersion))],
        schemas: [...new Set(data.snapshots.map((row) => row.schemaVersion))],
        averageMissingSyllabusLinks: average(data.snapshots.map((row) => row.missingSyllabusLinks)),
        averageJobLagSeconds: average(data.snapshots.map((row) =>
          row.sourceThroughAt ? Math.max(0, Math.floor((row.completedAt.getTime() - row.sourceThroughAt.getTime()) / 1_000)) : 0,
        )),
      },
      mapCoverage: Object.fromEntries(data.states.map((row) => [row.state, row.count])),
      recommendations: {
        intentsCreated: eventsByType.recommendation_intent_created ?? 0,
        outcomesCompleted: eventsByType.recommendation_completed ?? 0,
      },
      calibration: {
        eligible: data.calibration.filter((row) => row.eligible).length,
        hiddenLowEvidence: data.calibration.filter((row) => !row.eligible).length,
        quieted: data.calibration.filter((row) => row.status === 'quieted').length,
        dismissed: data.calibration.filter((row) => row.status === 'dismissed').length,
      },
      recaps: {
        generated: data.recaps.length,
        corrected: data.recaps.filter((row) => row.status === 'corrected').length,
        dismissed: data.recaps.filter((row) => row.status === 'dismissed').length,
        validationFailures: data.recaps.filter((row) => !row.validationPassed).length,
      },
      alarms: {
        candidates: data.alarms.length,
        active: data.alarms.filter((row) => row.status === 'active').length,
        snoozed: data.alarms.filter((row) => row.status === 'snoozed').length,
        acceptedOrResolved: data.alarms.filter((row) => row.status === 'resolved').length,
        dismissed: data.alarms.filter((row) => row.status === 'dismissed').length,
        falsePositiveReports: data.alarms.filter((row) => row.falsePositive).length,
        averageConfidenceBasisPoints: average(data.alarms.map((row) => row.content.confidenceBasisPoints)),
      },
      functions: functionRows,
      releaseGate: {
        stage9PhysicalMicrophoneDeviceQaPassed: false,
        stage10HumanRepeatUsePassed: false,
        stage11HumanReflectionAcceptancePassed: false,
        productionReady: false,
      },
    };
  }

  async evidence(query: PetrosReflectionEvidenceQuery, ctx: ActionContext) {
    const rows = await this.repo.evidence(
      { institutionId: query.institutionId, studentId: query.studentId },
      query.entityType,
      query.entityId,
    );
    await this.audit.logAudit({
      ...baseAudit(ctx),
      action: 'petros.reflection.evidence.view',
      module: 'petros',
      entityType: query.entityType,
      entityId: query.entityId,
      newState: {
        institutionId: query.institutionId,
        studentId: query.studentId,
        evidenceCount: rows.length,
        privilegedIndividualEvidence: true,
      },
    } as Parameters<AuditWriter['logAudit']>[0]);
    return rows.map((row) => ({
      ...row,
      observedAt: row.observedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  private async surface(
    scope: PetrosOwnerScope,
    snapshotId: string,
    latestSourceAt: Date | null,
    latestGraphAt: Date | null,
  ) {
    const rows = await this.repo.snapshotRows(scope, snapshotId);
    if (!rows.snapshot || !rows.calibration) throw new Error('Reflection snapshot is incomplete.');
    const evidenceByEntity = new Map<string, typeof rows.evidence>();
    for (const link of rows.evidence) {
      const key = `${link.entityType}:${link.entityId}`;
      evidenceByEntity.set(key, [...(evidenceByEntity.get(key) ?? []), link]);
    }
    const toEvidence = (entityType: string, entityId: string) =>
      (evidenceByEntity.get(`${entityType}:${entityId}`) ?? []).map((row) => ({
        id: row.id,
        sourceType: row.sourceType as 'learner_evidence' | 'session_observation' | 'planning_decision' | 'curriculum' | 'teach_back_verdict',
        sourceId: row.sourceId,
        label: row.label,
        observedAt: row.observedAt?.toISOString() ?? null,
        ageDays: row.observedAt
          ? Math.max(0, Math.floor((Date.now() - row.observedAt.getTime()) / 86_400_000))
          : null,
      }));
    const topics = rows.topics.map((row) => ({
      conceptId: row.conceptId,
      topicId: row.topicId,
      title: row.title,
      subjectLabel: row.subjectLabel,
      curriculumLabel: row.curriculumLabel,
      state: row.state as 'solid' | 'shaky' | 'untouched' | 'insufficient_evidence',
      stateExplanation: row.stateExplanation,
      evidenceCount: row.evidenceCount,
      masteryBasisPoints: row.masteryBasisPoints,
      uncertaintyBasisPoints: row.uncertaintyBasisPoints,
      freshness: row.freshness as 'fresh' | 'aging' | 'stale' | 'none',
      evidenceAgeDays: row.evidenceAgeDays,
      lastEvidenceAt: row.lastEvidenceAt?.toISOString() ?? null,
      prerequisiteConceptIds: row.prerequisiteConceptIds,
      dependentConceptIds: row.dependentConceptIds,
      examRelevance: row.examRelevance,
      evidence: toEvidence('map_state', row.id),
      recommendationId: row.recommendationId,
    }));
    const recommendations = rows.recommendations.filter((row) => row.status === 'active').map((row) => ({
      id: row.id,
      conceptId: row.conceptId,
      topicId: row.topicId,
      title: row.title,
      actionLabel: row.actionLabel,
      sessionType: row.sessionType,
      score: row.score,
      reasons: row.reasons,
      whyThis: row.whyThis,
      evidenceAgeDays: row.evidenceAgeDays,
      status: row.status,
    }));
    const calibration = {
      id: rows.calibration.id,
      eligible: rows.calibration.eligible,
      evidenceCount: rows.calibration.evidenceCount,
      minimumEvidence: PETROS_REFLECTION_THRESHOLDS.calibrationMinimumEvidence,
      direction: rows.calibration.direction,
      trend: rows.calibration.trend,
      meanConfidenceBasisPoints: rows.calibration.meanConfidenceBasisPoints,
      meanOutcomeBasisPoints: rows.calibration.meanOutcomeBasisPoints,
      gapBasisPoints: rows.calibration.gapBasisPoints,
      uncertaintyBasisPoints: rows.calibration.uncertaintyBasisPoints,
      headline: rows.calibration.headline,
      explanation: rows.calibration.explanation,
      actionRecommendationId:
        rows.calibration.actionRecommendationId &&
        recommendations.some((row) => row.id === rows.calibration?.actionRecommendationId)
          ? rows.calibration.actionRecommendationId
          : null,
      quietUntil: rows.calibration.quietUntil?.toISOString() ?? null,
      status: rows.calibration.status,
      evidence: toEvidence('calibration', rows.calibration.id),
    };
    const recaps = rows.recaps.map((row) => ({
      id: row.id,
      sessionId: row.sessionId,
      topic: row.topic,
      closedAt: row.closedAt.toISOString(),
      content: row.content,
      evidence: toEvidence('recap', row.id),
      status: row.status,
      correctedText: row.correctedText,
      generation: {
        source: row.generationSource,
        functionKey: PETROS_REFLECTION_FUNCTIONS.recap,
        validationPassed: row.validationPassed,
      },
    }));
    const alarms = rows.alarms.map((row) => ({
      id: row.id,
      fingerprint: row.fingerprint,
      content: row.content,
      evidence: toEvidence('alarm', row.id),
      recommendationId:
        row.recommendationId && recommendations.some((item) => item.id === row.recommendationId)
          ? row.recommendationId
          : null,
      status: row.status,
      snoozedUntil: row.snoozedUntil?.toISOString() ?? null,
      generation: {
        source: row.generationSource,
        functionKey: PETROS_REFLECTION_FUNCTIONS.gapExplanation,
        validationPassed: row.validationPassed,
      },
    }));
    const stale = isReflectionStale({
      snapshotSourceThroughAt: rows.snapshot.sourceThroughAt,
      snapshotGraphUpdatedAt: rows.snapshot.graphUpdatedAt,
      latestSourceAt,
      latestGraphAt,
    });
    const sourceThroughAt = rows.snapshot.sourceThroughAt;
    return petrosReflectionSurfaceSchema.parse({
      schemaVersion: PETROS_REFLECTION_SCHEMA_VERSION,
      algorithmVersion: PETROS_REFLECTION_ALGORITHM_VERSION,
      rebuiltAt: rows.snapshot.completedAt.toISOString(),
      sourceThroughAt: sourceThroughAt?.toISOString() ?? null,
      stale,
      jobLagSeconds: sourceThroughAt
        ? Math.max(0, Math.floor((rows.snapshot.completedAt.getTime() - sourceThroughAt.getTime()) / 1_000))
        : 0,
      thresholds: PETROS_REFLECTION_THRESHOLDS,
      map: {
        topics,
        relationships: topics.flatMap((topic) =>
          topic.prerequisiteConceptIds.map((prerequisite) => ({
            fromConceptId: prerequisite,
            toConceptId: topic.conceptId,
          })),
        ),
        coverage: Object.fromEntries(
          ['solid', 'shaky', 'untouched', 'insufficient_evidence'].map((state) => [
            state,
            topics.filter((topic) => topic.state === state).length,
          ]),
        ),
        missingSyllabusLinks: rows.snapshot.missingSyllabusLinks,
      },
      recommendations,
      calibration,
      recaps,
      alarms,
      voiceRequired: false,
      productionReady: false,
    });
  }

  private async enhanceRecap(
    scope: PetrosOwnerScope,
    deterministic: PetrosSessionRecap,
  ): Promise<FunctionDerivation<PetrosSessionRecap>> {
    const started = Date.now();
    try {
      const result = await this.gateway.execute({
        context: {
          functionKey: PETROS_REFLECTION_FUNCTIONS.recap,
          topic: deterministic.topic,
          sessionType: 'reflection',
          inputModality: 'text',
          language: 'en',
          institutionId: scope.institutionId,
          studentId: scope.studentId,
          estimatedTokens: 900,
          currentCostMicros: 0,
          previousFailures: 0,
          requiredReasoningQuality: 0.6,
        },
        system: 'Rewrite only the supplied structured observed facts and tentative inferences into a concise respectful session-process recap. Keep facts and tentative inference separate. Never claim a durable preference, personality, ability, diagnosis, or hidden reasoning. Preserve every evidence-link ID exactly.',
        input: [{ type: 'text', text: JSON.stringify({ content: deterministic.content, evidence: deterministic.evidence }) }],
        responseSchema: zodToJsonSchema(petrosSessionRecapContentSchema, { $refStrategy: 'none' }) as Record<string, unknown>,
        sessionId: deterministic.sessionId,
        metadata: { reflectionSurface: 'recap', rawStudentAnswerIncluded: false },
      });
      const content = petrosSessionRecapContentSchema.parse(result.content);
      assertEvidenceSubset(content, deterministic.evidence.map((row) => row.id));
      return {
        value: {
          ...deterministic,
          content,
          generation: { source: 'ai', functionKey: PETROS_REFLECTION_FUNCTIONS.recap, validationPassed: true },
        },
        result,
        validationPassed: true,
        durationMs: Date.now() - started,
      };
    } catch (error) {
      const validationPassed = !isValidationError(error);
      return {
        value: {
          ...deterministic,
          generation: { source: 'deterministic_fallback', functionKey: PETROS_REFLECTION_FUNCTIONS.recap, validationPassed },
        },
        result: null,
        validationPassed,
        durationMs: Date.now() - started,
        errorCode: providerNeutralError(error),
      };
    }
  }

  private async enhanceAlarm(
    scope: PetrosOwnerScope,
    deterministic: PetrosGapAlarm,
  ): Promise<FunctionDerivation<PetrosGapAlarm>> {
    const started = Date.now();
    try {
      const result = await this.gateway.execute({
        context: {
          functionKey: PETROS_REFLECTION_FUNCTIONS.gapExplanation,
          topic: deterministic.content.prerequisiteLabel,
          sessionType: 'reflection',
          inputModality: 'text',
          language: 'en',
          institutionId: scope.institutionId,
          studentId: scope.studentId,
          estimatedTokens: 700,
          currentCostMicros: 0,
          previousFailures: 0,
          requiredReasoningQuality: 0.6,
        },
        system: 'Explain the supplied deterministic prerequisite candidate gently. It is a hypothesis, not a fact. Preserve prerequisite, affected topics, counts, confidence, repair time, schema version, and uncertainty label exactly. Add no new evidence.',
        input: [{ type: 'text', text: JSON.stringify(deterministic.content) }],
        responseSchema: zodToJsonSchema(petrosGapAlarmContentSchema, { $refStrategy: 'none' }) as Record<string, unknown>,
        metadata: { reflectionSurface: 'gap_alarm', deterministicCandidate: true, rawStudentAnswerIncluded: false },
      });
      const content = petrosGapAlarmContentSchema.parse(result.content);
      assertGapInvariants(deterministic.content, content);
      return {
        value: {
          ...deterministic,
          content,
          generation: { source: 'ai', functionKey: PETROS_REFLECTION_FUNCTIONS.gapExplanation, validationPassed: true },
        },
        result,
        validationPassed: true,
        durationMs: Date.now() - started,
      };
    } catch (error) {
      const validationPassed = !isValidationError(error);
      return {
        value: {
          ...deterministic,
          generation: { source: 'deterministic_fallback', functionKey: PETROS_REFLECTION_FUNCTIONS.gapExplanation, validationPassed },
        },
        result: null,
        validationPassed,
        durationMs: Date.now() - started,
        errorCode: providerNeutralError(error),
      };
    }
  }

  private functionEvent<T extends PetrosSessionRecap | PetrosGapAlarm>(
    scope: PetrosOwnerScope,
    snapshotId: string,
    derivation: FunctionDerivation<T>,
  ) {
    const functionKey = derivation.value.generation.functionKey;
    const fallback = derivation.value.generation.source !== 'ai';
    return this.event(scope, randomUUID(), fallback ? `${entityType(derivation.value)}_fallback` : `${entityType(derivation.value)}_generated`, {
      snapshotId,
      entityType: entityType(derivation.value),
      entityId: derivation.value.id,
      functionKey,
      durationMs: derivation.durationMs,
      validationPassed: derivation.validationPassed,
      errorCode: derivation.errorCode,
      result: derivation.result,
      payload: { fallback, structuredOutput: true, rawStudentContentStored: false },
    });
  }

  private event(
    scope: PetrosOwnerScope,
    idempotencyKey: string,
    type: string,
    options: {
      snapshotId?: string;
      entityType?: string;
      entityId?: string;
      functionKey?: string;
      durationMs?: number;
      validationPassed?: boolean;
      errorCode?: string;
      result?: PetrosAiExecuteResult | null;
      payload?: Record<string, unknown>;
    },
  ) {
    return this.repo.recordEvent({
      ...scope,
      snapshotId: options.snapshotId,
      entityType: options.entityType,
      entityId: options.entityId,
      type,
      functionKey: options.functionKey,
      providerKey: options.result?.providerKey,
      modelKey: options.result?.modelKey,
      algorithmVersion: PETROS_REFLECTION_ALGORITHM_VERSION,
      schemaVersion: PETROS_REFLECTION_SCHEMA_VERSION,
      durationMs: options.durationMs,
      retryCount: options.result?.retryCount ?? 0,
      fallbackTier: options.result?.fallbackTier,
      estimatedCostMicros: options.result?.estimatedCostMicros ?? 0,
      actualCostMicros: options.result?.actualCostMicros,
      validationPassed: options.validationPassed ?? true,
      errorCode: options.errorCode,
      idempotencyKey,
      payload: options.payload ?? {},
    });
  }
}

interface FunctionDerivation<T> {
  value: T;
  result: PetrosAiExecuteResult | null;
  validationPassed: boolean;
  durationMs: number;
  errorCode?: string;
}

function owner(principal: InstitutionalStudentPrincipal): PetrosOwnerScope {
  return { institutionId: principal.institutionId, studentId: principal.studentId };
}

function assertEvidenceSubset(
  content: PetrosSessionRecap['content'],
  allowed: string[],
) {
  const cited = [
    ...content.observedFacts.flatMap((row) => row.evidenceLinkIds),
    ...content.tentativeInferences.flatMap((row) => row.evidenceLinkIds),
  ];
  if (cited.some((id) => !allowed.includes(id))) {
    throw new Error('REFLECTION_EVIDENCE_VALIDATION_FAILED');
  }
}

function assertGapInvariants(
  expected: PetrosGapAlarm['content'],
  actual: PetrosGapAlarm['content'],
) {
  const stable = (value: PetrosGapAlarm['content']) => JSON.stringify({
    schemaVersion: value.schemaVersion,
    prerequisiteConceptId: value.prerequisiteConceptId,
    prerequisiteLabel: value.prerequisiteLabel,
    affectedTopics: value.affectedTopics,
    independentEvidenceCount: value.independentEvidenceCount,
    confidenceBasisPoints: value.confidenceBasisPoints,
    practicalMinutes: value.practicalMinutes,
    uncertaintyLabel: value.uncertaintyLabel,
  });
  if (stable(expected) !== stable(actual)) throw new Error('REFLECTION_GAP_INVARIANT_FAILED');
}

function entityType(value: PetrosSessionRecap | PetrosGapAlarm) {
  return 'sessionId' in value ? 'recap' : 'alarm';
}

function isValidationError(error: unknown) {
  return error instanceof ZodError || (error instanceof Error && /validation|invariant|evidence/i.test(error.message));
}

function providerNeutralError(error: unknown) {
  if (isValidationError(error)) return 'REFLECTION_STRUCTURED_VALIDATION_FAILED';
  return 'REFLECTION_AI_UNAVAILABLE';
}

function counts(values: string[]) {
  return values.reduce<Record<string, number>>((result, value) => {
    result[value] = (result[value] ?? 0) + 1;
    return result;
  }, {});
}

function average(values: number[]) {
  return values.length
    ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)
    : 0;
}

function derivedUuid(value: string, purpose: string) {
  const hash = digest(`${value}:${purpose}`);
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

function notFound() {
  return new NotFoundException({
    code: 'PETROS_REFLECTION_NOT_FOUND',
    message: 'This reflection item is unavailable or you do not have access to it.',
  });
}
