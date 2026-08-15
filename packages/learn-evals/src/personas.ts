import type { EvalPersona } from './fixtures/topics';

export interface PersonaPolicy {
  id: EvalPersona;
  description: string;
  accuracy: number;
  confidence: 'sure' | 'think_so' | 'guessing';
  responseTimeMs: number;
  skips: boolean;
  prerequisiteAccuracy: number;
  questionBehavior: 'none' | 'relevant_detour';
  recovery: 'normal' | 'persistent_struggle';
}

export const PERSONA_POLICIES: Record<EvalPersona, PersonaPolicy> = {
  fast_confident: { id: 'fast_confident', description: 'Answers quickly and usually correctly with calibrated confidence.', accuracy: 0.92, confidence: 'sure', responseTimeMs: 1_500, skips: false, prerequisiteAccuracy: 0.9, questionBehavior: 'none', recovery: 'normal' },
  slow_careful: { id: 'slow_careful', description: 'Takes time, checks work, and answers carefully.', accuracy: 0.82, confidence: 'think_so', responseTimeMs: 9_000, skips: false, prerequisiteAccuracy: 0.8, questionBehavior: 'none', recovery: 'normal' },
  confidently_wrong: { id: 'confidently_wrong', description: 'Commits to a plausible misconception with high confidence.', accuracy: 0.18, confidence: 'sure', responseTimeMs: 2_500, skips: false, prerequisiteAccuracy: 0.3, questionBehavior: 'none', recovery: 'normal' },
  disengaged_skipping: { id: 'disengaged_skipping', description: 'Skips optional depth and delays or omits responses.', accuracy: 0.45, confidence: 'guessing', responseTimeMs: 15_000, skips: true, prerequisiteAccuracy: 0.45, questionBehavior: 'none', recovery: 'normal' },
  weak_prerequisites: { id: 'weak_prerequisites', description: 'Misses foundation checks but responds to a focused detour.', accuracy: 0.5, confidence: 'think_so', responseTimeMs: 7_000, skips: false, prerequisiteAccuracy: 0.05, questionBehavior: 'none', recovery: 'normal' },
  relevant_detour: { id: 'relevant_detour', description: 'Asks one relevant side question and then returns to the goal.', accuracy: 0.72, confidence: 'think_so', responseTimeMs: 5_000, skips: false, prerequisiteAccuracy: 0.7, questionBehavior: 'relevant_detour', recovery: 'normal' },
  unsure_but_correct: { id: 'unsure_but_correct', description: 'Usually answers correctly but marks the answer as uncertain.', accuracy: 0.9, confidence: 'guessing', responseTimeMs: 6_000, skips: false, prerequisiteAccuracy: 0.85, questionBehavior: 'none', recovery: 'normal' },
  repeated_struggle: { id: 'repeated_struggle', description: 'Fails the same target three times and tests the complete struggle ladder.', accuracy: 0.05, confidence: 'guessing', responseTimeMs: 8_000, skips: false, prerequisiteAccuracy: 0.25, questionBehavior: 'none', recovery: 'persistent_struggle' },
};

/** Seeded LCG used only inside synthetic evaluation sessions. */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

export function sessionSeed(runSeed: number, caseId: string, persona: string): number {
  let hash = runSeed >>> 0;
  for (const character of `${caseId}::${persona}`) {
    hash = Math.imul(hash ^ character.charCodeAt(0), 16777619) >>> 0;
  }
  return hash;
}
