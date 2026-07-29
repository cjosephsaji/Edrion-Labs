/**
 * Pure mock exam scorer — objective marks, negative marking, section optionality.
 * No I/O. Used by scoring jobs and golden/property tests.
 */
import {
  deriveVerdictFromMarks,
  isExamObjectiveType,
  type ExamBlueprintSection,
  type ExamQuestion,
  type ExamTopicVerdict,
  type SaveExamAnswerInput,
} from '@edrion/schemas';
import { gradeExamObjective } from './exam-grader';

export const MOCK_SCORING_VERSION = 'mock-scorer-v1';

export type MockScoredItem = {
  questionId: string;
  sectionId: string;
  awardedMarks: number;
  maxMarks: number;
  verdict: ExamTopicVerdict;
  objective: boolean;
  note?: string;
  distractorRationale?: string;
};

export type MockSectionScore = {
  sectionId: string;
  sectionName: string;
  awardedMarks: number;
  maxMarks: number;
};

export type MockScoreInput = {
  sections: ExamBlueprintSection[];
  questions: Array<{
    id: string;
    sectionId: string;
    marks: number;
    question: ExamQuestion;
  }>;
  answers: Map<string, SaveExamAnswerInput | Record<string, unknown> | null | undefined>;
};

export type MockScoreResult = {
  scoringVersion: string;
  awardedMarks: number;
  maxMarks: number;
  bySection: MockSectionScore[];
  items: MockScoredItem[];
};

function negativeDeduction(section: ExamBlueprintSection, marksPerQ: number): number {
  const neg = section.negative ?? { mode: 'none' as const, value: 0 };
  if (neg.mode === 'none') return 0;
  if (neg.mode === 'fixed') return Math.min(marksPerQ, Math.max(0, neg.value));
  // fraction of marks
  return Math.min(marksPerQ, Math.max(0, marksPerQ * neg.value));
}

/** Score one objective question with optional negative marking floor at 0 per item. */
export function scoreObjectiveItem(
  section: ExamBlueprintSection,
  question: ExamQuestion,
  answer: SaveExamAnswerInput | Record<string, unknown> | null | undefined,
): Omit<MockScoredItem, 'questionId' | 'sectionId'> {
  if (!isExamObjectiveType(question.type)) {
    return {
      awardedMarks: 0,
      maxMarks: question.marks,
      verdict: 'missed',
      objective: false,
      note: 'Subjective — awaiting self-grade',
    };
  }
  const obj = gradeExamObjective(question, answer);
  if (obj.awardedMarks > 0) {
    return { ...obj, objective: true };
  }
  // Wrong/blank: apply negative only when an answer was attempted
  const attempted =
    answer &&
    (typeof (answer as SaveExamAnswerInput).choiceKey === 'string' ||
      Array.isArray((answer as SaveExamAnswerInput).choiceKeys) ||
      typeof (answer as SaveExamAnswerInput).text === 'string' ||
      typeof (answer as SaveExamAnswerInput).value === 'number' ||
      (answer as SaveExamAnswerInput).pairs != null);
  if (!attempted) {
    return { awardedMarks: 0, maxMarks: obj.maxMarks, verdict: 'missed', objective: true, note: obj.note };
  }
  const ded = negativeDeduction(section, obj.maxMarks);
  const awarded = Math.max(0, -ded); // per-item floor 0 (no carry-negative across paper unless section later)
  // Spec: no negative below rules' floor — item-level floor is 0 after deduction from zero.
  return {
    awardedMarks: awarded === 0 && ded > 0 ? 0 : awarded,
    maxMarks: obj.maxMarks,
    verdict: deriveVerdictFromMarks(0, obj.maxMarks),
    objective: true,
    note: ded > 0 ? `Incorrect (−${ded} negative).` : obj.note,
    distractorRationale: obj.distractorRationale,
  };
}

/**
 * Apply section optionality: keep best `answerAny` answered scores; unanswered don't count toward max
 * when optionality is set — maxMarks uses answerAny × marksPerQuestion.
 */
export function scoreMockPaper(input: MockScoreInput): MockScoreResult {
  const items: MockScoredItem[] = [];
  const bySection: MockSectionScore[] = [];
  let awardedMarks = 0;
  let maxMarks = 0;

  for (const section of input.sections) {
    const secQs = input.questions.filter((q) => q.sectionId === section.id);
    const scored = secQs.map((q) => {
      const raw = scoreObjectiveItem(section, q.question, input.answers.get(q.id));
      return { questionId: q.id, sectionId: section.id, ...raw };
    });

    const opt = section.optionality?.answerAny;
    if (opt != null && opt < scored.length) {
      // Best N by awardedMarks among attempted; rest contribute 0 awarded but still listed
      const ranked = [...scored].sort((a, b) => b.awardedMarks - a.awardedMarks);
      const keep = new Set(ranked.slice(0, opt).map((s) => s.questionId));
      for (const s of scored) {
        if (!keep.has(s.questionId) && s.objective) {
          s.awardedMarks = 0;
          s.note = (s.note ? s.note + ' ' : '') + 'Outside optionality window (best scores kept).';
        }
      }
      const secAwarded = scored.reduce((sum, s) => sum + s.awardedMarks, 0);
      const secMax = opt * section.marksPerQuestion;
      items.push(...scored);
      bySection.push({
        sectionId: section.id,
        sectionName: section.name,
        awardedMarks: secAwarded,
        maxMarks: secMax,
      });
      awardedMarks += secAwarded;
      maxMarks += secMax;
    } else {
      const secAwarded = scored.reduce((sum, s) => sum + (s.objective ? s.awardedMarks : 0), 0);
      const secMax = scored.reduce((sum, s) => sum + s.maxMarks, 0);
      items.push(...scored);
      bySection.push({
        sectionId: section.id,
        sectionName: section.name,
        awardedMarks: secAwarded,
        maxMarks: secMax,
      });
      awardedMarks += secAwarded;
      maxMarks += secMax;
    }
  }

  return {
    scoringVersion: MOCK_SCORING_VERSION,
    awardedMarks,
    maxMarks,
    bySection,
    items,
  };
}
