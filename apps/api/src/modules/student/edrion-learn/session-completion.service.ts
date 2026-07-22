import { Inject, Injectable } from '@nestjs/common';
import { LEARNING_EVENTS_WRITER } from '../../../common/tokens';
import type { LearningEventsWriter } from '../ledger/learning-events.writer';
import type { StudentPrincipal } from '../student.types';
import type { EndReason, SessionStateV1 } from '@edrion/schemas';
import { EdrionLearnRepository } from './edrion-learn.repository';

@Injectable()
export class SessionCompletionService {
  constructor(
    private readonly repo: EdrionLearnRepository,
    @Inject(LEARNING_EVENTS_WRITER) private readonly ledger: LearningEventsWriter,
  ) {}

  async finalize(
    principal: StudentPrincipal,
    sessionId: string,
    endReason: EndReason,
    state: SessionStateV1,
  ) {
    const session = await this.repo.getSession(principal, sessionId);
    if (!session) return;

    const checkpointsMet = state.checkpoints.done >= 1;
    const countsAsComplete =
      checkpointsMet &&
      ['goal_met', 'time_budget', 'student_exit', 'move_cap'].includes(endReason);

    if (session.pathItemId && countsAsComplete) {
      await this.repo.updatePathItem(session.pathItemId, {
        status: 'completed',
        completedAt: new Date(),
      });
    }

    if (session.topicId && countsAsComplete && session.entryPoint === 'review_queue') {
      await this.repo.upsertRevisionFresh(principal, session.topicId);
    }

    await this.ledger.log({
      principal,
      eventType: 'session.completed',
      topicKey: state.topic_key,
      payload: {
        sessionId,
        endReason,
        checkpointsDone: state.checkpoints.done,
        moveCount: state.moves.length,
      },
    });
  }
}
