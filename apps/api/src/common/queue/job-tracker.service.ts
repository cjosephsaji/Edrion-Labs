import { Inject, Injectable } from '@nestjs/common';
import { desc, eq, schema, sql, type Database } from '@edrion/database';
import type { Logger } from '@edrion/observability';
import { DATABASE, LOGGER } from '../tokens';

export interface JobOutcome {
  itemsProcessed?: number;
  detail?: Record<string, unknown>;
}

/**
 * Records every background-job execution to `background_jobs` (running → succeeded/failed, with
 * duration + items processed), so the former in-process sweeps become observable in System Health.
 * Wraps the job body; failures are recorded and re-thrown for the queue's retry/backoff.
 */
@Injectable()
export class JobTracker {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {}

  async run(name: string, queue: string, fn: () => Promise<JobOutcome | void>): Promise<void> {
    const startedAt = new Date();
    const [row] = await this.db
      .insert(schema.backgroundJobs)
      .values({ name, queue, status: 'running', startedAt })
      .returning({ id: schema.backgroundJobs.id });
    const id = row?.id;
    const log = this.logger.child({ job: name, jobRunId: id });

    try {
      const outcome = (await fn()) ?? {};
      const finishedAt = new Date();
      const durationMs = finishedAt.getTime() - startedAt.getTime();
      if (id) {
        await this.db
          .update(schema.backgroundJobs)
          .set({
            status: 'succeeded',
            finishedAt,
            durationMs,
            itemsProcessed: outcome.itemsProcessed ?? 0,
            detail: outcome.detail ?? null,
          })
          .where(eq(schema.backgroundJobs.id, id));
      }
      log.info('job.succeeded', { durationMs, itemsProcessed: outcome.itemsProcessed ?? 0 });
    } catch (err) {
      const finishedAt = new Date();
      const message = err instanceof Error ? err.message : String(err);
      if (id) {
        await this.db
          .update(schema.backgroundJobs)
          .set({
            status: 'failed',
            finishedAt,
            durationMs: finishedAt.getTime() - startedAt.getTime(),
            error: message.slice(0, 1000),
          })
          .where(eq(schema.backgroundJobs.id, id));
      }
      log.error('job.failed', { error: message });
      throw err;
    }
  }

  /** Recent runs for System Health — newest first. */
  async recent(limit = 20) {
    return this.db
      .select()
      .from(schema.backgroundJobs)
      .orderBy(desc(schema.backgroundJobs.startedAt))
      .limit(limit);
  }

  /** Latest run per distinct job name (for an at-a-glance status board). */
  async latestPerJob() {
    const rows = await this.db.execute<{
      name: string;
      status: string;
      started_at: Date;
      duration_ms: number | null;
      items_processed: number;
    }>(sql`
      SELECT DISTINCT ON (name) name, status, started_at, duration_ms, items_processed
      FROM background_jobs
      ORDER BY name, started_at DESC
    `);
    return rows as unknown as Array<{
      name: string;
      status: string;
      started_at: Date;
      duration_ms: number | null;
      items_processed: number;
    }>;
  }
}
