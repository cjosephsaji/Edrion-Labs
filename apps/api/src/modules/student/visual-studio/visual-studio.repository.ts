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
import {
  CURRENT_CANVAS_GRAPH_VERSION,
  migrateCanvasGraphToCurrent,
  type CanvasGraph,
} from '@edrion/schemas';
import { schema, type Database, type VisualCanvas, type VisualManualReason } from '@edrion/database';
import { DATABASE } from '../../../common/tokens';
import { ownerColumns, ownerWhere } from '../core/owner-scope';
import type { StudentPrincipal } from '../student.types';
import { MAX_CANVAS_REVISIONS } from './visual-studio.constants';

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

/** Read-only persistence for visual canvases. All graph mutations go through VisualRevisionService. */
@Injectable()
export class VisualStudioRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  owner(principal: StudentPrincipal) {
    return ownerColumns(principal);
  }

  private presentCanvasGraph(graph: unknown): CanvasGraph {
    return migrateCanvasGraphToCurrent(graph).graph;
  }

  private presentCanvas(row: VisualCanvas): VisualCanvas {
    return {
      ...row,
      graph: this.presentCanvasGraph(row.graph),
    };
  }

  private presentRevision<T extends { graph: unknown }>(row: T): T & { graph: CanvasGraph } {
    return {
      ...row,
      graph: this.presentCanvasGraph(row.graph),
    };
  }

  private notDeletedCondition(): SQL {
    return isNull(schema.visualCanvases.deletedAt);
  }

  async getCanvas(principal: StudentPrincipal, id: string) {
    const row = await this.getCanvasRow(principal, id);
    return row ? this.presentCanvas(row) : null;
  }

  private async getCanvasRow(principal: StudentPrincipal, id: string) {
    const [row] = await this.db
      .select()
      .from(schema.visualCanvases)
      .where(
        and(
          eq(schema.visualCanvases.id, id),
          this.notDeletedCondition(),
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
          this.notDeletedCondition(),
          ownerWhere(
            principal,
            schema.visualCanvases.studentId,
            schema.visualCanvases.independentUserId,
          ),
        ),
      )
      .limit(1);
    return row ? this.presentCanvas(row) : null;
  }

  async listCanvases(principal: StudentPrincipal, query: ListCanvasesQuery) {
    const conditions: SQL[] = [
      this.notDeletedCondition(),
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
    const items = (hasMore ? rows.slice(0, query.limit) : rows).map((row) =>
      this.presentCanvas(row),
    );
    const nextCursor =
      hasMore && items.length ? items[items.length - 1]!.updatedAt.toISOString() : null;
    return { items, nextCursor };
  }

  async listRevisions(principal: StudentPrincipal, canvasId: string, limit: number) {
    const canvas = await this.getCanvasRow(principal, canvasId);
    if (!canvas) return null;

    const items = await this.db
      .select({
        id: schema.visualCanvasRevisions.id,
        revisionNumber: schema.visualCanvasRevisions.revisionNumber,
        reason: schema.visualCanvasRevisions.reason,
        createdAt: schema.visualCanvasRevisions.createdAt,
        title: schema.visualCanvasRevisions.title,
        archetype: schema.visualCanvasRevisions.archetype,
        schemaVersion: schema.visualCanvasRevisions.schemaVersion,
      })
      .from(schema.visualCanvasRevisions)
      .where(eq(schema.visualCanvasRevisions.canvasId, canvasId))
      .orderBy(desc(schema.visualCanvasRevisions.revisionNumber))
      .limit(limit);

    return items;
  }

  async getRevision(principal: StudentPrincipal, canvasId: string, revisionId: string) {
    const canvas = await this.getCanvasRow(principal, canvasId);
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
    return row ? this.presentRevision(row) : null;
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

  async claimCanvasesForSchemaMigration(cursor: string | null, batchSize: number): Promise<string[]> {
    const result = await this.db.execute<{ id: string }>(sql`
      SELECT id
      FROM visual_canvases
      WHERE deleted_at IS NULL
        AND schema_version < ${CURRENT_CANVAS_GRAPH_VERSION}
        AND (${cursor ?? null}::uuid IS NULL OR id > ${cursor ?? null}::uuid)
      ORDER BY id
      LIMIT ${batchSize}
      FOR UPDATE SKIP LOCKED
    `);
    const rows: { id: string }[] = Array.isArray(result)
      ? result
      : ((result as { rows?: { id: string }[] }).rows ?? []);
    return rows.map((row) => row.id);
  }

  /** Maintenance sweep: keep newest revisions per canvas and remove orphaned rows. */
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
      WHERE rn > ${MAX_CANVAS_REVISIONS}
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
