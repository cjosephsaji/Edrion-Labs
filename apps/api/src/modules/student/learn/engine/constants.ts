import type { LearnConfig } from './learn-config.service';

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

/**
 * Hyperspec 3 §2 knob set. These are the compile-time fallbacks: at runtime
 * every one of them resolves through LearnConfigService, which reads the
 * `learn_config` table and falls back to exactly this object when a key is
 * absent, the table is empty, or the row is malformed. An empty table is
 * therefore behaviourally identical to no config store at all.
 *
 * Note `render_model_tier: 'mid'` — that is the spec value. The renderer still
 * hardcodes 'small'; switching it to read config is a separate change.
 */
export const LEARN_CONFIG_DEFAULTS = {
  move_cap: LEARN_MOVE_CAP,
  profile_ttl_days: LEARN_PROFILE_TTL_DAYS,
  plan_model_tier: 'small',
  render_model_tier: 'mid',
  grade_model_tier: 'small',
  judge_model_tier: 'mid',
  profiler_model_tier: 'small',
  max_free_questions_per_session: LEARN_MAX_FREE_QUESTIONS,
  daily_session_cap_per_user: LEARN_DAILY_SESSION_CAP,
  speculative_planning: true,
  default_session_minutes: LEARN_DEFAULT_SESSION_MINUTES,
} as const satisfies LearnConfig;

/** The `learn.*` config key for each knob. */
export const LEARN_CONFIG_KEYS = {
  move_cap: 'learn.move_cap',
  profile_ttl_days: 'learn.profile_ttl_days',
  plan_model_tier: 'learn.plan_model_tier',
  render_model_tier: 'learn.render_model_tier',
  grade_model_tier: 'learn.grade_model_tier',
  judge_model_tier: 'learn.judge_model_tier',
  profiler_model_tier: 'learn.profiler_model_tier',
  max_free_questions_per_session: 'learn.max_free_questions_per_session',
  daily_session_cap_per_user: 'learn.daily_session_cap_per_user',
  speculative_planning: 'learn.speculative_planning',
  default_session_minutes: 'learn.default_session_minutes',
} as const satisfies Record<keyof LearnConfig, string>;

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
