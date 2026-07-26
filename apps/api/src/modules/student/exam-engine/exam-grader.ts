import {
  deriveVerdictFromMarks,
  isExamObjectiveType,
  normalizeFillBlankAnswer,
  numericalMatches,
  type ExamQuestion,
  type ExamTopicVerdict,
  type SaveExamAnswerInput,
} from '@edrion/schemas';

export interface ObjectiveGradeResult {
  awardedMarks: number;
  maxMarks: number;
  verdict: ExamTopicVerdict;
  note?: string;
  distractorRationale?: string;
  objective: true;
}

function setsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}

/** Deterministic grader for exam-engine objective types. */
export function gradeExamObjective(
  question: ExamQuestion,
  answer: SaveExamAnswerInput | Record<string, unknown> | null | undefined,
): ObjectiveGradeResult {
  const maxMarks = question.marks;
  const empty = (): ObjectiveGradeResult => ({
    awardedMarks: 0,
    maxMarks,
    verdict: 'missed',
    note: 'No answer given.',
    objective: true,
  });

  if (!answer || !isExamObjectiveType(question.type)) {
    return empty();
  }

  switch (question.type) {
    case 'mcq_single': {
      const key = typeof answer.choiceKey === 'string' ? answer.choiceKey : null;
      if (!key) return empty();
      const correct = key === question.correctKey;
      const picked = question.options.find((o) => o.key === key);
      return {
        awardedMarks: correct ? maxMarks : 0,
        maxMarks,
        verdict: correct ? 'solid' : 'missed',
        note: correct ? 'Correct.' : 'Incorrect option.',
        distractorRationale: !correct ? picked?.distractorRationale : undefined,
        objective: true,
      };
    }
    case 'mcq_multi': {
      const keys = Array.isArray(answer.choiceKeys)
        ? answer.choiceKeys.filter((k): k is string => typeof k === 'string')
        : typeof answer.choiceKey === 'string'
          ? answer.choiceKey.split(',').map((k) => k.trim()).filter(Boolean)
          : [];
      if (!keys.length) return empty();
      const correct = setsEqual(new Set(keys), new Set(question.correctKeys));
      return {
        awardedMarks: correct ? maxMarks : 0,
        maxMarks,
        verdict: correct ? 'solid' : keys.some((k) => question.correctKeys.includes(k)) ? 'slipped' : 'missed',
        note: correct ? 'All correct options selected.' : 'Selection did not match the key.',
        objective: true,
      };
    }
    case 'assertion_reason': {
      const key = typeof answer.choiceKey === 'string' ? answer.choiceKey : null;
      if (!key) return empty();
      const correct = key === question.correctKey;
      return {
        awardedMarks: correct ? maxMarks : 0,
        maxMarks,
        verdict: correct ? 'solid' : 'missed',
        note: correct ? 'Correct.' : 'Assertion–Reason option incorrect.',
        objective: true,
      };
    }
    case 'fill_blank': {
      const rec = answer as Record<string, unknown>;
      const text =
        typeof answer.text === 'string'
          ? answer.text
          : typeof rec.answerText === 'string'
            ? rec.answerText
            : null;
      if (!text?.trim()) return empty();
      const rules = question.normalization ?? { caseInsensitive: true, collapseWhitespace: true };
      const given = normalizeFillBlankAnswer(text, rules);
      const ok = question.acceptedAnswers.some((a) => normalizeFillBlankAnswer(a, rules) === given);
      if (!ok && rules.numericTolerance != null) {
        const n = Number(given);
        const match = question.acceptedAnswers.some((a) => {
          const expected = Number(normalizeFillBlankAnswer(a, rules));
          return Number.isFinite(n) && Number.isFinite(expected) && Math.abs(n - expected) <= rules.numericTolerance!;
        });
        if (match) {
          return { awardedMarks: maxMarks, maxMarks, verdict: 'solid', note: 'Within numeric tolerance.', objective: true };
        }
      }
      return {
        awardedMarks: ok ? maxMarks : 0,
        maxMarks,
        verdict: ok ? 'solid' : 'missed',
        note: ok ? 'Accepted answer.' : 'Did not match accepted answers.',
        objective: true,
      };
    }
    case 'match_following': {
      const pairs =
        answer.pairs && typeof answer.pairs === 'object' && !Array.isArray(answer.pairs)
          ? (answer.pairs as Record<string, string>)
          : null;
      if (!pairs) return empty();
      const expected = question.correctPairs;
      const leftKeys = Object.keys(expected);
      let hits = 0;
      for (const lk of leftKeys) {
        if (pairs[lk] === expected[lk]) hits += 1;
      }
      if (hits === 0) return { awardedMarks: 0, maxMarks, verdict: 'missed', note: 'No correct pairs.', objective: true };
      if (hits === leftKeys.length) {
        return { awardedMarks: maxMarks, maxMarks, verdict: 'solid', note: 'All pairs correct.', objective: true };
      }
      const awarded = Math.round((hits / leftKeys.length) * maxMarks);
      return {
        awardedMarks: awarded,
        maxMarks,
        verdict: deriveVerdictFromMarks(awarded, maxMarks),
        note: `${hits}/${leftKeys.length} pairs correct.`,
        objective: true,
      };
    }
    case 'numerical': {
      const rec = answer as Record<string, unknown>;
      const value =
        typeof answer.value === 'number'
          ? answer.value
          : typeof answer.text === 'string'
            ? Number(answer.text)
            : typeof rec.answerText === 'string'
              ? Number(rec.answerText)
              : NaN;
      if (!Number.isFinite(value)) return empty();
      const ok = numericalMatches(value, question.expectedValue, question.tolerance);
      // Step-marks are graded async when workingText is present; value-check is sync.
      return {
        awardedMarks: ok ? maxMarks : 0,
        maxMarks,
        verdict: ok ? 'solid' : 'missed',
        note: ok ? 'Within tolerance.' : 'Value outside tolerance.',
        objective: true,
      };
    }
    default:
      return empty();
  }
}

export function stripAnswerKeys(question: ExamQuestion): Record<string, unknown> {
  const base = { ...question } as Record<string, unknown>;
  delete base.correctKey;
  delete base.correctKeys;
  delete base.correctPairs;
  delete base.acceptedAnswers;
  delete base.expectedValue;
  delete base.explanation;
  if (Array.isArray(base.options)) {
    base.options = (base.options as Array<Record<string, unknown>>).map((o) => {
      const { distractorRationale: _d, ...rest } = o;
      return rest;
    });
  }
  if (question.type === 'case_based' && Array.isArray(question.subQuestions)) {
    base.subQuestions = question.subQuestions.map((sq) => stripAnswerKeys(sq as ExamQuestion));
  }
  if (question.type === 'short_answer') {
    // Keep expectedPoints descriptions for the student? No — hide marking detail until review.
    delete base.expectedPoints;
  }
  if (question.type === 'long_answer') delete base.rubric;
  if (question.type === 'numerical') delete base.stepRubric;
  return base;
}
