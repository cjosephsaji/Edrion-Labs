/* eslint-disable @typescript-eslint/consistent-type-imports -- Nest needs runtime constructor metadata. */
import { Injectable, type OnModuleInit, type OnModuleDestroy } from '@nestjs/common';
import { z } from 'zod';
import { JobsService } from '../../../common/queue/jobs.service';
import { QueueWorkers } from '../../../common/queue/queue.worker';
import { PetrosContentIntelligenceService } from './petros-content-intelligence.service';
import type { Preparation } from './knowledge-preparation.repository';
import type { SourceBinding } from '@edrion/schemas';
import type { ReadinessScope } from '@edrion/database';
export const M2_CONTENT_JOB = 'knowledge.content.m2.prepare';
const jobSchema = z
  .object({
    id: z.string().uuid(),
    institutionId: z.string().uuid(),
    requestedBy: z.string().uuid(),
    sourceItemId: z.string().uuid().nullable(),
    courseId: z.string().uuid().nullable(),
  })
  .strict();
/** IDs only in BullMQ. The existing durable receipt owns fence/retry/cancellation and authority. */
@Injectable()
export class PetrosContentIntelligenceJobs implements OnModuleInit, OnModuleDestroy {
  private active?: AbortController;
  private timer?: NodeJS.Timeout;
  private readonly recoveryScopes = new Map<string, ReadinessScope>();
  private recovering = false;
  constructor(
    private readonly jobs: JobsService,
    private readonly workers: QueueWorkers,
    private readonly content: PetrosContentIntelligenceService,
  ) {}
  onModuleInit() {
    this.workers.register(M2_CONTENT_JOB, async (job) => {
      if (!this.content.enabled) throw new Error('PETROS_M2_ISOLATED_GATE_CLOSED');
      const data = jobSchema.parse(job.data);
      if (this.active) throw new Error('M2_WORKER_BUSY');
      const controller = new AbortController();
      this.active = controller;
      try {
        return await this.content.run(
          {
            institutionId: data.institutionId,
            institutionUserId: data.requestedBy,
            ...(data.sourceItemId ? { sourceItemId: data.sourceItemId } : {}),
            ...(data.courseId ? { courseId: data.courseId } : {}),
          },
          data.id,
          controller.signal,
        );
      } finally {
        this.active = undefined;
      }
    });
    if (this.content.enabled && this.jobs.enabled) {
      this.timer = setInterval(() => void this.poll(), 5000);
      this.timer.unref();
    }
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    this.active?.abort();
  }
  private async poll() {
    if (this.recovering) return;
    this.recovering = true;
    try {
      for (const scope of this.recoveryScopes.values())
        await this.recover(scope).catch(() => undefined);
    } finally {
      this.recovering = false;
    }
  }
  /** Existing staff upload ownership supplies the exact source scope. Lost enqueue remains durable. */
  async prepare(scope: ReadinessScope, binding: SourceBinding) {
    const row = await this.content.enqueue(scope, binding),
      key = JSON.stringify(scope);
    if (this.recoveryScopes.size < 20) this.recoveryScopes.set(key, { ...scope });
    await this.dispatch(row).catch(() => undefined);
    return row;
  }
  async dispatch(row: Preparation) {
    if (!this.content.enabled || row.operationVersion !== 'v2')
      throw new Error('PETROS_M2_ISOLATED_GATE_CLOSED');
    const binding = row.sourceBinding as SourceBinding;
    return this.jobs.enqueue(
      'imports',
      M2_CONTENT_JOB,
      {
        id: row.id,
        institutionId: row.institutionId,
        requestedBy: row.requestedBy,
        sourceItemId: binding.kind === 'material' ? binding.materialId : null,
        courseId: binding.kind === 'material' ? binding.contextId : null,
      },
      {
        jobId: `petros-m2-${row.id}-${row.dispatchSequence}`,
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: true,
      },
    );
  }
  async recover(scope: ReadinessScope) {
    const due = await this.content.recover(scope);
    for (const row of due) await this.dispatch(row);
    return due.length;
  }
}
