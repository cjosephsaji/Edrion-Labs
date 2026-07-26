/** Spaced-repetition scheduling (SM-lite). */
export const FLASHCARD_AGAIN_DELAY_MINUTES = 10;
export const FLASHCARD_INTERVAL_MULTIPLIER = 2.2;
export const FLASHCARD_MIN_INTERVAL_DAYS = 1;

/** Mock exam weak-topic retake threshold (selection only — never displayed). */
export const MOCK_WEAK_TOPIC_THRESHOLD = 0.7;

export type BadgeTier = 'bronze' | 'silver' | 'gold';

export interface BadgeTierThreshold {
  tier: BadgeTier;
  target: number;
  evidenceTemplate: (count: number) => string;
}

export interface BadgeDefinition {
  key: string;
  family: string;
  glyph: string;
  name: string;
  /** Ledger event types counted toward this badge. */
  eventTypes: string[];
  tiers: BadgeTierThreshold[];
  /** Optional predicate over aggregated counts — must not use durations or cross-student data. */
  predicate?: (counts: Record<string, number>, context: BadgePredicateContext) => boolean;
}

export interface BadgePredicateContext {
  /** Distinct calendar days with qualifying events in the current ISO week. */
  activeDaysThisWeek: number;
  /** Distinct ISO weeks (lifetime) meeting the weekly active-day threshold. */
  steadyWeeksLifetime: number;
  /** Days since last qualifying event before a return event. */
  gapDaysBeforeReturn: number | null;
  distinctTopicsCompleted: number;
  labVisits: number;
}

export const BADGE_FAMILIES: Record<string, string> = {
  consistency: 'Consistency',
  path: 'Path',
  curiosity: 'Curiosity',
  mastery: 'Mastery',
  lab: 'The Lab',
  milestones: 'Milestones',
};

