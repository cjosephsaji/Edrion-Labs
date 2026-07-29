import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import type { Job } from 'bullmq';
import { JobsService } from '../../../../common/queue/jobs.service';
import { QueueWorkers } from '../../../../common/queue/queue.worker';
import { MasterySeedService } from './mastery-seed.service';
import {
  LEARN_MASTERY_SEED_JOB,
  LEARN_PROFILE_TOPIC_JOB,
  type MasterySeedJobData,
  type ProfileTopicJobData,
} from './learn-profile.job-types';

export {
  LEARN_MASTERY_SEED_JOB,
  LEARN_PROFILE_TOPIC_JOB,
  type MasterySeedJobData,
  type ProfileTopicJobData,
} from './learn-profile.job-types';

/**
 * Interim job handlers during the Learn rebuild.
 * Topic-profile generation is retired — enqueue is a no-op until topic-shape
 * jobs land. Mastery seeding still runs.
 */
@Injectable()
export class LearnProfileJobsService implements OnModuleInit {
  private readonly logger = new Logger(LearnProfileJobsService.name);

  constructor(
    private readonly jobs: JobsService,
    private readonly workers: QueueWorkers,
    private readonly masterySeed: MasterySeedService,
  ) {}

  onModuleInit(): void {
    this.workers.register(LEARN_PROFILE_TOPIC_JOB, async () => {
      this.logger.debug('topic-profile job skipped — Learn rebuild in progress');
      return { ok: true, skipped: true };
    });
    this.workers.register(LEARN_MASTERY_SEED_JOB, (job: Job) =>
      this.onMasterySeed(job.data as MasterySeedJobData),
    );
  }

  /** No-op until topic-shape jobs replace topic profiles. */
  async enqueueProfileTopic(data: ProfileTopicJobData): Promise<string | null> {
    this.logger.debug(`enqueueProfileTopic deferred for ${data.topicKey}`);
    return null;
  }

  async enqueueMasterySeed(data: MasterySeedJobData = {}): Promise<string | null> {
    return this.jobs.enqueue('ai', LEARN_MASTERY_SEED_JOB, data as unknown as Record<string, unknown>);
  }

  private async onMasterySeed(data: MasterySeedJobData): Promise<{ ok: boolean }> {
    await this.masterySeed.recompute(data);
    return { ok: true };
  }
}
