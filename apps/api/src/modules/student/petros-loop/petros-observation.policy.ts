import {
  PETROS_EVALUATION_SCHEMA_VERSION,
  type PetrosAnswerEvaluation,
  type PetrosConfidence,
} from '@edrion/schemas';

export interface EvaluationQuestion {
  responseType: string;
  acceptableAnswers: string[];
  correctChoiceId: string | null;
  hint: string;
  missingStep: string;
  workedSolution: string;
}

export interface ConfidenceFlags {
  highValueMisconception: boolean;
  fragileSuccess: boolean;
  uncertaintyRecorded: boolean;
}

export interface LadderTransition {
  countedWrong: boolean;
  wrongAttemptCount: number;
  ladderLevel: number;
  status: 'active' | 'reworded' | 'recovered' | 'stuck_support' | 'observed';
  supportKind: 'none' | 'hint' | 'missing_step' | 'worked_solution' | 'stuck_path';
  supportText: string | null;
  needsRewordedQuestion: boolean;
  needsFollowupQuestion: boolean;
  recovery: boolean;
}

export function confidenceFlags(
  correctness: PetrosAnswerEvaluation['correctness'],
  confidence: PetrosConfidence,
): ConfidenceFlags {
  return {
    highValueMisconception: correctness === 'incorrect' && confidence === 'sure',
    fragileSuccess: correctness === 'correct' && confidence !== 'sure',
    uncertaintyRecorded: confidence === 'guessing',
  };
}

export function deterministicEvaluate(
  question: EvaluationQuestion,
  rawAnswer: string,
): PetrosAnswerEvaluation {
  const answer = normalize(rawAnswer);
  if (!answer) return invalidEvaluation();
  const accepted =
    question.responseType === 'single_choice'
      ? Boolean(question.correctChoiceId) && answer === normalize(question.correctChoiceId ?? '')
      : question.acceptableAnswers.some((candidate) => answer === normalize(candidate));
  if (accepted) {
    return {
      schemaVersion: PETROS_EVALUATION_SCHEMA_VERSION,
      correctness: 'correct',
      credit: 1,
      evidence: ['The committed response matches the registered answer contract.'],
      errorClass: 'none',
      misconception: null,
      feedback: 'That works. Your response matches the target idea.',
      safeNextHint: null,
    };
  }
  return {
    schemaVersion: PETROS_EVALUATION_SCHEMA_VERSION,
    correctness: 'incorrect',
    credit: 0,
    evidence: ['The committed response does not match the registered answer contract.'],
    errorClass: 'concept_gap',
    misconception: null,
    feedback: 'Not yet. Keep the same target in view and use the next support step.',
    safeNextHint: question.hint,
  };
}

export function safeFallbackEvaluation(rawAnswer: string): PetrosAnswerEvaluation {
  if (!normalize(rawAnswer)) return invalidEvaluation();
  return {
    schemaVersion: PETROS_EVALUATION_SCHEMA_VERSION,
    correctness: 'partial',
    credit: 0.5,
    evidence: ['The response was recorded, but automated evaluation was unavailable.'],
    errorClass: 'unknown',
    misconception: null,
    feedback:
      'Your attempt is saved. We could not verify it safely, so it will not count as a wrong attempt.',
    safeNextHint: 'Compare your response with the key relationship named in the question.',
  };
}

export function ladderTransition(
  previousWrongCount: number,
  previousStatus: string | undefined,
  evaluation: PetrosAnswerEvaluation,
  question: Pick<EvaluationQuestion, 'hint' | 'missingStep' | 'workedSolution'>,
): LadderTransition {
  if (evaluation.correctness === 'correct') {
    return {
      countedWrong: false,
      wrongAttemptCount: previousWrongCount,
      ladderLevel: 0,
      status: 'recovered',
      supportKind: 'none',
      supportText: null,
      needsRewordedQuestion: false,
      needsFollowupQuestion: false,
      recovery: previousWrongCount > 0 || previousStatus === 'reworded',
    };
  }
  if (evaluation.correctness === 'partial' || evaluation.correctness === 'invalid') {
    return {
      countedWrong: false,
      wrongAttemptCount: previousWrongCount,
      ladderLevel: Math.min(previousWrongCount, 4),
      status: previousStatus === 'reworded' ? 'reworded' : 'active',
      supportKind: 'none',
      supportText: evaluation.safeNextHint,
      needsRewordedQuestion: false,
      needsFollowupQuestion: true,
      recovery: false,
    };
  }
  const wrongAttemptCount = previousWrongCount + 1;
  if (wrongAttemptCount === 1)
    return transition(wrongAttemptCount, 'active', 'hint', question.hint);
  if (wrongAttemptCount === 2)
    return transition(wrongAttemptCount, 'active', 'missing_step', question.missingStep);
  if (wrongAttemptCount === 3) {
    return {
      ...transition(wrongAttemptCount, 'reworded', 'worked_solution', question.workedSolution),
      needsRewordedQuestion: true,
      needsFollowupQuestion: true,
    };
  }
  return transition(
    wrongAttemptCount,
    'stuck_support',
    'stuck_path',
    'This stretch is still open. Pause here, review the worked solution, or ask for a short teacher handoff that names exactly where the attempt broke.',
  );
}

function transition(
  wrongAttemptCount: number,
  status: LadderTransition['status'],
  supportKind: LadderTransition['supportKind'],
  supportText: string,
): LadderTransition {
  return {
    countedWrong: true,
    wrongAttemptCount,
    ladderLevel: Math.min(wrongAttemptCount, 4),
    status,
    supportKind,
    supportText,
    needsRewordedQuestion: false,
    needsFollowupQuestion: status !== 'stuck_support',
    recovery: false,
  };
}

function invalidEvaluation(): PetrosAnswerEvaluation {
  return {
    schemaVersion: PETROS_EVALUATION_SCHEMA_VERSION,
    correctness: 'invalid',
    credit: 0,
    evidence: ['No evaluable response was supplied.'],
    errorClass: 'invalid_input',
    misconception: null,
    feedback: 'Add a response before committing this attempt.',
    safeNextHint: null,
  };
}

function normalize(value: string) {
  return value.trim().toLocaleLowerCase().replace(/\s+/g, ' ');
}
