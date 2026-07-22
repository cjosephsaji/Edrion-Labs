import { createEmptyCard } from 'ts-fsrs';
import type { SrsState } from './types';

export interface Sm2BackfillInput {
  reps: number;
  intervalDays: number;
  ease: number;
  nextDueAt: Date;
  lastReviewAt: Date | null;
  updatedAt: Date;
}

export interface Sm2BackfillOutput {
  srsState: SrsState;
  stability: number;
  difficulty: number;
  fsrsDueAt: Date;
  lastReviewAt: Date | null;
}

const seed = createEmptyCard();

/** SM-2 → FSRS one-shot mapping (A1: fsrs_due_at = next_due_at for every card). */
export function mapSm2ToFsrs(input: Sm2BackfillInput): Sm2BackfillOutput {
  if (input.reps === 0) {
    return {
      srsState: 'new',
      stability: seed.stability,
      difficulty: seed.difficulty,
      fsrsDueAt: input.nextDueAt,
      lastReviewAt: input.lastReviewAt,
    };
  }

  const interval = Number(input.intervalDays);
  const ease = Number(input.ease);
  const srsState: SrsState = interval >= 1 ? 'review' : 'learning';
  const stability = Math.max(interval, 0.1);
  const difficulty = Math.min(10, Math.max(1, 11 - 2 * ease));

  return {
    srsState,
    stability,
    difficulty,
    fsrsDueAt: input.nextDueAt,
    lastReviewAt: input.lastReviewAt ?? input.updatedAt,
  };
}
