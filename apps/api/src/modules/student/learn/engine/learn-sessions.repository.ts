import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, gte, inArray, isNull, sql, type SQL } from 'drizzle-orm';
import { schema, type Database } from '@edrion/database';
import { DATABASE } from '../../../../common/tokens';
import type { OrchestratorStatus } from '@edrion/schemas';
import type { StudentPrincipal } from '../../student.types';
import { ORCHESTRATOR_ACTIVE_STATUSES } from './constants';

function sessionOwner(principal: StudentPrincipal): SQL {
  return principal.kind === 'institutional'
    ? eq(schema.learnSessions.studentId, principal.studentId)
    : eq(schema.learnSessions.independentUserId, principal.independentUserId);
}

function masteryOwner(principal: StudentPrincipal): SQL {
  return principal.kind === 'institutional'
    ? eq(schema.learnerMastery.studentId, principal.studentId)
    : eq(schema.learnerMastery.independentUserId, principal.independentUserId);
}

@Injectable()
export class LearnSessionsRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async findTopicByKey(topicKey: string, curriculumKey = 'generic') {
    return this.db
      .select()
      .from(schema.learnTopics)
      .where(and(eq(schema.learnTopics.topicKey, topicKey), eq(schema.learnTopics.curriculumKey, curriculumKey)))
      .limit(1)
      .then((r) => r[0] ?? null);
  }

  async upsertTopic(
    topicKey: string,
    title: string,
    subjectLabel: string,
    curriculumKey: string,
    institutionId?: string | null,
  ) {
    const existing = await this.findTopicByKey(topicKey, curriculumKey);
    if (existing) return existing;
    const [created] = await this.db
      .insert(schema.learnTopics)
      .values({
        topicKey,
        title,
        subjectLabel,
        curriculumKey,
        institutionId: institutionId ?? null,
        source: institutionId ? 'institution' : 'ai',
      })
      .returning();
    return created!;
  }

  async getTopic(topicId: string | null | undefined) {
    if (!topicId) return null;
    return this.db
      .select()
      .from(schema.learnTopics)
      .where(eq(schema.learnTopics.id, topicId))
      .limit(1)
      .then((r) => r[0] ?? null);
  }

  async listConceptAtoms(topicId: string) {
    return this.db
      .select()
      .from(schema.conceptAtoms)
      .where(eq(schema.conceptAtoms.topicId, topicId))
      .orderBy(schema.conceptAtoms.createdAt);
  }

  async touchConceptAtom(atomId: string) {
    await this.db
      .update(schema.conceptAtoms)
      .set({ updatedAt: new Date() })
      .where(eq(schema.conceptAtoms.id, atomId));
  }

  async seedLearnConceptAtoms(
    topicId: string,
    atoms: Array<{ variantKey: string; title: string; summary: string }>,
    model: string,
    promptVersion: string,
  ): Promise<number> {
    if (!atoms.length) return 0;
    let inserted = 0;
    for (const atom of atoms) {
      await this.db
        .insert(schema.conceptAtoms)
        .values({
          topicId,
          atomKind: 'learn_concept',
          variantKey: atom.variantKey.slice(0, 120),
          content: { title: atom.title, summary: atom.summary },
          model,
          promptVersion,
        })
        .onConflictDoNothing();
      inserted += 1;
    }
    return inserted;
  }

  async findActiveOrchestratorSession(principal: StudentPrincipal) {
    return this.db
      .select()
      .from(schema.learnSessions)
      .where(
        and(
          sessionOwner(principal),
          sql`${schema.learnSessions.entryPoint} IS NOT NULL`,
          inArray(schema.learnSessions.orchestratorStatus, [...ORCHESTRATOR_ACTIVE_STATUSES]),
        ),
      )
      .orderBy(desc(schema.learnSessions.startedAt))
      .limit(1)
      .then((r) => r[0] ?? null);
  }

  async getSession(principal: StudentPrincipal, sessionId: string) {
    return this.db
      .select()
      .from(schema.learnSessions)
      .where(and(eq(schema.learnSessions.id, sessionId), sessionOwner(principal)))
      .limit(1)
      .then((r) => r[0] ?? null);
  }

  async countSessionsToday(principal: StudentPrincipal): Promise<number> {
    const start = new Date();
    start.setUTCHours(0, 0, 0, 0);
    const rows = await this.db
      .select({ c: sql<number>`count(*)::int` })
      .from(schema.learnSessions)
      .where(
        and(
          sessionOwner(principal),
          gte(schema.learnSessions.startedAt, start),
          sql`${schema.learnSessions.entryPoint} IS NOT NULL`,
        ),
      );
    return rows[0]?.c ?? 0;
  }

  async createSession(row: typeof schema.learnSessions.$inferInsert) {
    const [created] = await this.db.insert(schema.learnSessions).values(row).returning();
    return created!;
  }

  async updateSession(
    sessionId: string,
    patch: Partial<typeof schema.learnSessions.$inferInsert>,
    expectedVersion?: number,
    tx: Database = this.db,
  ) {
    const conditions = [eq(schema.learnSessions.id, sessionId)];
    if (expectedVersion != null) {
      conditions.push(eq(schema.learnSessions.version, expectedVersion));
    }
    const [updated] = await tx
      .update(schema.learnSessions)
      .set({ ...patch, orchestratorUpdatedAt: new Date(), version: sql`${schema.learnSessions.version} + 1` })
      .where(and(...conditions))
      .returning();
    return updated ?? null;
  }

  async listBlocks(sessionId: string) {
    return this.db
      .select()
      .from(schema.learnSessionBlocks)
      .where(eq(schema.learnSessionBlocks.sessionId, sessionId))
      .orderBy(schema.learnSessionBlocks.sequence);
  }

  async getBlock(sessionId: string, blockId: string) {
    return this.db
      .select()
      .from(schema.learnSessionBlocks)
      .where(and(eq(schema.learnSessionBlocks.sessionId, sessionId), eq(schema.learnSessionBlocks.id, blockId)))
      .limit(1)
      .then((r) => r[0] ?? null);
  }

  async insertBlock(row: typeof schema.learnSessionBlocks.$inferInsert) {
    const [created] = await this.db.insert(schema.learnSessionBlocks).values(row).returning();
    return created!;
  }

  async updateBlock(
    blockId: string,
    patch: Partial<typeof schema.learnSessionBlocks.$inferInsert>,
  ) {
    const [updated] = await this.db
      .update(schema.learnSessionBlocks)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(schema.learnSessionBlocks.id, blockId))
      .returning();
    return updated ?? null;
  }

  /**
   * Atomically allocate the next block sequence for a session.
   * Single statement: never read-then-increment.
   */
  async nextBlockSequence(sessionId: string) {
    const [row] = await this.db
      .update(schema.learnSessions)
      .set({ lastBlockSeq: sql`${schema.learnSessions.lastBlockSeq} + 1` })
      .where(eq(schema.learnSessions.id, sessionId))
      .returning({ seq: schema.learnSessions.lastBlockSeq });
    return Number(row?.seq ?? 1);
  }

  /**
   * Atomically allocate the next session event sequence.
   * Single statement: the returned value is the committed `last_event_seq`.
   */
  async nextEventSeq(sessionId: string, tx: Database = this.db) {
    const [row] = await tx
      .update(schema.learnSessions)
      .set({ lastEventSeq: sql`${schema.learnSessions.lastEventSeq} + 1` })
      .where(eq(schema.learnSessions.id, sessionId))
      .returning({ seq: schema.learnSessions.lastEventSeq });
    return Number(row?.seq ?? 1);
  }

  async appendSessionEvent(
    sessionId: string,
    eventType: string,
    payload: Record<string, unknown>,
    tx: Database = this.db,
  ) {
    const seq = await this.nextEventSeq(sessionId, tx);
    const [row] = await tx
      .insert(schema.learnSessionEvents)
      .values({ sessionId, seq, eventType, payload })
      .returning();
    return row!;
  }

  /**
   * Hyperspec §5: a state-machine transition and its audit event are ONE unit of
   * work. The status UPDATE is guarded on the expected `from` set so a concurrent
   * request can never double-transition (and never writes a second audit event) —
   * a lost race returns `null` and the caller no-ops.
   *
   * The event seq is allocated inside the same transaction via
   * `appendSessionEvent`, which owns its own atomic `UPDATE … RETURNING`.
   */
  async transitionSessionStatus(input: {
    sessionId: string;
    from: readonly OrchestratorStatus[];
    to: OrchestratorStatus;
    eventType: string;
    payload: Record<string, unknown>;
    patch?: Partial<typeof schema.learnSessions.$inferInsert>;
  }) {
    return this.runInTransaction(async (tx) => {
      const [updated] = await tx
        .update(schema.learnSessions)
        .set({
          ...(input.patch ?? {}),
          orchestratorStatus: input.to,
          orchestratorUpdatedAt: new Date(),
          version: sql`${schema.learnSessions.version} + 1`,
        })
        .where(
          and(
            eq(schema.learnSessions.id, input.sessionId),
            inArray(schema.learnSessions.orchestratorStatus, [...input.from]),
          ),
        )
        .returning();
      if (!updated) return null;
      const event = await this.appendSessionEvent(
        input.sessionId,
        input.eventType,
        input.payload,
        tx,
      );
      return { session: updated, event };
    });
  }

  async listSessionEventsSince(sessionId: string, afterSeq: number) {
    return this.db
      .select()
      .from(schema.learnSessionEvents)
      .where(and(eq(schema.learnSessionEvents.sessionId, sessionId), sql`${schema.learnSessionEvents.seq} > ${afterSeq}`))
      .orderBy(schema.learnSessionEvents.seq);
  }

  async findTopicShape(
    principal: StudentPrincipal,
    opts: { learnTopicId?: string | null; topicKey: string },
  ) {
    const ownerCond =
      principal.kind === 'institutional'
        ? and(
            eq(schema.learnTopicShapes.institutionId, principal.institutionId),
            isNull(schema.learnTopicShapes.independentUserId),
          )
        : and(
            isNull(schema.learnTopicShapes.institutionId),
            eq(schema.learnTopicShapes.independentUserId, principal.independentUserId),
          );

    if (opts.learnTopicId) {
      const byTopic = await this.db
        .select()
        .from(schema.learnTopicShapes)
        .where(and(ownerCond, eq(schema.learnTopicShapes.learnTopicId, opts.learnTopicId)))
        .limit(1)
        .then((r) => r[0] ?? null);
      if (byTopic) return byTopic;
    }

    return this.db
      .select()
      .from(schema.learnTopicShapes)
      .where(and(ownerCond, eq(schema.learnTopicShapes.topicKey, opts.topicKey)))
      .limit(1)
      .then((r) => r[0] ?? null);
  }

  /** @deprecated Use findTopicShape — alias during rebuild. */
  async findTopicProfile(
    principal: StudentPrincipal,
    opts: { learnTopicId?: string | null; topicKey: string },
  ) {
    return this.findTopicShape(principal, opts);
  }

  async insertTopicShape(row: typeof schema.learnTopicShapes.$inferInsert) {
    const conflict =
      row.institutionId != null
        ? {
            target: [schema.learnTopicShapes.institutionId, schema.learnTopicShapes.topicKey],
            targetWhere: sql`${schema.learnTopicShapes.institutionId} IS NOT NULL`,
          }
        : row.independentUserId != null
          ? {
              target: [
                schema.learnTopicShapes.independentUserId,
                schema.learnTopicShapes.topicKey,
              ],
              targetWhere: sql`${schema.learnTopicShapes.independentUserId} IS NOT NULL`,
            }
          : null;

    if (!conflict) {
      const [inserted] = await this.db.insert(schema.learnTopicShapes).values(row).returning();
      return inserted!;
    }

    const [created] = await this.db
      .insert(schema.learnTopicShapes)
      .values(row)
      .onConflictDoUpdate({
        ...conflict,
        set: {
          learnTopicId: row.learnTopicId ?? null,
          shape: row.shape,
          shapeSchemaVersion: row.shapeSchemaVersion ?? 1,
          source: row.source,
          model: row.model ?? null,
          promptVersion: row.promptVersion ?? null,
          computedAt: row.computedAt ?? new Date(),
          updatedAt: new Date(),
          version: sql`${schema.learnTopicShapes.version} + 1`,
        },
      })
      .returning();
    return created!;
  }

  /** @deprecated Use insertTopicShape. */
  async insertTopicProfile(row: typeof schema.learnTopicShapes.$inferInsert) {
    return this.insertTopicShape(row);
  }

  async getMastery(principal: StudentPrincipal, atomId: string) {
    return this.db
      .select()
      .from(schema.learnerMastery)
      .where(and(masteryOwner(principal), eq(schema.learnerMastery.atomId, atomId)))
      .limit(1)
      .then((r) => r[0] ?? null);
  }

  async upsertMastery(
    principal: StudentPrincipal,
    atomId: string,
    patch: { rating: number; attempts: number; correctWeight: number; lastAttemptAt: Date },
    tx?: Database,
  ) {
    const db = tx ?? this.db;
    const base =
      principal.kind === 'institutional'
        ? {
            institutionId: principal.institutionId,
            studentId: principal.studentId,
            independentUserId: null,
          }
        : { institutionId: null, studentId: null, independentUserId: principal.independentUserId };

    const [row] = await db
      .insert(schema.learnerMastery)
      .values({
        ...base,
        atomId,
        rating: patch.rating,
        attempts: patch.attempts,
        correctWeight: String(patch.correctWeight),
        lastAttemptAt: patch.lastAttemptAt,
      })
      .onConflictDoUpdate({
        target:
          principal.kind === 'institutional'
            ? [schema.learnerMastery.studentId, schema.learnerMastery.atomId]
            : [schema.learnerMastery.independentUserId, schema.learnerMastery.atomId],
        targetWhere:
          principal.kind === 'institutional'
            ? sql`${schema.learnerMastery.studentId} IS NOT NULL`
            : sql`${schema.learnerMastery.independentUserId} IS NOT NULL`,
        set: {
          rating: patch.rating,
          attempts: patch.attempts,
          correctWeight: String(patch.correctWeight),
          lastAttemptAt: patch.lastAttemptAt,
          updatedAt: new Date(),
          version: sql`${schema.learnerMastery.version} + 1`,
        },
      })
      .returning();
    return row!;
  }

  async findAttemptByQuestion(sessionId: string, blockId: string, questionId: string) {
    return this.db
      .select()
      .from(schema.learnAttempts)
      .where(
        and(
          eq(schema.learnAttempts.sessionId, sessionId),
          eq(schema.learnAttempts.blockId, blockId),
          eq(schema.learnAttempts.questionId, questionId),
        ),
      )
      .limit(1)
      .then((r) => r[0] ?? null);
  }

  async insertAttempt(row: typeof schema.learnAttempts.$inferInsert, tx?: Database) {
    const db = tx ?? this.db;
    const [created] = await db.insert(schema.learnAttempts).values(row).returning();
    return created!;
  }

  async insertEvidenceTag(row: typeof schema.evidenceTags.$inferInsert, tx?: Database) {
    const db = tx ?? this.db;
    const [created] = await db.insert(schema.evidenceTags).values(row).returning();
    return created!;
  }

  async insertModelEvent(row: typeof schema.learnerModelEvents.$inferInsert, tx?: Database) {
    const db = tx ?? this.db;
    const [created] = await db.insert(schema.learnerModelEvents).values(row).returning();
    return created!;
  }

  async findModelEventByIdempotency(principal: StudentPrincipal, key: string) {
    const owner =
      principal.kind === 'institutional'
        ? eq(schema.learnerModelEvents.studentId, principal.studentId)
        : eq(schema.learnerModelEvents.independentUserId, principal.independentUserId);
    return this.db
      .select()
      .from(schema.learnerModelEvents)
      .where(and(owner, eq(schema.learnerModelEvents.idempotencyKey, key)))
      .limit(1)
      .then((r) => r[0] ?? null);
  }

  async getPath(principal: StudentPrincipal) {
    const owner =
      principal.kind === 'institutional'
        ? eq(schema.learningPaths.studentId, principal.studentId)
        : eq(schema.learningPaths.independentUserId, principal.independentUserId);
    return this.db
      .select()
      .from(schema.learningPaths)
      .where(and(owner, eq(schema.learningPaths.status, 'active')))
      .orderBy(desc(schema.learningPaths.createdAt))
      .limit(1)
      .then((r) => r[0] ?? null);
  }

  async getPathItem(itemId: string) {
    return this.db
      .select()
      .from(schema.learningPathItems)
      .where(eq(schema.learningPathItems.id, itemId))
      .limit(1)
      .then((r) => r[0] ?? null);
  }

  async updatePathItem(itemId: string, patch: Partial<typeof schema.learningPathItems.$inferInsert>) {
    const [updated] = await this.db
      .update(schema.learningPathItems)
      .set(patch)
      .where(eq(schema.learningPathItems.id, itemId))
      .returning();
    return updated ?? null;
  }

  async upsertRevisionFresh(principal: StudentPrincipal, topicId: string) {
    const now = new Date();
    const base =
      principal.kind === 'institutional'
        ? { studentId: principal.studentId, independentUserId: null }
        : { studentId: null, independentUserId: principal.independentUserId };

    await this.db
      .insert(schema.revisionStates)
      .values({
        ...base,
        topicId,
        freshness: 'fresh',
        lastEvidenceAt: now,
        lastRefreshedAt: now,
        computedAt: now,
      })
      .onConflictDoUpdate({
        target:
          principal.kind === 'institutional'
            ? [schema.revisionStates.studentId, schema.revisionStates.topicId]
            : [schema.revisionStates.independentUserId, schema.revisionStates.topicId],
        set: {
          freshness: 'fresh',
          lastEvidenceAt: now,
          lastRefreshedAt: now,
          computedAt: now,
        },
      });
  }

  async runInTransaction<T>(fn: (tx: Database) => Promise<T>): Promise<T> {
    return this.db.transaction(fn);
  }

  async getTopicShapeById(principal: StudentPrincipal, shapeId: string) {
    const ownerCond =
      principal.kind === 'institutional'
        ? and(
            eq(schema.learnTopicShapes.institutionId, principal.institutionId),
            isNull(schema.learnTopicShapes.independentUserId),
          )
        : and(
            isNull(schema.learnTopicShapes.institutionId),
            eq(schema.learnTopicShapes.independentUserId, principal.independentUserId),
          );
    return this.db
      .select()
      .from(schema.learnTopicShapes)
      .where(and(ownerCond, eq(schema.learnTopicShapes.id, shapeId)))
      .limit(1)
      .then((r) => r[0] ?? null);
  }

  /** @deprecated Use getTopicShapeById. */
  async getTopicProfileById(principal: StudentPrincipal, profileId: string) {
    return this.getTopicShapeById(principal, profileId);
  }

  async getTopicShapeByIdForInstitution(institutionId: string, shapeId: string) {
    return this.db
      .select()
      .from(schema.learnTopicShapes)
      .where(
        and(
          eq(schema.learnTopicShapes.id, shapeId),
          eq(schema.learnTopicShapes.institutionId, institutionId),
        ),
      )
      .limit(1)
      .then((r) => r[0] ?? null);
  }

  /** @deprecated Use getTopicShapeByIdForInstitution. */
  async getTopicProfileByIdForInstitution(institutionId: string, profileId: string) {
    return this.getTopicShapeByIdForInstitution(institutionId, profileId);
  }

  async updateTopicShape(
    shapeId: string,
    patch: Partial<typeof schema.learnTopicShapes.$inferInsert>,
  ) {
    const [updated] = await this.db
      .update(schema.learnTopicShapes)
      .set({ ...patch, updatedAt: new Date(), version: sql`${schema.learnTopicShapes.version} + 1` })
      .where(eq(schema.learnTopicShapes.id, shapeId))
      .returning();
    return updated ?? null;
  }

  /** @deprecated Use updateTopicShape. */
  async updateTopicProfile(
    profileId: string,
    patch: Partial<typeof schema.learnTopicShapes.$inferInsert>,
  ) {
    return this.updateTopicShape(profileId, patch);
  }

  async getLearnerModelState(principal: StudentPrincipal) {
    const owner =
      principal.kind === 'institutional'
        ? eq(schema.learnerModelState.studentId, principal.studentId)
        : eq(schema.learnerModelState.independentUserId, principal.independentUserId);
    return this.db
      .select()
      .from(schema.learnerModelState)
      .where(owner)
      .limit(1)
      .then((r) => r[0] ?? null);
  }

  async ensureLearnerModelState(principal: StudentPrincipal) {
    const existing = await this.getLearnerModelState(principal);
    if (existing) return existing;
    const base =
      principal.kind === 'institutional'
        ? {
            institutionId: principal.institutionId,
            studentId: principal.studentId,
            independentUserId: null,
          }
        : { institutionId: null, studentId: null, independentUserId: principal.independentUserId };
    const [created] = await this.db.insert(schema.learnerModelState).values(base).returning();
    return created!;
  }

  async updateLearnerModelState(
    id: string,
    patch: Partial<typeof schema.learnerModelState.$inferInsert>,
  ) {
    const [updated] = await this.db
      .update(schema.learnerModelState)
      .set({ ...patch, updatedAt: new Date(), version: sql`${schema.learnerModelState.version} + 1` })
      .where(eq(schema.learnerModelState.id, id))
      .returning();
    return updated ?? null;
  }

  async listAttemptsForMasterySeed(scope: {
    studentId?: string | null;
    independentUserId?: string | null;
  }) {
    const conditions: SQL[] = [];
    if (scope.studentId) conditions.push(eq(schema.learnAttempts.studentId, scope.studentId));
    if (scope.independentUserId) {
      conditions.push(eq(schema.learnAttempts.independentUserId, scope.independentUserId));
    }
    const attempts = await this.db
      .select({
        id: schema.learnAttempts.id,
        studentId: schema.learnAttempts.studentId,
        independentUserId: schema.learnAttempts.independentUserId,
        evaluation: schema.learnAttempts.evaluation,
        hintsUsed: schema.learnAttempts.hintsUsed,
        createdAt: schema.learnAttempts.createdAt,
        blockId: schema.learnAttempts.blockId,
        questionId: schema.learnAttempts.questionId,
        sessionId: schema.learnAttempts.sessionId,
      })
      .from(schema.learnAttempts)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(schema.learnAttempts.createdAt);

    // Resolve atom_id from the block content's question when possible; also pull polarity.
    const out: Array<{
      id: string;
      studentId: string | null;
      independentUserId: string | null;
      institutionId: string | null;
      atomId: string | null;
      evaluation: Record<string, unknown>;
      hintsUsed: number;
      createdAt: Date;
      evidencePolarity: string | null;
    }> = [];

    for (const a of attempts) {
      let atomId: string | null = null;
      if (a.blockId && a.questionId) {
        const block = await this.db
          .select()
          .from(schema.learnSessionBlocks)
          .where(eq(schema.learnSessionBlocks.id, a.blockId))
          .limit(1)
          .then((r) => r[0] ?? null);
        const content = block?.content as { questions?: Array<{ id: string; atom_id?: string }> } | null;
        const q = content?.questions?.find((x) => x.id === a.questionId);
        atomId = q?.atom_id ?? null;
      }

      const tagKey =
        a.sessionId && a.blockId && a.questionId
          ? `learn:${a.sessionId}:${a.blockId}:${a.questionId}`
          : null;
      let evidencePolarity: string | null = null;
      if (tagKey) {
        const tag = await this.db
          .select({ polarity: schema.evidenceTags.polarity })
          .from(schema.evidenceTags)
          .where(eq(schema.evidenceTags.tagKey, tagKey))
          .limit(1)
          .then((r) => r[0] ?? null);
        evidencePolarity = tag?.polarity ?? null;
      }

      // Institution id is on the session when present (attempts themselves are owner-xor only).
      let institutionId: string | null = null;
      if (a.sessionId) {
        const sess = await this.db
          .select({ institutionId: schema.learnSessions.institutionId })
          .from(schema.learnSessions)
          .where(eq(schema.learnSessions.id, a.sessionId))
          .limit(1)
          .then((r) => r[0] ?? null);
        institutionId = sess?.institutionId ?? null;
      }

      out.push({
        id: a.id,
        studentId: a.studentId,
        independentUserId: a.independentUserId,
        institutionId,
        atomId,
        evaluation: (a.evaluation as Record<string, unknown>) ?? {},
        hintsUsed: a.hintsUsed ?? 0,
        createdAt: a.createdAt,
        evidencePolarity,
      });
    }
    return out;
  }

  async replaceMasteryForSeed(input: {
    studentId: string | null;
    independentUserId: string | null;
    institutionId: string | null;
    atomId: string;
    rating: number;
    attempts: number;
    correctWeight: number;
    lastAttemptAt: Date | null;
  }) {
    // Idempotent recompute-from-scratch: wipe then insert for this (owner, atom).
    if (input.studentId) {
      await this.db
        .delete(schema.learnerMastery)
        .where(
          and(
            eq(schema.learnerMastery.studentId, input.studentId),
            eq(schema.learnerMastery.atomId, input.atomId),
          ),
        );
    } else if (input.independentUserId) {
      await this.db
        .delete(schema.learnerMastery)
        .where(
          and(
            eq(schema.learnerMastery.independentUserId, input.independentUserId),
            eq(schema.learnerMastery.atomId, input.atomId),
          ),
        );
    }
    const [row] = await this.db
      .insert(schema.learnerMastery)
      .values({
        institutionId: input.institutionId,
        studentId: input.studentId,
        independentUserId: input.independentUserId,
        atomId: input.atomId,
        rating: input.rating,
        attempts: input.attempts,
        correctWeight: String(input.correctWeight),
        lastAttemptAt: input.lastAttemptAt,
      })
      .returning();
    return row!;
  }

  async listAtomIdsForTopic(topicId: string): Promise<string[]> {
    const rows = await this.listConceptAtoms(topicId);
    return rows.map((r) => r.id);
  }

  /** Validate LLM-emitted atom ids; drop unknowns. */
  async filterValidAtomIds(topicId: string | null | undefined, atomIds: string[]): Promise<Set<string>> {
    if (!topicId || atomIds.length === 0) return new Set();
    const valid = await this.listAtomIdsForTopic(topicId);
    const set = new Set(valid);
    return new Set(atomIds.filter((id) => set.has(id)));
  }
}
