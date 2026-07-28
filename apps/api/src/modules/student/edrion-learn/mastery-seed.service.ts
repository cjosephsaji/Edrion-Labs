import { Injectable, Logger } from '@nestjs/common';
import {
  MASTERY_DIFFICULTY_RATINGS,
  MASTERY_K_ATTEMPT_THRESHOLD,
  MASTERY_K_HIGH,
  MASTERY_K_LOW,
  MASTERY_RATING_DEFAULT,
  MASTERY_RATING_MAX,
  MASTERY_RATING_MIN,
  MASTERY_SCORE_CORRECT_THRESHOLD,
} from '@edrion/schemas';
import { EdrionLearnRepository } from './edrion-learn.repository';
import type { MasterySeedJobData } from './learn-profile.jobs';

/**
 * Idempotent mastery seeding (hyperspec §1.4 / AC9).
 * Recomputes learner_mastery from scratch by replaying learn_attempts
 * chronologically per (owner, atom), with evidence_tags.polarity as fallback.
 */
@Injectable()
export class MasterySeedService {
  private readonly logger = new Logger(MasterySeedService.name);

  constructor(private readonly repo: EdrionLearnRepository) {}

  async recompute(scope: MasterySeedJobData = {}): Promise<{ owners: number; rows: number }> {
    const attempts = await this.repo.listAttemptsForMasterySeed(scope);
    // Group by owner+atom
    type Key = string;
    const groups = new Map<
      Key,
      {
        studentId: string | null;
        independentUserId: string | null;
        institutionId: string | null;
        atomId: string;
        rows: Array<{
          id: string;
          evaluation: Record<string, unknown>;
          hintsUsed: number;
          createdAt: Date;
          evidencePolarity: string | null;
        }>;
      }
    >();

    for (const a of attempts) {
      if (!a.atomId) continue;
      const key = `${a.studentId ?? ''}|${a.independentUserId ?? ''}|${a.atomId}`;
      let g = groups.get(key);
      if (!g) {
        g = {
          studentId: a.studentId,
          independentUserId: a.independentUserId,
          institutionId: a.institutionId,
          atomId: a.atomId,
          rows: [],
        };
        groups.set(key, g);
      }
      g.rows.push({
        id: a.id,
        evaluation: (a.evaluation as Record<string, unknown>) ?? {},
        hintsUsed: a.hintsUsed ?? 0,
        createdAt: a.createdAt,
        evidencePolarity: a.evidencePolarity,
      });
    }

    let rows = 0;
    for (const g of groups.values()) {
      g.rows.sort((x, y) => x.createdAt.getTime() - y.createdAt.getTime());
      let rating = MASTERY_RATING_DEFAULT;
      let attemptsCount = 0;
      let correctWeight = 0;
      let lastAttemptAt: Date | null = null;

      for (const row of g.rows) {
        const outcome = deriveOutcome(row.evaluation, row.evidencePolarity);
        if (outcome == null) continue;
        const difficulty = 'medium' as const;
        const d = MASTERY_DIFFICULTY_RATINGS[difficulty];
        const expectedP = 1 / (1 + 10 ** ((d - rating) / 400));
        let k = attemptsCount < MASTERY_K_ATTEMPT_THRESHOLD ? MASTERY_K_HIGH : MASTERY_K_LOW;
        if (row.hintsUsed > 0 && outcome) k /= 2;
        rating = Math.min(
          MASTERY_RATING_MAX,
          Math.max(MASTERY_RATING_MIN, Math.round(rating + k * ((outcome ? 1 : 0) - expectedP))),
        );
        attemptsCount += 1;
        if (outcome) correctWeight += row.hintsUsed > 0 ? 0.5 : 1;
        lastAttemptAt = row.createdAt;
      }

      if (attemptsCount === 0) continue;

      await this.repo.replaceMasteryForSeed({
        studentId: g.studentId,
        independentUserId: g.independentUserId,
        institutionId: g.institutionId,
        atomId: g.atomId,
        rating,
        attempts: attemptsCount,
        correctWeight,
        lastAttemptAt,
      });
      rows += 1;
    }

    this.logger.log(`mastery seed complete: ${groups.size} owner-atom groups, ${rows} rows written`);
    return { owners: groups.size, rows };
  }
}

/** Hyperspec §1.4 outcome ladder. */
export function deriveOutcome(
  evaluation: Record<string, unknown>,
  evidencePolarity: string | null,
): boolean | null {
  if (typeof evaluation.correct === 'boolean') return evaluation.correct;
  if (typeof evaluation.score === 'number' && evaluation.score >= MASTERY_SCORE_CORRECT_THRESHOLD) {
    return true;
  }
  if (typeof evaluation.score === 'number' && evaluation.score < MASTERY_SCORE_CORRECT_THRESHOLD) {
    // Score present but below threshold → incorrect (only when no `correct` flag).
    return false;
  }
  if (evidencePolarity === 'strength' || evidencePolarity === 'positive') return true;
  if (evidencePolarity === 'growth' || evidencePolarity === 'negative') return false;
  return null;
}
