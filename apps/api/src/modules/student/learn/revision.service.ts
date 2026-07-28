import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { FRESHNESS_FADING_DAYS, FRESHNESS_FRESH_DAYS } from '@edrion/shared-types';
import { LEARNING_EVENTS_WRITER } from '../../../common/tokens';
import type { LearningEventsWriter } from '../ledger/learning-events.writer';
import type { StudentPrincipal } from '../student.types';
import { PedagogyOrchestratorService } from './engine/pedagogy-orchestrator.service';
import { LearnRepository } from './learn.repository';

@Injectable()
export class RevisionService {
  constructor(
    private readonly repo: LearnRepository,
    private readonly orchestrator: PedagogyOrchestratorService,
    @Inject(LEARNING_EVENTS_WRITER) private readonly ledger: LearningEventsWriter,
  ) {}

  async getQueue(principal: StudentPrincipal) {
    const rows = await this.repo.listRevisionStates(principal);
    const now = Date.now();
    const queue = rows.map((r) => {
      const days = (now - r.state.lastEvidenceAt.getTime()) / (1000 * 60 * 60 * 24);
      const manualReasons = r.state.manualReasons ?? [];
      const manualDue =
        r.state.manualDueAt != null && r.state.manualDueAt.getTime() <= now && manualReasons.length > 0;
      let freshness: 'fresh' | 'fading' | 'due' = 'fresh';
      if (manualDue || days > FRESHNESS_FADING_DAYS) freshness = 'due';
      else if (days > FRESHNESS_FRESH_DAYS) freshness = 'fading';
      return {
        topicKey: r.topic.topicKey,
        title: r.topic.title,
        freshness,
        lastTouched: r.state.lastEvidenceAt.toISOString(),
        topicId: r.topic.id,
        manualReasonCount: manualReasons.length,
        manualReasonTitles: manualReasons.slice(0, 2).map((reason) => reason.title),
      };
    });

    const sortOrder = { due: 0, fading: 1, fresh: 2 };
    queue.sort((a, b) => sortOrder[a.freshness] - sortOrder[b.freshness] || a.lastTouched.localeCompare(b.lastTouched));

    const counts = { fresh: 0, fading: 0, due: 0 };
    for (const q of queue) counts[q.freshness]++;

    return { queue, counts };
  }

  async refresh(principal: StudentPrincipal, topicId: string) {
    const topic = await this.repo.getTopic(topicId);
    if (!topic) throw new NotFoundException('Topic not found');

    const { session } = await this.orchestrator.createSession(principal, {
      entryPoint: 'review_queue',
      topicKey: topic.topicKey,
      goal: 'revision',
      timeBudgetMinutes: 20,
      idempotencyKey: randomUUID(),
    });

    await this.ledger.log({
      principal,
      eventType: 'revision.started',
      topicKey: topic.topicKey,
      payload: { topicKey: topic.topicKey, sessionId: session.id },
    });

    return session;
  }
}
