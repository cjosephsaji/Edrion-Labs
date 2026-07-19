import { describe, expect, it } from 'vitest';
import { gradeObjective, isAutoGradable } from './objective-grader';

describe('gradeObjective matching', () => {
  it('scores a perfect matching map from answerJson', () => {
    const result = gradeObjective(
      {
        qtype: 'matching',
        correctKey: null,
        marks: 5,
        config: {
          matching: {
            answerKey: { L1: 'R2', L2: 'R1' },
          },
        },
      },
      {
        choiceKey: null,
        answerText: null,
        answerJson: { matches: { L1: 'R2', L2: 'R1' } },
      },
    );
    expect(result).toEqual({ autoCorrect: true, awardedMarks: 5, needsReview: false });
  });

  it('scores zero on incorrect matching', () => {
    const result = gradeObjective(
      {
        qtype: 'matching',
        correctKey: JSON.stringify({ L1: 'R1' }),
        marks: 2,
      },
      {
        choiceKey: null,
        answerText: null,
        answerJson: { matches: { L1: 'R2' } },
      },
    );
    expect(result.autoCorrect).toBe(false);
    expect(result.awardedMarks).toBe(0);
  });

  it('treats matching as auto-gradable', () => {
    expect(isAutoGradable('matching')).toBe(true);
    expect(isAutoGradable('file_upload')).toBe(false);
    expect(isAutoGradable('code')).toBe(false);
  });
});
