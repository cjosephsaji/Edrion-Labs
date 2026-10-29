import type { InstructionalDecision, M4Evaluation, M4Response } from '@edrion/schemas';
export type AdaptationObservation = {
  studentResponse: M4Response;
  responseId: string;
  responseHash: string;
  evaluation: M4Evaluation;
  actualDecision: InstructionalDecision;
  expectedStrategy: string;
  scopeHash: string;
  sourceHash: string;
  sourceRevisionId: string;
  availableCapabilities: string[];
  expectedEducationalOutcome: string;
  expertJudgment: null | { reviewer: string; qualified: boolean; suitable: boolean };
};
export type AdaptationPair = {
  id: string;
  subject: 'cloud' | 'argument';
  perturbation: string;
  observations: [AdaptationObservation, AdaptationObservation];
};
export function summarizeAdaptation(pairs: AdaptationPair[]) {
  const observations = pairs.flatMap((p) => p.observations),
    judged = observations.filter((o) => o.expertJudgment?.qualified);
  return {
    pairs: pairs.length,
    observations: observations.length,
    bySubject: {
      cloud: pairs.filter((p) => p.subject === 'cloud').length,
      argument: pairs.filter((p) => p.subject === 'argument').length,
    },
    engineeringPolicyMatches: observations.filter(
      (o) => o.actualDecision.strategy === o.expectedStrategy,
    ).length,
    expertJudged: judged.length,
    expertSuitable: judged.filter((o) => o.expertJudgment?.suitable).length,
    expertGate:
      judged.length === observations.length &&
      judged.length > 0 &&
      judged.filter((o) => o.expertJudgment?.suitable).length / judged.length >= 0.9
        ? 'pass'
        : 'pending',
    genuineInference: 'unverified',
    judgmentOrigin: 'engineering_authored_expected_strategy',
  };
}
