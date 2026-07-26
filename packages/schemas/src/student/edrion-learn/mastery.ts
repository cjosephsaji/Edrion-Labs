import { z } from 'zod';

export const masteryRatingSchema = z.number().int().min(400).max(2400);

export const learnerMasterySnapshotSchema = z.object({
  atom_id: z.string().uuid(),
  rating: masteryRatingSchema,
  attempts: z.number().int().nonnegative(),
  correct_weight: z.number().nonnegative(),
  display_progress: z.number().min(0).max(1),
});

export type LearnerMasterySnapshot = z.infer<typeof learnerMasterySnapshotSchema>;

/** Display progress from Elo-lite rating (400–2400 → 0–1). */
export function masteryDisplayProgress(rating: number): number {
  const clamped = Math.min(2400, Math.max(400, rating));
  return Math.min(1, Math.max(0, (clamped - 800) / 800));
}
