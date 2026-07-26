import { Injectable, Inject } from '@nestjs/common';
import { and, desc, eq, inArray, isNull, sql, type SQL } from 'drizzle-orm';
import {
  CURRENT_CANVAS_GRAPH_VERSION,
  migrateCanvasGraphToCurrent,
  type CanvasGraph,
  type VisualRevisionReason,
} from '@edrion/schemas';
import { schema, type Database, type VisualCanvas } from '@edrion/database';
import { DATABASE } from '../../../common/tokens';
import { ownerColumns, ownerWhere } from '../core/owner-scope';
import type { StudentPrincipal } from '../student.types';
import { revConflict, visualNotFound } from './visual.errors';
import { VisualMemoryDiffService } from './visual-memory-diff.service';
import { LearningEventsWriter } from '../ledger/learning-events.writer';
import { ANCHOR_REVISION_REASONS, MAX_CANVAS_REVISIONS } from './visual-studio.constants';

export type TxClient = Database;

export interface RevisionCommitInput {
  canvasId: string;
  baseRevision: number;
  graph: CanvasGraph;
  title: string;
  archetype: string;
  reason: VisualRevisionReason;
  actor?: string;
  schemaVersion?: number;
  status?: 'ready' | 'generating' | 'failed';
  observeMemory?: boolean;
}

export interface InitialCanvasCommitInput {
  id: string;
  title: string;
  archetype: string;
  graph: CanvasGraph;
  origin: 'prompt' | 'library_source' | 'learn_topic' | 'learn_session' | 'memory' | 'legacy' | 'debate_clash';
  sourceId: string | null;
  topicId: string | null;
  sourceSessionId: string | null;
  sourceMeta?: Record<string, unknown> | null;
  debateId?: string | null;
  reason: 'created' | 'generation';
  status?: 'ready' | 'generating' | 'failed';
}

