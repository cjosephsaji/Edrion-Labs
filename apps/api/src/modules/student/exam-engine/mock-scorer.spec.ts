import { describe, expect, it } from 'vitest';
import { scoreMockPaper, MOCK_SCORING_VERSION } from './mock-scorer';
import type { ExamBlueprintSection, ExamQuestion } from '@edrion/schemas';

const section = (over: Partial<ExamBlueprintSection> = {}): ExamBlueprintSection => ({
  id: 'sec-a',
  name: 'A',
  questionCount: 3,
  questionTypes: ['mcq_single'],
  marksPerQuestion: 4,
  negative: { mode: 'none', value: 0 },
  optionality: null,
  sectionTimeSec: null,
  shuffleQuestions: true,
  ...over,
});

const mcq = (id: string, correctKey: string): ExamQuestion =>
  ({
    id,
    type: 'mcq_single',
    topicLabel: 'T',
    difficulty: 'balanced',
    marks: 4,
    blueprintSectionId: 'sec-a',
    explanation: 'e',
    schemaVersion: 1,
    prompt: 'q',
    options: [
      { key: 'a', label: 'A' },
      { key: 'b', label: 'B' },
      { key: 'c', label: 'C' },
      { key: 'd', label: 'D' },
    ],
    correctKey,
  }) as ExamQuestion;

describe('mock-scorer', () => {
  it('scores objective paper', () => {
    const qs = [
      { id: '1', sectionId: 'sec-a', marks: 4, question: mcq('1', 'a') },
      { id: '2', sectionId: 'sec-a', marks: 4, question: mcq('2', 'b') },
    ];
    const answers = new Map([
      ['1', { choiceKey: 'a', clientUpdatedAt: new Date().toISOString() }],
      ['2', { choiceKey: 'a', clientUpdatedAt: new Date().toISOString() }],
    ]);
    const r = scoreMockPaper({ sections: [section()], questions: qs, answers });
    expect(r.scoringVersion).toBe(MOCK_SCORING_VERSION);
    expect(r.awardedMarks).toBe(4);
    expect(r.maxMarks).toBe(8);
  });

  it('keeps best answerAny of optionality', () => {
    const sec = section({
      questionCount: 3,
      optionality: { answerAny: 2 },
      marksPerQuestion: 10,
    });
    const qs = [1, 2, 3].map((n) => ({
      id: String(n),
      sectionId: 'sec-a',
      marks: 10,
      question: { ...mcq(String(n), 'a'), marks: 10 },
    }));
    const answers = new Map([
      ['1', { choiceKey: 'a', clientUpdatedAt: 't' }],
      ['2', { choiceKey: 'b', clientUpdatedAt: 't' }],
      ['3', { choiceKey: 'a', clientUpdatedAt: 't' }],
    ]);
    const r = scoreMockPaper({ sections: [sec], questions: qs, answers });
    expect(r.maxMarks).toBe(20);
    expect(r.awardedMarks).toBe(20);
  });
});
