import { Injectable } from '@nestjs/common';
import {
  MASTERY_DIFFICULTY_RATINGS,
  MASTERY_K_ATTEMPT_THRESHOLD,
  MASTERY_K_HIGH,
  MASTERY_K_LOW,
  MASTERY_RATING_DEFAULT,
  MASTERY_RATING_MAX,
  MASTERY_RATING_MIN,
  ratingToDisplayMastery,
  type AttemptEvaluation,
} from '@edrion/schemas';
import type { StudentPrincipal } from '../student.types';
import { EdrionLearnRepository } from './edrion-learn.repository';

@Injectable()
export class MasteryService {
  constructor(private readonly repo: EdrionLearnRepository) {}

  async snapshot(principal: StudentPrincipal, atomIds: string[]): Promise<Record<string, number>> {
    const out: Record<string, number> = {};
    for (const atomId of atomIds) {
      const row = await this.repo.getMastery(principal, atomId);
      out[atomId] = ratingToDisplayMastery(row?.rating ?? MASTERY_RATING_DEFAULT);
    }
    return out;
  }

  async applyUpdate(
    principal: StudentPrincipal,
    atomId: string,
    difficulty: 'easy' | 'medium' | 'hard',
    evaluation: AttemptEvaluation,
    hintsUsed: number,
  ): Promise<{ ratingBefore: number; ratingAfter: number; k: number; expectedP: number } | null> {
    if (evaluation.correct == null) return null;

    const existing = await this.repo.getMastery(principal, atomId);
    const ratingBefore = existing?.rating ?? MASTERY_RATING_DEFAULT;
    const attempts = existing?.attempts ?? 0;
    const d = MASTERY_DIFFICULTY_RATINGS[difficulty];
    const expectedP = 1 / (1 + 10 ** ((d - ratingBefore) / 400));
    let k = attempts < MASTERY_K_ATTEMPT_THRESHOLD ? MASTERY_K_HIGH : MASTERY_K_LOW;
    if (hintsUsed > 0 && evaluation.correct) k /= 2;

    const outcome = evaluation.correct ? 1 : 0;
    const ratingAfter = Math.min(
      MASTERY_RATING_MAX,
      Math.max(MASTERY_RATING_MIN, Math.round(ratingBefore + k * (outcome - expectedP))),
    );

    const correctWeight =
      Number(existing?.correctWeight ?? 0) + (evaluation.correct ? (hintsUsed > 0 ? 0.5 : 1) : 0);

    await this.repo.upsertMastery(principal, atomId, {
      rating: ratingAfter,
      attempts: attempts + 1,
      correctWeight,
      lastAttemptAt: new Date(),
    });

    return { ratingBefore, ratingAfter, k, expectedP };
  }
}
