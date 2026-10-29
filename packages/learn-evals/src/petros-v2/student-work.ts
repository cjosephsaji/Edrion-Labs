import type { M4Snapshot } from '@edrion/schemas';
export function committedWorkReceipt(snapshot: M4Snapshot) {
  if (
    !snapshot.submission ||
    !snapshot.evaluation ||
    snapshot.evaluation.responseId !== snapshot.submission.id
  )
    throw new Error('M5_COMMITTED_EVALUATED_WORK_REQUIRED');
  return {
    responseId: snapshot.submission.id,
    response: snapshot.submission.response,
    evaluationId: snapshot.evaluation.id,
    checkpointId: snapshot.checkpointId,
    canvasRevision: snapshot.canvas?.revision ?? 0,
  };
}
