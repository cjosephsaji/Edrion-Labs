import { KnowledgeDocumentService } from '../knowledge/knowledge-document.service';
import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  lte,
  lt,
  or,
  schema,
  sql,
  type Database,
} from '@edrion/database';
import { petrosAssessmentSchema, petrosVisualSnapshotSchema, type PetrosDecisionDiagnosticQuery, type PetrosMoveType } from '@edrion/schemas';
import { DATABASE } from '../../../common/tokens';
import { executionConflict } from './petros-question-execution.repository';

export interface PetrosOwnerScope {
  institutionId: string;
  studentId: string;
}

@Injectable()
export class PetrosLoopRepository {
  constructor(@Inject(DATABASE) private readonly db: Database, private readonly documents: KnowledgeDocumentService) {}

  searchDocumentContext(scope: PetrosOwnerScope, context: Record<string, unknown> | null, query: string) {
    return this.documents.searchContext(scope, context, query);
  }

  async createSession(values: typeof schema.petrosLearningSessions.$inferInsert) {
    await this.documents.assertContext({ institutionId: values.institutionId, studentId: values.studentId }, values.sourceContext);
    return this.db
      .insert(schema.petrosLearningSessions)
      .values(values)
      .returning()
      .then((rows) => rows[0]!);
  }

  attachResolvedTopicProfile(
    scope: PetrosOwnerScope,
    sessionId: string,
    values: Pick<
      typeof schema.petrosLearningSessions.$inferInsert,
      | 'topicProfileId'
      | 'topicProfileVersionId'
      | 'resolvedTopicProfile'
      | 'stateVersion'
      | 'promptVersion'
      | 'outputSchemaVersion'
    >,
  ) {
    return this.db
      .update(schema.petrosLearningSessions)
      .set({ ...values, updatedAt: new Date() })
      .where(
        and(
          eq(schema.petrosLearningSessions.id, sessionId),
          eq(schema.petrosLearningSessions.institutionId, scope.institutionId),
          eq(schema.petrosLearningSessions.studentId, scope.studentId),
        ),
      )
      .returning()
      .then((rows) => rows[0]);
  }

  /**
   * The student's own sessions, newest first, with enough detail to decide whether to
   * resume one. There was previously no way to list sessions at all: a session could only
   * be reached by its id, so closing the tab lost the only route back to it.
   */
  listSessions(scope: PetrosOwnerScope, limit = 40) {
    return this.db
      .select({
        id: schema.petrosLearningSessions.id,
        topic: schema.petrosLearningSessions.topic,
        sourceContext: schema.petrosLearningSessions.sourceContext,
        sessionType: schema.petrosLearningSessions.sessionType,
        status: schema.petrosLearningSessions.status,
        elapsedSeconds: schema.petrosLearningSessions.elapsedSeconds,
        checkpoints: schema.petrosLearningSessions.checkpoints,
        closeReason: schema.petrosLearningSessions.closeReason,
        createdAt: schema.petrosLearningSessions.createdAt,
        updatedAt: schema.petrosLearningSessions.updatedAt,
      })
      .from(schema.petrosLearningSessions)
      .where(
        and(
          eq(schema.petrosLearningSessions.institutionId, scope.institutionId),
          eq(schema.petrosLearningSessions.studentId, scope.studentId),
        ),
      )
      .orderBy(desc(schema.petrosLearningSessions.updatedAt))
      .limit(limit).then(async (rows) => {
        const allowed = await Promise.all(rows.map((row) => this.documents.canReadContext(scope, row.sourceContext)));
        return rows.filter((_, index) => allowed[index]);
      });
  }

  /**
   * Counts per session, fetched separately rather than as correlated subqueries — those
   * rendered against the wrong scope and silently returned zero for every row.
   */
  async sessionCounts(sessionIds: string[]) {
    const counts = new Map<string, { blocks: number; artifacts: number }>();
    if (!sessionIds.length) return counts;
    const bump = (id: string, key: 'blocks' | 'artifacts', value: number) => {
      const entry = counts.get(id) ?? { blocks: 0, artifacts: 0 };
      entry[key] = value;
      counts.set(id, entry);
    };
    const [blocks, artifacts] = await Promise.all([
      this.db
        .select({
          sessionId: schema.petrosTeachingBlocks.sessionId,
          total: sql<number>`count(*)::int`,
        })
        .from(schema.petrosTeachingBlocks)
        .where(inArray(schema.petrosTeachingBlocks.sessionId, sessionIds))
        .groupBy(schema.petrosTeachingBlocks.sessionId),
      this.db
        .select({
          sessionId: schema.petrosSavedArtifacts.sessionId,
          total: sql<number>`count(*)::int`,
        })
        .from(schema.petrosSavedArtifacts)
        .where(inArray(schema.petrosSavedArtifacts.sessionId, sessionIds))
        .groupBy(schema.petrosSavedArtifacts.sessionId),
    ]);
    for (const row of blocks) bump(row.sessionId, 'blocks', row.total);
    for (const row of artifacts) if (row.sessionId) bump(row.sessionId, 'artifacts', row.total);
    return counts;
  }

  findSessionByRequest(scope: PetrosOwnerScope, clientRequestId: string) {
    return this.db
      .select()
      .from(schema.petrosLearningSessions)
      .where(
        and(
          eq(schema.petrosLearningSessions.institutionId, scope.institutionId),
          eq(schema.petrosLearningSessions.studentId, scope.studentId),
          eq(schema.petrosLearningSessions.clientRequestId, clientRequestId),
        ),
      )
      .limit(1)
      .then(async (rows) => {
        if (rows[0]) await this.documents.assertContext(scope, rows[0].sourceContext);
        return rows[0];
      });
  }

