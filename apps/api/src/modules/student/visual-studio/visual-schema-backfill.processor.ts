import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { and, isNull, lt, schema, sql, type Database } from '@edrion/database';
import { CURRENT_CANVAS_GRAPH_VERSION } from '@edrion/schemas';
import { DATABASE } from '../../../common/tokens';
import { JobsService } from '../../../common/queue/jobs.service';
import { QueueWorkers } from '../../../common/queue/queue.worker';
import { JobTracker } from '../../../common/queue/job-tracker.service';
import { VisualStudioRepository } from './visual-studio.repository';
import { VisualRevisionService } from './visual-revision.service';
import {
  VISUAL_SCHEMA_BACKFILL_BATCH_SIZE,
  VISUAL_SCHEMA_BACKFILL_JOB,
} from './visual-studio.constants';

@Injectable()
export class VisualSchemaBackfillProcessor implements OnModuleInit {
  private readonly logger = new Logger(VisualSchemaBackfillProcessor.name);
  private cursor: string | null = null;

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly jobs: JobsService,
    private readonly workers: QueueWorkers,
    private readonly tracker: JobTracker,
    private readonly repo: VisualStudioRepository,
    private readonly revisions: VisualRevisionService,
  ) {}

  onModuleInit() {
    this.workers.register(VISUAL_SCHEMA_BACKFILL_JOB, (payload: { cursor?: string | null }) =>
      this.tracker.run(VISUAL_SCHEMA_BACKFILL_JOB, 'ai', async () => {
        const processed = await this.runBatch(payload?.cursor ?? this.cursor);
        if (processed.cursor) {
          this.cursor = processed.cursor;
          await this.jobs.enqueue(
            'ai',
            VISUAL_SCHEMA_BACKFILL_JOB,
            { cursor: processed.cursor },
            { jobId: `visual-schema:${processed.cursor}` },
          );
        } else {
          this.cursor = null;
        }
        return { itemsProcessed: processed.migrated };
      }),
    );

    void this.enqueueIfNeeded();
  }

  async enqueueIfNeeded() {
    const remaining = await this.countRemaining();
    if (!remaining) return { queued: false, remaining: 0 };
    await this.jobs.enqueue(
      'ai',
      VISUAL_SCHEMA_BACKFILL_JOB,
      { cursor: this.cursor },
      { jobId: `visual-schema:seed:${Date.now()}` },
    );
    return { queued: true, remaining };
  }

  async countRemaining(): Promise<number> {
    const [row] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.visualCanvases)
      .where(
        and(
          isNull(schema.visualCanvases.deletedAt),
          lt(schema.visualCanvases.schemaVersion, CURRENT_CANVAS_GRAPH_VERSION),
        ),
      );
    return Number(row?.count ?? 0);
  }

  async runBatch(cursor: string | null = null): Promise<{ migrated: number; cursor: string | null }> {
    const claimed = await this.repo.claimCanvasesForSchemaMigration(
      cursor,
      VISUAL_SCHEMA_BACKFILL_BATCH_SIZE,
    );
    if (!claimed.length) {
      return { migrated: 0, cursor: null };
    }

    let migrated = 0;
    for (const canvasId of claimed) {
      const result = await this.revisions.commitMigration(canvasId);
      if (result === 'migrated') migrated += 1;
    }

    const lastId = claimed[claimed.length - 1] ?? null;
    const nextCursor =
      claimed.length === VISUAL_SCHEMA_BACKFILL_BATCH_SIZE && lastId ? lastId : null;

    if (migrated > 0) {
      this.logger.log(`Persisted ${migrated} canvas schema migration revision(s)`);
    }

    return { migrated, cursor: nextCursor };
  }
}
