import {
  PETROS_REVIEW_SCHEDULER_VERSION,
  type PetrosSubmitArtifactReviewInput,
} from './petros-artifacts';

export interface PetrosReviewState {
  dueAt: Date;
  intervalDays: number;
  ease: number;
  reps: number;
  lapses: number;
}

export interface PetrosScheduleResult extends PetrosReviewState {
  schedulerVersion: typeof PETROS_REVIEW_SCHEDULER_VERSION;
  examAware: boolean;
  explanation: string;
}

const MINUTE = 60_000;
const DAY = 86_400_000;

/** Deterministic Stage 7 scheduling. AI never performs review arithmetic. */
export function schedulePetrosReview(input: {
  state: PetrosReviewState | null;
  grade: PetrosSubmitArtifactReviewInput['grade'];
  confidence: PetrosSubmitArtifactReviewInput['confidence'];
  reviewedAt: Date;
  timezone: string;
  examDate?: string | null;
}): PetrosScheduleResult {
  const previous = input.state ?? {
    dueAt: input.reviewedAt,
    intervalDays: 0,
    ease: 2.5,
    reps: 0,
    lapses: 0,
  };
  const confidenceFactor = input.confidence === 'sure' ? 1 : input.confidence === 'think_so' ? 0.8 : 0.55;
  let intervalDays: number;
  let lapses = previous.lapses;
  let ease = previous.ease;
  if (input.grade === 'again') {
    intervalDays = 10 / 1_440;
    lapses += 1;
    ease = Math.max(1.3, ease - 0.2);
  } else if (input.grade === 'hard') {
    intervalDays = Math.max(1, (previous.intervalDays || 1) * 1.2 * confidenceFactor);
    ease = Math.max(1.3, ease - 0.1);
  } else if (input.grade === 'good') {
    intervalDays = (previous.reps === 0 ? 3 : Math.max(2, previous.intervalDays * ease)) * confidenceFactor;
  } else {
    intervalDays = (previous.reps === 0 ? 5 : Math.max(4, previous.intervalDays * (ease + 0.5))) * confidenceFactor;
    ease = Math.min(3, ease + 0.05);
  }
  intervalDays = Math.max(10 / 1_440, Math.round(intervalDays * 100) / 100);

  const examTime = parseExamEnd(input.examDate, input.timezone);
  const daysToExam = examTime == null ? null : (examTime.getTime() - input.reviewedAt.getTime()) / DAY;
  let examAware = false;
  if (daysToExam != null && daysToExam > 0.25) {
    const safeCap = Math.max(0.25, Math.floor(daysToExam / 3));
    if (intervalDays > safeCap) {
      intervalDays = safeCap;
      examAware = true;
    }
  }

  const rawDue = new Date(input.reviewedAt.getTime() + intervalDays * DAY);
  const dueAt = intervalDays < 1 ? rawDue : atLocalReviewHour(rawDue, input.timezone, 9);
  const floor = new Date(input.reviewedAt.getTime() + 10 * MINUTE);
  const safeDue = dueAt < floor ? floor : dueAt;
  return {
    dueAt: safeDue,
    intervalDays,
    ease,
    reps: previous.reps + 1,
    lapses,
    schedulerVersion: PETROS_REVIEW_SCHEDULER_VERSION,
    examAware,
    explanation: examAware
      ? 'This interval was shortened safely because the known exam is approaching.'
      : input.confidence === 'guessing'
        ? 'This card returns sooner because the answer felt fragile.'
        : 'This interval follows your result and confidence on the card.',
  };
}

/** New cards first return the next local morning, never in the past. */
export function firstPetrosReview(now: Date, timezone: string, examDate?: string | null): PetrosScheduleResult {
  const tomorrow = new Date(now.getTime() + DAY);
  let dueAt = atLocalReviewHour(tomorrow, timezone, 9);
  if (dueAt <= now) dueAt = new Date(now.getTime() + DAY);
  const examTime = parseExamEnd(examDate, timezone);
  let examAware = false;
  if (examTime && examTime > now && dueAt >= examTime) {
    dueAt = new Date(Math.max(now.getTime() + 10 * MINUTE, examTime.getTime() - 12 * 60 * MINUTE));
    examAware = true;
  }
  return {
    dueAt,
    intervalDays: Math.max(10 / 1_440, (dueAt.getTime() - now.getTime()) / DAY),
    ease: 2.5,
    reps: 0,
    lapses: 0,
    schedulerVersion: PETROS_REVIEW_SCHEDULER_VERSION,
    examAware,
    explanation: examAware
      ? 'The first review is before the known exam.'
      : 'New cards first return on the next local study morning.',
  };
}

export function mixPetrosReviewTopics<T extends { topic: string }>(cards: T[]): T[] {
  const groups = new Map<string, T[]>();
  for (const card of cards) groups.set(card.topic, [...(groups.get(card.topic) ?? []), card]);
  const output: T[] = [];
  while (groups.size) {
    for (const [topic, group] of groups) {
      const card = group.shift();
      if (card) output.push(card);
      if (!group.length) groups.delete(topic);
    }
  }
  return output;
}

function parseExamEnd(examDate: string | null | undefined, timezone: string): Date | null {
  if (!examDate || !/^\d{4}-\d{2}-\d{2}$/.test(examDate)) return null;
  const [year, month, day] = examDate.split('-').map(Number) as [number, number, number];
  return zonedDateTimeToUtc(year, month, day, 23, 59, timezone);
}

function atLocalReviewHour(date: Date, timezone: string, hour: number): Date {
  const parts = zonedParts(date, timezone);
  return zonedDateTimeToUtc(parts.year, parts.month, parts.day, hour, 0, timezone);
}

function zonedDateTimeToUtc(year: number, month: number, day: number, hour: number, minute: number, timezone: string): Date {
  const targetAsUtc = Date.UTC(year, month - 1, day, hour, minute);
  let guess = targetAsUtc;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const local = zonedParts(new Date(guess), timezone);
    const represented = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute);
    guess += targetAsUtc - represented;
  }
  return new Date(guess);
}

function zonedParts(date: Date, timezone: string): { year: number; month: number; day: number; hour: number; minute: number } {
  let formatter: Intl.DateTimeFormat;
  try {
    formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
  } catch {
    formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
  }
  const values = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
  };
}
