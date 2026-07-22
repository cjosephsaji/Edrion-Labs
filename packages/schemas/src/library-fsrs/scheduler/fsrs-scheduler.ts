import {
  Rating,
  State,
  createEmptyCard,
  fsrs,
  type Card,
  type Grade as FsrsGrade,
} from 'ts-fsrs';
import type { Grade, SchedulerCard, SchedulerResult, SchedulerService, SrsState } from './types';

const engine = fsrs({
  request_retention: 0.9,
  maximum_interval: 365,
});

const GRADE_MAP: Record<Grade, FsrsGrade> = {
  again: Rating.Again,
  hard: Rating.Hard,
  good: Rating.Good,
  easy: Rating.Easy,
};

const STATE_TO_SRS: Record<State, SrsState> = {
  [State.New]: 'new',
  [State.Learning]: 'learning',
  [State.Review]: 'review',
  [State.Relearning]: 'relearning',
};

const SRS_TO_STATE: Record<SrsState, State> = {
  new: State.New,
  learning: State.Learning,
  review: State.Review,
  relearning: State.Relearning,
};

function toCard(card: SchedulerCard): Card {
  const empty = createEmptyCard();
  return {
    ...empty,
    due: card.fsrsDueAt,
    stability: card.stability || empty.stability,
    difficulty: card.difficulty || empty.difficulty,
    reps: card.reps,
    lapses: card.lapses,
    state: SRS_TO_STATE[card.srsState],
    last_review: card.lastReviewAt ?? undefined,
  };
}

function fromCard(card: Card): SchedulerResult {
  return {
    srsState: STATE_TO_SRS[card.state],
    stability: card.stability,
    difficulty: card.difficulty,
    fsrsDueAt: card.due,
    reps: card.reps,
    lapses: card.lapses,
  };
}

export function formatIntervalLabel(dueAt: Date, now: Date): string {
  const ms = dueAt.getTime() - now.getTime();
  if (ms <= 0) return '<1m';
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `<${Math.max(1, minutes)}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return hours === 1 ? '1h' : `${hours}h`;
  const days = Math.round(hours / 24);
  if (days < 30) return days === 1 ? '1d' : `${days}d`;
  const months = Math.round(days / 30);
  return months === 1 ? '1mo' : `${months}mo`;
}

export class FsrsScheduler implements SchedulerService {
  preview(card: SchedulerCard, now: Date): Record<Grade, { intervalLabel: string; dueAt: Date }> {
    const fsrsCard = toCard(card);
    const record = engine.repeat(fsrsCard, now);
    const grades: Grade[] = ['again', 'hard', 'good', 'easy'];
    return Object.fromEntries(
      grades.map((grade) => {
        const rated = record[GRADE_MAP[grade]].card;
        return [grade, { intervalLabel: formatIntervalLabel(rated.due, now), dueAt: rated.due }];
      }),
    ) as Record<Grade, { intervalLabel: string; dueAt: Date }>;
  }

  applyGrade(card: SchedulerCard, grade: Grade, reviewedAt: Date): SchedulerResult {
    const fsrsCard = toCard(card);
    const record = engine.next(fsrsCard, reviewedAt, GRADE_MAP[grade]);
    return fromCard(record.card);
  }
}

export const defaultFsrsScheduler: SchedulerService = new FsrsScheduler();
