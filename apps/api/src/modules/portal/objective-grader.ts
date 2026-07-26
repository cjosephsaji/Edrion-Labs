import type { QuestionType } from '@edrion/schemas';
import { AUTO_GRADABLE_TYPES } from '@edrion/schemas';

export interface GradeableQuestion {
  qtype: string;
  correctKey: string | null;
  marks: number;
  config?: Record<string, unknown> | null;
}

export interface GradeableAnswer {
  choiceKey: string | null;
  answerText: string | null;
  answerJson?: Record<string, unknown> | null;
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

function matchingMapsEqual(
  given: Record<string, string> | null | undefined,
  expected: Record<string, string> | null | undefined,
): boolean {
  if (!given || !expected) return false;
  const gKeys = Object.keys(given);
  const eKeys = Object.keys(expected);
  if (gKeys.length !== eKeys.length) return false;
  for (const k of eKeys) {
    if ((given[k] ?? '').trim() !== (expected[k] ?? '').trim()) return false;
  }
  return true;
}

function resolveMatchingAnswerKey(question: GradeableQuestion): Record<string, string> | null {
  const cfg = question.config?.matching as { answerKey?: Record<string, string> } | undefined;
  if (cfg?.answerKey && typeof cfg.answerKey === 'object') return cfg.answerKey;
  if (question.correctKey) {
    try {
      const parsed = JSON.parse(question.correctKey) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, string>;
      }
    } catch {
      /* ignore */
    }
  }
  return null;
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
      const tol =
        typeof (question.config?.numeric as { tolerance?: number } | undefined)?.tolerance === 'number'
          ? (question.config!.numeric as { tolerance: number }).tolerance
          : 0.01;
      const correct = numericMatch(answer.answerText, question.correctKey, tol);
      return { autoCorrect: correct, awardedMarks: correct ? marks : 0, needsReview: false };
    }
    case 'matching': {
      const expected = resolveMatchingAnswerKey(question);
      const given =
        (answer.answerJson?.matches as Record<string, string> | undefined) ??
        (() => {
          if (!answer.answerText) return null;
          try {
            return JSON.parse(answer.answerText) as Record<string, string>;
          } catch {
            return null;
          }
        })();
      const correct = matchingMapsEqual(given, expected);
      return { autoCorrect: correct, awardedMarks: correct ? marks : 0, needsReview: false };
    }
    case 'short_answer':
    case 'long_answer':
    case 'file_upload':
    case 'code':
    default:
      return { autoCorrect: false, awardedMarks: 0, needsReview: true };
  }
}

/** Whether a question type can be auto-graded deterministically. */
export function isAutoGradable(qtype: string): boolean {
  return AUTO_GRADABLE_TYPES.has(qtype);
}
