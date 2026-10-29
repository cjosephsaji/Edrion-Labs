import { summarizeAdaptation, type AdaptationPair } from './adaptation';
import { assessmentIsBound } from './assessment';
import { decisionIsEvidenceBound } from './teaching-actions';
export function evaluateAdaptationRun(pairs: AdaptationPair[]) {
  const summary = summarizeAdaptation(pairs);
  const failures = pairs.flatMap((pair) =>
    pair.observations.flatMap((o, i) =>
      assessmentIsBound(o.evaluation, o.responseId) &&
      decisionIsEvidenceBound(o.actualDecision, o.evaluation.id) &&
      o.actualDecision.strategy === o.expectedStrategy
        ? []
        : [`${pair.id}:${i}`],
    ),
  );
  return {
    ...summary,
    failures,
    hardContracts: failures.length === 0 ? 'pass' : 'fail',
    minimumCases:
      summary.bySubject.cloud >= 20 && summary.bySubject.argument >= 20 ? 'pass' : 'fail',
  };
}
