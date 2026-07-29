/**
 * Learn visual system — extracted from design tokens + Learn home.
 * Session UI and block surfaces must derive from these, not approximate.
 *
 * Surfaces: ivory page, white/near-white cards, soft warm borders.
 * Emerald is loud — once or twice per screen.
 * Colour meaning: emerald = confirmed/correct; amber = attention/wrong;
 * neutral grey = recorded-unjudged; red = system failure only.
 */

export const LEARN_VISUAL = {
  page: '#F3F0E7',
  card: '#FFFFFF',
  cardAlt: '#FBFAF4',
  surface2: '#F5F2E8',
  bd1: '#E6E2D4',
  bd2: '#DDD8C8',
  divider: '#F0EDE1',
  ink: '#17251F',
  inkSoft: '#43514A',
  muted: '#55645C',
  faint: '#8A968F',
  accent: '#1E7A5E',
  accentDeep: '#0C3F31',
  accentSoft: '#E3EFE8',
  accentBd: '#C8DDD1',
  amber: '#B9741F',
  amberSoft: '#FCF6EB',
  amberBd: '#EAD9BC',
  amberInk: '#8F5716',
  cream: '#F6F3E9',
  heroFrom: '#0C3F31',
  heroTo: '#155844',
  heroShadow: '0_16px_36px_-20px_rgba(12,63,49,0.6)',
  readingMax: 'max-w-[680px]',
  radiusCard: 'rounded-[18px]',
  radiusChip: 'rounded-full',
} as const;

export type LearnGoal =
  | 'learn'
  | 'practice'
  | 'revise'
  | 'quick'
  | 'from_notes'
  | 'continue';

export const LEARN_GOAL_LABELS: Record<LearnGoal, string> = {
  learn: 'Learn something new',
  practice: 'Practice',
  revise: 'Revise',
  quick: 'Quick question',
  from_notes: 'Study from my notes',
  continue: 'Continue where I left off',
};

/** Block surface treatments — distinguishable from three feet away. */
export type LearnSurface =
  | 'explanation'
  | 'worked_example'
  | 'question_set'
  | 'probe'
  | 'diagram'
  | 'checkpoint'
  | 'system_notice';

export type BlockVisualState =
  | 'loading'
  | 'streaming'
  | 'active'
  | 'completed'
  | 'correct'
  | 'wrong'
  | 'unjudged'
  | 'degraded';
