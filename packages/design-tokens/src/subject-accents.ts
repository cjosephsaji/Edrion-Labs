/**
 * Closed set of subject accent tokens for graph nodes and comparison groups.
 * Persist token names only — never hex, rgb(), or CSS class names in graph JSON.
 */
export const SUBJECT_ACCENT_TOKENS = [
  'emerald',
  'ocean',
  'sky',
  'violet',
  'plum',
  'rose',
  'coral',
  'amber',
  'gold',
  'teal',
  'forest',
  'slate',
] as const;

export type SubjectAccentToken = (typeof SUBJECT_ACCENT_TOKENS)[number];
