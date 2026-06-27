import { Inject, Injectable, type OnApplicationBootstrap } from '@nestjs/common';
import { and, eq, lt, schema, type Database } from '@edrion/database';
import type { ApiEnv } from '@edrion/config';
import type { Logger } from '@edrion/observability';
import { API_ENV, DATABASE, LOGGER } from '../../common/tokens';
import { JobsService } from '../../common/queue/jobs.service';
import { QueueWorkers } from '../../common/queue/queue.worker';
import { JobTracker } from '../../common/queue/job-tracker.service';
import { SupportAccessService } from '../support-access/support-access.service';

const SWEEP_INTERVAL_MS = 60_000;
const QUEUE = 'maintenance';

/**
 * Phase 10e: the former in-process sweeps run as tracked, scheduled BullMQ jobs. On boot this
 * registers a handler per sweep (each wrapped in JobTracker so it records a `background_jobs`
 * row visible in System Health) and schedules a repeatable trigger. When queues are disabled the
 * services keep their own in-process timers (e.g. SupportAccessService), so behaviour is
 * preserved either way.
 */
@Injectable()
export class MaintenanceService implements OnApplicationBootstrap {
  constructor(
    @Inject(API_ENV) private readonly env: ApiEnv,
    @Inject(DATABASE) private readonly db: Database,
    @Inject(LOGGER) private readonly logger: Logger,
    private readonly jobs: JobsService,
    private readonly workers: QueueWorkers,
    private readonly tracker: JobTracker,
    private readonly support: SupportAccessService,
  ) {}

  /** True when the maintenance sweeps run as queue jobs (vs. in-process timers). */
  get queueOwned(): boolean {
    return this.env.REDIS_ENABLED && this.env.QUEUE_WORKERS_ENABLED && process.env.NODE_ENV !== 'test';
  }

  async onApplicationBootstrap(): Promise<void> {
    if (!this.queueOwned) return;

    this.workers.register('support-session.expiry', () =>
      this.tracker.run('support-session.expiry', QUEUE, async () => ({
        itemsProcessed: await this.support.sweepExpired(),
      })),
    );
    this.workers.register('ai-run.expiry', () =>
      this.tracker.run('ai-run.expiry', QUEUE, () => this.expireAiRuns()),
    );
    this.workers.register('billing.dunning-overdue', () =>
      this.tracker.run('billing.dunning-overdue', QUEUE, () => this.flagOverdueInvoices()),
    );

    await this.jobs.schedule(QUEUE, 'support-session.expiry', SWEEP_INTERVAL_MS);
    await this.jobs.schedule(QUEUE, 'ai-run.expiry', SWEEP_INTERVAL_MS);
    await this.jobs.schedule(QUEUE, 'billing.dunning-overdue', SWEEP_INTERVAL_MS);
    this.logger.info('maintenance.scheduled', { interval_ms: SWEEP_INTERVAL_MS });
  }

  /** Expire AI runs left awaiting confirmation past their TTL (mirrors the lazy RUN_EXPIRED check). */
  private async expireAiRuns(now: Date = new Date()) {
    const rows = await this.db
      .update(schema.aiRuns)
      .set({ status: 'expired' })
      .where(and(eq(schema.aiRuns.status, 'awaiting_confirmation'), lt(schema.aiRuns.expiresAt, now)))
      .returning({ id: schema.aiRuns.id });
    return { itemsProcessed: rows.length };
  }

  /** Flag open invoices past their due date into the dunning lifecycle. */
  private async flagOverdueInvoices(now: Date = new Date()) {
    const rows = await this.db
      .update(schema.invoices)
      .set({ dunningState: 'overdue' })
      .where(
        and(
          eq(schema.invoices.status, 'open'),
          lt(schema.invoices.dueAt, now),
          eq(schema.invoices.dunningState, 'none'),
        ),
      )
      .returning({ id: schema.invoices.id });
    return { itemsProcessed: rows.length };
  }
}
