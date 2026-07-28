import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import type { Job } from 'bullmq';
import { JobsService } from '../../../common/queue/jobs.service';
import { QueueWorkers } from '../../../common/queue/queue.worker';
import { TopicProfileService } from './profile.service';
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
 * Learn BullMQ job handlers (Phase E). Producers enqueue via JobsService
 * directly (see TopicProfileService / PathService / LibraryIngestWorker) so
 * this class only owns worker registration — no producer↔consumer cycle.
 */
@Injectable()
export class LearnProfileJobsService implements OnModuleInit {
  private readonly logger = new Logger(LearnProfileJobsService.name);

  constructor(
    private readonly jobs: JobsService,
    private readonly workers: QueueWorkers,
    private readonly profiles: TopicProfileService,
    private readonly masterySeed: MasterySeedService,
  ) {}

  onModuleInit(): void {
    this.workers.register(LEARN_PROFILE_TOPIC_JOB, (job: Job) =>
      this.onProfileTopic(job.data as ProfileTopicJobData),
    );
    this.workers.register(LEARN_MASTERY_SEED_JOB, (job: Job) =>
      this.onMasterySeed(job.data as MasterySeedJobData),
    );
  }

  /** Public enqueue helper for path creation / library indexing. */
  async enqueueProfileTopic(data: ProfileTopicJobData): Promise<string | null> {
    const id = await this.jobs.enqueue(
      'ai',
      LEARN_PROFILE_TOPIC_JOB,
      data as unknown as Record<string, unknown>,
      {
        jobId: `profile-topic:${data.topicKey}:${data.learnTopicId ?? 'adhoc'}`,
        removeOnComplete: { count: 200 },
      },
    );
    if (!id && !this.jobs.enabled) {
      void this.onProfileTopic(data).catch((err) =>
        this.logger.warn(`inline profile regen failed: ${(err as Error).message}`),
      );
    }
    return id;
  }

  async enqueueMasterySeed(data: MasterySeedJobData = {}): Promise<string | null> {
    return this.jobs.enqueue('ai', LEARN_MASTERY_SEED_JOB, data as unknown as Record<string, unknown>);
  }

  private async onProfileTopic(data: ProfileTopicJobData): Promise<{ ok: boolean }> {
    await this.profiles.regenerate(data.principal, {
      learnTopicId: data.learnTopicId,
      topicKey: data.topicKey,
      title: data.title,
      syllabusContext: data.syllabusContext,
      materialOutline: data.materialOutline,
      materialFirstChunk: data.materialFirstChunk,
      background: true,
    });
    return { ok: true };
  }

  private async onMasterySeed(data: MasterySeedJobData): Promise<{ owners: number; rows: number }> {
    return this.masterySeed.recompute(data);
  }
}
