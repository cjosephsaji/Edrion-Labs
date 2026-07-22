import type { EvalPersona } from './fixtures/topics';

export interface PersonaPolicy {
  correctProbability: number;
  expandDeeper: boolean;
  probeEscape: boolean;
  timeBudgetMinutes: number;
  goal: 'acquisition' | 'revision' | 'remediation';
  skipSynthesis: boolean;
}

export const PERSONA_POLICIES: Record<EvalPersona, PersonaPolicy> = {
  strong_fast: { correctProbability: 0.9, expandDeeper: false, probeEscape: false, timeBudgetMinutes: 15, goal: 'acquisition', skipSynthesis: false },
  struggling: { correctProbability: 0.3, expandDeeper: false, probeEscape: false, timeBudgetMinutes: 15, goal: 'acquisition', skipSynthesis: false },
  average_curious: { correctProbability: 0.6, expandDeeper: true, probeEscape: false, timeBudgetMinutes: 15, goal: 'acquisition', skipSynthesis: false },
  probe_escaper: { correctProbability: 0.6, expandDeeper: false, probeEscape: true, timeBudgetMinutes: 15, goal: 'acquisition', skipSynthesis: false },
  time_poor: { correctProbability: 0.7, expandDeeper: false, probeEscape: false, timeBudgetMinutes: 10, goal: 'acquisition', skipSynthesis: true },
  revision_mode: { correctProbability: 0.75, expandDeeper: false, probeEscape: false, timeBudgetMinutes: 20, goal: 'revision', skipSynthesis: false },
};

/** Seeded RNG for reproducible persona answers. */
export function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}
