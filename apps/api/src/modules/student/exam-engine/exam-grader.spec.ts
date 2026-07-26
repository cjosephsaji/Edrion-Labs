import { describe, expect, it } from 'vitest';
import { gradeExamObjective } from './exam-grader';
import type { ExamQuestion } from '@edrion/schemas';

const base = {
  id: '11111111-1111-4111-8111-111111111111',
  topicLabel: 'Algebra',
  difficulty: 'balanced' as const,
  marks: 2,
  blueprintSectionId: 'sec-a',
  explanation: 'Because.',
  schemaVersion: 1 as const,
  prompt: 'Q?',
};

describe('gradeExamObjective', () => {
  it('grades mcq_single', () => {
    const q = {
      ...base,
      type: 'mcq_single' as const,
      options: [
        { key: 'a', label: 'A', distractorRationale: 'Common slip' },
        { key: 'b', label: 'B' },
        { key: 'c', label: 'C' },
        { key: 'd', label: 'D' },
      ],
      correctKey: 'b',
    } satisfies ExamQuestion;
    expect(gradeExamObjective(q, { choiceKey: 'b', clientUpdatedAt: new Date().toISOString() }).verdict).toBe(
      'solid',
    );
    const wrong = gradeExamObjective(q, { choiceKey: 'a', clientUpdatedAt: new Date().toISOString() });
    expect(wrong.verdict).toBe('missed');
    expect(wrong.distractorRationale).toBe('Common slip');
  });

  it('grades fill_blank with normalization', () => {
    const q = {
      ...base,
      type: 'fill_blank' as const,
      acceptedAnswers: ['mitochondria'],
      normalization: { caseInsensitive: true, collapseWhitespace: true },
    } satisfies ExamQuestion;
    expect(
      gradeExamObjective(q, { text: '  Mitochondria  ', clientUpdatedAt: new Date().toISOString() }).awardedMarks,
    ).toBe(2);
  });

  it('grades numerical with tolerance', () => {
    const q = {
      ...base,
      type: 'numerical' as const,
      expectedValue: 3.14,
      tolerance: 0.01,
    } satisfies ExamQuestion;
    expect(gradeExamObjective(q, { value: 3.141, clientUpdatedAt: new Date().toISOString() }).verdict).toBe(
      'solid',
    );
    expect(gradeExamObjective(q, { value: 3.2, clientUpdatedAt: new Date().toISOString() }).verdict).toBe(
      'missed',
    );
  });

  it('partial-credits match_following', () => {
    const q = {
      ...base,
      marks: 4,
      type: 'match_following' as const,
      left: [
        { key: '1', label: 'A' },
        { key: '2', label: 'B' },
      ],
      right: [
        { key: 'x', label: 'X' },
        { key: 'y', label: 'Y' },
      ],
      correctPairs: { '1': 'x', '2': 'y' },
    } satisfies ExamQuestion;
    const half = gradeExamObjective(q, {
      pairs: { '1': 'x', '2': 'x' },
      clientUpdatedAt: new Date().toISOString(),
    });
    expect(half.awardedMarks).toBe(2);
    expect(half.verdict).toBe('slipped');
  });
});