@Injectable()
export class VisualRevisionService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly memoryDiff: VisualMemoryDiffService,
    private readonly ledger: LearningEventsWriter,
  ) {}

  owner(principal: StudentPrincipal) {
    return ownerColumns(principal);
  }

  private notDeletedCondition(): SQL {
    return isNull(schema.visualCanvases.deletedAt);
  }

  private presentCanvasGraph(graph: unknown): CanvasGraph {
    return migrateCanvasGraphToCurrent(graph).graph;
  }

  private presentCanvas(row: VisualCanvas): VisualCanvas {
    return { ...row, graph: this.presentCanvasGraph(row.graph) };
  }

  async commit(
    principal: StudentPrincipal,
    input: RevisionCommitInput,
    existingTx?: TxClient,
  ): Promise<{ canvas: VisualCanvas }> {
    const run = async (tx: TxClient) => {
      const [current] = await tx
        .select()
        .from(schema.visualCanvases)
        .where(
          and(
            eq(schema.visualCanvases.id, input.canvasId),
            this.notDeletedCondition(),
            ownerWhere(
              principal,
              schema.visualCanvases.studentId,
              schema.visualCanvases.independentUserId,
            ),
          ),
        )
        .for('update')
        .limit(1);

      if (!current) throw visualNotFound();
      if (input.baseRevision !== current.version) {
        throw revConflict(current.version, this.presentCanvasGraph(current.graph));
      }

      const migration = migrateCanvasGraphToCurrent(input.graph);
      const graph = migration.graph;
      const schemaVersion = input.schemaVersion ?? migration.targetSchemaVersion;
      const nextRevisionNumber = current.version + 1;

      await tx.insert(schema.visualCanvasRevisions).values({
        canvasId: current.id,
        revisionNumber: nextRevisionNumber,
        graph: current.graph,
        schemaVersion: current.schemaVersion,
        title: current.title,
        archetype: current.archetype,
        reason: input.reason,
        createdBy: input.actor ?? 'student',
      });

      await this.pruneRevisions(tx, current.id);

      const [updated] = await tx
        .update(schema.visualCanvases)
        .set({
          title: input.title,
          archetype: input.archetype,
          graph,
          schemaVersion,
          nodeCount: graph.nodes.length,
          version: nextRevisionNumber,
          status: input.status ?? current.status,
          updatedAt: new Date(),
        })
        .where(eq(schema.visualCanvases.id, input.canvasId))
        .returning();

      if (input.observeMemory !== false && current.origin === 'memory') {
        await this.memoryDiff.observeCommittedGraph({
          principal,
          canvasId: current.id,
          topicId: current.topicId,
          previousGraph: this.presentCanvasGraph(current.graph),
          committedGraph: graph,
          reason: input.reason,
          tx,
        });
      }

      return { canvas: this.presentCanvas(updated!) };
    };

    return existingTx ? run(existingTx) : this.db.transaction(run);
  }

  async commitInitial(
    principal: StudentPrincipal,
    input: InitialCanvasCommitInput,
    existingTx?: TxClient,
  ): Promise<{ canvas: VisualCanvas }> {
    const owner = this.owner(principal);
    const run = async (tx: TxClient) => {
      const [existing] = await tx
        .select()
        .from(schema.visualCanvases)
        .where(eq(schema.visualCanvases.id, input.id))
        .limit(1);
      if (existing) return { canvas: this.presentCanvas(existing) };

      const graph = input.graph as CanvasGraph;
      const [created] = await tx
        .insert(schema.visualCanvases)
        .values({
          id: input.id,
          ...owner,
          title: input.title,
          archetype: input.archetype,
          graph,
          schemaVersion: graph.graph_schema_version,
          origin: input.origin,
          sourceId: input.sourceId,
          topicId: input.topicId,
          sourceSessionId: input.sourceSessionId,
          sourceMeta: input.sourceMeta ?? null,
          debateId: input.debateId ?? null,
          legacyArtifactId: null,
          version: 1,
          nodeCount: graph.nodes.length,
          status: input.status ?? 'ready',
        })
        .returning();

      await tx.insert(schema.visualCanvasRevisions).values({
        canvasId: created!.id,
        revisionNumber: 1,
        graph,
        schemaVersion: graph.graph_schema_version,
        title: input.title,
        archetype: input.archetype,
        reason: input.reason,
        createdBy: 'student',
      });

      await this.ledger.logStrictInTransaction(tx, {
        principal,
        eventType: 'visual.canvas_created',
        payload: {
          canvasId: created!.id,
          origin: created!.origin,
          archetype: created!.archetype,
          nodeCount: graph.nodes.length,
          edgeCount: graph.edges.length,
        },
      });

      return { canvas: this.presentCanvas(created!) };
    };

    return existingTx ? run(existingTx) : this.db.transaction(run);
  }

  async commitMigration(canvasId: string): Promise<'migrated' | 'skipped' | 'missing'> {
    return this.db.transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(schema.visualCanvases)
        .where(eq(schema.visualCanvases.id, canvasId))
        .for('update')
        .limit(1);

      if (!current || current.deletedAt) return 'missing';
      if (current.schemaVersion >= CURRENT_CANVAS_GRAPH_VERSION) return 'skipped';

      const migration = migrateCanvasGraphToCurrent(current.graph);
      if (!migration.migrated) {
        if (current.schemaVersion < CURRENT_CANVAS_GRAPH_VERSION) {
          await tx
            .update(schema.visualCanvases)
            .set({ schemaVersion: CURRENT_CANVAS_GRAPH_VERSION, updatedAt: new Date() })
            .where(eq(schema.visualCanvases.id, canvasId));
        }
        return 'skipped';
      }

      const nextRevisionNumber = current.version + 1;
      await tx.insert(schema.visualCanvasRevisions).values({
        canvasId: current.id,
        revisionNumber: nextRevisionNumber,
        graph: migration.graph,
        schemaVersion: migration.targetSchemaVersion,
        title: current.title,
        archetype: current.archetype,
        reason: 'migration',
        createdBy: 'system',
      });

      await this.pruneRevisions(tx, current.id);

      await tx
        .update(schema.visualCanvases)
        .set({
          graph: migration.graph,
          schemaVersion: migration.targetSchemaVersion,
          nodeCount: migration.graph.nodes.length,
          version: nextRevisionNumber,
          updatedAt: new Date(),
        })
        .where(eq(schema.visualCanvases.id, canvasId));

      return 'migrated';
    });
  }

  async softDelete(
    principal: StudentPrincipal,
    canvasId: string,
    expectedVersion: number,
  ): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(schema.visualCanvases)
        .where(
          and(
            eq(schema.visualCanvases.id, canvasId),
            this.notDeletedCondition(),
            eq(schema.visualCanvases.version, expectedVersion),
            ownerWhere(
              principal,
              schema.visualCanvases.studentId,
              schema.visualCanvases.independentUserId,
            ),
          ),
        )
        .for('update')
        .limit(1);

      if (!current) return false;

      await tx
        .update(schema.visualCanvases)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(eq(schema.visualCanvases.id, canvasId));

      await this.ledger.logStrictInTransaction(tx, {
        principal,
        eventType: 'visual.canvas_deleted',
        payload: { canvasId, origin: current.origin },
      });

      return true;
    });
  }

  async restoreRevision(
    principal: StudentPrincipal,
    canvasId: string,
    revisionId: string,
    baseRevision: number,
  ): Promise<{ canvas: VisualCanvas } | null> {
    const [revision] = await this.db
      .select()
      .from(schema.visualCanvasRevisions)
      .where(
        and(
          eq(schema.visualCanvasRevisions.id, revisionId),
          eq(schema.visualCanvasRevisions.canvasId, canvasId),
        ),
      )
      .limit(1);
    if (!revision) return null;

    const graph = this.presentCanvasGraph(revision.graph);
    return this.commit(principal, {
      canvasId,
      baseRevision,
      graph,
      title: revision.title,
      archetype: revision.archetype,
      reason: 'restore',
      schemaVersion: revision.schemaVersion,
    });
  }

  private async pruneRevisions(tx: TxClient, canvasId: string) {
    const rows = await tx
      .select({
        id: schema.visualCanvasRevisions.id,
        revisionNumber: schema.visualCanvasRevisions.revisionNumber,
        reason: schema.visualCanvasRevisions.reason,
      })
      .from(schema.visualCanvasRevisions)
      .where(eq(schema.visualCanvasRevisions.canvasId, canvasId))
      .orderBy(desc(schema.visualCanvasRevisions.revisionNumber));

    if (rows.length <= MAX_CANVAS_REVISIONS) return;

    const protectedIds = new Set(
      rows
        .filter((row) => ANCHOR_REVISION_REASONS.has(row.reason as VisualRevisionReason))
        .map((row) => row.id),
    );

    const deletable = rows
      .slice(MAX_CANVAS_REVISIONS)
      .filter((row) => !protectedIds.has(row.id))
      .map((row) => row.id);

    if (!deletable.length) return;

    await tx
      .delete(schema.visualCanvasRevisions)
      .where(inArray(schema.visualCanvasRevisions.id, deletable));
  }

  /** Purge canvases soft-deleted more than 30 days ago (skips shared/legal refs). */
  async purgeSoftDeleted(): Promise<number> {
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const result = await this.db.execute<{ id: string }>(sql`
      DELETE FROM visual_canvases
      WHERE deleted_at IS NOT NULL
        AND deleted_at < ${cutoff}
      RETURNING id
    `);
    const rows: { id: string }[] = Array.isArray(result)
      ? result
      : ((result as { rows?: { id: string }[] }).rows ?? []);
    return rows.length;
  }
}
