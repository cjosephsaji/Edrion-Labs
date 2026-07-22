/** Edrion Learn orchestrator runtime defaults (namespace learn.*). */
export const LEARN_MOVE_CAP = 14;
export const LEARN_DEFAULT_SESSION_MINUTES = 15;
export const LEARN_MAX_FREE_QUESTIONS = 5;
export const LEARN_DAILY_SESSION_CAP = 12;
export const LEARN_PROFILE_TTL_DAYS = 180;
export const LEARN_PROBE_MAX_TURNS = 2;
export const LEARN_PROBE_MAX_CHAINS = 2;
export const LEARN_STATE_DIGEST_MAX_BYTES = 8 * 1024;
export const LEARN_TIME_WRAP_MINUTES_BEFORE_END = 3;
export const LEARN_TIME_EXTENSION_MINUTES = 5;
export const LEARN_PAUSED_ABANDON_HOURS = 24;

export const ORCHESTRATOR_ACTIVE_STATUSES = [
  'created',
  'active',
  'awaiting_response',
  'paused',
  'closing',
] as const;

export const NON_EXPOSITION_MOVES = new Set([
  'retrieval_check',
  'prereq_pulse',
  'socratic_probe',
]);

export const CLOSING_MOVES = new Set(['synthesis', 'artifact_commit']);
