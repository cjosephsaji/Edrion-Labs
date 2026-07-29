import type { EvalPersona } from './fixtures/topics';

export interface PersonaPolicy {
  correctProbability: number;
  /** Always reveal worked-example steps when available. */
  alwaysShowStep: boolean;
  /** Expand deeper once per session (struggling "simpler" / average curious). */
  expandDeeperOnce: boolean;
  expandDeeperProbability: number;
  askFreeQuestion: boolean;
  probeEscape: boolean;
  timeBudgetMinutes: number;
  goal: 'acquisition' | 'revision' | 'remediation';
  skipSynthesis: boolean;
}

export const PERSONA_POLICIES: Record<EvalPersona, PersonaPolicy> = {
  strong_fast: {
    correctProbability: 0.9,
    alwaysShowStep: true,
    expandDeeperOnce: false,
    expandDeeperProbability: 0,
    askFreeQuestion: false,
    probeEscape: false,
    timeBudgetMinutes: 15,
    goal: 'acquisition',
    skipSynthesis: false,
  },
  struggling: {
    correctProbability: 0.3,
    alwaysShowStep: false,
    expandDeeperOnce: true,
    expandDeeperProbability: 0,
    askFreeQuestion: false,
    probeEscape: false,
    timeBudgetMinutes: 15,
    goal: 'acquisition',
    skipSynthesis: false,
  },
  average_curious: {
    correctProbability: 0.6,
    alwaysShowStep: false,
    expandDeeperOnce: false,
    expandDeeperProbability: 0.5,
    askFreeQuestion: true,
    probeEscape: false,
    timeBudgetMinutes: 15,
    goal: 'acquisition',
    skipSynthesis: false,
  },
  probe_escaper: {
    correctProbability: 0.6,
    alwaysShowStep: false,
    expandDeeperOnce: false,
    expandDeeperProbability: 0,
    askFreeQuestion: false,
    probeEscape: true,
    timeBudgetMinutes: 15,
    goal: 'acquisition',
    skipSynthesis: false,
  },
  time_poor: {
    correctProbability: 0.7,
    alwaysShowStep: false,
    expandDeeperOnce: false,
    expandDeeperProbability: 0,
    askFreeQuestion: false,
    probeEscape: false,
    timeBudgetMinutes: 10,
    goal: 'acquisition',
    skipSynthesis: true,
  },
  revision_mode: {
    correctProbability: 0.75,
    alwaysShowStep: false,
    expandDeeperOnce: false,
    expandDeeperProbability: 0,
    askFreeQuestion: false,
    probeEscape: false,
    timeBudgetMinutes: 20,
    goal: 'revision',
    skipSynthesis: false,
  },
};

/** Seeded LCG — hyperspec §1.3 reproducibility. */
export function seededRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export function sessionSeed(runSeed: number, topicKey: string, persona: string): number {
  let h = runSeed >>> 0;
  const str = `${topicKey}::${persona}`;
  for (let i = 0; i < str.length; i += 1) {
    h = Math.imul(h ^ str.charCodeAt(i), 16777619) >>> 0;
  }
  return h;
}
