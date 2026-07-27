import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, gte, inArray, isNull, sql, type SQL } from 'drizzle-orm';
import { schema, type Database } from '@edrion/database';
import { DATABASE } from '../../../common/tokens';
import type { StudentPrincipal } from '../student.types';
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
export class EdrionLearnRepository {
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

  async getTopic(topicId: string) {
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
  ) {
    const conditions = [eq(schema.learnSessions.id, sessionId)];
    if (expectedVersion != null) {
      conditions.push(eq(schema.learnSessions.version, expectedVersion));
    }
    const [updated] = await this.db
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
  async nextEventSeq(sessionId: string) {
    const [row] = await this.db
      .update(schema.learnSessions)
      .set({ lastEventSeq: sql`${schema.learnSessions.lastEventSeq} + 1` })
      .where(eq(schema.learnSessions.id, sessionId))
      .returning({ seq: schema.learnSessions.lastEventSeq });
    return Number(row?.seq ?? 1);
  }

  async appendSessionEvent(sessionId: string, eventType: string, payload: Record<string, unknown>) {
    const seq = await this.nextEventSeq(sessionId);
    const [row] = await this.db
      .insert(schema.learnSessionEvents)
      .values({ sessionId, seq, eventType, payload })
      .returning();
    return row!;
  }

  async listSessionEventsSince(sessionId: string, afterSeq: number) {
    return this.db
      .select()
      .from(schema.learnSessionEvents)
      .where(and(eq(schema.learnSessionEvents.sessionId, sessionId), sql`${schema.learnSessionEvents.seq} > ${afterSeq}`))
      .orderBy(schema.learnSessionEvents.seq);
  }

  async findTopicProfile(
    principal: StudentPrincipal,
    opts: { learnTopicId?: string | null; topicKey: string },
  ) {
    const ownerCond =
      principal.kind === 'institutional'
        ? and(
            eq(schema.learnTopicProfiles.institutionId, principal.institutionId),
            isNull(schema.learnTopicProfiles.independentUserId),
          )
        : and(
            isNull(schema.learnTopicProfiles.institutionId),
            eq(schema.learnTopicProfiles.independentUserId, principal.independentUserId),
          );

    if (opts.learnTopicId) {
      const byTopic = await this.db
        .select()
        .from(schema.learnTopicProfiles)
        .where(and(ownerCond, eq(schema.learnTopicProfiles.learnTopicId, opts.learnTopicId)))
        .limit(1)
        .then((r) => r[0] ?? null);
      if (byTopic) return byTopic;
    }

    return this.db
      .select()
      .from(schema.learnTopicProfiles)
      .where(and(ownerCond, eq(schema.learnTopicProfiles.topicKey, opts.topicKey)))
      .limit(1)
      .then((r) => r[0] ?? null);
  }

  async insertTopicProfile(row: typeof schema.learnTopicProfiles.$inferInsert) {
    // Uniqueness is enforced by PARTIAL unique indexes, so the arbiter must repeat
    // the index predicate via `targetWhere` (a bare column list raises 42P10).
    const conflict =
      row.institutionId != null
        ? {
            target: [schema.learnTopicProfiles.institutionId, schema.learnTopicProfiles.topicKey],
            targetWhere: sql`${schema.learnTopicProfiles.institutionId} IS NOT NULL`,
          }
        : row.independentUserId != null
          ? {
              target: [
                schema.learnTopicProfiles.independentUserId,
                schema.learnTopicProfiles.topicKey,
              ],
              targetWhere: sql`${schema.learnTopicProfiles.independentUserId} IS NOT NULL`,
            }
          : null;

    if (!conflict) {
      const [inserted] = await this.db.insert(schema.learnTopicProfiles).values(row).returning();
      return inserted!;
    }

    const [created] = await this.db
      .insert(schema.learnTopicProfiles)
      .values(row)
      .onConflictDoUpdate({
        ...conflict,
        set: {
          learnTopicId: row.learnTopicId ?? null,
          title: row.title,
          profile: row.profile,
          source: row.source,
          model: row.model ?? null,
          promptVersion: row.promptVersion ?? null,
          expiresAt: row.expiresAt ?? null,
          updatedAt: new Date(),
          version: sql`${schema.learnTopicProfiles.version} + 1`,
        },
      })
      .returning();
    return created!;
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
  ) {
    const base =
      principal.kind === 'institutional'
        ? {
            institutionId: principal.institutionId,
            studentId: principal.studentId,
            independentUserId: null,
          }
        : { institutionId: null, studentId: null, independentUserId: principal.independentUserId };

    const [row] = await this.db
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

  async insertAttempt(row: typeof schema.learnAttempts.$inferInsert) {
    const [created] = await this.db.insert(schema.learnAttempts).values(row).returning();
    return created!;
  }

  async insertEvidenceTag(row: typeof schema.evidenceTags.$inferInsert) {
    const [created] = await this.db.insert(schema.evidenceTags).values(row).returning();
    return created!;
  }

  async insertModelEvent(row: typeof schema.learnerModelEvents.$inferInsert) {
    const [created] = await this.db.insert(schema.learnerModelEvents).values(row).returning();
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
}
