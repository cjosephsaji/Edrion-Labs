import { Global, Module } from '@nestjs/common';
import { JobsService } from './jobs.service';
import { QueueWorkers } from './queue.worker';
import { JobTracker } from './job-tracker.service';

/** Global so any module can enqueue jobs, register handlers, or record tracked runs. */
@Global()
@Module({
  providers: [JobsService, QueueWorkers, JobTracker],
  exports: [JobsService, QueueWorkers, JobTracker],
})
export class QueueModule {}