  findSession(scope: PetrosOwnerScope, sessionId: string) {
    return this.db
      .select()
      .from(schema.petrosLearningSessions)
      .where(
        and(
          eq(schema.petrosLearningSessions.id, sessionId),
          eq(schema.petrosLearningSessions.institutionId, scope.institutionId),
          eq(schema.petrosLearningSessions.studentId, scope.studentId),
        ),
      )
      .limit(1)
      .then(async (rows) => {
        if (rows[0]) await this.documents.assertContext(scope, rows[0].sourceContext);
        return rows[0];
      });
  }

  listDecisions(scope: PetrosOwnerScope, sessionId: string) {
    return this.db
      .select()
      .from(schema.petrosPlanningDecisions)
      .where(
        and(
          eq(schema.petrosPlanningDecisions.sessionId, sessionId),
          eq(schema.petrosPlanningDecisions.institutionId, scope.institutionId),
          eq(schema.petrosPlanningDecisions.studentId, scope.studentId),
        ),
      )
      .orderBy(asc(schema.petrosPlanningDecisions.sequence));
  }

  listBlocks(scope: PetrosOwnerScope, sessionId: string) {
    return this.db
      .select()
      .from(schema.petrosTeachingBlocks)
      .where(
        and(
          eq(schema.petrosTeachingBlocks.sessionId, sessionId),
          eq(schema.petrosTeachingBlocks.institutionId, scope.institutionId),
          eq(schema.petrosTeachingBlocks.studentId, scope.studentId),
        ),
      )
      .orderBy(asc(schema.petrosTeachingBlocks.sequence));
  }

  findBlock(scope: PetrosOwnerScope, sessionId: string, blockId: string) {
    return this.db
      .select()
      .from(schema.petrosTeachingBlocks)
      .where(
        and(
          eq(schema.petrosTeachingBlocks.id, blockId),
          eq(schema.petrosTeachingBlocks.sessionId, sessionId),
          eq(schema.petrosTeachingBlocks.institutionId, scope.institutionId),
          eq(schema.petrosTeachingBlocks.studentId, scope.studentId),
        ),
      )
      .limit(1)
      .then((rows) => rows[0]);
  }

  findCurrentBlock(scope: PetrosOwnerScope, sessionId: string) {
    return this.db
      .select()
      .from(schema.petrosTeachingBlocks)
      .where(
        and(
          eq(schema.petrosTeachingBlocks.sessionId, sessionId),
          eq(schema.petrosTeachingBlocks.institutionId, scope.institutionId),
          eq(schema.petrosTeachingBlocks.studentId, scope.studentId),
          eq(schema.petrosTeachingBlocks.status, 'current'),
        ),
      )
      .orderBy(desc(schema.petrosTeachingBlocks.sequence))
      .limit(1)
      .then((rows) => rows[0]);
  }

  findPendingDecision(scope: PetrosOwnerScope, sessionId: string) {
    return this.db
      .select()
      .from(schema.petrosPlanningDecisions)
      .where(
        and(
          eq(schema.petrosPlanningDecisions.sessionId, sessionId),
          eq(schema.petrosPlanningDecisions.institutionId, scope.institutionId),
          eq(schema.petrosPlanningDecisions.studentId, scope.studentId),
          inArray(schema.petrosPlanningDecisions.status, ['planned', 'overridden']),
          isNull(schema.petrosPlanningDecisions.resultingBlockId),
        ),
      )
      .orderBy(desc(schema.petrosPlanningDecisions.sequence))
      .limit(1)
      .then((rows) => rows[0]);
  }

  insertDecision(values: typeof schema.petrosPlanningDecisions.$inferInsert) {
    return this.db
      .insert(schema.petrosPlanningDecisions)
      .values(values)
      .returning()
      .then((rows) => rows[0]!);
  }

  async insertRenderedBlock(
    decisionId: string,
    values: typeof schema.petrosTeachingBlocks.$inferInsert,
    route: {
      renderRequestId?: string;
      routeReference?: Record<string, unknown> | null;
    },
    questions: Array<typeof schema.petrosQuestionSpecs.$inferInsert> = [],
  ) {
    if (values.visualSnapshot) {
      values.visualSnapshot = petrosVisualSnapshotSchema.parse(values.visualSnapshot);
      if ((values.visualSnapshot.program as { programId: string }).programId !== values.id) throw new Error('PETROS_VISUAL_SCOPE');
    }
    return this.db.transaction(async (tx) => {
      const [block] = await tx.insert(schema.petrosTeachingBlocks).values(values).returning();
      if (questions.length) await tx.insert(schema.petrosQuestionSpecs).values(questions);
      await tx
        .update(schema.petrosPlanningDecisions)
        .set({
          status: 'rendered',
          resultingBlockId: block!.id,
          renderRequestId: route.renderRequestId,
          routeReference: route.routeReference ?? null,
          updatedAt: new Date(),
        })
        .where(eq(schema.petrosPlanningDecisions.id, decisionId));
      return block!;
    });
  }

  acquirePlanning(scope: PetrosOwnerScope, sessionId: string) {
    const stale = new Date(Date.now() - 90_000);
    return this.db
      .update(schema.petrosLearningSessions)
      .set({ planningStartedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(schema.petrosLearningSessions.id, sessionId),
          eq(schema.petrosLearningSessions.institutionId, scope.institutionId),
          eq(schema.petrosLearningSessions.studentId, scope.studentId),
          eq(schema.petrosLearningSessions.status, 'active'),
          or(
            isNull(schema.petrosLearningSessions.planningStartedAt),
            lt(schema.petrosLearningSessions.planningStartedAt, stale),
          ),
        ),
      )
      .returning()
      .then((rows) => rows[0]);
  }

