import { Inject, Injectable } from '@nestjs/common';
import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  lte,
  or,
  schema,
  sql,
  type Database,
} from '@edrion/database';
import type {
  PetrosCalibrationInsight,
  PetrosGapAlarm,
  PetrosKnowledgeMapTopic,
  PetrosReflectionDashboardQuery,
  PetrosReflectionEvidenceLink,
  PetrosReflectionRecommendation,
  PetrosSessionRecap,
} from '@edrion/schemas';
import { DATABASE } from '../../../common/tokens';
import type { PetrosOwnerScope } from '../petros-loop/petros-loop.repository';
import type {
  ReflectionCurriculumTopic,
  ReflectionEvidence,
  ReflectionMastery,
  ReflectionSessionEvidence,
} from './petros-reflection.engine';

export interface ReflectionSourceBundle {
  topics: ReflectionCurriculumTopic[];
  mastery: ReflectionMastery[];
  evidence: ReflectionEvidence[];
  sessions: ReflectionSessionEvidence[];
  sourceThroughAt: Date | null;
  graphUpdatedAt: Date | null;
}

@Injectable()
export class PetrosReflectionRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async sourceBundle(scope: PetrosOwnerScope): Promise<ReflectionSourceBundle> {
    const [topicRows, pathRows, profileRows, prerequisiteRows, masteryRows, evidenceRows, sessionRows] =
      await Promise.all([
        this.db
          .select()
          .from(schema.learnTopics)
          .where(or(isNull(schema.learnTopics.institutionId), eq(schema.learnTopics.institutionId, scope.institutionId)))
          .orderBy(asc(schema.learnTopics.subjectLabel), asc(schema.learnTopics.title))
          .limit(300),
        this.db
          .select({
            path: schema.learningPaths,
            item: schema.learningPathItems,
            topic: schema.learnTopics,
          })
          .from(schema.learningPathItems)
          .innerJoin(schema.learningPaths, eq(schema.learningPaths.id, schema.learningPathItems.pathId))
          .innerJoin(schema.learnTopics, eq(schema.learnTopics.id, schema.learningPathItems.topicId))
          .where(
            and(
              eq(schema.learningPaths.institutionId, scope.institutionId),
              eq(schema.learningPaths.studentId, scope.studentId),
              eq(schema.learningPaths.status, 'active'),
            ),
          )
          .orderBy(asc(schema.learningPathItems.sequence)),
        this.db
          .select({
            learnTopicId: schema.petrosTopicProfiles.learnTopicId,
            topicKey: schema.petrosTopicProfiles.topicKey,
            curriculumLabel: schema.petrosTopicProfiles.curriculumLabel,
            publishedVersionId: schema.petrosTopicProfiles.publishedVersionId,
            updatedAt: schema.petrosTopicProfiles.updatedAt,
          })
          .from(schema.petrosTopicProfiles)
          .where(eq(schema.petrosTopicProfiles.status, 'published')),
        this.db
          .select({
            versionId: schema.petrosTopicProfilePrerequisites.profileVersionId,
            conceptKey: schema.petrosTopicProfilePrerequisites.conceptKey,
          })
          .from(schema.petrosTopicProfilePrerequisites),
        this.db
          .select()
          .from(schema.petrosLearnerConceptMastery)
          .where(
            and(
              eq(schema.petrosLearnerConceptMastery.institutionId, scope.institutionId),
              eq(schema.petrosLearnerConceptMastery.studentId, scope.studentId),
              eq(
                schema.petrosLearnerConceptMastery.algorithmVersion,
                'petros.learner-model.stage6.v1',
              ),
            ),
          ),
        this.db
          .select()
          .from(schema.petrosLearnerEvidenceEvents)
          .where(
            and(
              eq(schema.petrosLearnerEvidenceEvents.institutionId, scope.institutionId),
              eq(schema.petrosLearnerEvidenceEvents.studentId, scope.studentId),
              eq(schema.petrosLearnerEvidenceEvents.environment, 'production'),
              eq(schema.petrosLearnerEvidenceEvents.synthetic, false),
            ),
          )
          .orderBy(asc(schema.petrosLearnerEvidenceEvents.occurredAt)),
        this.db
          .select()
          .from(schema.petrosLearningSessions)
          .where(
            and(
              eq(schema.petrosLearningSessions.institutionId, scope.institutionId),
              eq(schema.petrosLearningSessions.studentId, scope.studentId),
              eq(schema.petrosLearningSessions.status, 'closed'),
            ),
          )
          .orderBy(desc(schema.petrosLearningSessions.closedAt))
          .limit(20),
      ]);

