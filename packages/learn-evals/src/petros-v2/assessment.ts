import type { M4Evaluation } from '@edrion/schemas';
export function assessmentIsBound(result: M4Evaluation, responseId: string) {
  return (
    result.responseId === responseId &&
    result.criteria.length > 0 &&
    result.criteria.every((c) => c.status !== 'satisfied' || c.origin === 'trusted_kernel')
  );
}
