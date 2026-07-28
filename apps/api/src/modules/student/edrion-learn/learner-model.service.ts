import { Injectable } from '@nestjs/common';
import type { MoveOutcomeBucket, PacePreference, SessionStateV1 } from '@edrion/schemas';
import type { StudentPrincipal } from '../student.types';
import { EdrionLearnRepository } from './edrion-learn.repository';
import { PACE_SHORT_DWELL_MS, PACE_SHORT_DWELL_TRIGGER_COUNT } from './learn-ai-tier';

const EMPTY_BUCKET = (): MoveOutcomeBucket => ({
  correct: 0,
  wrong: 0,
  null_count: 0,
  escaped: 0,
  expanded_deeper: 0,
  skipped: 0,
  count: 0,
});

/**
 * Durable learner-model inputs beyond per-atom Elo (Phase E):
 * pace preference (short-dwell ×2 → fast) and per-move-type outcome stats.
 */
@Injectable()
export class LearnerModelService {
  constructor(private readonly repo: EdrionLearnRepository) {}

  async getSnapshot(principal: StudentPrincipal): Promise<{
    pacePreference: PacePreference | null;
    moveOutcomeStats: Record<string, MoveOutcomeBucket>;
  }> {
    const row = await this.repo.getLearnerModelState(principal);
    return {
      pacePreference: (row?.pacePreference as PacePreference | null) ?? null,
      moveOutcomeStats: (row?.moveOutcomeStats as Record<string, MoveOutcomeBucket>) ?? {},
    };
  }

  async recordDwell(principal: StudentPrincipal, dwellMs: number): Promise<PacePreference | null> {
    const row = await this.repo.ensureLearnerModelState(principal);
    if (dwellMs >= PACE_SHORT_DWELL_MS) {
      await this.repo.updateLearnerModelState(row.id, { shortDwellStreak: 0 });
      return (row.pacePreference as PacePreference | null) ?? null;
    }
    const streak = (row.shortDwellStreak ?? 0) + 1;
    const pace: PacePreference | null =
      streak >= PACE_SHORT_DWELL_TRIGGER_COUNT ? 'fast' : ((row.pacePreference as PacePreference | null) ?? null);
    await this.repo.updateLearnerModelState(row.id, {
      shortDwellStreak: pace === 'fast' ? 0 : streak,
      pacePreference: pace,
    });
    return pace;
  }

  async recordExpandedDeeper(principal: StudentPrincipal, moveType: string): Promise<void> {
    const row = await this.repo.ensureLearnerModelState(principal);
    const stats = { ...((row.moveOutcomeStats as Record<string, MoveOutcomeBucket>) ?? {}) };
    const bucket = { ...(stats[moveType] ?? EMPTY_BUCKET()) };
    bucket.expanded_deeper += 1;
    bucket.count += 1;
    stats[moveType] = bucket;
    await this.repo.updateLearnerModelState(row.id, { moveOutcomeStats: stats });
  }

  /** Roll session move digest into durable per-move-type aggregates (session close). */
  async rollupSessionMoves(principal: StudentPrincipal, state: SessionStateV1): Promise<void> {
    if (!state.moves.length) return;
    const row = await this.repo.ensureLearnerModelState(principal);
    const stats = { ...((row.moveOutcomeStats as Record<string, MoveOutcomeBucket>) ?? {}) };
    for (const move of state.moves) {
      const bucket = { ...(stats[move.move_type] ?? EMPTY_BUCKET()) };
      bucket.count += 1;
      const answered = move.outcome.answered;
      if (answered) {
        bucket.correct += answered.correct ?? 0;
        bucket.wrong += answered.wrong ?? 0;
        bucket.null_count += answered.null ?? 0;
      }
      if (move.outcome.probe_escaped) bucket.escaped += 1;
      if (move.outcome.expanded_deeper) bucket.expanded_deeper += 1;
      if (move.outcome.skipped) bucket.skipped += 1;
      stats[move.move_type] = bucket;
    }
    await this.repo.updateLearnerModelState(row.id, { moveOutcomeStats: stats });
  }
}
