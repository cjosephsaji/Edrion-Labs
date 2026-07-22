import { Injectable, type OnModuleInit } from '@nestjs/common';
import type { Job } from 'bullmq';
import { QueueWorkers } from '../../common/queue/queue.worker';
import { DocumentBatchService } from './document-batch.service';
import { BATCH_RENDER_COMPLETE_JOB } from './document-batch.controller';

@Injectable()
export class DocumentBatchJobsService implements OnModuleInit {
  constructor(
    private readonly workers: QueueWorkers,
    private readonly batches: DocumentBatchService,
  ) {}

  onModuleInit(): void {
    this.workers.register(BATCH_RENDER_COMPLETE_JOB, (job: Job) => {
      const data = job.data as { renderId: string };
      return this.batches.onRenderDone(data.renderId);
    });
  }
}
