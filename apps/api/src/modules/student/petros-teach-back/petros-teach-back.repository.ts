import { Inject, Injectable } from '@nestjs/common';
import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  lte,
  schema,
  sql,
  type Database,
} from '@edrion/database';
import type {
  PetrosTeachBackAnalysis,
  PetrosTeachBackDashboardQuery,
  PetrosTeachBackFollowUp,
  PetrosTeachBackVerdict,
} from '@edrion/schemas';
import { DATABASE } from '../../../common/tokens';
import type { PetrosOwnerScope } from '../petros-loop/petros-loop.repository';

@Injectable()
export class PetrosTeachBackRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  findByLearningSession(scope: PetrosOwnerScope, learningSessionId: string) {
    return this.db
      .select()
      .from(schema.petrosTeachBackSessions)
      .where(
        and(
          eq(schema.petrosTeachBackSessions.learningSessionId, learningSessionId),
          eq(schema.petrosTeachBackSessions.institutionId, scope.institutionId),
          eq(schema.petrosTeachBackSessions.studentId, scope.studentId),
        ),
      )
      .limit(1)
      .then((rows) => rows[0]);
  }

  find(scope: PetrosOwnerScope, sessionId: string) {
    return this.db
      .select()
      .from(schema.petrosTeachBackSessions)
      .where(
        and(
          eq(schema.petrosTeachBackSessions.id, sessionId),
          eq(schema.petrosTeachBackSessions.institutionId, scope.institutionId),
          eq(schema.petrosTeachBackSessions.studentId, scope.studentId),
        ),
      )
      .limit(1)
      .then((rows) => rows[0]);
  }

  create(values: typeof schema.petrosTeachBackSessions.$inferInsert) {
    return this.db
      .insert(schema.petrosTeachBackSessions)
      .values(values)
      .onConflictDoNothing()
      .returning()
      .then((rows) => rows[0]);
  }

  listSegments(scope: PetrosOwnerScope, sessionId: string) {
    return this.db
      .select()
      .from(schema.petrosTeachBackSegments)
      .where(
        and(
          eq(schema.petrosTeachBackSegments.teachBackSessionId, sessionId),
          eq(schema.petrosTeachBackSegments.institutionId, scope.institutionId),
          eq(schema.petrosTeachBackSegments.studentId, scope.studentId),
        ),
      )
      .orderBy(asc(schema.petrosTeachBackSegments.ordinal));
  }

  listFollowUps(scope: PetrosOwnerScope, sessionId: string) {
    return this.db
      .select()
      .from(schema.petrosTeachBackFollowUps)
      .where(
        and(
          eq(schema.petrosTeachBackFollowUps.teachBackSessionId, sessionId),
          eq(schema.petrosTeachBackFollowUps.institutionId, scope.institutionId),
          eq(schema.petrosTeachBackFollowUps.studentId, scope.studentId),
        ),
      )
      .orderBy(asc(schema.petrosTeachBackFollowUps.createdAt));
  }

  findMedia(scope: PetrosOwnerScope, mediaId: string) {
    return this.db
      .select()
      .from(schema.petrosMediaObjects)
      .where(
        and(
          eq(schema.petrosMediaObjects.id, mediaId),
          eq(schema.petrosMediaObjects.institutionId, scope.institutionId),
          eq(schema.petrosMediaObjects.studentId, scope.studentId),
        ),
      )
      .limit(1)
      .then((rows) => rows[0]);
  }

  async beginCommand(
    scope: PetrosOwnerScope,
    sessionId: string,
    idempotencyKey: string,
    kind: string,
  ) {
    const [created] = await this.db
      .insert(schema.petrosTeachBackCommands)
      .values({
        teachBackSessionId: sessionId,
        institutionId: scope.institutionId,
        studentId: scope.studentId,
        idempotencyKey,
        kind,
      })
      .onConflictDoNothing()
      .returning();
    if (created) return { state: 'started' as const, row: created };
    const [existing] = await this.db
      .select()
      .from(schema.petrosTeachBackCommands)
      .where(
        and(
          eq(schema.petrosTeachBackCommands.institutionId, scope.institutionId),
          eq(schema.petrosTeachBackCommands.studentId, scope.studentId),
          eq(schema.petrosTeachBackCommands.idempotencyKey, idempotencyKey),
        ),
      )
      .limit(1);
    if (existing?.status === 'completed' && existing.response) {
      return {
        state: 'completed' as const,
        row: existing,
        response: existing.response,
      };
    }
    return { state: 'in_flight' as const, row: existing };
  }

  finishCommand(commandId: string, response: Record<string, unknown>) {
    return this.db
      .update(schema.petrosTeachBackCommands)
      .set({
        status: 'completed',
        response,
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(schema.petrosTeachBackCommands.id, commandId));
  }

  failCommand(commandId: string, errorCode: string) {
    return this.db
      .update(schema.petrosTeachBackCommands)
      .set({
        status: 'failed',
        errorCode,
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(schema.petrosTeachBackCommands.id, commandId));
  }

  async appendSegment(input: {
    scope: PetrosOwnerScope;
    sessionId: string;
    expectedVersion: number;
    segmentId: string;
    text: string;
    originalTextHash: string;
    source: 'text' | 'voice';
    mediaId: string | null;
    transcriptionConfidenceBasisPoints: number | null;
    responseToFollowUpId: string | null;
    analysis: PetrosTeachBackAnalysis;
    analysisRequestId: string | null;
    analysisRouteReference: Record<string, unknown> | null;
    correlationId: string;
    nextGap: { type: string; fingerprint: string; probes: number } | null;
    followUp: PetrosTeachBackFollowUp | null;
    followUpRequestId: string | null;
    followUpRouteReference: Record<string, unknown> | null;
    capHelpApplied: boolean;
  }) {
    return this.db.transaction(async (tx) => {
      const [locked] = await tx
        .update(schema.petrosTeachBackSessions)
        .set({
          coverageChecklist: input.analysis.coverage,
          currentGapType: input.nextGap?.type ?? 'none',
          currentGapFingerprint: input.nextGap?.fingerprint ?? null,
          probesOnCurrentGap: input.nextGap?.probes ?? 0,
          movesUsed: sql`${schema.petrosTeachBackSessions.movesUsed} + 1`,
          helpUseCount: input.capHelpApplied
            ? sql`${schema.petrosTeachBackSessions.helpUseCount} + 1`
            : schema.petrosTeachBackSessions.helpUseCount,
          version: sql`${schema.petrosTeachBackSessions.version} + 1`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(schema.petrosTeachBackSessions.id, input.sessionId),
            eq(schema.petrosTeachBackSessions.institutionId, input.scope.institutionId),
            eq(schema.petrosTeachBackSessions.studentId, input.scope.studentId),
            eq(schema.petrosTeachBackSessions.version, input.expectedVersion),
            eq(schema.petrosTeachBackSessions.status, 'active'),
          ),
        )
        .returning();
      if (!locked) return null;

      if (input.source === 'voice' && input.mediaId) {
        const [confirmedMedia] = await tx
          .update(schema.petrosMediaObjects)
          .set({
            state: 'ready',
            sessionId: locked.learningSessionId,
            structuredResult: {
              transcriptConfirmed: true,
              sourceOfTruth: 'teach_back_segment',
            },
            correctionAudit: {
              studentSourceOfTruth: true,
              confirmedTextHash: input.originalTextHash,
              providerTranscriptRetained: false,
            },
            confirmedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(schema.petrosMediaObjects.id, input.mediaId),
              eq(schema.petrosMediaObjects.institutionId, input.scope.institutionId),
              eq(schema.petrosMediaObjects.studentId, input.scope.studentId),
              eq(schema.petrosMediaObjects.kind, 'voice_turn'),
              eq(schema.petrosMediaObjects.state, 'needs_confirmation'),
            ),
          )
          .returning({ id: schema.petrosMediaObjects.id });
        if (!confirmedMedia) throw new Error('PETROS_TEACH_BACK_MEDIA_CONFIRMATION_RACE');
      }

      if (input.responseToFollowUpId) {
        await tx
          .update(schema.petrosTeachBackFollowUps)
          .set({
            status: input.capHelpApplied ? 'helped' : 'answered',
            resolvedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(schema.petrosTeachBackFollowUps.id, input.responseToFollowUpId),
              eq(schema.petrosTeachBackFollowUps.teachBackSessionId, input.sessionId),
              eq(schema.petrosTeachBackFollowUps.status, 'open'),
            ),
          );
      }

      const [segment] = await tx
        .insert(schema.petrosTeachBackSegments)
        .values({
          id: input.segmentId,
          teachBackSessionId: input.sessionId,
          institutionId: input.scope.institutionId,
          studentId: input.scope.studentId,
          ordinal: locked.movesUsed,
          source: input.source,
          text: input.text,
          originalTextHash: input.originalTextHash,
          mediaId: input.mediaId,
          transcriptionConfidenceBasisPoints: input.transcriptionConfidenceBasisPoints,
          responseToFollowUpId: input.responseToFollowUpId,
          analysis: input.analysis,
          analysisFunctionKey: 'teach_back.explanation.analyse',
          analysisRequestId: input.analysisRequestId,
          analysisRouteReference: input.analysisRouteReference,
          correlationId: input.correlationId,
        })
        .returning();
      if (!segment) throw new Error('Teach-it-back segment was not persisted.');

      let followUpRow: typeof schema.petrosTeachBackFollowUps.$inferSelect | undefined;
      if (input.followUp && input.nextGap) {
        [followUpRow] = await tx
          .insert(schema.petrosTeachBackFollowUps)
          .values({
            teachBackSessionId: input.sessionId,
            segmentId: segment.id,
            institutionId: input.scope.institutionId,
            studentId: input.scope.studentId,
            gapType: input.nextGap.type,
            gapFingerprint: input.nextGap.fingerprint,
            probeNumber: input.nextGap.probes,
            content: input.followUp,
            functionKey: 'teach_back.follow_up.generate',
            providerRequestId: input.followUpRequestId,
            routeReference: input.followUpRouteReference,
            correlationId: input.correlationId,
          })
          .returning();
      }
      return { session: locked, segment, followUp: followUpRow };
    });
  }

  async correctSegment(input: {
    scope: PetrosOwnerScope;
    sessionId: string;
    segmentId: string;
    expectedVersion: number;
    text: string;
    analysis: PetrosTeachBackAnalysis;
    analysisRequestId: string | null;
    analysisRouteReference: Record<string, unknown> | null;
    correlationId: string;
    nextGap: { type: string; fingerprint: string; probes: number } | null;
    followUp: PetrosTeachBackFollowUp | null;
    followUpRequestId: string | null;
    followUpRouteReference: Record<string, unknown> | null;
  }) {
    return this.db.transaction(async (tx) => {
      const [session] = await tx
        .update(schema.petrosTeachBackSessions)
        .set({
          coverageChecklist: input.analysis.coverage,
          currentGapType: input.nextGap?.type ?? 'none',
          currentGapFingerprint: input.nextGap?.fingerprint ?? null,
          probesOnCurrentGap: input.nextGap?.probes ?? 0,
          version: sql`${schema.petrosTeachBackSessions.version} + 1`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(schema.petrosTeachBackSessions.id, input.sessionId),
            eq(schema.petrosTeachBackSessions.institutionId, input.scope.institutionId),
            eq(schema.petrosTeachBackSessions.studentId, input.scope.studentId),
            eq(schema.petrosTeachBackSessions.version, input.expectedVersion),
            eq(schema.petrosTeachBackSessions.status, 'active'),
          ),
        )
        .returning();
      if (!session) return null;
      const [segment] = await tx
        .update(schema.petrosTeachBackSegments)
        .set({
          text: input.text,
          corrected: true,
          correctionCount: sql`${schema.petrosTeachBackSegments.correctionCount} + 1`,
          analysis: input.analysis,
          analysisRequestId: input.analysisRequestId,
          analysisRouteReference: input.analysisRouteReference,
          correlationId: input.correlationId,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(schema.petrosTeachBackSegments.id, input.segmentId),
            eq(schema.petrosTeachBackSegments.teachBackSessionId, input.sessionId),
            eq(schema.petrosTeachBackSegments.institutionId, input.scope.institutionId),
            eq(schema.petrosTeachBackSegments.studentId, input.scope.studentId),
          ),
        )
        .returning();
      if (!segment) return null;
      await tx
        .update(schema.petrosTeachBackFollowUps)
        .set({
          status: 'skipped',
          resolvedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(schema.petrosTeachBackFollowUps.segmentId, segment.id),
            eq(schema.petrosTeachBackFollowUps.status, 'open'),
          ),
        );
      let followUpRow: typeof schema.petrosTeachBackFollowUps.$inferSelect | undefined;
      if (input.followUp && input.nextGap) {
        [followUpRow] = await tx
          .insert(schema.petrosTeachBackFollowUps)
          .values({
            teachBackSessionId: input.sessionId,
            segmentId: segment.id,
            institutionId: input.scope.institutionId,
            studentId: input.scope.studentId,
            gapType: input.nextGap.type,
            gapFingerprint: input.nextGap.fingerprint,
            probeNumber: input.nextGap.probes,
            content: input.followUp,
            functionKey: 'teach_back.follow_up.generate',
            providerRequestId: input.followUpRequestId,
            routeReference: input.followUpRouteReference,
            correlationId: input.correlationId,
          })
          .returning();
      }
      return { session, segment, followUp: followUpRow };
    });
  }

  async help(input: {
    scope: PetrosOwnerScope;
    sessionId: string;
    expectedVersion: number;
    followUpId: string | null;
    action: 'hint' | 'help' | 'i_dont_know' | 'skip';
  }) {
    return this.db.transaction(async (tx) => {
      const [session] = await tx
        .update(schema.petrosTeachBackSessions)
        .set({
          currentGapType: 'none',
          currentGapFingerprint: null,
          probesOnCurrentGap: 0,
          helpUseCount:
            input.action === 'skip'
              ? schema.petrosTeachBackSessions.helpUseCount
              : sql`${schema.petrosTeachBackSessions.helpUseCount} + 1`,
          version: sql`${schema.petrosTeachBackSessions.version} + 1`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(schema.petrosTeachBackSessions.id, input.sessionId),
            eq(schema.petrosTeachBackSessions.institutionId, input.scope.institutionId),
            eq(schema.petrosTeachBackSessions.studentId, input.scope.studentId),
            eq(schema.petrosTeachBackSessions.version, input.expectedVersion),
            eq(schema.petrosTeachBackSessions.status, 'active'),
          ),
        )
        .returning();
      if (!session) return null;
      if (input.followUpId) {
        await tx
          .update(schema.petrosTeachBackFollowUps)
          .set({
            status: input.action === 'skip' ? 'skipped' : 'helped',
            resolvedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(schema.petrosTeachBackFollowUps.id, input.followUpId),
              eq(schema.petrosTeachBackFollowUps.teachBackSessionId, input.sessionId),
              eq(schema.petrosTeachBackFollowUps.status, 'open'),
            ),
          );
      }
      return session;
    });
  }

  updateLifecycle(
    scope: PetrosOwnerScope,
    sessionId: string,
    expectedVersion: number,
    values: Partial<typeof schema.petrosTeachBackSessions.$inferInsert>,
  ) {
    return this.db
      .update(schema.petrosTeachBackSessions)
      .set({
        ...values,
        version: sql`${schema.petrosTeachBackSessions.version} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.petrosTeachBackSessions.id, sessionId),
          eq(schema.petrosTeachBackSessions.institutionId, scope.institutionId),
          eq(schema.petrosTeachBackSessions.studentId, scope.studentId),
          eq(schema.petrosTeachBackSessions.version, expectedVersion),
        ),
      )
      .returning()
      .then((rows) => rows[0]);
  }

  async createArtifactBlock(input: {
    scope: PetrosOwnerScope;
    learningSessionId: string;
    topic: string;
    verdict: PetrosTeachBackVerdict;
    correlationId: string;
  }) {
    return this.db.transaction(async (tx) => {
      const [decision] = await tx
        .insert(schema.petrosPlanningDecisions)
        .values({
          sessionId: input.learningSessionId,
          institutionId: input.scope.institutionId,
          studentId: input.scope.studentId,
          sequence: 1,
          status: 'rendered',
          selectedMoveType: 'artifact_commit',
          originalMoveType: null,
          targetConcept: input.topic,
          studentSafeReason: 'Your explanation is complete, so you can edit what becomes yours.',
          decisionFactors: [
            'Teach-it-back verdict complete',
            'Explicit artifact ownership required',
          ],
          moveParameters: {
            artifactKinds: ['note'],
            requireExplicitConsent: true,
          },
          expectedEvidence: 'Student reviews and explicitly saves or discards the recap proposal.',
          progressEffect: {
            checkpointId: 'teach-back-close',
            effect: 'complete',
            progressDelta: 1,
          },
          canStream: false,
          termination: {
            recommendation: 'goal_met',
            reason: 'Teach-it-back verdict complete.',
          },
          guessFirst: {
            status: 'completed',
            targetId: null,
            reason: 'The student generated the explanation.',
          },
          observationResponse: {
            causalObservationIds: [],
            action: 'continue',
            acknowledgement: 'Your explanation produced this editable recap.',
            routeChange: null,
            returnPlan: null,
          },
          selectionPolicy: {
            normalizedCandidateWeights: { artifact_commit: 1 },
            exclusions: [],
            selectedWeight: 1,
            override: null,
            capabilityFallback: null,
          },
          policyInterventions: [{ policy: 'teach_it_back_artifact_ownership', autoSave: false }],
          source: 'deterministic_fallback',
          functionKey: 'artifact.notes.generate',
          promptVersion: 'petros.teach-back.artifact.v1',
          schemaVersion: 'petros.render.v2',
          correlationId: input.correlationId,
        })
        .onConflictDoNothing()
        .returning();
      if (!decision) {
        return tx
          .select()
          .from(schema.petrosTeachingBlocks)
          .where(eq(schema.petrosTeachingBlocks.sessionId, input.learningSessionId))
          .limit(1)
          .then((rows) => rows[0]);
      }
      const proposal = input.verdict.recapProposal;
      const [block] = await tx
        .insert(schema.petrosTeachingBlocks)
        .values({
          sessionId: input.learningSessionId,
          decisionId: decision.id,
          institutionId: input.scope.institutionId,
          studentId: input.scope.studentId,
          sequence: 1,
          type: 'artifact_commit',
          status: 'completed',
          content: {
            schemaVersion: 'petros.render.v2',
            type: 'artifact_commit',
            title: 'Edit your explanation recap',
            prompt: 'Review this proposal before anything is saved as yours.',
            proposals: proposal
              ? [
                  {
                    id: 'teach_back_recap',
                    kind: proposal.kind === 'flashcard' ? 'flashcard' : 'note',
                    label: proposal.title,
                    preview: proposal.body,
                  },
                ]
              : [],
            consentRequired: true,
          },
          interactionState: { selectedProposalIds: [] },
          observedOutcome: { proposed: Boolean(proposal), saved: false },
          delivery: 'deterministic_fallback',
          functionKey: 'artifact.notes.generate',
          promptVersion: 'petros.teach-back.artifact.v1',
          schemaVersion: 'petros.render.v2',
          correlationId: input.correlationId,
          completedAt: new Date(),
        })
        .returning();
      await tx
        .update(schema.petrosPlanningDecisions)
        .set({ resultingBlockId: block?.id, updatedAt: new Date() })
        .where(eq(schema.petrosPlanningDecisions.id, decision.id));
      return block;
    });
  }

  closeLearningSession(scope: PetrosOwnerScope, learningSessionId: string, elapsedSeconds: number) {
    return this.db
      .update(schema.petrosLearningSessions)
      .set({
        status: 'closed',
        activeSince: null,
        elapsedSeconds,
        closeReason: 'teach_it_back_verdict',
        closedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.petrosLearningSessions.id, learningSessionId),
          eq(schema.petrosLearningSessions.institutionId, scope.institutionId),
          eq(schema.petrosLearningSessions.studentId, scope.studentId),
        ),
      );
  }

  recordEvent(values: typeof schema.petrosTeachBackEvents.$inferInsert) {
    return this.db
      .insert(schema.petrosTeachBackEvents)
      .values(values)
      .onConflictDoNothing()
      .returning()
      .then((rows) => rows[0]);
  }

  async dashboardRows(query: PetrosTeachBackDashboardQuery) {
    const sessionFilters = [
      ...(query.institutionId
        ? [eq(schema.petrosTeachBackSessions.institutionId, query.institutionId)]
        : []),
      ...(query.mode ? [eq(schema.petrosTeachBackSessions.mode, query.mode)] : []),
      ...(query.gapType ? [eq(schema.petrosTeachBackSessions.currentGapType, query.gapType)] : []),
      ...(query.from ? [gte(schema.petrosTeachBackSessions.createdAt, new Date(query.from))] : []),
      ...(query.to ? [lte(schema.petrosTeachBackSessions.createdAt, new Date(query.to))] : []),
    ];
    const eventFilters = [
      ...(query.institutionId
        ? [eq(schema.petrosTeachBackEvents.institutionId, query.institutionId)]
        : []),
      ...(query.mode ? [eq(schema.petrosTeachBackEvents.mode, query.mode)] : []),
      ...(query.gapType ? [eq(schema.petrosTeachBackEvents.gapType, query.gapType)] : []),
      ...(query.functionKey
        ? [eq(schema.petrosTeachBackEvents.functionKey, query.functionKey)]
        : []),
      ...(query.from ? [gte(schema.petrosTeachBackEvents.createdAt, new Date(query.from))] : []),
      ...(query.to ? [lte(schema.petrosTeachBackEvents.createdAt, new Date(query.to))] : []),
    ];
    const [sessions, events] = await Promise.all([
      this.db
        .select()
        .from(schema.petrosTeachBackSessions)
        .where(sessionFilters.length ? and(...sessionFilters) : undefined)
        .orderBy(desc(schema.petrosTeachBackSessions.createdAt))
        .limit(10_000),
      this.db
        .select()
        .from(schema.petrosTeachBackEvents)
        .where(eventFilters.length ? and(...eventFilters) : undefined)
        .orderBy(desc(schema.petrosTeachBackEvents.createdAt))
        .limit(20_000),
    ]);
    const sessionIds = sessions.map((session) => session.id);
    const mediaLinks = sessionIds.length
      ? await this.db
          .select({ mediaId: schema.petrosTeachBackSegments.mediaId })
          .from(schema.petrosTeachBackSegments)
          .where(
            and(
              inArray(schema.petrosTeachBackSegments.teachBackSessionId, sessionIds),
              isNotNull(schema.petrosTeachBackSegments.mediaId),
            ),
          )
          .limit(20_000)
      : [];
    const mediaIds = [
      ...new Set(mediaLinks.map((row) => row.mediaId).filter((id): id is string => Boolean(id))),
    ];
    const voiceEvents =
      mediaIds.length && query.mode !== 'text'
        ? await this.db
            .select()
            .from(schema.petrosModalityEvents)
            .where(
              and(
                inArray(schema.petrosModalityEvents.mediaId, mediaIds),
                ...(query.institutionId
                  ? [eq(schema.petrosModalityEvents.institutionId, query.institutionId)]
                  : []),
                ...(query.functionKey
                  ? [eq(schema.petrosModalityEvents.functionKey, query.functionKey)]
                  : []),
                ...(query.from
                  ? [gte(schema.petrosModalityEvents.createdAt, new Date(query.from))]
                  : []),
                ...(query.to
                  ? [lte(schema.petrosModalityEvents.createdAt, new Date(query.to))]
                  : []),
              ),
            )
            .orderBy(desc(schema.petrosModalityEvents.createdAt))
            .limit(20_000)
        : [];
    const learningSessionIds = sessions.map((session) => session.learningSessionId);
    const artifactEvents = learningSessionIds.length
      ? await this.db
          .select()
          .from(schema.petrosArtifactEvents)
          .where(
            and(
              inArray(schema.petrosArtifactEvents.sessionId, learningSessionIds),
              ...(query.institutionId
                ? [eq(schema.petrosArtifactEvents.institutionId, query.institutionId)]
                : []),
              ...(query.from
                ? [gte(schema.petrosArtifactEvents.createdAt, new Date(query.from))]
                : []),
              ...(query.to ? [lte(schema.petrosArtifactEvents.createdAt, new Date(query.to))] : []),
            ),
          )
          .orderBy(desc(schema.petrosArtifactEvents.createdAt))
          .limit(20_000)
      : [];
    return { sessions, events, voiceEvents, artifactEvents };
  }
}