    const profileByTopic = new Map(
      profileRows
        .filter((row) => row.learnTopicId)
        .map((row) => [row.learnTopicId!, row]),
    );
    const prerequisitesByVersion = groupBy(
      prerequisiteRows,
      (row) => row.versionId,
    );
    const activeTopicIds = new Set(pathRows.map((row) => row.topic.id));
    const selectedTopics = topicRows.filter(
      (topic) => activeTopicIds.has(topic.id) || profileByTopic.has(topic.id),
    );
    const fallbackTopics = selectedTopics.length
      ? selectedTopics
      : topicRows.filter((topic) =>
          masteryRows.some(
            (row) => row.topicId === topic.topicKey || row.topicId === topic.id,
          ),
        );
    const pathByTopic = new Map(pathRows.map((row) => [row.topic.id, row]));
    const topics: ReflectionCurriculumTopic[] = fallbackTopics.map((topic) => {
      const profile = profileByTopic.get(topic.id);
      const path = pathByTopic.get(topic.id);
      return {
        conceptId: topic.topicKey,
        topicId: topic.id,
        title: topic.title,
        subjectLabel: topic.subjectLabel,
        curriculumLabel: profile?.curriculumLabel ?? topic.curriculumKey,
        prerequisiteConceptIds: profile?.publishedVersionId
          ? (prerequisitesByVersion.get(profile.publishedVersionId) ?? []).map(
              (row) => row.conceptKey,
            )
          : [],
        learnerGoal: Boolean(path),
        syllabusLinked: Boolean(path || profile),
      };
    });
    const titleById = new Map(topics.map((topic) => [topic.topicId, topic]));
    // Learner evidence is keyed by entity reference ("assignment:<uuid>"), so humanizing the
    // key produced titles like "assignment 35dcabe7 2dac 41d5". Resolve the real names first.
    const entityLabels = await this.entityLabels(scope, [
      ...masteryRows.map((row) => row.conceptId),
      ...masteryRows.map((row) => row.topicId),
    ]);
    for (const mastery of masteryRows) {
      if (topics.some((topic) => topic.conceptId === mastery.conceptId)) continue;
      const known = titleById.get(mastery.topicId);
      topics.push({
        conceptId: mastery.conceptId,
        topicId: mastery.topicId,
        title:
          known?.title ??
          entityLabels.get(mastery.conceptId) ??
          conceptFallback(
            mastery.conceptId,
            known?.subjectLabel ?? entityLabels.get(mastery.topicId),
          ),
        subjectLabel:
          known?.subjectLabel ??
          entityLabels.get(mastery.topicId) ??
          conceptFallback(mastery.topicId),
        curriculumLabel: known?.curriculumLabel ?? 'Learner evidence without a published syllabus link',
        prerequisiteConceptIds: mastery.prerequisiteConceptIds,
        learnerGoal: false,
        syllabusLinked: Boolean(known),
      });
    }
    const mastery: ReflectionMastery[] = masteryRows.map((row) => ({
      conceptId: row.conceptId,
      topicId: row.topicId,
      masteryBasisPoints: row.masteryBasisPoints,
      uncertaintyBasisPoints: row.uncertaintyBasisPoints,
      evidenceCount: row.evidenceCount,
      lastTouchedAt: row.lastTouchedAt,
      nextReviewAt: row.nextReviewAt,
    }));
    const evidence: ReflectionEvidence[] = evidenceRows.map((row) => ({
      id: row.id,
      sourceEventId: row.sourceEventId,
      conceptId: row.conceptId,
      topicId: row.topicId,
      prerequisiteConceptIds: row.prerequisiteConceptIds,
      outcome: row.outcome,
      creditBasisPoints: row.creditBasisPoints,
      confidenceAfter: row.confidenceAfter as ReflectionEvidence['confidenceAfter'],
      errorCategory: row.errorCategory,
      occurredAt: row.occurredAt,
    }));
    const sessions = await this.sessionEvidence(scope, sessionRows);
    const sourceTimes = [
      ...evidenceRows.map((row) => row.occurredAt),
      ...sessionRows.map((row) => row.updatedAt),
    ];
    const graphTimes = [
      ...topicRows.map((row) => row.createdAt),
      ...profileRows.map((row) => row.updatedAt),
    ];
    return {
      topics,
      mastery,
      evidence,
      sessions,
      sourceThroughAt: latest(sourceTimes),
      graphUpdatedAt: latest(graphTimes),
    };
  }

  private async sessionEvidence(
    scope: PetrosOwnerScope,
    sessions: Array<typeof schema.petrosLearningSessions.$inferSelect>,
  ): Promise<ReflectionSessionEvidence[]> {
    if (!sessions.length) return [];
    const ids = sessions.map((row) => row.id);
    const [decisions, observations] = await Promise.all([
      this.db
        .select()
        .from(schema.petrosPlanningDecisions)
        .where(
          and(
            inArray(schema.petrosPlanningDecisions.sessionId, ids),
            eq(schema.petrosPlanningDecisions.institutionId, scope.institutionId),
            eq(schema.petrosPlanningDecisions.studentId, scope.studentId),
          ),
        )
        .orderBy(asc(schema.petrosPlanningDecisions.sequence)),
      this.db
        .select({ observation: schema.petrosObservations, evaluation: schema.petrosAnswerEvaluations })
        .from(schema.petrosObservations)
        .leftJoin(
          schema.petrosAnswerEvaluations,
          eq(schema.petrosAnswerEvaluations.observationId, schema.petrosObservations.id),
        )
        .where(
          and(
            inArray(schema.petrosObservations.sessionId, ids),
            eq(schema.petrosObservations.institutionId, scope.institutionId),
            eq(schema.petrosObservations.studentId, scope.studentId),
          ),
        )
        .orderBy(asc(schema.petrosObservations.occurredAt)),
    ]);
    return sessions.map((session) => ({
      sessionId: session.id,
      topic: session.topic,
      closedAt: session.closedAt ?? session.updatedAt,
      moves: decisions
        .filter((row) => row.sessionId === session.id)
        .map((row) => ({
          id: row.id,
          type: row.selectedMoveType,
          reason: row.studentSafeReason,
          createdAt: row.createdAt,
        })),
      observations: observations
        .filter((row) => row.observation.sessionId === session.id)
        .map(({ observation, evaluation }) => ({
          id: observation.id,
          type: observation.type,
          confidence: observation.confidence,
          correctness: evaluation?.correctness ?? null,
          errorClass: evaluation?.errorClass ?? null,
          fragileSuccess: evaluation?.fragileSuccess ?? false,
          recovery: Boolean(observation.payload.recovery),
          occurredAt: observation.occurredAt,
        })),
    }));
  }

  latestSnapshot(scope: PetrosOwnerScope) {
    return this.db
      .select()
      .from(schema.petrosReflectionSnapshots)
      .where(
        and(
          eq(schema.petrosReflectionSnapshots.institutionId, scope.institutionId),
          eq(schema.petrosReflectionSnapshots.studentId, scope.studentId),
          eq(schema.petrosReflectionSnapshots.status, 'completed'),
        ),
      )
      .orderBy(desc(schema.petrosReflectionSnapshots.completedAt))
      .limit(1)
      .then((rows) => rows[0]);
  }

  findSnapshotBySource(
    scope: PetrosOwnerScope,
    algorithmVersion: string,
    sourceHash: string,
  ) {
    return this.db
      .select()
      .from(schema.petrosReflectionSnapshots)
      .where(
        and(
          eq(schema.petrosReflectionSnapshots.institutionId, scope.institutionId),
          eq(schema.petrosReflectionSnapshots.studentId, scope.studentId),
          eq(schema.petrosReflectionSnapshots.algorithmVersion, algorithmVersion),
          eq(schema.petrosReflectionSnapshots.sourceHash, sourceHash),
        ),
      )
      .limit(1)
      .then((rows) => rows[0]);
  }

  async persist(input: {
    scope: PetrosOwnerScope;
    schemaVersion: string;
    algorithmVersion: string;
    sourceHash: string;
    idempotencyKey: string;
    sourceThroughAt: Date | null;
    graphUpdatedAt: Date | null;
    topics: PetrosKnowledgeMapTopic[];
    recommendations: PetrosReflectionRecommendation[];
    calibration: PetrosCalibrationInsight;
    recaps: PetrosSessionRecap[];
    alarms: PetrosGapAlarm[];
    missingSyllabusLinks: number;
    validationFailureCount: number;
    fallbackCount: number;
  }) {
    return this.db.transaction(async (tx) => {
      const [snapshot] = await tx
        .insert(schema.petrosReflectionSnapshots)
        .values({
          ...input.scope,
          schemaVersion: input.schemaVersion,
          algorithmVersion: input.algorithmVersion,
          sourceHash: input.sourceHash,
          idempotencyKey: input.idempotencyKey,
          sourceThroughAt: input.sourceThroughAt,
          graphUpdatedAt: input.graphUpdatedAt,
          mapStateCount: input.topics.length,
          recommendationCount: input.recommendations.length,
          recapCount: input.recaps.length,
          alarmCount: input.alarms.length,
          missingSyllabusLinks: input.missingSyllabusLinks,
          validationFailureCount: input.validationFailureCount,
          fallbackCount: input.fallbackCount,
        })
        .onConflictDoNothing()
        .returning();
      if (!snapshot) return null;

      if (input.recommendations.length) {
        const fingerprints = input.recommendations.map(sourceFingerprint);
        const priorRows = await tx
          .select({
            sourceFingerprint: schema.petrosReflectionRecommendations.sourceFingerprint,
            status: schema.petrosReflectionRecommendations.status,
          })
          .from(schema.petrosReflectionRecommendations)
          .where(
            and(
              eq(schema.petrosReflectionRecommendations.institutionId, input.scope.institutionId),
              eq(schema.petrosReflectionRecommendations.studentId, input.scope.studentId),
              inArray(schema.petrosReflectionRecommendations.sourceFingerprint, fingerprints),
            ),
          )
          .orderBy(desc(schema.petrosReflectionRecommendations.updatedAt));
        const priorStatus = new Map<string, string>();
        for (const row of priorRows) {
          if (!priorStatus.has(row.sourceFingerprint)) priorStatus.set(row.sourceFingerprint, row.status);
        }
        await tx.insert(schema.petrosReflectionRecommendations).values(
          input.recommendations.map((row) => ({
            id: row.id,
            snapshotId: snapshot.id,
            ...input.scope,
            conceptId: row.conceptId,
            topicId: row.topicId,
            title: row.title,
            actionLabel: row.actionLabel,
            sessionType: row.sessionType,
            score: row.score,
            reasons: row.reasons,
            whyThis: row.whyThis,
            evidenceAgeDays: row.evidenceAgeDays == null ? null : Math.floor(row.evidenceAgeDays),
            sourceFingerprint: sourceFingerprint(row),
            status: priorStatus.get(sourceFingerprint(row)) === 'dismissed' ? 'dismissed' : row.status,
            algorithmVersion: input.algorithmVersion,
          })),
        );
      }
      const mapRows = input.topics.length
        ? await tx
            .insert(schema.petrosReflectionMapStates)
            .values(
              input.topics.map((row) => ({
                snapshotId: snapshot.id,
                ...input.scope,
                conceptId: row.conceptId,
                topicId: row.topicId,
                title: row.title,
                subjectLabel: row.subjectLabel,
                curriculumLabel: row.curriculumLabel,
                state: row.state,
                stateExplanation: row.stateExplanation,
                evidenceCount: row.evidenceCount,
                masteryBasisPoints: row.masteryBasisPoints,
                uncertaintyBasisPoints: row.uncertaintyBasisPoints,
                freshness: row.freshness,
                evidenceAgeDays: row.evidenceAgeDays == null ? null : Math.floor(row.evidenceAgeDays),
                lastEvidenceAt: row.lastEvidenceAt ? new Date(row.lastEvidenceAt) : null,
                prerequisiteConceptIds: row.prerequisiteConceptIds,
                dependentConceptIds: row.dependentConceptIds,
                examRelevance: row.examRelevance,
                recommendationId: row.recommendationId,
                algorithmVersion: input.algorithmVersion,
              })),
            )
            .returning()
        : [];
      const priorCalibration = await tx
        .select()
        .from(schema.petrosReflectionCalibrationInsights)
        .where(
          and(
            eq(schema.petrosReflectionCalibrationInsights.institutionId, input.scope.institutionId),
            eq(schema.petrosReflectionCalibrationInsights.studentId, input.scope.studentId),
          ),
        )
        .orderBy(desc(schema.petrosReflectionCalibrationInsights.createdAt))
        .limit(1)
        .then((rows) => rows[0]);
      await tx.insert(schema.petrosReflectionCalibrationInsights).values({
        id: input.calibration.id,
        snapshotId: snapshot.id,
        ...input.scope,
        eligible: input.calibration.eligible,
        evidenceCount: input.calibration.evidenceCount,
        direction: input.calibration.direction,
        trend: input.calibration.trend,
        meanConfidenceBasisPoints: input.calibration.meanConfidenceBasisPoints,
        meanOutcomeBasisPoints: input.calibration.meanOutcomeBasisPoints,
        gapBasisPoints: input.calibration.gapBasisPoints,
        uncertaintyBasisPoints: input.calibration.uncertaintyBasisPoints,
        headline: input.calibration.headline,
        explanation: input.calibration.explanation,
        actionRecommendationId: input.calibration.actionRecommendationId,
        status: carryCalibrationStatus(priorCalibration, input.calibration.status),
        quietUntil: priorCalibration?.quietUntil ?? null,
        algorithmVersion: input.algorithmVersion,
      });
      for (const recap of input.recaps) {
        await tx
          .insert(schema.petrosReflectionSessionRecaps)
          .values({
            id: recap.id,
            snapshotId: snapshot.id,
            sessionId: recap.sessionId,
            ...input.scope,
            topic: recap.topic,
            content: recap.content,
            status: recap.status,
            correctedText: recap.correctedText,
            generationSource: recap.generation.source,
            functionKey: recap.generation.functionKey,
            validationPassed: recap.generation.validationPassed,
            closedAt: new Date(recap.closedAt),
            algorithmVersion: input.algorithmVersion,
          })
          .onConflictDoUpdate({
            target: [
              schema.petrosReflectionSessionRecaps.sessionId,
              schema.petrosReflectionSessionRecaps.algorithmVersion,
            ],
            set: { snapshotId: snapshot.id },
          });
      }
      for (const alarm of input.alarms) {
        await tx
          .insert(schema.petrosReflectionGapAlarms)
          .values({
            id: alarm.id,
            snapshotId: snapshot.id,
            ...input.scope,
            fingerprint: alarm.fingerprint,
            content: alarm.content,
            recommendationId: alarm.recommendationId,
            status: alarm.status,
            generationSource: alarm.generation.source,
            functionKey: alarm.generation.functionKey,
            validationPassed: alarm.generation.validationPassed,
            algorithmVersion: input.algorithmVersion,
          })
          .onConflictDoUpdate({
            target: [
              schema.petrosReflectionGapAlarms.institutionId,
              schema.petrosReflectionGapAlarms.studentId,
              schema.petrosReflectionGapAlarms.fingerprint,
              schema.petrosReflectionGapAlarms.algorithmVersion,
            ],
            set: {
              snapshotId: snapshot.id,
              content: alarm.content,
              recommendationId: alarm.recommendationId,
              updatedAt: new Date(),
            },
          });
      }
      const recapRows = await tx
        .select()
        .from(schema.petrosReflectionSessionRecaps)
        .where(
          and(
            eq(schema.petrosReflectionSessionRecaps.snapshotId, snapshot.id),
            eq(schema.petrosReflectionSessionRecaps.institutionId, input.scope.institutionId),
            eq(schema.petrosReflectionSessionRecaps.studentId, input.scope.studentId),
          ),
        );
      const alarmRows = await tx
        .select()
        .from(schema.petrosReflectionGapAlarms)
        .where(
          and(
            eq(schema.petrosReflectionGapAlarms.snapshotId, snapshot.id),
            eq(schema.petrosReflectionGapAlarms.institutionId, input.scope.institutionId),
            eq(schema.petrosReflectionGapAlarms.studentId, input.scope.studentId),
          ),
        );
      const links: Array<typeof schema.petrosReflectionEvidenceLinks.$inferInsert> = [];
      for (const row of mapRows) {
        const source = input.topics.find((topic) => topic.conceptId === row.conceptId);
        links.push(...evidenceValues(snapshot.id, input.scope, 'map_state', row.id, source?.evidence ?? []));
      }
      links.push(
        ...evidenceValues(snapshot.id, input.scope, 'calibration', input.calibration.id, input.calibration.evidence),
      );
      for (const row of recapRows) {
        const source = input.recaps.find((recap) => recap.sessionId === row.sessionId);
        links.push(...evidenceValues(snapshot.id, input.scope, 'recap', row.id, source?.evidence ?? []));
      }
      for (const row of alarmRows) {
        const source = input.alarms.find((alarm) => alarm.fingerprint === row.fingerprint);
        links.push(...evidenceValues(snapshot.id, input.scope, 'alarm', row.id, source?.evidence ?? []));
      }
      if (links.length) {
        await tx
          .insert(schema.petrosReflectionEvidenceLinks)
          .values(links)
          .onConflictDoUpdate({
            target: [
              schema.petrosReflectionEvidenceLinks.entityType,
              schema.petrosReflectionEvidenceLinks.entityId,
              schema.petrosReflectionEvidenceLinks.sourceType,
              schema.petrosReflectionEvidenceLinks.sourceId,
            ],
            set: {
              snapshotId: snapshot.id,
              institutionId: input.scope.institutionId,
              studentId: input.scope.studentId,
            },
          });
      }
      return snapshot;
    });
  }

  async snapshotRows(scope: PetrosOwnerScope, snapshotId: string) {
    const [snapshot, topics, recommendations, calibration, recaps, alarms, evidence] =
      await Promise.all([
        this.db
          .select()
          .from(schema.petrosReflectionSnapshots)
          .where(
            and(
              eq(schema.petrosReflectionSnapshots.id, snapshotId),
              eq(schema.petrosReflectionSnapshots.institutionId, scope.institutionId),
              eq(schema.petrosReflectionSnapshots.studentId, scope.studentId),
            ),
          )
          .limit(1)
          .then((rows) => rows[0]),
        this.db
          .select()
          .from(schema.petrosReflectionMapStates)
          .where(
            and(
              eq(schema.petrosReflectionMapStates.snapshotId, snapshotId),
              eq(schema.petrosReflectionMapStates.institutionId, scope.institutionId),
              eq(schema.petrosReflectionMapStates.studentId, scope.studentId),
            ),
          )
          .orderBy(asc(schema.petrosReflectionMapStates.subjectLabel), asc(schema.petrosReflectionMapStates.title)),
        this.db
          .select()
          .from(schema.petrosReflectionRecommendations)
          .where(
            and(
              eq(schema.petrosReflectionRecommendations.snapshotId, snapshotId),
              eq(schema.petrosReflectionRecommendations.institutionId, scope.institutionId),
              eq(schema.petrosReflectionRecommendations.studentId, scope.studentId),
            ),
          )
          .orderBy(desc(schema.petrosReflectionRecommendations.score))
          .limit(12),
        this.db
          .select()
          .from(schema.petrosReflectionCalibrationInsights)
          .where(
            and(
              eq(schema.petrosReflectionCalibrationInsights.snapshotId, snapshotId),
              eq(schema.petrosReflectionCalibrationInsights.institutionId, scope.institutionId),
              eq(schema.petrosReflectionCalibrationInsights.studentId, scope.studentId),
            ),
          )
          .limit(1)
          .then((rows) => rows[0]),
        this.db
          .select()
          .from(schema.petrosReflectionSessionRecaps)
          .where(
            and(
              eq(schema.petrosReflectionSessionRecaps.institutionId, scope.institutionId),
              eq(schema.petrosReflectionSessionRecaps.studentId, scope.studentId),
            ),
          )
          .orderBy(desc(schema.petrosReflectionSessionRecaps.closedAt))
          .limit(20),
        this.db
          .select()
          .from(schema.petrosReflectionGapAlarms)
          .where(
            and(
              eq(schema.petrosReflectionGapAlarms.institutionId, scope.institutionId),
              eq(schema.petrosReflectionGapAlarms.studentId, scope.studentId),
            ),
          )
          .orderBy(desc(schema.petrosReflectionGapAlarms.updatedAt))
          .limit(20),
        this.db
          .select()
          .from(schema.petrosReflectionEvidenceLinks)
          .where(
            and(
              eq(schema.petrosReflectionEvidenceLinks.institutionId, scope.institutionId),
              eq(schema.petrosReflectionEvidenceLinks.studentId, scope.studentId),
            ),
          )
          .orderBy(desc(schema.petrosReflectionEvidenceLinks.observedAt))
          .limit(1_000),
      ]);
    return { snapshot, topics, recommendations, calibration, recaps, alarms, evidence };
  }

  findRecommendation(scope: PetrosOwnerScope, id: string) {
    return this.db
      .select()
      .from(schema.petrosReflectionRecommendations)
      .where(
        and(
          eq(schema.petrosReflectionRecommendations.id, id),
          eq(schema.petrosReflectionRecommendations.institutionId, scope.institutionId),
          eq(schema.petrosReflectionRecommendations.studentId, scope.studentId),
          eq(schema.petrosReflectionRecommendations.status, 'active'),
        ),
      )
      .limit(1)
      .then((rows) => rows[0]);
  }

  attachRecommendationIntent(scope: PetrosOwnerScope, id: string, intentId: string) {
    return this.db
      .update(schema.petrosReflectionRecommendations)
      .set({ startedIntentId: intentId, updatedAt: new Date() })
      .where(
        and(
          eq(schema.petrosReflectionRecommendations.id, id),
          eq(schema.petrosReflectionRecommendations.institutionId, scope.institutionId),
          eq(schema.petrosReflectionRecommendations.studentId, scope.studentId),
        ),
      );
  }

  updateRecommendation(scope: PetrosOwnerScope, id: string, status: string) {
    return this.db
      .update(schema.petrosReflectionRecommendations)
      .set({ status, updatedAt: new Date() })
      .where(
        and(
          eq(schema.petrosReflectionRecommendations.id, id),
          eq(schema.petrosReflectionRecommendations.institutionId, scope.institutionId),
          eq(schema.petrosReflectionRecommendations.studentId, scope.studentId),
        ),
      )
      .returning()
      .then((rows) => rows[0]);
  }

  async completeRecommendationsFromEvidence(
    scope: PetrosOwnerScope,
    evidence: ReflectionEvidence[],
  ) {
    const started = await this.db
      .select()
      .from(schema.petrosReflectionRecommendations)
      .where(
        and(
          eq(schema.petrosReflectionRecommendations.institutionId, scope.institutionId),
          eq(schema.petrosReflectionRecommendations.studentId, scope.studentId),
          eq(schema.petrosReflectionRecommendations.status, 'started'),
        ),
      );
    const completed = [];
    for (const row of started) {
      const outcome = evidence
        .filter((item) => item.conceptId === row.conceptId && item.occurredAt > row.updatedAt)
        .sort((left, right) => right.occurredAt.getTime() - left.occurredAt.getTime())[0];
      if (!outcome) continue;
      const [updated] = await this.db
        .update(schema.petrosReflectionRecommendations)
        .set({ status: 'completed', completedAt: outcome.occurredAt, updatedAt: new Date() })
        .where(
          and(
            eq(schema.petrosReflectionRecommendations.id, row.id),
            eq(schema.petrosReflectionRecommendations.institutionId, scope.institutionId),
            eq(schema.petrosReflectionRecommendations.studentId, scope.studentId),
            eq(schema.petrosReflectionRecommendations.status, 'started'),
          ),
        )
        .returning();
      if (updated) completed.push({ recommendation: updated, outcome });
    }
    return completed;
  }

  updateCalibration(
    scope: PetrosOwnerScope,
    id: string,
    patch: { status: string; quietUntil?: Date | null },
  ) {
    return this.db
      .update(schema.petrosReflectionCalibrationInsights)
      .set({ ...patch, updatedAt: new Date() })
      .where(
        and(
          eq(schema.petrosReflectionCalibrationInsights.id, id),
          eq(schema.petrosReflectionCalibrationInsights.institutionId, scope.institutionId),
          eq(schema.petrosReflectionCalibrationInsights.studentId, scope.studentId),
        ),
      )
      .returning()
      .then((rows) => rows[0]);
  }

  updateRecap(scope: PetrosOwnerScope, id: string, status: string, correctedText: string | null) {
    return this.db
      .update(schema.petrosReflectionSessionRecaps)
      .set({ status, correctedText, updatedAt: new Date() })
      .where(
        and(
          eq(schema.petrosReflectionSessionRecaps.id, id),
          eq(schema.petrosReflectionSessionRecaps.institutionId, scope.institutionId),
          eq(schema.petrosReflectionSessionRecaps.studentId, scope.studentId),
        ),
      )
      .returning()
      .then((rows) => rows[0]);
  }

  updateAlarm(
    scope: PetrosOwnerScope,
    id: string,
    patch: { status: string; snoozedUntil?: Date | null; resolutionReason?: string | null; falsePositive?: boolean },
  ) {
    return this.db
      .update(schema.petrosReflectionGapAlarms)
      .set({ ...patch, updatedAt: new Date() })
      .where(
        and(
          eq(schema.petrosReflectionGapAlarms.id, id),
          eq(schema.petrosReflectionGapAlarms.institutionId, scope.institutionId),
          eq(schema.petrosReflectionGapAlarms.studentId, scope.studentId),
        ),
      )
      .returning()
      .then((rows) => rows[0]);
  }

  recordEvent(values: typeof schema.petrosReflectionEvents.$inferInsert) {
    return this.db
      .insert(schema.petrosReflectionEvents)
      .values(values)
      .onConflictDoNothing()
      .returning()
      .then((rows) => rows[0]);
  }

  evidence(scope: PetrosOwnerScope, entityType: string, entityId: string) {
    return this.db
      .select()
      .from(schema.petrosReflectionEvidenceLinks)
      .where(
        and(
          eq(schema.petrosReflectionEvidenceLinks.institutionId, scope.institutionId),
          eq(schema.petrosReflectionEvidenceLinks.studentId, scope.studentId),
          eq(schema.petrosReflectionEvidenceLinks.entityType, entityType),
          eq(schema.petrosReflectionEvidenceLinks.entityId, entityId),
        ),
      )
      .orderBy(desc(schema.petrosReflectionEvidenceLinks.observedAt));
  }

  async export(scope: PetrosOwnerScope) {
    const snapshot = await this.latestSnapshot(scope);
    const data = snapshot ? await this.snapshotRows(scope, snapshot.id) : null;
    return { scope, data, exportedAt: new Date().toISOString(), transfer: 'Derived insights are rebuilt after an authorized transfer from portable learner evidence; institution-restricted syllabus links are excluded.' };
  }

  delete(scope: PetrosOwnerScope) {
    return this.db
      .delete(schema.petrosReflectionSnapshots)
      .where(
        and(
          eq(schema.petrosReflectionSnapshots.institutionId, scope.institutionId),
          eq(schema.petrosReflectionSnapshots.studentId, scope.studentId),
        ),
      );
  }

  async dashboard(query: PetrosReflectionDashboardQuery) {
    const conditions = [];
    if (query.institutionId) conditions.push(eq(schema.petrosReflectionEvents.institutionId, query.institutionId));
    if (query.algorithmVersion) conditions.push(eq(schema.petrosReflectionEvents.algorithmVersion, query.algorithmVersion));
    if (query.from) conditions.push(gte(schema.petrosReflectionEvents.createdAt, new Date(query.from)));
    if (query.to) conditions.push(lte(schema.petrosReflectionEvents.createdAt, new Date(query.to)));
    const where = conditions.length ? and(...conditions) : undefined;
    const [events, snapshots, states, calibration, recaps, alarms] = await Promise.all([
      this.db.select().from(schema.petrosReflectionEvents).where(where).orderBy(desc(schema.petrosReflectionEvents.createdAt)).limit(5_000),
      this.db.select().from(schema.petrosReflectionSnapshots).where(query.institutionId ? eq(schema.petrosReflectionSnapshots.institutionId, query.institutionId) : undefined).orderBy(desc(schema.petrosReflectionSnapshots.completedAt)).limit(1_000),
      this.db.select({ state: schema.petrosReflectionMapStates.state, count: sql<number>`count(*)::int` }).from(schema.petrosReflectionMapStates).where(query.institutionId ? eq(schema.petrosReflectionMapStates.institutionId, query.institutionId) : undefined).groupBy(schema.petrosReflectionMapStates.state),
      this.db.select().from(schema.petrosReflectionCalibrationInsights).where(query.institutionId ? eq(schema.petrosReflectionCalibrationInsights.institutionId, query.institutionId) : undefined).limit(5_000),
      this.db.select().from(schema.petrosReflectionSessionRecaps).where(query.institutionId ? eq(schema.petrosReflectionSessionRecaps.institutionId, query.institutionId) : undefined).limit(5_000),
      this.db.select().from(schema.petrosReflectionGapAlarms).where(query.institutionId ? eq(schema.petrosReflectionGapAlarms.institutionId, query.institutionId) : undefined).limit(5_000),
    ]);
    return { events, snapshots, states, calibration, recaps, alarms };
  }

  /**
   * Resolves `kind:<uuid>` evidence keys to the record's own title, scoped to the student's
   * institution. Unknown kinds and missing rows simply do not appear in the map.
   */
  private async entityLabels(
    scope: PetrosOwnerScope,
    keys: string[],
  ): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    const byKind = new Map<string, Set<string>>();
    for (const key of new Set(keys)) {
      const match = UUID_KEY.exec(key ?? '');
      if (!match) continue;
      const kind = match[1]!.toLowerCase();
      const set = byKind.get(kind) ?? new Set<string>();
      set.add(match[2]!);
      byKind.set(kind, set);
    }
    if (!byKind.size) return out;

    const assignmentIds = [...(byKind.get('assignment') ?? [])];
    if (assignmentIds.length) {
      const rows = await this.db
        .select({ id: schema.assignments.id, title: schema.assignments.title })
        .from(schema.assignments)
        .where(
          and(
            eq(schema.assignments.institutionId, scope.institutionId),
            inArray(schema.assignments.id, assignmentIds),
          ),
        );
      for (const row of rows) out.set(`assignment:${row.id}`, row.title);
    }

    const homeworkIds = [...(byKind.get('homework') ?? [])];
    if (homeworkIds.length) {
      const rows = await this.db
        .select({ id: schema.homework.id, title: schema.homework.title })
        .from(schema.homework)
        .where(
          and(
            eq(schema.homework.institutionId, scope.institutionId),
            inArray(schema.homework.id, homeworkIds),
          ),
        );
      for (const row of rows) out.set(`homework:${row.id}`, row.title);
    }

    const subjectIds = [...(byKind.get('subject') ?? [])];
    if (subjectIds.length) {
      const rows = await this.db
        .select({ id: schema.subjects.id, name: schema.subjects.name })
        .from(schema.subjects)
        .where(
          and(
            eq(schema.subjects.institutionId, scope.institutionId),
            inArray(schema.subjects.id, subjectIds),
          ),
        );
      for (const row of rows) out.set(`subject:${row.id}`, row.name);
    }

    return out;
  }

}

