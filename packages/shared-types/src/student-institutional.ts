/** Transparency panel + learning-summary DTO source lists (Plan 03). */
export const STUDENT_SHARED_WITH_INSTITUTION = [
  'Topics completed count',
  'Weekly learning goal progress',
  'Evidence tags (strengths and growth areas)',
  'Session completion timestamps',
  'Practice attempt counts',
] as const;

export const STUDENT_NEVER_SHARED = [
  'Chat logs with Petros',
  'Scratchpad content',
  'Hint ladder detail',
  'Uploaded files before submission',
  'Library and lab activity',
] as const;

export type HomeworkAiPolicy = 'off' | 'hints_only' | 'full';

export const HOMEWORK_AI_POLICY_NOTES: Record<HomeworkAiPolicy, string> = {
  off: 'AI help is off for this homework. Your teacher set this — Petros will not answer homework questions.',
  hints_only: 'Hints only — Petros can explain concepts but will not give direct answers.',
  full: 'Full help — Petros can assist with this homework per your teacher\'s policy.',
};

/** 10-point grade band for college SGPA (Plan 03). */
export function gradePointFromPct(pct: number): number {
  if (pct >= 90) return 10;
  if (pct >= 80) return 9;
  if (pct >= 70) return 8;
  if (pct >= 60) return 7;
  if (pct >= 50) return 6;
  if (pct >= 45) return 5;
  return 0;
}
