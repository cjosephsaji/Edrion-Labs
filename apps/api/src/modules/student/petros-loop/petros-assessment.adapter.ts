import {
  petrosAssessmentSchema,
  unknownAssessmentConditions,
  type PetrosAnswerEvaluation,
  type PetrosAssessmentConditions,
} from '@edrion/schemas';

/** Prior persisted facts only; support generated for the current answer is excluded. */
export function objectiveAssessment(input: {
  evaluation: PetrosAnswerEvaluation;
  evaluator: 'deterministic' | 'ai' | 'safe_fallback';
  evaluatorVersion: string;
  collectedAt: string;
  responseType: string;
  prior: Array<{ type: string; payload: Record<string, unknown> }>;
}) {
  const c = unknownAssessmentConditions(input.collectedAt);
  const fact = <T>(value: T) => ({
    value,
    basis: 'system_observed' as const,
    actor: { kind: 'system' as const, id: 'petros.loop' },
    method: 'persisted_observation_history',
    recordedAt: input.collectedAt,
  });
  const answers = input.prior.filter((o) => o.type === 'answer_submitted');
  const hints = input.prior.filter(
    (o) =>
      o.type === 'hint_requested' ||
      (o.type === 'answer_submitted' &&
        ['hint', 'missing_step'].includes(String(o.payload.supportKind))),
  );
  const exposed = answers.some(
    (o) => o.payload.supportKind === 'worked_solution' || o.payload.supportKind === 'stuck_path',
  );
  c.modality = [
    fact(input.responseType === 'single_choice' ? 'interactive' : 'written'),
  ] as PetrosAssessmentConditions['modality'];
  c.petrosAssistance = [fact({ hintCount: Math.min(100, hints.length), suppliedAnswer: exposed })];
  c.answerExposure = [fact(exposed ? 'exposed' : 'not_observed')];
  c.attempt = [fact(answers.length ? 'repeat_equivalent' : 'first_observed')];
  return petrosAssessmentSchema.parse({
    schemaVersion: 'petros.assessment.v1',
    origin: 'petros_objective',
    conditions: c,
    result: {
      kind: 'objective',
      judgment:
        input.evaluator === 'safe_fallback'
          ? { status: 'not_evaluated', reason: 'evaluator_unavailable' }
          : input.evaluation.correctness === 'invalid'
            ? { status: 'not_evaluated', reason: 'invalid_response' }
            : {
                status: 'evaluated',
                outcome:
                  input.evaluation.correctness === 'incorrect'
                    ? 'wrong'
                    : input.evaluation.correctness,
                creditBasisPoints: Math.round(input.evaluation.credit * 10_000),
              },
      feedback: input.evaluation.feedback,
      evidence: input.evaluation.evidence,
      provenance: {
        evaluator:
          input.evaluator === 'ai'
            ? 'model'
            : input.evaluator === 'safe_fallback'
              ? 'unavailable'
              : 'deterministic',
        evaluatorVersion: input.evaluatorVersion,
        evaluatedAt: input.collectedAt,
        uncertainty: input.evaluator === 'deterministic' ? 'low' : 'unknown',
        review: 'not_required',
      },
    },
  });
}
