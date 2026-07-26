import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import { Queue, type ConnectionOptions, type JobsOptions } from 'bullmq';
import IORedis, { type Redis } from 'ioredis';
import type { ApiEnv } from '@edrion/config';
import { API_ENV } from '../tokens';
import { QUEUE_NAMES, type QueueName } from './queue.constants';

export interface QueueCounts {
  name: QueueName;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
}

/**
 * Producer side of the background-queue framework. Holds one BullMQ Queue per name and a shared
 * Redis connection. `enqueue` is a no-op (returns null) when queues are disabled so callers don't
 * have to branch — the work simply isn't deferred in that environment. `counts` feeds System
 * Health.
 */
@Injectable()
export class JobsService implements OnModuleDestroy {
  private readonly connection: Redis | null;
  private readonly queues = new Map<QueueName, Queue>();

  constructor(@Inject(API_ENV) env: ApiEnv) {
    if (!env.REDIS_ENABLED) {
      this.connection = null;
      return;
    }
    // BullMQ requires maxRetriesPerRequest: null on its connection (blocking commands).
    this.connection = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });
    this.connection.on('error', () => undefined);
    const connection = this.connection as unknown as ConnectionOptions;
    for (const name of QUEUE_NAMES) {
      this.queues.set(name, new Queue(name, { connection }));
    }
  }

  get enabled(): boolean {
    return this.connection !== null;
  }

  /** Enqueue a job. Returns the job id, or null when queues are disabled. */
  async enqueue(
    queue: QueueName,
    jobName: string,
    data: Record<string, unknown>,
    opts?: JobsOptions,
  ): Promise<string | null> {
    const q = this.queues.get(queue);
    if (!q) return null;
    const job = await q.add(jobName, data, {
      removeOnComplete: { count: 1000 },
      removeOnFail: { count: 1000 },
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 },
      ...opts,
    });
    return job.id ?? null;
  }

  /**
   * Register a repeatable job (BullMQ repeat). Idempotent on `jobId` so re-registering on every
   * boot doesn't stack duplicate schedules. Used by the maintenance sweeps.
   */
  async schedule(
    queue: QueueName,
    jobName: string,
    everyMs: number,
    data: Record<string, unknown> = {},
  ): Promise<void> {
    const q = this.queues.get(queue);
    if (!q) return;
    await q.add(jobName, data, {
      repeat: { every: everyMs },
      jobId: `repeat:${jobName}`,
      removeOnComplete: { count: 50 },
      removeOnFail: { count: 50 },
    });
  }

  /** Per-queue depth + outcome counters for System Health. */
  async counts(): Promise<QueueCounts[]> {
    const out: QueueCounts[] = [];
    for (const [name, q] of this.queues) {
      const c = await q.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed');
      out.push({
        name,
        waiting: c.waiting ?? 0,
        active: c.active ?? 0,
        completed: c.completed ?? 0,
        failed: c.failed ?? 0,
        delayed: c.delayed ?? 0,
      });
    }
    return out;
  }

  async onModuleDestroy(): Promise<void> {
    for (const q of this.queues.values()) await q.close().catch(() => undefined);
    if (this.connection) await this.connection.quit().catch(() => undefined);
  }
}
