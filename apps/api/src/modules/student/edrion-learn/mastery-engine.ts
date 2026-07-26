/** Elo-lite mastery update per PLAN-EDRION-LEARN P1.3 */
export type MasteryOutcome = 'correct' | 'incorrect' | 'hinted_correct' | 'skipped';

export interface MasteryState {
  rating: number;
  attempts: number;
  correctWeight: number;
}

const DIFFICULTY = { easy: 1100, medium: 1300, hard: 1500 } as const;

export function expectedProbability(rating: number, difficulty: number): number {
  return 1 / (1 + 10 ** ((difficulty - rating) / 400));
}

export function masteryDisplayProgress(rating: number): number {
  const clamped = Math.min(2400, Math.max(400, rating));
  return Math.min(1, Math.max(0, (clamped - 800) / 800));
}

export function applyMasteryUpdate(
  state: MasteryState,
  difficultyKey: keyof typeof DIFFICULTY,
  outcome: MasteryOutcome,
): MasteryState {
  if (outcome === 'skipped') return state;

  const difficulty = DIFFICULTY[difficultyKey];
  const expected = expectedProbability(state.rating, difficulty);
  const actual = outcome === 'correct' || outcome === 'hinted_correct' ? 1 : 0;
  let k = state.attempts < 10 ? 32 : 16;
  if (outcome === 'hinted_correct') k = k / 2;

  const delta = k * (actual - expected);
  const rating = Math.min(2400, Math.max(400, Math.round(state.rating + delta)));
  const correctWeight =
    state.correctWeight + (actual === 1 ? (outcome === 'hinted_correct' ? 0.5 : 1) : 0);

  return {
    rating,
    attempts: state.attempts + 1,
    correctWeight,
  };
}
