import { Injectable, type OnModuleInit } from '@nestjs/common';
import { localStudyDate } from '@edrion/schemas';
import { JobsService } from '../../../common/queue/jobs.service';
import { QueueWorkers } from '../../../common/queue/queue.worker';
import { JobTracker } from '../../../common/queue/job-tracker.service';
import { LIBRARY_STREAK_FINALIZE_JOB } from './library.constants';
import { StreakService } from './streak.service';

@Injectable()
export class StreakFinalizeProcessor implements OnModuleInit {
  constructor(
    private readonly jobs: JobsService,
    private readonly workers: QueueWorkers,
    private readonly tracker: JobTracker,
    private readonly streaks: StreakService,
  ) {}

  onModuleInit() {
    this.workers.register(LIBRARY_STREAK_FINALIZE_JOB, () =>
      this.tracker.run(LIBRARY_STREAK_FINALIZE_JOB, 'maintenance', async () => {
        const studyDate = localStudyDate(new Date(Date.now() - 4 * 60 * 60 * 1000), 'UTC');
        const processed = await this.streaks.finalizeDay(studyDate);
        return { itemsProcessed: processed };
      }),
    );
    void this.jobs.schedule('maintenance', LIBRARY_STREAK_FINALIZE_JOB, 24 * 60 * 60 * 1000);
  }
}
