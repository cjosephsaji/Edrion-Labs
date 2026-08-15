import {
  Inject,
  Injectable,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import type { ApiEnv } from '@edrion/config';
import type { Logger } from '@edrion/observability';
import { JobsService } from '../../common/queue/jobs.service';
import { JobTracker } from '../../common/queue/job-tracker.service';
import { QueueWorkers } from '../../common/queue/queue.worker';
import { API_ENV, LOGGER } from '../../common/tokens';
import { PetrosInstitutionalService } from './petros-institutional.service';

const QUEUE = 'maintenance';
const JOB = 'petros.institutional.delivery';
const DELIVERY_INTERVAL_MS = 60_000;

/**
 * Owns delivery of queued teacher handoffs and parent digests. BullMQ provides the production
 * schedule; development without Redis retains the same bounded, idempotent sweep in-process.
 */
@Injectable()
export class PetrosInstitutionalJobs
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private fallbackTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    @Inject(API_ENV) private readonly env: ApiEnv,
    @Inject(LOGGER) private readonly logger: Logger,
    private readonly jobs: JobsService,
    private readonly workers: QueueWorkers,
    private readonly tracker: JobTracker,
    private readonly institutional: PetrosInstitutionalService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (this.env.NODE_ENV === 'test') return;

    if (this.env.REDIS_ENABLED && this.env.QUEUE_WORKERS_ENABLED) {
      this.workers.register(JOB, () =>
        this.tracker.run(JOB, QUEUE, async () => {
          const detail = await this.institutional.processJobs();
          return {
            itemsProcessed:
              detail.handoffsDelivered + detail.digestsDelivered + detail.digestsFailed,
            detail,
          };
        }),
      );
      await this.jobs.schedule(QUEUE, JOB, DELIVERY_INTERVAL_MS);
      this.logger.info('petros.institutional.delivery.scheduled', {
        interval_ms: DELIVERY_INTERVAL_MS,
        queue: QUEUE,
      });
      return;
    }

    this.fallbackTimer = setInterval(() => {
      void this.institutional.processJobs().catch((error: unknown) => {
        this.logger.error('petros.institutional.delivery.failed', {
          error: error instanceof Error ? error.message : String(error),
        });
      });
    }, DELIVERY_INTERVAL_MS);
    this.fallbackTimer.unref?.();
    this.logger.info('petros.institutional.delivery.in_process', {
      interval_ms: DELIVERY_INTERVAL_MS,
    });
  }

  onApplicationShutdown(): void {
    if (this.fallbackTimer) clearInterval(this.fallbackTimer);
    this.fallbackTimer = null;
  }
}
