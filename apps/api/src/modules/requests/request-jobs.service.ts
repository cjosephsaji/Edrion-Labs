import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import type { Job } from 'bullmq';
import {
  and,
  eq,
  inArray,
  lte,
  runInInstitutionTenant,
  schema,
  type Database,
} from '@edrion/database';
import { DATABASE } from '../../common/tokens';
import { JobsService } from '../../common/queue/jobs.service';
import { QueueWorkers } from '../../common/queue/queue.worker';
import { RequestDocumentService, REQUEST_RENDER_COMPLETE_JOB } from './request-document.service';
import { RequestEngineService } from './request-engine.service';
import { RequestNotifyService } from './request-notify.service';

export const REQUEST_EXPIRE_JOB = 'requests.expire_needs_info';
export const REQUEST_SLA_JOB = 'requests.sla_breach_sweep';

@Injectable()
export class RequestJobsService implements OnModuleInit {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly jobs: JobsService,
    private readonly workers: QueueWorkers,
    private readonly engine: RequestEngineService,
    private readonly documents: RequestDocumentService,
    private readonly notifications: RequestNotifyService,
  ) {}

  async onModuleInit(): Promise<void> {
    this.workers.register(REQUEST_RENDER_COMPLETE_JOB, (job: Job) => {
      const data = job.data as { institutionId: string; renderId: string };
      return runInInstitutionTenant(this.db, data.institutionId, () =>
        this.documents.completeRender(data.renderId),
      );
    });
    this.workers.register(REQUEST_EXPIRE_JOB, () => this.expireSweep());
    this.workers.register(REQUEST_SLA_JOB, () => this.slaSweep());
    await this.jobs.schedule('maintenance', REQUEST_EXPIRE_JOB, 24 * 60 * 60 * 1000);
    await this.jobs.schedule('maintenance', REQUEST_SLA_JOB, 60 * 60 * 1000);
  }

  async expireSweep(): Promise<{ expired: number }> {
    // Enumerate the platform-level institution registry, then enter each tenant
    // before touching request rows so the worker obeys the same RLS boundary as HTTP.
    const institutions = await this.db.select({ institutionId: schema.institutions.id }).from(schema.institutions);
    let expired = 0;
    for (const { institutionId } of institutions) {
      expired += await runInInstitutionTenant(this.db, institutionId, () =>
        this.engine.expireSilentRequests(institutionId),
      );
    }
    return { expired };
  }

  async slaSweep(): Promise<{ breached: number }> {
    const institutions = await this.db.select({ institutionId: schema.institutions.id }).from(schema.institutions);
    let breached = 0;
    for (const { institutionId } of institutions) {
      const rows = await runInInstitutionTenant(this.db, institutionId, () =>
        this.db
          .select({ id: schema.studentRequests.id })
          .from(schema.studentRequests)
          .where(
            and(
              eq(schema.studentRequests.institutionId, institutionId),
              inArray(schema.studentRequests.status, ['submitted', 'in_review', 'needs_info']),
              lte(schema.studentRequests.slaDueAt, new Date()),
            ),
          ),
      );
      for (const row of rows) await this.notifications.notifySla(institutionId, row.id);
      breached += rows.length;
    }
    return { breached };
  }
}
