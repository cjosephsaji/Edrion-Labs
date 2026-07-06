import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, inArray, sql, type SQL } from 'drizzle-orm';
import { schema, type Database } from '@edrion/database';
import { DATABASE } from '../../../common/tokens';

import type { StudentPrincipal } from '../student.types';

function ownerFilter(principal: StudentPrincipal): SQL {
  if (principal.kind === 'institutional') {
    return eq(schema.learnSessions.studentId, principal.studentId);
  }
  return eq(schema.learnSessions.independentUserId, principal.independentUserId);
}

function ownerFilterQuick(principal: StudentPrincipal): SQL {
  if (principal.kind === 'institutional') {
    return eq(schema.quickAnswers.studentId, principal.studentId);
  }
  return eq(schema.quickAnswers.independentUserId, principal.independentUserId);
}

function ownerFilterPath(principal: StudentPrincipal): SQL {
  if (principal.kind === 'institutional') {
    return eq(schema.learningPaths.studentId, principal.studentId);
  }
  return eq(schema.learningPaths.independentUserId, principal.independentUserId);
}

function ownerFilterRevision(principal: StudentPrincipal): SQL {
  if (principal.kind === 'institutional') {
    return eq(schema.revisionStates.studentId, principal.studentId);
  }
  return eq(schema.revisionStates.independentUserId, principal.independentUserId);
}

function ownerFilterTags(principal: StudentPrincipal): SQL {
  if (principal.kind === 'institutional') {
    return eq(schema.evidenceTags.studentId, principal.studentId);
  }
  return eq(schema.evidenceTags.independentUserId, principal.independentUserId);
}

