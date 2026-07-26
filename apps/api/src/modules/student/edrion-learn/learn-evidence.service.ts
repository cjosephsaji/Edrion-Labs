import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq } from 'drizzle-orm';
import { schema, type Database } from '@edrion/database';
import { DATABASE } from '../../../common/tokens';
import type { StudentPrincipal } from '../student.types';
import { applyMasteryUpdate, type MasteryOutcome } from './mastery-engine';
import { LEARNING_EVENTS_WRITER } from '../../../common/tokens';
import type { LearningEventsWriter } from '../ledger/learning-events.writer';
import { EdrionLearnRepository } from './edrion-learn.repository';

export interface RecordAnswerInput {
  sessionId: string;
  blockId: string;
  questionId: string;
  atomId: string;
  kind: string;
  input: Record<string, unknown>;
  evaluation: Record<string, unknown>;
  hintsUsed?: number;
  outcome: MasteryOutcome;
  idempotencyKey: string;
}

@Injectable()
export class LearnEvidenceService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly repo: EdrionLearnRepository,
    @Inject(LEARNING_EVENTS_WRITER) private readonly ledger: LearningEventsWriter,
  ) {}

  async recordAnswer(principal: StudentPrincipal, input: RecordAnswerInput) {
    const session = await this.repo.getOrchestratorSession(principal, input.sessionId);
    if (!session) throw new Error('SESSION_NOT_FOUND');

    const owner =
      principal.kind === 'institutional'
        ? { studentId: principal.studentId, independentUserId: null }
        : { studentId: null, independentUserId: principal.independentUserId };

    return this.db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(schema.learnAttempts)
        .where(
          and(
            eq(schema.learnAttempts.sessionId, input.sessionId),
            eq(schema.learnAttempts.blockId, input.blockId),
            eq(schema.learnAttempts.questionId, input.questionId),
          ),
        )
        .limit(1);

      if (existing) {
        return { attempt: existing, duplicate: true };
      }

      const [attempt] = await tx
        .insert(schema.learnAttempts)
        .values({
          ...owner,
          sessionId: input.sessionId,
          blockId: input.blockId,
          questionId: input.questionId,
          kind: input.kind,
          input: input.input,
          evaluation: input.evaluation,
          hintsUsed: input.hintsUsed ?? 0,
        })
        .returning();

      const prior = await this.repo.getMastery(principal, input.atomId);
      const next = applyMasteryUpdate(
        {
          rating: prior?.rating ?? 800,
          attempts: prior?.attempts ?? 0,
          correctWeight: Number(prior?.correctWeight ?? 0),
        },
        'medium',
        input.outcome,
      );

      await this.repo.upsertMastery(
        principal,
        input.atomId,
        {
          rating: next.rating,
          attempts: next.attempts,
          correctWeight: String(next.correctWeight),
          lastAttemptAt: new Date(),
        },
        tx,
      );

      await tx.insert(schema.learnerModelEvents).values({
        ...owner,
        sessionId: input.sessionId,
        attemptId: attempt!.id,
        atomId: input.atomId,
        eventType: 'mastery_updated',
        payload: { before: prior?.rating ?? 800, after: next.rating },
        idempotencyKey: input.idempotencyKey,
      });

      await this.ledger.logStrictInTransaction(tx, {
        eventType: 'session.checkpoint_answered',
        payload: {
          sessionId: input.sessionId,
          blockId: input.blockId,
          correct: input.outcome === 'correct' || input.outcome === 'hinted_correct',
          tries: 1,
          method: 'mcq',
        },
        principal,
      });

      return { attempt: attempt!, duplicate: false, mastery: next };
    });
  }
}
