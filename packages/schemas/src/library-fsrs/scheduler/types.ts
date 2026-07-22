export type SrsState = 'new' | 'learning' | 'review' | 'relearning';
export type Grade = 'again' | 'hard' | 'good' | 'easy';

export interface SchedulerCard {
  srsState: SrsState;
  stability: number;
  difficulty: number;
  fsrsDueAt: Date;
  lastReviewAt: Date | null;
  reps: number;
  lapses: number;
}

export interface SchedulerResult {
  srsState: SrsState;
  stability: number;
  difficulty: number;
  fsrsDueAt: Date;
  reps: number;
  lapses: number;
}

export interface SchedulerService {
  preview(card: SchedulerCard, now: Date): Record<Grade, { intervalLabel: string; dueAt: Date }>;
  applyGrade(card: SchedulerCard, grade: Grade, reviewedAt: Date): SchedulerResult;
}
