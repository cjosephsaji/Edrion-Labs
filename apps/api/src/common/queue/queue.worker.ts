import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { Worker, type ConnectionOptions, type Job } from 'bullmq';
import IORedis, { type Redis } from 'ioredis';
import type { ApiEnv } from '@edrion/config';
import { API_ENV } from '../tokens';
import { RedisService } from '../redis/redis.service';
import { QUEUE_NAMES, PING_JOB, type QueueName, type PingJobData } from './queue.constants';

/** A job handler. Registered by feature modules (e.g. 10e converts sweeps into handlers). */
export type JobHandler = (job: Job) => Promise<unknown>;

/**
 * Consumer side of the queue framework. Starts one BullMQ Worker per queue (when
 * QUEUE_WORKERS_ENABLED) and routes each job to a registered handler by job name. The built-in
 * `system.ping` handler sets a Redis marker so the round-trip can be observed in a live smoke.
 * Other modules call `register(jobName, handler)` from their own onModuleInit.
 */
@Injectable()
export class QueueWorkers implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(QueueWorkers.name);
  private readonly handlers = new Map<string, JobHandler>();
  private readonly workers: Worker[] = [];
  private connection: Redis | null = null;

  constructor(
    @Inject(API_ENV) private readonly env: ApiEnv,
    private readonly redis: RedisService,
  ) {}

  /** Register a handler for a job name. Last registration wins. */
  register(jobName: string, handler: JobHandler): void {
    this.handlers.set(jobName, handler);
  }

  onModuleInit(): void {
    if (!this.env.REDIS_ENABLED || !this.env.QUEUE_WORKERS_ENABLED) return;

    this.handlers.set(PING_JOB, async (job: Job) => {
      const { marker } = job.data as PingJobData;
      await this.redis.set(marker, 'done', 120);
      return { ok: true };
    });

    this.connection = new IORedis(this.env.REDIS_URL, { maxRetriesPerRequest: null });
    this.connection.on('error', () => undefined);
    const connection = this.connection as unknown as ConnectionOptions;

    for (const name of QUEUE_NAMES) {
      const worker = new Worker(
        name as QueueName,
        async (job: Job) => {
          const handler = this.handlers.get(job.name);
          if (!handler) {
            this.logger.warn(`No handler for job ${job.name} on queue ${name}`);
            throw new Error(`No registered handler for ${job.name}`);
          }
          return handler(job);
        },
        { connection, concurrency: 5 },
      );
      worker.on('failed', (job, err) =>
        this.logger.error(`Job ${job?.name} on ${name} failed: ${err.message}`),
      );
      this.workers.push(worker);
    }
    this.logger.log(`Queue workers started for: ${QUEUE_NAMES.join(', ')}`);
  }

  async onModuleDestroy(): Promise<void> {
    for (const w of this.workers) await w.close().catch(() => undefined);
    if (this.connection) await this.connection.quit().catch(() => undefined);
  }
}
