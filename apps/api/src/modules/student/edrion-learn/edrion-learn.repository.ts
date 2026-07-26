import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, isNull, or, sql, type SQL } from 'drizzle-orm';
import { schema, type Database } from '@edrion/database';
import { DATABASE } from '../../../common/tokens';
import type { StudentPrincipal } from '../student.types';

function ownerWhere(principal: StudentPrincipal): SQL {
  if (principal.kind === 'institutional') {
    return eq(schema.learnerMastery.studentId, principal.studentId);
  }
  return eq(schema.learnerMastery.independentUserId, principal.independentUserId);
}

function profileOwnerWhere(principal: StudentPrincipal): SQL {
  if (principal.kind === 'institutional') {
    return eq(schema.learnTopicProfiles.institutionId, principal.institutionId);
  }
  return eq(schema.learnTopicProfiles.independentUserId, principal.independentUserId);
}

@Injectable()
export class EdrionLearnRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async getMastery(principal: StudentPrincipal, atomId: string) {
    const [row] = await this.db
      .select()
      .from(schema.learnerMastery)
      .where(and(ownerWhere(principal), eq(schema.learnerMastery.atomId, atomId)))
      .limit(1);
    return row ?? null;
  }

  async upsertMastery(
    principal: StudentPrincipal,
    atomId: string,
    patch: {
      rating: number;
      attempts: number;
      correctWeight: string;
      lastAttemptAt: Date;
    },
    tx?: Database,
  ) {
    const db = tx ?? this.db;
    const existing = await this.getMastery(principal, atomId);
    const base =
      principal.kind === 'institutional'
        ? { studentId: principal.studentId, independentUserId: null }
        : { studentId: null, independentUserId: principal.independentUserId };

    if (existing) {
      const [row] = await db
        .update(schema.learnerMastery)
        .set({
          rating: patch.rating,
          attempts: patch.attempts,
          correctWeight: patch.correctWeight,
          lastAttemptAt: patch.lastAttemptAt,
          updatedAt: new Date(),
          version: sql`${schema.learnerMastery.version} + 1`,
        })
        .where(eq(schema.learnerMastery.id, existing.id))
        .returning();
      return row!;
    }

    const [row] = await db
      .insert(schema.learnerMastery)
      .values({
        ...base,
        atomId,
        rating: patch.rating,
        attempts: patch.attempts,
        correctWeight: patch.correctWeight,
        lastAttemptAt: patch.lastAttemptAt,
      })
      .returning();
    return row!;
  }

  async findTopicProfile(
    principal: StudentPrincipal,
    opts: { learnTopicId?: string; topicKey?: string },
  ) {
    const owner = profileOwnerWhere(principal);
    if (opts.learnTopicId) {
      const [row] = await this.db
        .select()
        .from(schema.learnTopicProfiles)
        .where(and(owner, eq(schema.learnTopicProfiles.learnTopicId, opts.learnTopicId)))
        .limit(1);
      if (row) return row;
    }
    if (opts.topicKey) {
      const [row] = await this.db
        .select()
        .from(schema.learnTopicProfiles)
        .where(
          and(
            owner,
            eq(schema.learnTopicProfiles.topicKey, opts.topicKey),
            isNull(schema.learnTopicProfiles.learnTopicId),
          ),
        )
        .limit(1);
      return row ?? null;
    }
    return null;
  }

  async getOrchestratorSession(principal: StudentPrincipal, sessionId: string) {
    const owner =
      principal.kind === 'institutional'
        ? eq(schema.learnSessions.studentId, principal.studentId)
        : eq(schema.learnSessions.independentUserId, principal.independentUserId);

    const [row] = await this.db
      .select()
      .from(schema.learnSessions)
      .where(and(eq(schema.learnSessions.id, sessionId), owner))
      .limit(1);
    return row ?? null;
  }

  async findActiveOrchestratorSession(principal: StudentPrincipal) {
    const owner =
      principal.kind === 'institutional'
        ? eq(schema.learnSessions.studentId, principal.studentId)
        : eq(schema.learnSessions.independentUserId, principal.independentUserId);

    const [row] = await this.db
      .select()
      .from(schema.learnSessions)
      .where(
        and(
          owner,
          sql`${schema.learnSessions.entryPoint} IS NOT NULL`,
          or(
            eq(schema.learnSessions.orchestratorStatus, 'created'),
            eq(schema.learnSessions.orchestratorStatus, 'active'),
            eq(schema.learnSessions.orchestratorStatus, 'awaiting_response'),
            eq(schema.learnSessions.orchestratorStatus, 'paused'),
            eq(schema.learnSessions.orchestratorStatus, 'closing'),
          ),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async appendSessionEvent(
    sessionId: string,
    seq: number,
    eventType: string,
    payload: Record<string, unknown>,
    tx?: Database,
  ) {
    const db = tx ?? this.db;
    const [row] = await db
      .insert(schema.learnSessionEvents)
      .values({ sessionId, seq, eventType, payload })
      .returning();
    return row!;
  }

  async insertSessionBlock(
    row: typeof schema.learnSessionBlocks.$inferInsert,
    tx?: Database,
  ) {
    const db = tx ?? this.db;
    const [created] = await db.insert(schema.learnSessionBlocks).values(row).returning();
    return created!;
  }

  async listSessionBlocks(sessionId: string) {
    return this.db
      .select()
      .from(schema.learnSessionBlocks)
      .where(eq(schema.learnSessionBlocks.sessionId, sessionId))
      .orderBy(asc(schema.learnSessionBlocks.sequence));
  }
}