export const STUDENT_BADGE_CATALOGUE: readonly BadgeDefinition[] = [
  {
    key: 'steady_week',
    family: 'consistency',
    glyph: '📅',
    name: 'Steady week',
    eventTypes: [
      'session.completed',
      'revision.completed',
      'quick.asked',
      'flashcards.reviewed',
      'practice_attempted',
    ],
    tiers: [
      { tier: 'bronze', target: 5, evidenceTemplate: (n) => `Active on ${n} different days in one week.` },
      { tier: 'silver', target: 4, evidenceTemplate: (n) => `Kept a steady rhythm across ${n} weeks.` },
      { tier: 'gold', target: 12, evidenceTemplate: (n) => `A year of steady weeks — ${n} and counting.` },
    ],
  },
  {
    key: 'back_for_more',
    family: 'consistency',
    glyph: '🌱',
    name: 'Back for more',
    eventTypes: ['session.started', 'session.completed'],
    tiers: [
      { tier: 'bronze', target: 1, evidenceTemplate: () => 'You came back after a break — welcome.' },
    ],
    predicate: (_c, ctx) => ctx.gapDaysBeforeReturn !== null && ctx.gapDaysBeforeReturn >= 7,
  },
  {
    key: 'full_fortnight',
    family: 'consistency',
    glyph: '✦',
    name: 'Full fortnight',
    eventTypes: ['session.completed', 'revision.completed', 'flashcards.reviewed'],
    tiers: [
      { tier: 'bronze', target: 10, evidenceTemplate: (n) => `Learning on ${n} days across two weeks.` },
      { tier: 'silver', target: 3, evidenceTemplate: (n) => `${n} fortnights with real momentum.` },
      { tier: 'gold', target: 8, evidenceTemplate: (n) => `${n} fortnights — a real habit forming.` },
    ],
  },
  {
    key: 'weekly_goal',
    family: 'consistency',
    glyph: '🎯',
    name: 'Weekly goal',
    eventTypes: ['goal.weekly_met'],
    tiers: [
      { tier: 'bronze', target: 1, evidenceTemplate: () => 'You hit your weekly goal.' },
      { tier: 'silver', target: 4, evidenceTemplate: (n) => `${n} weekly goals met.` },
      { tier: 'gold', target: 12, evidenceTemplate: (n) => `${n} weeks — goals kept.` },
    ],
  },
  {
    key: 'chapter_done',
    family: 'path',
    glyph: '📖',
    name: 'Chapter done',
    eventTypes: ['path.item_completed'],
    tiers: [
      { tier: 'bronze', target: 1, evidenceTemplate: () => 'A path chapter finished.' },
      { tier: 'silver', target: 5, evidenceTemplate: (n) => `${n} chapters completed on your path.` },
      { tier: 'gold', target: 15, evidenceTemplate: (n) => `${n} chapters — serious progress.` },
    ],
  },
  {
    key: 'path_pioneer',
    family: 'path',
    glyph: '🧭',
    name: 'Path pioneer',
    eventTypes: ['path.created', 'path.edited'],
    tiers: [
      { tier: 'bronze', target: 1, evidenceTemplate: () => 'You shaped your own learning path.' },
    ],
  },
  {
    key: 'explainer',
    family: 'mastery',
    glyph: '💬',
    name: 'Explainer',
    eventTypes: ['session.checkpoint_answered'],
    tiers: [
      { tier: 'bronze', target: 5, evidenceTemplate: (n) => `Explained your thinking ${n} times.` },
      { tier: 'silver', target: 20, evidenceTemplate: (n) => `${n} explain-backs — real understanding.` },
      { tier: 'gold', target: 50, evidenceTemplate: (n) => `${n} times you put ideas in your own words.` },
    ],
  },
  {
    key: 'detective',
    family: 'mastery',
    glyph: '🔍',
    name: 'Detective',
    eventTypes: ['session.practice_attempted'],
    tiers: [
      { tier: 'bronze', target: 10, evidenceTemplate: (n) => `${n} practice puzzles worked through.` },
      { tier: 'silver', target: 30, evidenceTemplate: (n) => `${n} practice sessions — persistent.` },
      { tier: 'gold', target: 75, evidenceTemplate: (n) => `${n} practice attempts logged.` },
    ],
  },
  {
    key: 'hint_free_solve',
    family: 'mastery',
    glyph: '✓',
    name: 'Hint-free solve',
    eventTypes: ['session.practice_attempted'],
    tiers: [
      { tier: 'bronze', target: 3, evidenceTemplate: (n) => `${n} practice items solved without hints.` },
      { tier: 'silver', target: 10, evidenceTemplate: (n) => `${n} hint-free solves.` },
      { tier: 'gold', target: 25, evidenceTemplate: (n) => `${n} times you worked it out yourself.` },
    ],
  },
  {
    key: 'curious_mind',
    family: 'curiosity',
    glyph: '✦',
    name: 'Curious mind',
    eventTypes: ['quick.asked', 'drawer.asked'],
    tiers: [
      { tier: 'bronze', target: 5, evidenceTemplate: (n) => `${n} questions asked along the way.` },
      { tier: 'silver', target: 20, evidenceTemplate: (n) => `${n} curious moments captured.` },
      { tier: 'gold', target: 50, evidenceTemplate: (n) => `${n} questions — always asking why.` },
    ],
  },
  {
    key: 'lab_visitor',
    family: 'lab',
    glyph: '🔬',
    name: 'Lab visitor',
    eventTypes: ['mock.completed', 'debate.completed', 'library.item_processed'],
    tiers: [
      { tier: 'bronze', target: 1, evidenceTemplate: () => 'You tried something in The Lab.' },
      { tier: 'silver', target: 5, evidenceTemplate: (n) => `${n} Lab sessions completed.` },
      { tier: 'gold', target: 15, evidenceTemplate: (n) => `${n} workshops in The Lab.` },
    ],
  },
  {
    key: 'first_debate',
    family: 'lab',
    glyph: '⚖️',
    name: 'First debate',
    eventTypes: ['debate.completed'],
    tiers: [
      { tier: 'bronze', target: 1, evidenceTemplate: () => 'Your first debate — arguments made.' },
    ],
  },
  {
    key: 'first_session',
    family: 'milestones',
    glyph: '🎓',
    name: 'First session',
    eventTypes: ['session.completed'],
    tiers: [
      { tier: 'bronze', target: 1, evidenceTemplate: () => 'Your first Learn session finished.' },
    ],
  },
  {
    key: 'first_deck',
    family: 'milestones',
    glyph: '🃏',
    name: 'First deck',
    eventTypes: ['flashcards.reviewed'],
    tiers: [
      { tier: 'bronze', target: 1, evidenceTemplate: () => 'You studied your first flashcard deck.' },
    ],
  },
  {
    key: 'first_mock',
    family: 'milestones',
    glyph: '📝',
    name: 'First mock',
    eventTypes: ['mock.completed'],
    tiers: [
      { tier: 'bronze', target: 1, evidenceTemplate: () => 'Your first mock test — evidence logged.' },
    ],
  },
] as const;

export function badgeByKey(key: string): BadgeDefinition | undefined {
  return STUDENT_BADGE_CATALOGUE.find((b) => b.key === key);
}
