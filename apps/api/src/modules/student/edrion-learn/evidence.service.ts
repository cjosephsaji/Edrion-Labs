import { Inject, Injectable } from '@nestjs/common';
import {
  MASTERY_SCORE_CORRECT_THRESHOLD,
  type AttemptEvaluation,
} from '@edrion/schemas';
import { LEARNING_EVENTS_WRITER } from '../../../common/tokens';
import type { LearningEventsWriter } from '../ledger/learning-events.writer';
import type { StudentPrincipal } from '../student.types';
import { EdrionLearnRepository } from './edrion-learn.repository';
import { MasteryService } from './mastery.service';
import { deriveOutcome } from './mastery-seed.service';

export interface RecordAnswerInput {
  sessionId: string;
  blockId: string;
  questionId: string;
  /** Null when the block's atom_id failed validation (E10) — attempt still recorded, no mastery. */
  atomId: string | null;
  difficulty: 'easy' | 'medium' | 'hard';
  kind: string;
  input: Record<string, unknown>;
  evaluation: Record<string, unknown>;
  hintsUsed: number;
  idempotencyKey: string;
}

/**
 * DEC-9 writeback: attempt + evidence tag + mastery + model event + learning_events
 * are one transaction. Model event is unconditional whenever mastery updates.
 * Ledger writes via logStrict (does not swallow).
 */
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
    if (priorModel) {
      // Idempotent: mastery + event already committed for this key.
      const attempt = await this.repo.findAttemptByQuestion(
        input.sessionId,
        input.blockId,
        input.questionId,
      );
      return { attempt: attempt!, duplicate: true as const };
    }

    const owner =
      principal.kind === 'institutional'
        ? {
            studentId: principal.studentId,
            independentUserId: null as string | null,
          }
        : {
            studentId: null as string | null,
            independentUserId: principal.independentUserId,
          };
    const modelOwner =
      principal.kind === 'institutional'
        ? { ...owner, institutionId: principal.institutionId }
        : { ...owner, institutionId: null as string | null };

    // Normalize evaluation through the §1.4 ladder (score threshold + polarity later).
    const normalized = normalizeEvaluation(input.evaluation);

    return this.repo.runInTransaction(async (tx) => {
      const attempt = await this.repo.insertAttempt(
        {
          sessionId: input.sessionId,
          blockId: input.blockId,
          questionId: input.questionId,
          ...owner,
          kind: input.kind,
          input: input.input,
          evaluation: normalized,
          hintsUsed: input.hintsUsed,
        },
        tx,
      );

      const polarity =
        normalized.correct === true
          ? 'strength'
          : normalized.correct === false
            ? 'growth'
            : 'neutral';

      const tag = await this.repo.insertEvidenceTag(
        {
          ...owner,
          tagKey: `learn:${input.sessionId}:${input.blockId}:${input.questionId}`,
          label: 'Learn retrieval',
          polarity,
          note: String(normalized.feedback ?? ''),
          evidenceEventIds: [attempt.id],
        },
        tx,
      );

      const masteryUpdate =
        input.atomId != null
          ? await this.mastery.applyUpdate(
              principal,
              input.atomId,
              input.difficulty,
              normalized as AttemptEvaluation,
              input.hintsUsed,
              tx,
            )
          : null;

      if (masteryUpdate && input.atomId) {
        await this.repo.insertModelEvent(
          {
            ...modelOwner,
            sessionId: input.sessionId,
            attemptId: attempt.id,
            atomId: input.atomId,
            eventType: 'mastery_update',
            idempotencyKey: modelKey,
            payload: {
              atom_id: input.atomId,
              rating_before: masteryUpdate.ratingBefore,
              rating_after: masteryUpdate.ratingAfter,
              outcome: normalized.correct ?? null,
              k: masteryUpdate.k,
              expected_p: masteryUpdate.expectedP,
              source_block_id: input.blockId,
              hinted: input.hintsUsed > 0,
            },
          },
          tx,
        );

        await this.ledger.logStrict(
          {
            principal,
            eventType: 'session.checkpoint_answered',
            payload: {
              sessionId: input.sessionId,
              blockId: input.blockId,
              correct: normalized.correct === true,
              tries: 1,
              method: 'mcq',
            },
          },
          tx,
        );
      }

      return { attempt, tag, duplicate: false as const };
    });
  }
}

function normalizeEvaluation(evaluation: Record<string, unknown>): Record<string, unknown> {
  if (typeof evaluation.correct === 'boolean') return evaluation;
  const derived = deriveOutcome(evaluation, null);
  if (derived == null) return evaluation;
  return { ...evaluation, correct: derived };
}

export { MASTERY_SCORE_CORRECT_THRESHOLD };
