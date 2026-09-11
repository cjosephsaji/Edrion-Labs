import { describe, expect, it } from 'vitest';
import type { PetrosLearningSessionDocument } from '@edrion/schemas';
import { learningEvidence } from './petros-learning-evidence';

function session(attempts: Array<Record<string, unknown>>) {
  return { checkpoints: [{ status: 'complete' }], elapsedSeconds: 9999, blocks: [{ questions: [{
    rootQuestionId: 'root', attempts: attempts.map((attempt, index) => ({
      correctness: 'correct', supportKind: 'none', ladderLevel: 0, fragileSuccess: false,
      confidence: 'sure', submittedAt: `2026-09-05T10:00:0${index}.000Z`, ...attempt,
    })),
  }] }] } as unknown as PetrosLearningSessionDocument;
}

describe('learning evidence', () => {
  it('does not confuse elapsed time or completed steps with understanding', () => {
    expect(learningEvidence(session([]))).toEqual({ independent: 0, supported: 0, revisit: 0, checked: 0 });
  });
  it('counts one independent first response and does not double count retries', () => {
    expect(learningEvidence(session([{}, {}])).independent).toBe(1);
  });
  it('keeps hinted, guessed, and fragile successes separate from independent checks', () => {
    for (const attempt of [{ supportKind: 'hint' }, { confidence: 'guessing' }, { fragileSuccess: true }]) {
      expect(learningEvidence(session([attempt]))).toMatchObject({ independent: 0, supported: 1 });
    }
  });
  it('does not promote an answer learned through retries to independent evidence', () => {
    expect(learningEvidence(session([{ correctness: 'incorrect' }, {}]))).toMatchObject({ independent: 0, supported: 1 });
    expect(learningEvidence(session([{ correctness: 'partial' }])).revisit).toBe(1);
    expect(learningEvidence(session([{}, { correctness: 'incorrect' }]))).toMatchObject({ independent: 0, revisit: 1 });
  });
});
