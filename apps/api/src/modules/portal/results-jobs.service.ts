import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import type { Job } from 'bullmq';
import { and, eq, schema, type Database } from '@edrion/database';
import { DATABASE } from '../../common/tokens';
import { JobsService } from '../../common/queue/jobs.service';
import { QueueWorkers } from '../../common/queue/queue.worker';
import { JobTracker } from '../../common/queue/job-tracker.service';
import { TodayNotifyService } from '../student/today/today-notify.service';
import {
  RESULTS_RECOMPUTE_TERM_JOB,
  RESULTS_RELEASE_FANOUT_JOB,
  type ResultsRecomputeTermJobData,
  type ResultsReleaseFanoutJobData,
} from './results.constants';
import { ResultsRecomputeService } from './results-recompute.service';

const CHUNK_SIZE = 200;

@Injectable()
export class ResultsJobsService implements OnModuleInit {
  constructor(
    private readonly jobs: JobsService,
    private readonly workers: QueueWorkers,
    private readonly tracker: JobTracker,
    private readonly recompute: ResultsRecomputeService,
    private readonly notify: TodayNotifyService,
    @Inject(DATABASE) private readonly db: Database,
  ) {}

  onModuleInit() {
    this.workers.register(RESULTS_RECOMPUTE_TERM_JOB, (job: Job) =>
      this.tracker.run(RESULTS_RECOMPUTE_TERM_JOB, 'reports', async () => {
        const data = job.data as ResultsRecomputeTermJobData;
        const [before] = await this.db
          .select({ isComplete: schema.studentTermResults.isComplete })
          .from(schema.studentTermResults)
          .where(
            and(
              eq(schema.studentTermResults.studentId, data.studentId),
              eq(schema.studentTermResults.termId, data.termId),
            ),
          )
          .limit(1);

        const row = await this.recompute.recomputeStudent(data.institutionId, data.studentId, data.termId);

        if (data.revisionId) {
          await this.notify.fanoutInstitutionStudents(data.institutionId, [data.studentId], {
            eventKey: `rev:${data.revisionId}:${data.studentId}`,
            type: 'mark_revised',
            sourceModule: 'results',
            title: 'A mark was revised',
            body: 'One of your released marks was updated after revaluation.',
            deepLink: `/results?term=${data.termId}`,
          });
        }

        if (row && !before?.isComplete && row.isComplete) {
          await this.notify.fanoutInstitutionStudents(data.institutionId, [data.studentId], {
            eventKey: `complete:${data.studentId}:${data.termId}`,
            type: 'results_complete',
            sourceModule: 'results',
            title: 'Term results complete',
            body: 'All components for this term are now released.',
            deepLink: `/results?term=${data.termId}`,
          });
        }

        return { itemsProcessed: row ? 1 : 0 };
      }),
    );

    this.workers.register(RESULTS_RELEASE_FANOUT_JOB, (job: Job) =>
      this.tracker.run(RESULTS_RELEASE_FANOUT_JOB, 'reports', async () => {
        const data = job.data as ResultsReleaseFanoutJobData;
        let processed = 0;
        for (let offset = 0; offset < data.studentIds.length; offset += CHUNK_SIZE) {
          const chunk = data.studentIds.slice(offset, offset + CHUNK_SIZE);
          for (const studentId of chunk) {
            await this.notify.fanoutInstitutionStudents(data.institutionId, [studentId], {
              eventKey: `${data.batchId}:${studentId}`,
              type: 'marks_released',
              sourceModule: 'results',
              title: `${data.subjectName} ${data.assessmentLabel} marks are out`,
              body: `${data.subjectName} ${data.assessmentLabel} marks are out`,
              deepLink: `/results/${data.termId}/${data.subjectId}?highlight=${data.highlightRef}`,
            });
            await this.enqueueRecompute({
              institutionId: data.institutionId,
              studentId,
              termId: data.termId,
              batchId: data.batchId,
            });
            processed += 1;
          }
        }
        return { itemsProcessed: processed };
      }),
    );
  }

  async enqueueRecompute(data: ResultsRecomputeTermJobData) {
    await this.jobs.enqueue(
      'reports',
      RESULTS_RECOMPUTE_TERM_JOB,
      data as unknown as Record<string, unknown>,
      { jobId: `results:${data.studentId}:${data.termId}` },
    );
  }

  async enqueueReleaseFanout(data: ResultsReleaseFanoutJobData) {
    await this.jobs.enqueue(
      'reports',
      RESULTS_RELEASE_FANOUT_JOB,
      data as unknown as Record<string, unknown>,
      { jobId: `results-fanout:${data.batchId}:${data.batchVersion}` },
    );
  }
}