function evidenceValues(
  snapshotId: string,
  scope: PetrosOwnerScope,
  entityType: string,
  entityId: string,
  evidence: PetrosReflectionEvidenceLink[],
) {
  return evidence.map((row) => ({
    id: evidenceLinkId(snapshotId, entityType, entityId, row.sourceType, row.sourceId),
    snapshotId,
    ...scope,
    entityType,
    entityId,
    sourceType: row.sourceType,
    sourceId: row.sourceId,
    label: row.label,
    observedAt: row.observedAt ? new Date(row.observedAt) : null,
  }));
}

function evidenceLinkId(...parts: string[]) {
  const hex = digest(parts.join(':'));
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function digest(value: string) {
  let h1 = 0xdeadbeef ^ value.length;
  let h2 = 0x41c6ce57 ^ value.length;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    h1 = Math.imul(h1 ^ code, 2654435761);
    h2 = Math.imul(h2 ^ code, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const chunk = (value: number) => (value >>> 0).toString(16).padStart(8, '0');
  return `${chunk(h2)}${chunk(h1)}${chunk(h2 ^ h1)}${chunk(Math.imul(h1, h2))}`;
}

function carryCalibrationStatus(
  prior: typeof schema.petrosReflectionCalibrationInsights.$inferSelect | undefined,
  derived: string,
) {
  if (!prior) return derived;
  if (prior.status === 'dismissed') return 'dismissed';
  if (prior.status === 'quieted' && prior.quietUntil && prior.quietUntil > new Date()) return 'quieted';
  return derived;
}

function sourceFingerprint(row: PetrosReflectionRecommendation) {
  return `${row.conceptId}:${row.sessionType}:${row.reasons.map((reason) => reason.code).join(',')}`;
}

function latest(values: Date[]) {
  return values.length ? new Date(Math.max(...values.map((value) => value.getTime()))) : null;
}

function groupBy<T>(values: T[], key: (value: T) => string) {
  const result = new Map<string, T[]>();
  for (const value of values) result.set(key(value), [...(result.get(key(value)) ?? []), value]);
  return result;
}

function humanize(value: string) {
  return value.replace(/[_:-]+/g, ' ').replace(/\s+/g, ' ').trim();
}

const UUID_KEY = /^([a-z_]+):([0-9a-f-]{36})$/i;

/**
 * Titles a concept whose key is an internal identifier rather than a syllabus topic.
 *
 * Evidence keys look like `assignment:<uuid>` or `checkpoint:2:mathematics:contrast_case`.
 * Humanizing those produced student-facing titles such as "assignment 35dcabe7 2dac 41d5"
 * and "checkpoint 2 mathematics contrast case commitment". Nothing internal is ever shown:
 * an unresolved key falls back to the subject it belongs to.
 */
function conceptFallback(conceptId: string, subjectLabel?: string) {
  const entity = UUID_KEY.exec(conceptId);
  if (entity) {
    const kind = humanize(entity[1]!).toLowerCase();
    return subjectLabel ? `${subjectLabel} — a ${kind} you worked on` : `A ${kind} you worked on`;
  }
  // Teaching-move keys the loop writes per checkpoint are not concept names.
  if (/^checkpoint-\d/i.test(conceptId)) {
    return subjectLabel ? `${subjectLabel} — a step you practised` : 'A step you practised';
  }
  return humanize(conceptId);
}
