import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq } from 'drizzle-orm';
import { schema, type Database } from '@edrion/database';
import { DATABASE } from '../../../common/tokens';
import { JobsService } from '../../../common/queue/jobs.service';
import {
  DEBATE_ADJUDICATE_JOB,
  DEBATE_OPPONENT_JOB,
} from './debate.constants';

@Injectable()
export class DebateOrchestrationService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly jobs: JobsService,
  ) {}

  async onSttCompleted(debateId: string, turnId: string) {
    const [debate] = await this.db
      .select()
      .from(schema.debates)
      .where(eq(schema.debates.id, debateId))
      .limit(1);
    if (!debate) return;

    const [turn] = await this.db
      .select()
      .from(schema.debateTurns)
      .where(eq(schema.debateTurns.id, turnId))
      .limit(1);
    if (!turn) return;

    await this.advanceAfterTurnReady(debate, turn.turnIndex);
  }

  async onOpponentCompleted(debateId: string, turnId: string) {
    const [debate] = await this.db
      .select()
      .from(schema.debates)
      .where(eq(schema.debates.id, debateId))
      .limit(1);
    if (!debate) return;
    const [turn] = await this.db
      .select()
      .from(schema.debateTurns)
      .where(eq(schema.debateTurns.id, turnId))
      .limit(1);
    if (!turn) return;
    await this.advanceAfterTurnReady(debate, turn.turnIndex);
  }

  private async advanceAfterTurnReady(
    debate: typeof schema.debates.$inferSelect,
    completedTurnIndex: number,
  ) {
    const turns = await this.db
      .select()
      .from(schema.debateTurns)
      .where(eq(schema.debateTurns.debateId, debate.id))
      .orderBy(asc(schema.debateTurns.turnIndex));

    const participants = await this.db
      .select()
      .from(schema.debateParticipants)
      .where(eq(schema.debateParticipants.debateId, debate.id));

    const nextIndex = completedTurnIndex + 1;
    const nextTurn = turns.find((t) => t.turnIndex === nextIndex);

    if (nextTurn && this.isAiSeat(nextTurn.seatKey, participants)) {
      if (nextTurn.sttState !== 'done') {
        await this.jobs.enqueue('ai', DEBATE_OPPONENT_JOB, {
          debateId: debate.id,
          turnId: nextTurn.id,
        });
        await this.db
          .update(schema.debates)
          .set({ status: 'speaking', currentTurnIndex: nextIndex, updatedAt: new Date() })
          .where(eq(schema.debates.id, debate.id));
        return;
      }
    }

    if (nextTurn) {
      const ready = nextTurn.sttState === 'done' || nextTurn.captureState === 'ai_synthetic';
      if (!ready && this.isAiSeat(nextTurn.seatKey, participants)) {
        await this.jobs.enqueue('ai', DEBATE_OPPONENT_JOB, {
          debateId: debate.id,
          turnId: nextTurn.id,
        });
      }
      await this.db
        .update(schema.debates)
        .set({
          status: 'speaking',
          currentTurnIndex: nextIndex,
          updatedAt: new Date(),
        })
        .where(eq(schema.debates.id, debate.id));
      return;
    }

    const allReady = turns.every(
      (t) => t.sttState === 'done' || t.captureState === 'ai_synthetic',
    );
    if (!allReady) return;

    await this.db
      .update(schema.debates)
      .set({ status: 'capture_complete', updatedAt: new Date() })
      .where(eq(schema.debates.id, debate.id));

    await this.jobs.enqueue('ai', DEBATE_ADJUDICATE_JOB, { debateId: debate.id });
  }

  private isAiSeat(
    seatKey: string | null,
    participants: (typeof schema.debateParticipants.$inferSelect)[],
  ): boolean {
    const seat = participants.find((p) => p.seatKey === seatKey);
    return seat?.participantKind === 'ai';
  }
}
