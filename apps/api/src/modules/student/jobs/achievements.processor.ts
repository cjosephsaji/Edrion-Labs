import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import { LEARNING_EVENTS_WRITER } from '../../../common/tokens';
import { QueueWorkers } from '../../../common/queue/queue.worker';
import type { LearningEventsWriter } from '../ledger/learning-events.writer';
import type { StudentPrincipal } from '../student.types';
import { AchievementsService, ACHIEVEMENTS_SWEEP_JOB } from '../achievements/achievements.service';

/** BullMQ stub — evaluates badge predicates after ledger writes + nightly sweep. */
@Injectable()
export class AchievementsProcessor implements OnModuleInit {
  constructor(
    private readonly workers: QueueWorkers,
    private readonly achievements: AchievementsService,
    @Inject(LEARNING_EVENTS_WRITER) private readonly ledger: LearningEventsWriter,
  ) {}

  onModuleInit(): void {
    this.workers.register(ACHIEVEMENTS_SWEEP_JOB, async () => ({ ok: true }));
  }

  async evaluateForPrincipal(principal: StudentPrincipal) {
    await this.achievements.evaluatePrincipal(principal, this.ledger);
  }
}