  releasePlanning(scope: PetrosOwnerScope, sessionId: string) {
    return this.db
      .update(schema.petrosLearningSessions)
      .set({ planningStartedAt: null, updatedAt: new Date() })
      .where(
        and(
          eq(schema.petrosLearningSessions.id, sessionId),
          eq(schema.petrosLearningSessions.institutionId, scope.institutionId),
          eq(schema.petrosLearningSessions.studentId, scope.studentId),
        ),
      );
  }

  async beginCommand(
    scope: PetrosOwnerScope,
    sessionId: string,
    idempotencyKey: string,
    command: string,
    inputSha256?: string,
  ) {
    if (command === 'composer_question') {
      // Enabled execution is gated by the service. With both flags disabled, no new
      // durable admission/retry is allowed; existing pending work must still block callers.
      const [pending] = await this.db.select({ id: schema.petrosSessionCommands.id })
        .from(schema.petrosSessionCommands)
        .where(and(
          eq(schema.petrosSessionCommands.institutionId, scope.institutionId),
          eq(schema.petrosSessionCommands.studentId, scope.studentId),
          eq(schema.petrosSessionCommands.sessionId, sessionId),
          inArray(schema.petrosSessionCommands.executionState, ['queued', 'running']),
        )).limit(1);
      if (pending) throw executionConflict('PETROS_QUESTION_EXECUTION_REQUIRED');
    }
    const inserted = await this.db
      .insert(schema.petrosSessionCommands)
      .values({
        sessionId,
        institutionId: scope.institutionId,
        studentId: scope.studentId,
        idempotencyKey,
        command,
        inputSha256,
      })
      .onConflictDoNothing()
      .returning();
    if (inserted[0]) return { state: 'started' as const, row: inserted[0] };
    const [existing] = await this.db
      .select()
      .from(schema.petrosSessionCommands)
      .where(
        and(
          eq(schema.petrosSessionCommands.sessionId, sessionId),
          eq(schema.petrosSessionCommands.institutionId, scope.institutionId),
          eq(schema.petrosSessionCommands.studentId, scope.studentId),
          eq(schema.petrosSessionCommands.idempotencyKey, idempotencyKey),
        ),
      )
      .limit(1);
    // A concurrent durable insert can win the database-enforced active-command index
    // after the optimistic pending read but before this legacy insert. Preserve the
    // typed rollback boundary instead of returning an unowned generic in-flight state.
    if (command === 'composer_question' && !existing && !inserted[0])
      throw executionConflict('PETROS_QUESTION_EXECUTION_REQUIRED');
    if (existing?.executionVersion) throw executionConflict('PETROS_QUESTION_EXECUTION_REQUIRED');
    if (existing && existing.command !== command)
      throw executionConflict('PETROS_COMMAND_REPLAY_CONFLICT');
    if (inputSha256 && existing && existing.inputSha256 !== inputSha256)
      throw executionConflict('PETROS_COMMAND_REPLAY_CONFLICT');
    if (existing?.status === 'completed' && existing.response) {
      return { state: 'completed' as const, row: existing, response: existing.response };
    }
    if (existing?.status === 'failed') {
      const [retried] = await this.db
        .update(schema.petrosSessionCommands)
        .set({
          status: 'in_progress',
          errorCode: null,
          response: null,
          completedAt: null,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(schema.petrosSessionCommands.id, existing.id),
            eq(schema.petrosSessionCommands.status, 'failed'),
          ),
        )
        .returning();
      if (retried) return { state: 'started' as const, row: retried };
    }
    return { state: 'in_flight' as const, row: existing };
  }

  async assertNoPendingQuestionExecution(scope: PetrosOwnerScope, sessionId: string) {
    const [pending] = await this.db.select({ id: schema.petrosSessionCommands.id })
      .from(schema.petrosSessionCommands)
      .where(and(
        eq(schema.petrosSessionCommands.institutionId, scope.institutionId),
        eq(schema.petrosSessionCommands.studentId, scope.studentId),
        eq(schema.petrosSessionCommands.sessionId, sessionId),
        inArray(schema.petrosSessionCommands.executionState, ['queued', 'running']),
      )).limit(1);
    if (pending) throw executionConflict('PETROS_QUESTION_EXECUTION_REQUIRED');
  }

