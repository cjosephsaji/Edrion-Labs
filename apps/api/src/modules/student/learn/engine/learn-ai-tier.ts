import type { LearnAiTier } from '../../learn-ai/provider';
import type { LearnModelTier } from './learn-config.service';

/** Map learn.* config tiers onto the provider's LearnAiTier vocabulary. */
export function configTierToAiTier(tier: LearnModelTier): LearnAiTier {
  return tier === 'mid' ? 'large' : 'small';
}

/** Outcome derivation rung 1b (hyperspec §1.4): evaluation.score ≥ threshold ⇒ correct. */
export const MASTERY_SCORE_CORRECT_THRESHOLD = 0.7;

/** Profiler inline miss budget (hyperspec §2.1). */
export const PROFILE_INLINE_TIMEOUT_MS = 4_000;

/** Short-dwell threshold for pace preference (§3.1 observe). Two shorts → 'fast'. */
export const PACE_SHORT_DWELL_MS = 3_000;
export const PACE_SHORT_DWELL_TRIGGER_COUNT = 2;
