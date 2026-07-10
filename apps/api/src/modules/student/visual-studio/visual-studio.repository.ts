import { Inject, Injectable } from '@nestjs/common';
import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNull,
  lt,
  sql,
  type SQL,
} from 'drizzle-orm';
import type { CanvasGraph, CompleteCanvasGraph } from '@edrion/schemas';
import { schema, type Database, type VisualManualReason } from '@edrion/database';
import { DATABASE } from '../../../common/tokens';
import { ownerColumns, ownerWhere } from '../core/owner-scope';
import type { StudentPrincipal } from '../student.types';

const MAX_REVISIONS = 20;

export interface ListCanvasesQuery {
  limit: number;
  cursor?: string;
  sourceId?: string;
  topicId?: string;
}

export interface PatchCanvasInput {
  title: string;
  archetype: string;
  graph: CanvasGraph;
  baseVersion: number;
}

@Injectable()
export class VisualStudioRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  owner(principal: StudentPrincipal) {
    return ownerColumns(principal);
  }

  async getCanvas(principal: StudentPrincipal, id: string) {
    const [row] = await this.db
      .select()
      .from(schema.visualCanvases)
      .where(
        and(
          eq(schema.visualCanvases.id, id),
          ownerWhere(
            principal,
            schema.visualCanvases.studentId,
            schema.visualCanvases.independentUserId,
          ),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async getCanvasByLegacyArtifact(principal: StudentPrincipal, artifactId: string) {
    const [row] = await this.db
      .select()
      .from(schema.visualCanvases)
      .where(
        and(
          eq(schema.visualCanvases.legacyArtifactId, artifactId),
          ownerWhere(
            principal,
            schema.visualCanvases.studentId,
            schema.visualCanvases.independentUserId,
          ),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async listCanvases(principal: StudentPrincipal, query: ListCanvasesQuery) {
    const conditions: SQL[] = [
      ownerWhere(
        principal,
        schema.visualCanvases.studentId,
        schema.visualCanvases.independentUserId,
      ),
    ];
    if (query.cursor) {
      conditions.push(lt(schema.visualCanvases.updatedAt, new Date(query.cursor)));
    }
    if (query.sourceId) {
      conditions.push(eq(schema.visualCanvases.sourceId, query.sourceId));
    }
    if (query.topicId) {
      conditions.push(eq(schema.visualCanvases.topicId, query.topicId));
    }

    const rows = await this.db
      .select()
      .from(schema.visualCanvases)
      .where(and(...conditions))
      .orderBy(desc(schema.visualCanvases.updatedAt))
      .limit(query.limit + 1);

    const hasMore = rows.length > query.limit;
    const items = hasMore ? rows.slice(0, query.limit) : rows;
    const nextCursor =
      hasMore && items.length ? items[items.length - 1]!.updatedAt.toISOString() : null;
    return { items, nextCursor };
  }

  async createMemoryCanvas(
    principal: StudentPrincipal,
    row: typeof schema.visualCanvases.$inferInsert,
  ) {
    const existing = await this.getCanvas(principal, row.id!);
    if (existing) return existing;

    return this.db.transaction(async (tx) => {
      const [created] = await tx.insert(schema.visualCanvases).values(row).returning();
      await tx.insert(schema.visualCanvasRevisions).values({
        canvasId: created!.id,
        revisionNumber: 1,
        graph: created!.graph,
        schemaVersion: created!.schemaVersion,
        title: created!.title,
        archetype: created!.archetype,
        reason: 'created',
      });
      return created!;
    });
  }

  async patchCanvas(
    principal: StudentPrincipal,
    id: string,
    input: PatchCanvasInput,
    reason: 'autosave' | 'restore' | 'ai_patch' = 'autosave',
  ) {
    return this.db.transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(schema.visualCanvases)
        .where(
          and(
            eq(schema.visualCanvases.id, id),
            ownerWhere(
              principal,
              schema.visualCanvases.studentId,
              schema.visualCanvases.independentUserId,
            ),
          ),
        )
        .for('update')
        .limit(1);

      if (!current) return null;

      const conflictResolved =
        input.baseVersion !== current.version ? ('last_write_wins' as const) : null;
      const nextRevisionNumber = current.version + 1;

      await tx.insert(schema.visualCanvasRevisions).values({
        canvasId: current.id,
        revisionNumber: nextRevisionNumber,
        graph: current.graph,
        schemaVersion: current.schemaVersion,
        title: current.title,
        archetype: current.archetype,
        reason,
      });

      await this.pruneRevisions(tx, current.id);

      const [updated] = await tx
        .update(schema.visualCanvases)
        .set({
          title: input.title,
          archetype: input.archetype,
          graph: input.graph,
          version: nextRevisionNumber,
          updatedAt: new Date(),
        })
        .where(eq(schema.visualCanvases.id, id))
        .returning();

      return { canvas: updated!, conflictResolved };
    });
  }

  async deleteCanvas(principal: StudentPrincipal, id: string, expectedVersion: number) {
    const result = await this.db
      .delete(schema.visualCanvases)
      .where(
        and(
          eq(schema.visualCanvases.id, id),
          eq(schema.visualCanvases.version, expectedVersion),
          ownerWhere(
            principal,
            schema.visualCanvases.studentId,
            schema.visualCanvases.independentUserId,
          ),
        ),
      )
      .returning({ id: schema.visualCanvases.id });
    return result.length > 0;
  }

  async listRevisions(principal: StudentPrincipal, canvasId: string, limit: number) {
    const canvas = await this.getCanvas(principal, canvasId);
    if (!canvas) return null;

    const items = await this.db
      .select({
        id: schema.visualCanvasRevisions.id,
        revisionNumber: schema.visualCanvasRevisions.revisionNumber,
        reason: schema.visualCanvasRevisions.reason,
        createdAt: schema.visualCanvasRevisions.createdAt,
        title: schema.visualCanvasRevisions.title,
        archetype: schema.visualCanvasRevisions.archetype,
      })
      .from(schema.visualCanvasRevisions)
      .where(eq(schema.visualCanvasRevisions.canvasId, canvasId))
      .orderBy(desc(schema.visualCanvasRevisions.revisionNumber))
      .limit(limit);

    return items;
  }

  async getRevision(principal: StudentPrincipal, canvasId: string, revisionId: string) {
    const canvas = await this.getCanvas(principal, canvasId);
    if (!canvas) return null;

    const [row] = await this.db
      .select()
      .from(schema.visualCanvasRevisions)
      .where(
        and(
          eq(schema.visualCanvasRevisions.id, revisionId),
          eq(schema.visualCanvasRevisions.canvasId, canvasId),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async restoreRevision(
    principal: StudentPrincipal,
    canvasId: string,
    revisionId: string,
    baseVersion: number,
  ) {
    const revision = await this.getRevision(principal, canvasId, revisionId);
    if (!revision) return null;

    return this.patchCanvas(
      principal,
      canvasId,
      {
        title: revision.title,
        archetype: revision.archetype,
        graph: revision.graph,
        baseVersion,
      },
      'restore',
    );
  }

  async listMemoryTopics(principal: StudentPrincipal) {
    const ownerCond =
      principal.kind === 'institutional'
        ? eq(schema.learningEvents.studentId, principal.studentId)
        : eq(schema.learningEvents.independentUserId, principal.independentUserId);

    const eventTypes = [
      'session.completed',
      'session.checkpoint_answered',
      'session.practice_attempted',
      'revision.completed',
    ];

    const rows = await this.db
      .select({
        topicId: schema.learnTopics.id,
        topicKey: schema.learnTopics.topicKey,
        title: schema.learnTopics.title,
        subjectLabel: schema.learnTopics.subjectLabel,
        lastTouched: sql<Date>`max(${schema.learningEvents.occurredAt})`,
      })
      .from(schema.learningEvents)
      .innerJoin(
        schema.learnTopics,
        eq(schema.learningEvents.topicKey, schema.learnTopics.topicKey),
      )
      .where(and(ownerCond, inArray(schema.learningEvents.eventType, eventTypes)))
      .groupBy(
        schema.learnTopics.id,
        schema.learnTopics.topicKey,
        schema.learnTopics.title,
        schema.learnTopics.subjectLabel,
      )
      .orderBy(desc(sql`max(${schema.learningEvents.occurredAt})`));

    return rows;
  }

  async getTopicByKey(topicKey: string) {
    const [row] = await this.db
      .select()
      .from(schema.learnTopics)
      .where(eq(schema.learnTopics.topicKey, topicKey))
      .limit(1);
    return row ?? null;
  }

  async attachTopicId(principal: StudentPrincipal, canvasId: string, topicId: string) {
    const [updated] = await this.db
      .update(schema.visualCanvases)
      .set({ topicId, updatedAt: new Date() })
      .where(
        and(
          eq(schema.visualCanvases.id, canvasId),
          ownerWhere(
            principal,
            schema.visualCanvases.studentId,
            schema.visualCanvases.independentUserId,
          ),
        ),
      )
      .returning();
    return updated ?? null;
  }

  async getTopic(topicId: string) {
    const [row] = await this.db
      .select()
      .from(schema.learnTopics)
      .where(eq(schema.learnTopics.id, topicId))
      .limit(1);
    return row ?? null;
  }

  async upsertTopic(row: typeof schema.learnTopics.$inferInsert) {
    const [created] = await this.db.insert(schema.learnTopics).values(row).returning();
    return created!;
  }

  async getRevisionState(principal: StudentPrincipal, topicId: string) {
    const [row] = await this.db
      .select()
      .from(schema.revisionStates)
      .where(
        and(
          eq(schema.revisionStates.topicId, topicId),
          ownerWhere(
            principal,
            schema.revisionStates.studentId,
            schema.revisionStates.independentUserId,
          ),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async updateManualReasons(
    principal: StudentPrincipal,
    topicId: string,
    reasons: VisualManualReason[],
  ) {
    const now = new Date();
    const base =
      principal.kind === 'institutional'
        ? { studentId: principal.studentId, independentUserId: null }
        : { studentId: null, independentUserId: principal.independentUserId };

    const manualDueAt = reasons.length > 0 ? now : null;

    await this.db
      .insert(schema.revisionStates)
      .values({
        ...base,
        topicId,
        freshness: 'fresh',
        lastEvidenceAt: now,
        manualDueAt,
        manualReasons: reasons,
        computedAt: now,
      })
      .onConflictDoUpdate({
        target:
          principal.kind === 'institutional'
            ? [schema.revisionStates.studentId, schema.revisionStates.topicId]
            : [schema.revisionStates.independentUserId, schema.revisionStates.topicId],
        set: {
          manualDueAt,
          manualReasons: reasons,
          computedAt: now,
        },
      });

    return { manualReasonCount: reasons.length };
  }

  async getKnowledgeItem(principal: StudentPrincipal, itemId: string) {
    const [row] = await this.db
      .select()
      .from(schema.knowledgeItems)
      .where(
        and(
          eq(schema.knowledgeItems.id, itemId),
          ownerWhere(
            principal,
            schema.knowledgeItems.studentId,
            schema.knowledgeItems.independentUserId,
          ),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async getKnowledgeArtifact(principal: StudentPrincipal, artifactId: string) {
    const [row] = await this.db
      .select()
      .from(schema.knowledgeArtifacts)
      .where(
        and(
          eq(schema.knowledgeArtifacts.id, artifactId),
          ownerWhere(
            principal,
            schema.knowledgeArtifacts.studentId,
            schema.knowledgeArtifacts.independentUserId,
          ),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async listKnowledgePages(itemId: string) {
    return this.db
      .select()
      .from(schema.knowledgeItemPages)
      .where(eq(schema.knowledgeItemPages.itemId, itemId))
      .orderBy(asc(schema.knowledgeItemPages.pageIndex));
  }

  async getSession(principal: StudentPrincipal, sessionId: string) {
    const ownerCond =
      principal.kind === 'institutional'
        ? eq(schema.learnSessions.studentId, principal.studentId)
        : eq(schema.learnSessions.independentUserId, principal.independentUserId);
    const [row] = await this.db
      .select()
      .from(schema.learnSessions)
      .where(and(eq(schema.learnSessions.id, sessionId), ownerCond))
      .limit(1);
    return row ?? null;
  }

  async createGeneratedCanvas(
    principal: StudentPrincipal,
    row: {
      id: string;
      title: string;
      archetype: string;
      graph: CompleteCanvasGraph;
      origin: 'prompt' | 'library_source' | 'learn_topic' | 'learn_session';
      sourceId: string | null;
      topicId: string | null;
      sourceSessionId: string | null;
    },
  ) {
    const owner = this.owner(principal);
    return this.db.transaction(async (tx) => {
      const [created] = await tx
        .insert(schema.visualCanvases)
        .values({
          id: row.id,
          ...owner,
          title: row.title,
          archetype: row.archetype,
          graph: row.graph as CanvasGraph,
          schemaVersion: row.graph.graph_schema_version,
          origin: row.origin,
          sourceId: row.sourceId,
          topicId: row.topicId,
          sourceSessionId: row.sourceSessionId,
          legacyArtifactId: null,
          version: 1,
        })
        .returning();
      await tx.insert(schema.visualCanvasRevisions).values({
        canvasId: created!.id,
        revisionNumber: 1,
        graph: row.graph as CanvasGraph,
        schemaVersion: row.graph.graph_schema_version,
        title: row.title,
        archetype: row.archetype,
        reason: 'created',
      });
      return created!;
    });
  }

  private async pruneRevisions(tx: Database, canvasId: string) {
    const stale = await tx
      .select({ id: schema.visualCanvasRevisions.id })
      .from(schema.visualCanvasRevisions)
      .where(eq(schema.visualCanvasRevisions.canvasId, canvasId))
      .orderBy(desc(schema.visualCanvasRevisions.revisionNumber))
      .offset(MAX_REVISIONS);

    if (!stale.length) return;
    await tx
      .delete(schema.visualCanvasRevisions)
      .where(
        inArray(
          schema.visualCanvasRevisions.id,
          stale.map((r) => r.id),
        ),
      );
  }

  /** Maintenance sweep: keep newest 20 revisions per canvas and remove orphaned rows. */
  async pruneStaleRevisions(): Promise<number> {
    const overflow = await this.db.execute<{ id: string }>(sql`
      SELECT id
      FROM (
        SELECT id,
               ROW_NUMBER() OVER (
                 PARTITION BY canvas_id
                 ORDER BY revision_number DESC
               ) AS rn
        FROM visual_canvas_revisions
      ) ranked
      WHERE rn > ${MAX_REVISIONS}
    `);
    const overflowRows: { id: string }[] = Array.isArray(overflow)
      ? overflow
      : ((overflow as { rows?: { id: string }[] }).rows ?? []);
    if (overflowRows.length > 0) {
      await this.db
        .delete(schema.visualCanvasRevisions)
        .where(
          inArray(
            schema.visualCanvasRevisions.id,
            overflowRows.map((row) => row.id),
          ),
        );
    }

    const orphaned = await this.db
      .select({ id: schema.visualCanvasRevisions.id })
      .from(schema.visualCanvasRevisions)
      .leftJoin(schema.visualCanvases, eq(schema.visualCanvasRevisions.canvasId, schema.visualCanvases.id))
      .where(isNull(schema.visualCanvases.id));

    if (orphaned.length > 0) {
      await this.db
        .delete(schema.visualCanvasRevisions)
        .where(
          inArray(
            schema.visualCanvasRevisions.id,
            orphaned.map((row) => row.id),
          ),
        );
    }

    return overflowRows.length + orphaned.length;
  }
}