  finishCommand(commandId: string, response: Record<string, unknown>) {
    return this.db
      .update(schema.petrosSessionCommands)
      .set({
        status: 'completed',
        response,
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(schema.petrosSessionCommands.id, commandId));
  }

  failCommand(commandId: string, errorCode: string) {
    return this.db
      .update(schema.petrosSessionCommands)
      .set({
        status: 'failed',
        errorCode,
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(schema.petrosSessionCommands.id, commandId));
  }

  lockVisualBlock(scope: PetrosOwnerScope, sessionId: string, blockId: string) {
    return this.db.select().from(schema.petrosTeachingBlocks).where(and(
      eq(schema.petrosTeachingBlocks.id, blockId), eq(schema.petrosTeachingBlocks.sessionId, sessionId),
      eq(schema.petrosTeachingBlocks.institutionId, scope.institutionId), eq(schema.petrosTeachingBlocks.studentId, scope.studentId),
    )).for('update').then(rows => rows[0]);
  }

  saveVisualSnapshot(scope: PetrosOwnerScope, sessionId: string, blockId: string, snapshot: Record<string, unknown>) {
    const validated = petrosVisualSnapshotSchema.parse(snapshot);
    if (validated.program.programId !== blockId) throw new Error('PETROS_VISUAL_SCOPE');
    return this.db.update(schema.petrosTeachingBlocks).set({ visualSnapshot: validated, updatedAt: new Date() }).where(and(
      eq(schema.petrosTeachingBlocks.id, blockId), eq(schema.petrosTeachingBlocks.sessionId, sessionId),
      eq(schema.petrosTeachingBlocks.institutionId, scope.institutionId), eq(schema.petrosTeachingBlocks.studentId, scope.studentId),
    ));
  }

  updateBlockInteraction(
    scope: PetrosOwnerScope,
    sessionId: string,
    blockId: string,
    interactionState: Record<string, unknown>,
  ) {
    return this.db
      .update(schema.petrosTeachingBlocks)
      .set({ interactionState, updatedAt: new Date() })
      .where(
        and(
          eq(schema.petrosTeachingBlocks.id, blockId),
          eq(schema.petrosTeachingBlocks.sessionId, sessionId),
          eq(schema.petrosTeachingBlocks.institutionId, scope.institutionId),
          eq(schema.petrosTeachingBlocks.studentId, scope.studentId),
        ),
      )
      .returning()
      .then((rows) => rows[0]);
  }

  updateSessionLearnerContext(
    scope: PetrosOwnerScope,
    sessionId: string,
    learnerContext: Record<string, unknown>,
  ) {
    return this.db
      .update(schema.petrosLearningSessions)
      .set({
        learnerContext,
        version: sql`${schema.petrosLearningSessions.version} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.petrosLearningSessions.id, sessionId),
          eq(schema.petrosLearningSessions.institutionId, scope.institutionId),
          eq(schema.petrosLearningSessions.studentId, scope.studentId),
        ),
      )
      .returning()
      .then((rows) => rows[0]);
  }

  updateSessionSourceContext(
    scope: PetrosOwnerScope,
    sessionId: string,
    sourceContext: Record<string, unknown> | null,
  ) {
    return this.db
      .update(schema.petrosLearningSessions)
      .set({ sourceContext, updatedAt: new Date() })
      .where(
        and(
          eq(schema.petrosLearningSessions.id, sessionId),
          eq(schema.petrosLearningSessions.institutionId, scope.institutionId),
          eq(schema.petrosLearningSessions.studentId, scope.studentId),
        ),
      )
      .returning()
      .then((rows) => rows[0]);
  }

  listQuestionSpecs(scope: PetrosOwnerScope, sessionId: string) {
    return this.db
      .select()
      .from(schema.petrosQuestionSpecs)
      .where(
        and(
          eq(schema.petrosQuestionSpecs.sessionId, sessionId),
          eq(schema.petrosQuestionSpecs.institutionId, scope.institutionId),
          eq(schema.petrosQuestionSpecs.studentId, scope.studentId),
        ),
      )
      .orderBy(asc(schema.petrosQuestionSpecs.createdAt));
  }

  insertQuestionSpecs(values: Array<typeof schema.petrosQuestionSpecs.$inferInsert>) {
    if (!values.length) return Promise.resolve([]);
    return this.db.insert(schema.petrosQuestionSpecs).values(values).returning();
  }

  findQuestionSpec(
    scope: PetrosOwnerScope,
    sessionId: string,
    blockId: string,
    questionId: string,
  ) {
    return this.db
      .select()
      .from(schema.petrosQuestionSpecs)
      .where(
        and(
          eq(schema.petrosQuestionSpecs.id, questionId),
          eq(schema.petrosQuestionSpecs.sessionId, sessionId),
          eq(schema.petrosQuestionSpecs.blockId, blockId),
          eq(schema.petrosQuestionSpecs.institutionId, scope.institutionId),
          eq(schema.petrosQuestionSpecs.studentId, scope.studentId),
        ),
      )
      .limit(1)
      .then((rows) => rows[0]);
  }

  listObservations(scope: PetrosOwnerScope, sessionId: string) {
    return this.db
      .select()
      .from(schema.petrosObservations)
      .where(
        and(
          eq(schema.petrosObservations.sessionId, sessionId),
          eq(schema.petrosObservations.institutionId, scope.institutionId),
          eq(schema.petrosObservations.studentId, scope.studentId),
        ),
      )
      .orderBy(asc(schema.petrosObservations.occurredAt));
  }

  assessmentHistory(scope: PetrosOwnerScope, sessionId: string, equivalenceKey: string, acrossSessions=false) {
    return this.db.select({ type: schema.petrosObservations.type, payload: schema.petrosObservations.payload })
      .from(schema.petrosObservations).innerJoin(schema.petrosQuestionSpecs,
        eq(schema.petrosObservations.questionId, schema.petrosQuestionSpecs.id))
      .where(and(acrossSessions ? undefined : eq(schema.petrosObservations.sessionId, sessionId),
        eq(schema.petrosObservations.institutionId, scope.institutionId), eq(schema.petrosObservations.studentId, scope.studentId),
        eq(schema.petrosQuestionSpecs.equivalenceKey, equivalenceKey)))
      .limit(1001).then(rows => {
        if (rows.length > 1000) throw new ConflictException({ code: 'PETROS_ASSESSMENT_HISTORY_LIMIT' });
        return rows;
      });
  }

  listEvaluations(scope: PetrosOwnerScope, sessionId: string) {
    return this.db
      .select()
      .from(schema.petrosAnswerEvaluations)
      .where(
        and(
          eq(schema.petrosAnswerEvaluations.sessionId, sessionId),
          eq(schema.petrosAnswerEvaluations.institutionId, scope.institutionId),
          eq(schema.petrosAnswerEvaluations.studentId, scope.studentId),
        ),
      )
      .orderBy(asc(schema.petrosAnswerEvaluations.createdAt));
  }

  listStretches(scope: PetrosOwnerScope, sessionId: string) {
    return this.db
      .select()
      .from(schema.petrosStruggleStretches)
      .where(
        and(
          eq(schema.petrosStruggleStretches.sessionId, sessionId),
          eq(schema.petrosStruggleStretches.institutionId, scope.institutionId),
          eq(schema.petrosStruggleStretches.studentId, scope.studentId),
        ),
      );
  }

  listDetours(scope: PetrosOwnerScope, sessionId: string) {
    return this.db
      .select()
      .from(schema.petrosSessionDetours)
      .where(
        and(
          eq(schema.petrosSessionDetours.sessionId, sessionId),
          eq(schema.petrosSessionDetours.institutionId, scope.institutionId),
          eq(schema.petrosSessionDetours.studentId, scope.studentId),
        ),
      )
      .orderBy(asc(schema.petrosSessionDetours.createdAt));
  }

  async commitAnswer(values: {
    scope: PetrosOwnerScope;
    sessionId: string;
    blockId: string;
    expectedBlockVersion: number;
    question: typeof schema.petrosQuestionSpecs.$inferSelect;
    observation: typeof schema.petrosObservations.$inferInsert;
    confidenceObservation: typeof schema.petrosObservations.$inferInsert;
    responseTimeObservation?: typeof schema.petrosObservations.$inferInsert;
    evaluation: Omit<typeof schema.petrosAnswerEvaluations.$inferInsert, 'observationId'>;
    ladder: {
      wrongAttemptCount: number;
      ladderLevel: number;
      status: string;
      recovery: boolean;
    };
    rewordedQuestion?: typeof schema.petrosQuestionSpecs.$inferInsert;
  }) {
    if (values.evaluation.assessment) {
      const assessment = petrosAssessmentSchema.parse(values.evaluation.assessment);
      if (assessment.result.kind !== 'objective') throw new ConflictException({ code: 'PETROS_QUALITATIVE_ASSESSMENT_DISABLED' });
      const judgment = assessment.result.judgment;
      if (judgment.status === 'evaluated' && (judgment.creditBasisPoints !== values.evaluation.creditBasisPoints ||
        judgment.outcome !== (values.evaluation.correctness === 'incorrect' ? 'wrong' : values.evaluation.correctness)))
        throw new ConflictException({ code: 'PETROS_ASSESSMENT_PROJECTION_MISMATCH' });
      values.evaluation.assessment = assessment;
    }
    return this.db.transaction(async (tx) => {
      const [alreadyAnswered] = await tx
        .select({ id: schema.petrosObservations.id })
        .from(schema.petrosObservations)
        .where(
          and(
            eq(schema.petrosObservations.questionId, values.question.id),
            eq(schema.petrosObservations.type, 'answer_submitted'),
          ),
        )
        .limit(1);
      if (alreadyAnswered) return { state: 'already_answered' as const };
      const [block] = await tx
        .update(schema.petrosTeachingBlocks)
        .set({
          version: sql`${schema.petrosTeachingBlocks.version} + 1`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(schema.petrosTeachingBlocks.id, values.blockId),
            eq(schema.petrosTeachingBlocks.sessionId, values.sessionId),
            eq(schema.petrosTeachingBlocks.institutionId, values.scope.institutionId),
            eq(schema.petrosTeachingBlocks.studentId, values.scope.studentId),
            eq(schema.petrosTeachingBlocks.status, 'current'),
            eq(schema.petrosTeachingBlocks.version, values.expectedBlockVersion),
          ),
        )
        .returning();
      if (!block) return { state: 'stale' as const };

      const [observation] = await tx
        .insert(schema.petrosObservations)
        .values(values.observation)
        .returning();
      await tx
        .insert(schema.petrosObservations)
        .values([
          values.confidenceObservation,
          ...(values.responseTimeObservation ? [values.responseTimeObservation] : []),
        ]);
      const [evaluation] = await tx
        .insert(schema.petrosAnswerEvaluations)
        .values({ ...values.evaluation, observationId: observation!.id }).returning();
      await tx
        .update(schema.petrosQuestionSpecs)
        .set({ active: false, updatedAt: new Date() })
        .where(eq(schema.petrosQuestionSpecs.id, values.question.id));

      const [stretch] = await tx
        .select()
        .from(schema.petrosStruggleStretches)
        .where(
          and(
            eq(schema.petrosStruggleStretches.sessionId, values.sessionId),
            eq(schema.petrosStruggleStretches.equivalenceKey, values.question.equivalenceKey),
          ),
        )
        .limit(1);
      const stretchPatch = {
        wrongAttemptCount: values.ladder.wrongAttemptCount,
        ladderLevel: values.ladder.ladderLevel,
        status: values.ladder.status,
        lastObservationId: observation!.id,
        recoveredAt: values.ladder.recovery ? new Date() : null,
        ...(values.rewordedQuestion ? { rewordedQuestionId: values.rewordedQuestion.id } : {}),
        updatedAt: new Date(),
      };
      if (stretch) {
        await tx
          .update(schema.petrosStruggleStretches)
          .set({
            ...stretchPatch,
            version: sql`${schema.petrosStruggleStretches.version} + 1`,
          })
          .where(eq(schema.petrosStruggleStretches.id, stretch.id));
      } else {
        await tx.insert(schema.petrosStruggleStretches).values({
          sessionId: values.sessionId,
          blockId: values.blockId,
          institutionId: values.scope.institutionId,
          studentId: values.scope.studentId,
          targetId: values.question.targetId,
          equivalenceKey: values.question.equivalenceKey,
          ...stretchPatch,
        });
      }
      if (values.rewordedQuestion)
        await tx.insert(schema.petrosQuestionSpecs).values(values.rewordedQuestion);
      await tx
        .update(schema.petrosLearningSessions)
        .set({
          version: sql`${schema.petrosLearningSessions.version} + 1`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(schema.petrosLearningSessions.id, values.sessionId),
            eq(schema.petrosLearningSessions.institutionId, values.scope.institutionId),
            eq(schema.petrosLearningSessions.studentId, values.scope.studentId),
          ),
        );
      return { state: 'committed' as const, observation: observation!, evaluation:evaluation!, block: block! };
    });
  }

  async recordHint(values: {
    scope: PetrosOwnerScope;
    sessionId: string;
    blockId: string;
    expectedBlockVersion: number;
    observation: typeof schema.petrosObservations.$inferInsert;
  }) {
    return this.db.transaction(async (tx) => {
      const [block] = await tx
        .update(schema.petrosTeachingBlocks)
        .set({
          version: sql`${schema.petrosTeachingBlocks.version} + 1`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(schema.petrosTeachingBlocks.id, values.blockId),
            eq(schema.petrosTeachingBlocks.sessionId, values.sessionId),
            eq(schema.petrosTeachingBlocks.institutionId, values.scope.institutionId),
            eq(schema.petrosTeachingBlocks.studentId, values.scope.studentId),
            eq(schema.petrosTeachingBlocks.version, values.expectedBlockVersion),
          ),
        )
        .returning();
      if (!block) return undefined;
      await tx.insert(schema.petrosObservations).values(values.observation);
      return block;
    });
  }

  async createDetour(values: {
    scope: PetrosOwnerScope;
    sessionId: string;
    expectedSessionVersion: number;
    observation: typeof schema.petrosObservations.$inferInsert;
    question: string;
    answer: string;
    routeChange: string;
    returnPlan: string;
  }) {
    return this.db.transaction(async (tx) => {
      const [session] = await tx
        .update(schema.petrosLearningSessions)
        .set({
          version: sql`${schema.petrosLearningSessions.version} + 1`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(schema.petrosLearningSessions.id, values.sessionId),
            eq(schema.petrosLearningSessions.institutionId, values.scope.institutionId),
            eq(schema.petrosLearningSessions.studentId, values.scope.studentId),
            eq(schema.petrosLearningSessions.version, values.expectedSessionVersion),
            eq(schema.petrosLearningSessions.status, 'active'),
            isNull(schema.petrosLearningSessions.planningStartedAt),
          ),
        )
        .returning();
      if (!session) return undefined;
      const [observation] = await tx
        .insert(schema.petrosObservations)
        .values(values.observation)
        .returning();
      await tx.insert(schema.petrosSessionDetours).values({
        sessionId: values.sessionId,
        observationId: observation!.id,
        institutionId: values.scope.institutionId,
        studentId: values.scope.studentId,
        question: values.question,
        status: 'active',
        action: 'answer_now',
        acknowledgement: values.answer,
        routeChange: values.routeChange,
        returnPlan: values.returnPlan,
      });
      return session;
    });
  }

  async rejoinDetour(scope: PetrosOwnerScope, sessionId: string, detourId: string) {
    const [detour] = await this.db
      .update(schema.petrosSessionDetours)
      .set({ status: 'rejoined', rejoinedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(schema.petrosSessionDetours.id, detourId),
          eq(schema.petrosSessionDetours.sessionId, sessionId),
          eq(schema.petrosSessionDetours.institutionId, scope.institutionId),
          eq(schema.petrosSessionDetours.studentId, scope.studentId),
          eq(schema.petrosSessionDetours.status, 'active'),
        ),
      )
      .returning();
    return detour;
  }

  activateDetours(
    scope: PetrosOwnerScope,
    sessionId: string,
    decisionId: string,
    response: {
      causalObservationIds: string[];
      action: string;
      acknowledgement: string | null;
      routeChange: string | null;
      returnPlan: string | null;
    },
  ) {
    if (!response.causalObservationIds.length || response.action === 'continue')
      return Promise.resolve([]);
    const status =
      response.action === 'park'
        ? 'parked'
        : response.action === 'clarify'
          ? 'clarifying'
          : 'active';
    return this.db
      .update(schema.petrosSessionDetours)
      .set({
        status,
        action: response.action,
        acknowledgement: response.acknowledgement,
        routeChange: response.routeChange,
        returnPlan: response.returnPlan,
        changedDecisionId: decisionId,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.petrosSessionDetours.sessionId, sessionId),
          eq(schema.petrosSessionDetours.institutionId, scope.institutionId),
          eq(schema.petrosSessionDetours.studentId, scope.studentId),
          inArray(schema.petrosSessionDetours.observationId, response.causalObservationIds),
          eq(schema.petrosSessionDetours.status, 'pending'),
        ),
      )
      .returning();
  }

  rejoinDecisionDetours(scope: PetrosOwnerScope, sessionId: string, decisionId: string) {
    return this.db
      .update(schema.petrosSessionDetours)
      .set({ status: 'rejoined', rejoinedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(schema.petrosSessionDetours.sessionId, sessionId),
          eq(schema.petrosSessionDetours.institutionId, scope.institutionId),
          eq(schema.petrosSessionDetours.studentId, scope.studentId),
          eq(schema.petrosSessionDetours.changedDecisionId, decisionId),
          eq(schema.petrosSessionDetours.status, 'active'),
        ),
      );
  }

  async completeBlock(
    scope: PetrosOwnerScope,
    sessionId: string,
    blockId: string,
    values: {
      expectedBlockVersion: number;
      interactionState: Record<string, unknown>;
      observedOutcome: Record<string, unknown>;
      checkpoints: Array<{ id: string; label: string; status: 'pending' | 'current' | 'complete' }>;
      currentCheckpointId: string;
      elapsedSeconds: number;
      closeReason?: string;
      retireQuestions?: boolean;
    },
  ) {
    return this.db.transaction(async (tx) => {
      const [block] = await tx
        .update(schema.petrosTeachingBlocks)
        .set({
          status: 'completed',
          version: sql`${schema.petrosTeachingBlocks.version} + 1`,
          interactionState: values.interactionState,
          observedOutcome: values.observedOutcome,
          completedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(schema.petrosTeachingBlocks.id, blockId),
            eq(schema.petrosTeachingBlocks.sessionId, sessionId),
            eq(schema.petrosTeachingBlocks.institutionId, scope.institutionId),
            eq(schema.petrosTeachingBlocks.studentId, scope.studentId),
            eq(schema.petrosTeachingBlocks.status, 'current'),
            eq(schema.petrosTeachingBlocks.version, values.expectedBlockVersion),
          ),
        )
        .returning();
      if (!block) return undefined;
      if (values.retireQuestions) {
        await tx
          .update(schema.petrosQuestionSpecs)
          .set({ active: false, updatedAt: new Date() })
          .where(
            and(
              eq(schema.petrosQuestionSpecs.blockId, blockId),
              eq(schema.petrosQuestionSpecs.sessionId, sessionId),
              eq(schema.petrosQuestionSpecs.institutionId, scope.institutionId),
              eq(schema.petrosQuestionSpecs.studentId, scope.studentId),
            ),
          );
      }
      await tx
        .update(schema.petrosPlanningDecisions)
        .set({
          status: 'completed',
          observedOutcome: values.observedOutcome,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(schema.petrosPlanningDecisions.id, block.decisionId),
            eq(schema.petrosPlanningDecisions.institutionId, scope.institutionId),
            eq(schema.petrosPlanningDecisions.studentId, scope.studentId),
          ),
        );
      await tx
        .update(schema.petrosLearningSessions)
        .set({
          checkpoints: values.checkpoints,
          currentCheckpointId: values.currentCheckpointId,
          elapsedSeconds: values.elapsedSeconds,
          activeSince: values.closeReason ? null : new Date(),
          ...(values.closeReason
            ? { status: 'closed', closeReason: values.closeReason, closedAt: new Date() }
            : {}),
          version: sql`${schema.petrosLearningSessions.version} + 1`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(schema.petrosLearningSessions.id, sessionId),
            eq(schema.petrosLearningSessions.institutionId, scope.institutionId),
            eq(schema.petrosLearningSessions.studentId, scope.studentId),
          ),
        );
      return block;
    });
  }

  setSessionStatus(
    scope: PetrosOwnerScope,
    sessionId: string,
    patch: {
      status: 'active' | 'paused' | 'closed';
      elapsedSeconds: number;
      activeSince: Date | null;
      closeReason?: string | null;
      closedAt?: Date | null;
    },
  ) {
    return this.db
      .update(schema.petrosLearningSessions)
      .set({ ...patch, planningStartedAt: null, updatedAt: new Date() })
      .where(
        and(
          eq(schema.petrosLearningSessions.id, sessionId),
          eq(schema.petrosLearningSessions.institutionId, scope.institutionId),
          eq(schema.petrosLearningSessions.studentId, scope.studentId),
        ),
      )
      .returning()
      .then((rows) => rows[0]);
  }

  recordEvent(values: typeof schema.petrosSessionEvents.$inferInsert) {
    return this.db
      .insert(schema.petrosSessionEvents)
      .values(values)
      .returning()
      .then((rows) => rows[0]!);
  }

  async recordDoorLifecycle(
    scope: PetrosOwnerScope,
    sessionId: string,
    type: 'completed' | 'paused' | 'abandoned',
    reasonCode?: string,
  ) {
    const [intent] = await this.db
      .select()
      .from(schema.petrosSessionIntents)
      .where(
        and(
          eq(schema.petrosSessionIntents.institutionId, scope.institutionId),
          eq(schema.petrosSessionIntents.studentId, scope.studentId),
          eq(schema.petrosSessionIntents.sessionId, sessionId),
        ),
      )
      .limit(1);
    if (!intent) return undefined;
    return this.db
      .insert(schema.petrosDoorEvents)
      .values({
        institutionId: scope.institutionId,
        studentId: scope.studentId,
        intentId: intent.id,
        sessionId,
        door: intent.door,
        sessionType: intent.sessionType,
        type,
        idempotencyKey: randomUUID(),
        correlationId: intent.correlationId,
        reasonCode,
        payload: {},
      })
      .returning()
      .then((rows) => rows[0]);
  }

  async completePathItemFromEvidence(
    scope: PetrosOwnerScope,
    sessionId: string,
    pathItemId: string,
  ) {
    const [evidence] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.petrosAnswerEvaluations)
      .where(
        and(
          eq(schema.petrosAnswerEvaluations.sessionId, sessionId),
          eq(schema.petrosAnswerEvaluations.institutionId, scope.institutionId),
          eq(schema.petrosAnswerEvaluations.studentId, scope.studentId),
          gte(schema.petrosAnswerEvaluations.creditBasisPoints, 7_000),
        ),
      );
    if (!evidence?.count) return { completed: false, reason: 'insufficient_evidence' as const };
    return this.db.transaction(async (tx) => {
      const [owned] = await tx
        .select({ item: schema.learningPathItems, path: schema.learningPaths })
        .from(schema.learningPathItems)
        .innerJoin(
          schema.learningPaths,
          eq(schema.learningPaths.id, schema.learningPathItems.pathId),
        )
        .where(
          and(
            eq(schema.learningPathItems.id, pathItemId),
            eq(schema.learningPaths.institutionId, scope.institutionId),
            eq(schema.learningPaths.studentId, scope.studentId),
          ),
        )
        .limit(1);
      if (!owned || owned.item.status === 'completed')
        return { completed: owned?.item.status === 'completed', reason: 'unchanged' as const };
      const [completed] = await tx
        .update(schema.learningPathItems)
        .set({
          status: 'completed',
          completedAt: new Date(),
          version: sql`${schema.learningPathItems.version} + 1`,
        })
        .where(eq(schema.learningPathItems.id, pathItemId))
        .returning();
      const [next] = await tx
        .select()
        .from(schema.learningPathItems)
        .where(
          and(
            eq(schema.learningPathItems.pathId, owned.path.id),
            sql`${schema.learningPathItems.sequence} > ${owned.item.sequence}`,
            eq(schema.learningPathItems.status, 'upcoming'),
          ),
        )
        .orderBy(asc(schema.learningPathItems.sequence))
        .limit(1);
      if (next)
        await tx
          .update(schema.learningPathItems)
          .set({ status: 'current', version: sql`${schema.learningPathItems.version} + 1` })
          .where(eq(schema.learningPathItems.id, next.id));
      return { completed: Boolean(completed), reason: 'demonstrated_evidence' as const };
    });
  }

  recordObservation(values: typeof schema.petrosObservations.$inferInsert) {
    return this.db
      .insert(schema.petrosObservations)
      .values(values)
      .returning()
      .then((rows) => rows[0]!);
  }

  async listDecisionDiagnostics(query: PetrosDecisionDiagnosticQuery) {
    const clauses = [];
    if (query.sessionId)
      clauses.push(eq(schema.petrosPlanningDecisions.sessionId, query.sessionId));
    if (query.moveType)
      clauses.push(
        eq(schema.petrosPlanningDecisions.selectedMoveType, query.moveType as PetrosMoveType),
      );
    if (query.source) clauses.push(eq(schema.petrosPlanningDecisions.source, query.source));
    if (
      query.functionKey &&
      (query.functionKey === 'teaching.next_action.select' ||
        query.functionKey === 'teaching.block.render')
    ) {
      clauses.push(eq(schema.petrosPlanningDecisions.functionKey, query.functionKey));
    }
    if (query.institutionId)
      clauses.push(eq(schema.petrosPlanningDecisions.institutionId, query.institutionId));
    if (query.from)
      clauses.push(gte(schema.petrosPlanningDecisions.createdAt, new Date(query.from)));
    if (query.to) clauses.push(lte(schema.petrosPlanningDecisions.createdAt, new Date(query.to)));
    if (query.sessionType) {
      const sessionIds = await this.db
        .select({ id: schema.petrosLearningSessions.id })
        .from(schema.petrosLearningSessions)
        .where(eq(schema.petrosLearningSessions.sessionType, query.sessionType));
      if (!sessionIds.length) return [];
      clauses.push(
        inArray(
          schema.petrosPlanningDecisions.sessionId,
          sessionIds.map((row) => row.id),
        ),
      );
    }
    return this.db
      .select()
      .from(schema.petrosPlanningDecisions)
      .where(clauses.length ? and(...clauses) : undefined)
      .orderBy(desc(schema.petrosPlanningDecisions.createdAt))
      .limit(query.limit);
  }

  async listObservationDiagnostics(query: PetrosDecisionDiagnosticQuery) {
    const clauses = [];
    if (query.sessionId) clauses.push(eq(schema.petrosObservations.sessionId, query.sessionId));
    if (query.institutionId)
      clauses.push(eq(schema.petrosObservations.institutionId, query.institutionId));
    if (query.observationType)
      clauses.push(eq(schema.petrosObservations.type, query.observationType));
    if (query.functionKey === 'answer.evaluate')
      clauses.push(eq(schema.petrosAnswerEvaluations.functionKey, query.functionKey));
    if (query.functionKey === 'hint.generate')
      clauses.push(eq(schema.petrosObservations.type, 'hint_requested'));
    if (query.from) clauses.push(gte(schema.petrosObservations.occurredAt, new Date(query.from)));
    if (query.to) clauses.push(lte(schema.petrosObservations.occurredAt, new Date(query.to)));
    if (query.sessionType) {
      const sessionIds = await this.db
        .select({ id: schema.petrosLearningSessions.id })
        .from(schema.petrosLearningSessions)
        .where(eq(schema.petrosLearningSessions.sessionType, query.sessionType));
      if (!sessionIds.length) return [];
      clauses.push(
        inArray(
          schema.petrosObservations.sessionId,
          sessionIds.map((row) => row.id),
        ),
      );
    }
    return this.db
      .select({
        observation: schema.petrosObservations,
        evaluation: schema.petrosAnswerEvaluations,
      })
      .from(schema.petrosObservations)
      .leftJoin(
        schema.petrosAnswerEvaluations,
        eq(schema.petrosAnswerEvaluations.observationId, schema.petrosObservations.id),
      )
      .where(clauses.length ? and(...clauses) : undefined)
      .orderBy(desc(schema.petrosObservations.occurredAt))
      .limit(query.limit);
  }
}
