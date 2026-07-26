import { describe, expect, it } from 'vitest';
import {
  labExamQuestionSchema,
  fillBlankQuestionSchema,
  isDuplicatePrompt,
  jaccardSimilarity,
  normalizeFillBlankAnswer,
  normalizePromptForDedup,
  numericalMatches,
  numericalQuestionSchema,
  mcqSingleQuestionSchema,
} from './exam-questions';
import {
  defaultBlueprintForTemplate,
  examBlueprintSchema,
  examBlueprintTotalMarks,
  examTemplateAllowsPause,
} from './exam-blueprint';
import { deriveTopicVerdicts, deriveVerdictFromMarks } from './exam-grading';

const baseQ = {
  id: '11111111-1111-4111-8111-111111111111',
  topicLabel: 'Photosynthesis',
  difficulty: 'balanced' as const,
  marks: 1,
  blueprintSectionId: 'sec-a',
  explanation: 'Chloroplasts convert light energy.',
  schemaVersion: 1 as const,
  prompt: 'What is the site of photosynthesis?',
};

describe('normalizeFillBlankAnswer', () => {
  it('collapses whitespace and lowercases by default', () => {
    expect(normalizeFillBlankAnswer('  Hello   World  ')).toBe('hello world');
  });

  it('respects caseInsensitive=false', () => {
    expect(normalizeFillBlankAnswer('Hello', { caseInsensitive: false })).toBe('Hello');
  });

  it('matches accepted answers after normalization', () => {
    const q = fillBlankQuestionSchema.parse({
      ...baseQ,
      type: 'fill_blank',
      acceptedAnswers: ['mitochondria', 'the mitochondria'],
      normalization: { caseInsensitive: true, collapseWhitespace: true },
    });
    const given = normalizeFillBlankAnswer('  The   Mitochondria ', q.normalization);
    const ok = q.acceptedAnswers.some(
      (a) => normalizeFillBlankAnswer(a, q.normalization) === given,
    );
    expect(ok).toBe(true);
  });
});

describe('numericalMatches', () => {
  it('accepts values within tolerance', () => {
    expect(numericalMatches(3.141, 3.14, 0.01)).toBe(true);
    expect(numericalMatches(3.16, 3.14, 0.01)).toBe(false);
  });

  it('rejects non-finite', () => {
    expect(numericalMatches(Number.NaN, 1, 0.01)).toBe(false);
  });

  it('parses numerical question schema', () => {
    const q = numericalQuestionSchema.parse({
      ...baseQ,
      type: 'numerical',
      expectedValue: 9.8,
      tolerance: 0.1,
      unit: 'm/s²',
      stepRubric: [{ stepId: 's1', description: 'Write g', marks: 1 }],
    });
    expect(numericalMatches(9.75, q.expectedValue, q.tolerance)).toBe(true);
  });
});

describe('dedup Jaccard', () => {
  it('tokenizes prompts', () => {
    expect(normalizePromptForDedup('What is 2+2?')).toEqual(['what', 'is']);
  });

  it('detects near-duplicates at 0.85', () => {
    const a = 'Explain the process of photosynthesis in green plants carefully';
    const b = 'Explain the process of photosynthesis in green plants carefully today';
    expect(isDuplicatePrompt(a, b)).toBe(true);
  });

  it('allows distinct prompts', () => {
    expect(isDuplicatePrompt('Define osmosis', 'List the planets in order')).toBe(false);
  });

  it('jaccard is 1 for identical token sets', () => {
    expect(jaccardSimilarity(['a', 'b'], ['b', 'a'])).toBe(1);
  });
});

describe('labExamQuestionSchema', () => {
  it('accepts mcq_single with 4 options', () => {
    const q = mcqSingleQuestionSchema.parse({
      ...baseQ,
      type: 'mcq_single',
      options: [
        { key: 'a', label: 'Nucleus' },
        { key: 'b', label: 'Chloroplast', distractorRationale: 'Correct organelle' },
        { key: 'c', label: 'Ribosome' },
        { key: 'd', label: 'Vacuole' },
      ],
      correctKey: 'b',
    });
    expect(labExamQuestionSchema.parse(q).type).toBe('mcq_single');
  });

  it('rejects mcq with fewer than 4 options', () => {
    expect(() =>
      mcqSingleQuestionSchema.parse({
        ...baseQ,
        type: 'mcq_single',
        options: [
          { key: 'a', label: 'A' },
          { key: 'b', label: 'B' },
        ],
        correctKey: 'a',
      }),
    ).toThrow();
  });
});

describe('examBlueprintSchema', () => {
  it('builds quick_check defaults and allows pause', () => {
    const bp = defaultBlueprintForTemplate('quick_check', {
      subjectLabel: 'Biology',
      topicWeights: [{ topicLabel: 'Cells', weight: 5 }],
    });
    expect(examTemplateAllowsPause(bp.template)).toBe(true);
    expect(examBlueprintTotalMarks(bp)).toBe(10);
    expect(examBlueprintSchema.parse(bp).durationMin).toBe(10);
  });

  it('denies pause for board_pattern', () => {
    expect(examTemplateAllowsPause('board_pattern')).toBe(false);
  });

  it('rejects quick_check over 15 minutes', () => {
    expect(() =>
      examBlueprintSchema.parse({
        ...defaultBlueprintForTemplate('quick_check', {
          subjectLabel: 'Math',
          topicWeights: [{ topicLabel: 'Algebra', weight: 5 }],
        }),
        durationMin: 30,
      }),
    ).toThrow();
  });
});

describe('deriveVerdictFromMarks', () => {
  it('maps full / partial / zero', () => {
    expect(deriveVerdictFromMarks(5, 5)).toBe('solid');
    expect(deriveVerdictFromMarks(2, 5)).toBe('slipped');
    expect(deriveVerdictFromMarks(0, 5)).toBe('missed');
  });

  it('aggregates topic rows', () => {
    const rows = deriveTopicVerdicts([
      { topicLabel: 'Algebra', awardedMarks: 2, maxMarks: 2 },
      { topicLabel: 'Algebra', awardedMarks: 0, maxMarks: 2 },
      { topicLabel: 'Geometry', awardedMarks: 0, maxMarks: 3 },
    ]);
    const algebra = rows.find((r) => r.topicLabel === 'Algebra')!;
    expect(algebra.verdict).toBe('slipped');
    expect(algebra.questionCount).toBe(2);
    expect(rows.find((r) => r.topicLabel === 'Geometry')!.verdict).toBe('missed');
  });
});
