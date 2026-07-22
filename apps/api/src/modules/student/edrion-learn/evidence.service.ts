import { Inject, Injectable } from '@nestjs/common';
import { LEARNING_EVENTS_WRITER } from '../../../common/tokens';
import type { LearningEventsWriter } from '../ledger/learning-events.writer';
import type { StudentPrincipal } from '../student.types';
import { EdrionLearnRepository } from './edrion-learn.repository';
import { MasteryService } from './mastery.service';

export interface RecordAnswerInput {
  sessionId: string;
  blockId: string;
  questionId: string;
  atomId: string;
  difficulty: 'easy' | 'medium' | 'hard';
  kind: string;
  input: Record<string, unknown>;
  evaluation: Record<string, unknown>;
  hintsUsed: number;
  idempotencyKey: string;
}

@Injectable()
export class EvidenceService {
  constructor(
    private readonly repo: EdrionLearnRepository,
    private readonly mastery: MasteryService,
    @Inject(LEARNING_EVENTS_WRITER) private readonly ledger: LearningEventsWriter,
  ) {}

  async recordAnswer(principal: StudentPrincipal, input: RecordAnswerInput) {
    const existing = await this.repo.findAttemptByQuestion(
      input.sessionId,
      input.blockId,
      input.questionId,
    );
    if (existing) {
      return { attempt: existing, duplicate: true as const };
    }

    const modelKey = `mastery:${input.idempotencyKey}`;
    const priorModel = await this.repo.findModelEventByIdempotency(principal, modelKey);

    const owner =
      principal.kind === 'institutional'
        ? { studentId: principal.studentId, independentUserId: null, institutionId: principal.institutionId }
        : { studentId: null, independentUserId: principal.independentUserId, institutionId: null };

    const attempt = await this.repo.insertAttempt({
      sessionId: input.sessionId,
      blockId: input.blockId,
      questionId: input.questionId,
      ...owner,
      kind: input.kind,
      input: input.input,
      evaluation: input.evaluation,
      hintsUsed: input.hintsUsed,
    });

    const polarity =
      input.evaluation.correct === true ? 'strength' : input.evaluation.correct === false ? 'growth' : 'neutral';

    const tag = await this.repo.insertEvidenceTag({
      ...owner,
      tagKey: `learn:${input.sessionId}:${input.blockId}:${input.questionId}`,
      label: 'Learn retrieval',
      polarity,
      note: String(input.evaluation.feedback ?? ''),
      evidenceEventIds: [attempt.id],
    });

    const masteryUpdate = await this.mastery.applyUpdate(
      principal,
      input.atomId,
      input.difficulty,
      input.evaluation,
      input.hintsUsed,
    );

    if (masteryUpdate && !priorModel) {
      await this.repo.insertModelEvent({
        ...owner,
        sessionId: input.sessionId,
        attemptId: attempt.id,
        atomId: input.atomId,
        eventType: 'mastery_update',
        idempotencyKey: modelKey,
        payload: {
          atom_id: input.atomId,
          rating_before: masteryUpdate.ratingBefore,
          rating_after: masteryUpdate.ratingAfter,
          outcome: input.evaluation.correct ?? null,
          k: masteryUpdate.k,
          expected_p: masteryUpdate.expectedP,
          source_block_id: input.blockId,
          hinted: input.hintsUsed > 0,
        },
      });
    }

    await this.ledger.log({
      principal,
      eventType: 'session.checkpoint_answered',
      topicKey: undefined,
      payload: {
        sessionId: input.sessionId,
        blockId: input.blockId,
        correct: input.evaluation.correct === true,
        tries: 1,
        method: 'mcq',
      },
    });

    return { attempt, tag, duplicate: false as const };
  }
}
