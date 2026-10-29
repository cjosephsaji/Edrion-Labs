import type { InstructionalDecision } from '@edrion/schemas';
export function decisionIsEvidenceBound(decision: InstructionalDecision, evaluationId: string) {
  return (
    decision.evidenceIds.includes(evaluationId) &&
    !!decision.expectedObservation &&
    !!decision.reason &&
    decision.origin !== 'genuine_model'
  );
}
