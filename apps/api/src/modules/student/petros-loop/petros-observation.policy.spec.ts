import { describe, expect, it } from 'vitest';
import { PETROS_EVALUATION_SCHEMA_VERSION, type PetrosAnswerEvaluation } from '@edrion/schemas';
import {
  confidenceFlags,
  deterministicEvaluate,
  ladderTransition,
} from './petros-observation.policy';

const question = {
  responseType: 'single_choice',
  acceptableAnswers: [],
  correctChoiceId: 'correct',
  hint: 'Look at the command word.',
  missingStep: 'Identify the demand before choosing a method.',
  workedSolution: '1. Read the demand. 2. Select the fitting rule. 3. Check the result.',
};

function evaluation(correctness: PetrosAnswerEvaluation['correctness']): PetrosAnswerEvaluation {
  return {
    schemaVersion: PETROS_EVALUATION_SCHEMA_VERSION,
    correctness,
    credit: correctness === 'correct' ? 1 : correctness === 'partial' ? 0.5 : 0,
    evidence: ['Registered evidence'],
    errorClass:
      correctness === 'correct'
        ? 'none'
        : correctness === 'invalid'
          ? 'invalid_input'
          : 'concept_gap',
    misconception: null,
    feedback: 'Feedback notices the attempt.',
    safeNextHint: correctness === 'correct' ? null : 'Use the command word.',
  };
}

describe('Petros Stage 3 confidence matrix', () => {
  it.each([
    ['correct', 'sure', false, false],
    ['correct', 'think_so', false, true],
    ['incorrect', 'sure', true, false],
    ['incorrect', 'guessing', false, false],
  ] as const)(
    '%s + %s sets the intended flags',
    (correctness, confidence, misconception, fragile) => {
      expect(confidenceFlags(correctness, confidence)).toMatchObject({
        highValueMisconception: misconception,
        fragileSuccess: fragile,
        uncertaintyRecorded: confidence === 'guessing',
      });
    },
  );
});

describe('Petros Stage 3 struggle ladder', () => {
  it('moves through hint, missing step, worked solution, and a linked reworded chance exactly once', () => {
    const first = ladderTransition(0, 'active', evaluation('incorrect'), question);
    const second = ladderTransition(
      first.wrongAttemptCount,
      first.status,
      evaluation('incorrect'),
      question,
    );
    const third = ladderTransition(
      second.wrongAttemptCount,
      second.status,
      evaluation('incorrect'),
      question,
    );
    expect(first).toMatchObject({
      wrongAttemptCount: 1,
      ladderLevel: 1,
      supportKind: 'hint',
      needsFollowupQuestion: true,
    });
    expect(second).toMatchObject({
      wrongAttemptCount: 2,
      ladderLevel: 2,
      supportKind: 'missing_step',
      needsFollowupQuestion: true,
    });
    expect(third).toMatchObject({
      wrongAttemptCount: 3,
      ladderLevel: 3,
      supportKind: 'worked_solution',
      status: 'reworded',
      needsRewordedQuestion: true,
    });
  });

  it('closes a reworded stretch on earned success and never reports the earlier failure as the ending', () => {
    expect(ladderTransition(3, 'reworded', evaluation('correct'), question)).toMatchObject({
      status: 'recovered',
      recovery: true,
      supportKind: 'none',
      needsFollowupQuestion: false,
    });
  });

  it.each(['partial', 'invalid'] as const)(
    '%s does not count as conceptual failure',
    (correctness) => {
      expect(ladderTransition(1, 'active', evaluation(correctness), question)).toMatchObject({
        countedWrong: false,
        wrongAttemptCount: 1,
        ladderLevel: 1,
        needsFollowupQuestion: true,
      });
    },
  );

  it('offers a real pause or teacher path if the post-solution attempt remains stuck', () => {
    expect(ladderTransition(3, 'reworded', evaluation('incorrect'), question)).toMatchObject({
      status: 'stuck_support',
      supportKind: 'stuck_path',
      needsFollowupQuestion: false,
    });
  });
});

describe('deterministic objective evaluation', () => {
  it('scores registered choices without AI and treats malformed input as invalid', () => {
    expect(deterministicEvaluate(question, 'correct').correctness).toBe('correct');
    expect(deterministicEvaluate(question, 'wrong').correctness).toBe('incorrect');
    expect(deterministicEvaluate(question, '   ').correctness).toBe('invalid');
  });
});