@Injectable()
export class LearnRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async findTopicByKey(topicKey: string, curriculumKey = 'generic') {
    return this.db
      .select()
      .from(schema.learnTopics)
      .where(and(eq(schema.learnTopics.topicKey, topicKey), eq(schema.learnTopics.curriculumKey, curriculumKey)))
      .limit(1)
      .then((r) => r[0] ?? null);
  }

  async createTopic(row: typeof schema.learnTopics.$inferInsert) {
    const [created] = await this.db.insert(schema.learnTopics).values(row).returning();
    return created;
  }

  async upsertTopicByKey(
    topicKey: string,
    title: string,
    subjectLabel: string,
    curriculumKey: string,
    institutionId?: string | null,
  ) {
    const existing = await this.findTopicByKey(topicKey, curriculumKey);
    if (existing) return existing;
    return this.createTopic({
      topicKey,
      title,
      subjectLabel,
      curriculumKey,
      institutionId: institutionId ?? null,
      source: institutionId ? 'institution' : 'ai',
    });
  }

  async findActiveSessionForTopic(principal: StudentPrincipal, topicId: string) {
    return this.db
      .select()
      .from(schema.learnSessions)
      .where(
        and(
          ownerFilter(principal),
          eq(schema.learnSessions.topicId, topicId),
          inArray(schema.learnSessions.status, ['active', 'paused']),
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
      .where(and(eq(schema.learnSessions.id, sessionId), ownerFilter(principal)))
      .limit(1)
      .then((r) => r[0] ?? null);
  }

  async listSessions(principal: StudentPrincipal, status?: string[], limit = 10) {
    const conditions = [ownerFilter(principal)];
    if (status?.length) {
      conditions.push(inArray(schema.learnSessions.status, status));
    }
    return this.db
      .select()
      .from(schema.learnSessions)
      .where(and(...conditions))
      .orderBy(desc(schema.learnSessions.startedAt))
      .limit(limit);
  }

  async createSession(row: typeof schema.learnSessions.$inferInsert) {
    const [created] = await this.db.insert(schema.learnSessions).values(row).returning();
    return created;
  }

  async updateSession(sessionId: string, patch: Partial<typeof schema.learnSessions.$inferInsert>) {
    const [updated] = await this.db
      .update(schema.learnSessions)
      .set(patch)
      .where(eq(schema.learnSessions.id, sessionId))
      .returning();
    return updated;
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
    return created;
  }

  async updateBlock(blockId: string, patch: Partial<typeof schema.learnSessionBlocks.$inferInsert>) {
    const [updated] = await this.db
      .update(schema.learnSessionBlocks)
      .set(patch)
      .where(eq(schema.learnSessionBlocks.id, blockId))
      .returning();
    return updated;
  }

  async nextBlockSequence(sessionId: string): Promise<number> {
    const rows = await this.listBlocks(sessionId);
    return rows.length ? Math.max(...rows.map((b) => b.sequence)) + 1 : 1;
  }

  async insertAttempt(row: typeof schema.learnAttempts.$inferInsert) {
    const [created] = await this.db.insert(schema.learnAttempts).values(row).returning();
    return created;
  }

  async countAttemptsForBlock(blockId: string): Promise<number> {
    const rows = await this.db
      .select({ c: sql<number>`count(*)::int` })
      .from(schema.learnAttempts)
      .where(eq(schema.learnAttempts.blockId, blockId));
    return rows[0]?.c ?? 0;
  }

  async getTopic(topicId: string) {
    return this.db
      .select()
      .from(schema.learnTopics)
      .where(eq(schema.learnTopics.id, topicId))
      .limit(1)
      .then((r) => r[0] ?? null);
  }

  async createQuickAnswer(row: typeof schema.quickAnswers.$inferInsert) {
    const [created] = await this.db.insert(schema.quickAnswers).values(row).returning();
    return created;
  }

  async getQuickAnswer(principal: StudentPrincipal, id: string) {
    return this.db
      .select()
      .from(schema.quickAnswers)
      .where(and(eq(schema.quickAnswers.id, id), ownerFilterQuick(principal)))
      .limit(1)
      .then((r) => r[0] ?? null);
  }

  async listQuickAnswers(principal: StudentPrincipal, limit = 20) {
    return this.db
      .select()
      .from(schema.quickAnswers)
      .where(ownerFilterQuick(principal))
      .orderBy(desc(schema.quickAnswers.createdAt))
      .limit(limit);
  }

  async updateQuickAnswer(id: string, patch: Partial<typeof schema.quickAnswers.$inferInsert>) {
    const [updated] = await this.db
      .update(schema.quickAnswers)
      .set(patch)
      .where(eq(schema.quickAnswers.id, id))
      .returning();
    return updated;
  }

  async getPath(principal: StudentPrincipal) {
    return this.db
      .select()
      .from(schema.learningPaths)
      .where(and(ownerFilterPath(principal), eq(schema.learningPaths.status, 'active')))
      .orderBy(desc(schema.learningPaths.createdAt))
      .limit(1)
      .then((r) => r[0] ?? null);
  }

  async createPath(row: typeof schema.learningPaths.$inferInsert) {
    const [created] = await this.db.insert(schema.learningPaths).values(row).returning();
    return created;
  }

  async updatePath(pathId: string, patch: Partial<typeof schema.learningPaths.$inferInsert>) {
    const [updated] = await this.db
      .update(schema.learningPaths)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(schema.learningPaths.id, pathId))
      .returning();
    return updated;
  }

  async listPathItems(pathId: string) {
    return this.db
      .select({
        item: schema.learningPathItems,
        topic: schema.learnTopics,
      })
      .from(schema.learningPathItems)
      .innerJoin(schema.learnTopics, eq(schema.learningPathItems.topicId, schema.learnTopics.id))
      .where(eq(schema.learningPathItems.pathId, pathId))
      .orderBy(schema.learningPathItems.sequence);
  }

  async insertPathItem(row: typeof schema.learningPathItems.$inferInsert) {
    const [created] = await this.db.insert(schema.learningPathItems).values(row).returning();
    return created;
  }

  async updatePathItem(itemId: string, patch: Partial<typeof schema.learningPathItems.$inferInsert>) {
    const [updated] = await this.db
      .update(schema.learningPathItems)
      .set(patch)
      .where(eq(schema.learningPathItems.id, itemId))
      .returning();
    return updated;
  }

  async listRevisionStates(principal: StudentPrincipal) {
    return this.db
      .select({
        state: schema.revisionStates,
        topic: schema.learnTopics,
      })
      .from(schema.revisionStates)
      .innerJoin(schema.learnTopics, eq(schema.revisionStates.topicId, schema.learnTopics.id))
      .where(ownerFilterRevision(principal))
      .orderBy(schema.revisionStates.lastEvidenceAt);
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

  async listEvidenceTags(principal: StudentPrincipal, polarity?: 'strength' | 'growth') {
    const conditions = [ownerFilterTags(principal), eq(schema.evidenceTags.status, 'active')];
    if (polarity) conditions.push(eq(schema.evidenceTags.polarity, polarity));
    return this.db
      .select()
      .from(schema.evidenceTags)
      .where(and(...conditions))
      .orderBy(desc(schema.evidenceTags.computedAt));
  }

  async listStudentSubjects(principal: StudentPrincipal) {
    if (principal.kind !== 'institutional') return [];
    const student = await this.db
      .select({ classId: schema.students.classId })
      .from(schema.students)
      .where(eq(schema.students.id, principal.studentId))
      .limit(1)
      .then((r) => r[0]);
    if (!student?.classId) return [];
    return this.db
      .select({ name: schema.subjects.name })
      .from(schema.classSubjectTeachers)
      .innerJoin(schema.subjects, eq(schema.classSubjectTeachers.subjectId, schema.subjects.id))
      .where(eq(schema.classSubjectTeachers.classId, student.classId));
  }

  async loadPreferencesWeeklyGoal(principal: StudentPrincipal): Promise<number> {
    const row =
      principal.kind === 'institutional'
        ? await this.db
            .select({ weeklyGoal: schema.studentPreferences.weeklyGoal })
            .from(schema.studentPreferences)
            .where(eq(schema.studentPreferences.studentId, principal.studentId))
            .limit(1)
            .then((r) => r[0])
        : await this.db
            .select({ weeklyGoal: schema.studentPreferences.weeklyGoal })
            .from(schema.studentPreferences)
            .where(eq(schema.studentPreferences.independentUserId, principal.independentUserId))
            .limit(1)
            .then((r) => r[0]);
    return row?.weeklyGoal ?? (principal.kind === 'independent' ? 5 : 8);
  }

  async listLearningEvents(
    principal: StudentPrincipal,
    eventTypes?: string[],
    since?: Date,
  ) {
    const conditions: SQL[] = [];
    if (principal.kind === 'institutional') {
      conditions.push(eq(schema.learningEvents.studentId, principal.studentId));
    } else {
      conditions.push(eq(schema.learningEvents.independentUserId, principal.independentUserId));
    }
    if (eventTypes?.length) {
      conditions.push(inArray(schema.learningEvents.eventType, eventTypes));
    }
    if (since) {
      conditions.push(sql`${schema.learningEvents.occurredAt} >= ${since}`);
    }
    return this.db
      .select()
      .from(schema.learningEvents)
      .where(and(...conditions))
      .orderBy(desc(schema.learningEvents.occurredAt));
  }

  async listCompletedSessionsForHistory(principal: StudentPrincipal, limit = 50, cursor?: string) {
    const conditions = [ownerFilter(principal), eq(schema.learnSessions.status, 'completed')];
    if (cursor) {
      conditions.push(sql`${schema.learnSessions.completedAt} < ${cursor}`);
    }
    return this.db
      .select({
        session: schema.learnSessions,
        topic: schema.learnTopics,
      })
      .from(schema.learnSessions)
      .innerJoin(schema.learnTopics, eq(schema.learnSessions.topicId, schema.learnTopics.id))
      .where(and(...conditions))
      .orderBy(desc(schema.learnSessions.completedAt))
      .limit(limit);
  }

  async listQuickForHistory(principal: StudentPrincipal, limit = 50) {
    return this.db
      .select()
      .from(schema.quickAnswers)
      .where(ownerFilterQuick(principal))
      .orderBy(desc(schema.quickAnswers.createdAt))
      .limit(limit);
  }
}
