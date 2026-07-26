import { Injectable, type OnModuleInit } from '@nestjs/common';
import type { Job } from 'bullmq';
import { QueueWorkers } from '../../../common/queue/queue.worker';
import { JobsService } from '../../../common/queue/jobs.service';
import {
  DEBATE_ADJUDICATE_JOB,
  DEBATE_OPPONENT_JOB,
  DEBATE_RETENTION_JOB,
  DEBATE_STT_JOB,
} from './debate.constants';
import { DebateSttService } from './debate-stt.service';
import { DebateAdjudicationService } from './debate-adjudication.service';
import { DebateOpponentService } from './debate-opponent.service';
import { DebateRetentionService } from './debate-retention.service';

export interface DebateSttJobData {
  debateId: string;
  turnId: string;
}

@Injectable()
export class DebateProcessor implements OnModuleInit {
  constructor(
    private readonly workers: QueueWorkers,
    private readonly jobs: JobsService,
    private readonly stt: DebateSttService,
    private readonly adjudication: DebateAdjudicationService,
    private readonly opponent: DebateOpponentService,
    private readonly retention: DebateRetentionService,
  ) {}

  onModuleInit(): void {
    this.workers.register(DEBATE_STT_JOB, (job: Job) => this.onStt(job.data as DebateSttJobData));
    this.workers.register(DEBATE_ADJUDICATE_JOB, (job: Job) =>
      this.onAdjudicate(job.data as { debateId: string }),
    );
    this.workers.register(DEBATE_OPPONENT_JOB, (job: Job) =>
      this.onOpponent(job.data as { debateId: string; turnId: string }),
    );
    this.workers.register(DEBATE_RETENTION_JOB, () => this.onRetention());

    if (process.env.NODE_ENV !== 'test') {
      void this.jobs.schedule('maintenance', DEBATE_RETENTION_JOB, 24 * 60 * 60 * 1000);
    }
  }

  private async onStt(data: DebateSttJobData) {
    await this.stt.transcribeTurn(data.debateId, data.turnId);
    return { ok: true };
  }

  private async onAdjudicate(data: { debateId: string }) {
    await this.adjudication.adjudicateByJob(data.debateId);
    return { ok: true };
  }

  private async onOpponent(data: { debateId: string; turnId: string }) {
    await this.opponent.generateForTurn(data.debateId, data.turnId);
    return { ok: true };
  }

  private async onRetention() {
    return this.retention.sweepExpiredAudio();
  }
}
