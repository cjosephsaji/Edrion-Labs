import { Injectable, type OnModuleInit, type OnModuleDestroy } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { m4EvaluationSchema } from '@edrion/schemas';
import { JobsService } from '../../../common/queue/jobs.service';
import { QueueWorkers } from '../../../common/queue/queue.worker';
import { PetrosV2SessionService } from './petros-v2-session.service';
import { PetrosV2AssessmentService } from './petros-v2-assessment.service';
import { timePetrosStage, tracePetrosWorker } from './petros-performance';
const jobSchema = z
  .object({ sessionId: z.string().uuid(), requestedBy: z.string().uuid() })
  .strict();
export const M4_JOB = 'petros.v2.evaluate';
@Injectable()
export class PetrosV2CommandWorker implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  private recovering = false;
  private initialized = false;
  constructor(
    private readonly sessions: PetrosV2SessionService,
    private readonly assessment: PetrosV2AssessmentService,
    private readonly jobs: JobsService,
    private readonly workers: QueueWorkers,
  ) {}
  onModuleInit() {
    if (this.initialized) return;
    this.initialized = true;
    this.workers.register(M4_JOB, (job) => this.process(job.data));
    if (this.sessions.enabled && this.jobs.enabled) {
      this.timer = setInterval(() => void this.recover().catch(() => undefined), 5000);
      this.timer.unref();
      void this.recover().catch(() => undefined);
    }
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    this.initialized = false;
  }
  async dispatch(sessionId: string, requestedBy: string) {
    if (!this.sessions.enabled) return;
    return tracePetrosWorker(
      () =>
        timePetrosStage('queue_dispatch', () =>
          this.jobs.enqueue(
            'ai',
            M4_JOB,
            { sessionId, requestedBy },
            {
              jobId: `m4-${sessionId}-${Math.floor(Date.now() / 5000)}`,
              attempts: 3,
              backoff: { type: 'exponential', delay: 2000 },
              removeOnComplete: true,
            },
          ),
        ),
      'queue',
    );
  }
  async recover() {
    if (this.recovering || !this.sessions.enabled) return 0;
    this.recovering = true;
    try {
      const due = await this.sessions.due();
      for (const row of due) await this.dispatch(row.session_id, row.requested_by);
      return due.length;
    } finally {
      this.recovering = false;
    }
  }
  async process(raw: unknown) {
    return tracePetrosWorker(() => this.processClaim(raw));
  }
  private async processClaim(raw: unknown) {
    const input = jobSchema.parse(raw),
      p = await this.sessions.workerPrincipal(input.requestedBy);
    const claim = await timePetrosStage('worker_claim', () =>
      this.sessions.claim(p, input.sessionId),
    );
    if (!claim) return { published: false };
    let result;
    try {
      if (!claim.authorized) throw new Error('AUTHORITY_UNAVAILABLE');
      result = await timePetrosStage('kernel_evaluation', () => this.assessment.evaluate(claim));
    } catch {
      result = m4EvaluationSchema.parse({
        id: randomUUID(),
        responseId: claim.responseId,
        status: 'unavailable',
        evaluatorVersion: 'petros.m4.kernel.v1',
        supersedes: null,
        reason: 'Evaluation is unavailable. The submitted response remains saved.',
        criteria: [
          {
            criterionId: claim.objectiveId,
            label: 'Response review',
            status: 'abstained',
            origin: 'review_required',
            feedback: 'Your answer is saved. Feedback is not available yet.',
          },
        ],
      });
    }
    return {
      published: await timePetrosStage('evaluation_publish', () =>
        this.sessions.publish(p, claim, result),
      ),
    };
  }
}
