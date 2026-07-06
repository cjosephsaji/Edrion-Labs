import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { FRESHNESS_FADING_DAYS, FRESHNESS_FRESH_DAYS } from '@edrion/shared-types';
import { LEARNING_EVENTS_WRITER } from '../../../common/tokens';
import type { LearningEventsWriter } from '../ledger/learning-events.writer';
import type { StudentPrincipal } from '../student.types';
import { LearnRepository } from './learn.repository';
import { SessionsService } from './sessions.service';

@Injectable()
export class RevisionService {
  constructor(
    private readonly repo: LearnRepository,
    private readonly sessions: SessionsService,
    @Inject(LEARNING_EVENTS_WRITER) private readonly ledger: LearningEventsWriter,
  ) {}

  async getQueue(principal: StudentPrincipal) {
    const rows = await this.repo.listRevisionStates(principal);
    const now = Date.now();
    const queue = rows.map((r) => {
      const days = (now - r.state.lastEvidenceAt.getTime()) / (1000 * 60 * 60 * 24);
      let freshness: 'fresh' | 'fading' | 'due' = 'fresh';
      if (days > FRESHNESS_FADING_DAYS) freshness = 'due';
      else if (days > FRESHNESS_FRESH_DAYS) freshness = 'fading';
      return {
        topicKey: r.topic.topicKey,
        title: r.topic.title,
        freshness,
        lastTouched: r.state.lastEvidenceAt.toISOString(),
        topicId: r.topic.id,
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

    const session = await this.sessions.create(principal, {
      topicKey: topic.topicKey,
      topicTitle: topic.title,
      source: 'refresh',
    });

    await this.ledger.log({
      principal,
      eventType: 'revision.completed',
      topicKey: topic.topicKey,
      payload: { topicKey: topic.topicKey, mode: 'refresh10' },
    });

    await this.repo.upsertRevisionFresh(principal, topicId);
    return session;
  }
}
