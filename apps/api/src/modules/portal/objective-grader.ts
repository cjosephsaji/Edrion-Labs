import type { QuestionType } from '@edrion/schemas';

export interface GradeableQuestion {
  qtype: string;
  correctKey: string | null;
  marks: number;
}

export interface GradeableAnswer {
  choiceKey: string | null;
  answerText: string | null;
}

export interface ObjectiveGradeResult {
  autoCorrect: boolean;
  awardedMarks: number;
  needsReview: boolean;
}

function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

function parseMultiKey(key: string | null): Set<string> {
  if (!key) return new Set();
  return new Set(key.split(',').map((k) => k.trim()).filter(Boolean));
}

function setsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}

function numericMatch(given: string | null, expected: string | null, tolerance = 0.01): boolean {
  if (!given || !expected) return false;
  const a = Number(given);
  const b = Number(expected);
  if (Number.isNaN(a) || Number.isNaN(b)) return false;
  return Math.abs(a - b) <= tolerance;
}

/** Deterministic auto-grader for objective question types. */
export function gradeObjective(
  question: GradeableQuestion,
  answer: GradeableAnswer,
): ObjectiveGradeResult {
  const qtype = question.qtype as QuestionType;
  const marks = question.marks;

  switch (qtype) {
    case 'mcq_single':
    case 'true_false': {
      const correct = !!answer.choiceKey && answer.choiceKey === question.correctKey;
      return { autoCorrect: correct, awardedMarks: correct ? marks : 0, needsReview: false };
    }
    case 'mcq_multi': {
      const given = parseMultiKey(answer.choiceKey);
      const expected = parseMultiKey(question.correctKey);
      const correct = setsEqual(given, expected);
      return { autoCorrect: correct, awardedMarks: correct ? marks : 0, needsReview: false };
    }
    case 'fill_blank': {
      const correct =
        !!answer.answerText &&
        !!question.correctKey &&
        normalize(answer.answerText) === normalize(question.correctKey);
      return { autoCorrect: correct, awardedMarks: correct ? marks : 0, needsReview: false };
    }
    case 'numeric': {
      const correct = numericMatch(answer.answerText, question.correctKey);
      return { autoCorrect: correct, awardedMarks: correct ? marks : 0, needsReview: false };
    }
    case 'short_answer':
    case 'long_answer':
    case 'matching':
    default:
      return { autoCorrect: false, awardedMarks: 0, needsReview: true };
  }
}

/** Whether a question type can be auto-graded deterministically. */
export function isAutoGradable(qtype: string): boolean {
  return ['mcq_single', 'mcq_multi', 'true_false', 'numeric', 'fill_blank'].includes(qtype);
}
