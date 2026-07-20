import { Injectable, type OnModuleInit } from '@nestjs/common';
import type { Job } from 'bullmq';
import { JobsService } from '../../../common/queue/jobs.service';
import { QueueWorkers } from '../../../common/queue/queue.worker';
import { JobTracker } from '../../../common/queue/job-tracker.service';
import { TodayService } from './today.service';

export const TODAY_EXPIRE_JOB = 'today.obligations.expire';

@Injectable()
export class TodayJobsService implements OnModuleInit {
  constructor(private readonly jobs:JobsService,private readonly workers:QueueWorkers,private readonly tracker:JobTracker,private readonly today:TodayService){}
  async onModuleInit(){this.workers.register(TODAY_EXPIRE_JOB,(_job:Job)=>this.tracker.run(TODAY_EXPIRE_JOB,'maintenance',async()=>{const rows=await this.today.expireObligations();return{itemsProcessed:rows.length};}));await this.jobs.schedule('maintenance',TODAY_EXPIRE_JOB,24*60*60*1000);}
}
