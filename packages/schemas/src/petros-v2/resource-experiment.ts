import {
  observeResourceAllocation,
  type AllocationAttempt,
  type ResourceAllocation,
} from './resource-capacity';

/** Supplied by the durable command owner, never accepted from a canvas edit payload. */
export type AllocationCommandContext = {
  commandId: string;
  sessionId: string;
  at: string;
  sourceRevisionId: string;
  sourceHash: string;
};
export type AllocationProvenance = AllocationCommandContext & {
  activityId: string;
  branchId: string;
  elementId: string;
  sourceId: string;
  canvasRevision: number;
  operationIndex: number;
};
export const currentAllocationAttempt = (r: ResourceAllocation) =>
  r.attempts?.find((a) => a.id === r.activeAttemptId) ?? null;
export const allocationAttemptObservation = (r: ResourceAllocation, a: AllocationAttempt | null) =>
  a?.observedAt ? (r.observations.find((o) => o.attemptId === a.id) ?? null) : null;
function supersede(r: ResourceAllocation) {
  const a = currentAllocationAttempt(r);
  if (a && !['completed', 'cancelled', 'superseded'].includes(a.status))
    a.status = a.explanation ? 'completed' : 'superseded';
  r.activeAttemptId = null;
  r.prediction = null;
}
function create(
  r: ResourceAllocation,
  p: AllocationProvenance,
  requestedCount: number,
  operation: AllocationAttempt['operation'],
  prediction: AllocationAttempt['prediction'],
) {
  const initial = observeResourceAllocation(r.model, r.allocatedCount, r.allocatedCount);
  const a: AllocationAttempt = {
    id: `${p.commandId}:${p.operationIndex}`,
    sessionId: p.sessionId,
    activityId: p.activityId,
    branchId: p.branchId,
    elementId: p.elementId,
    sourceId: p.sourceId,
    sourceRevisionId: p.sourceRevisionId,
    sourceHash: p.sourceHash,
    modelRevision: JSON.stringify(r.model),
    model: structuredClone(r.model),
    kernel: r.model.kernel,
    initial: {
      allocatedCount: initial.allocatedCount,
      availableGB: initial.availableGB,
      allocatedGB: initial.allocatedGB,
      remainingGB: initial.remainingGB,
    },
    operation,
    requestedCount,
    prediction,
    predictedAt: prediction ? p.at : null,
    startedAt: p.at,
    observedAt: null,
    executedCount: null,
    initialCanvasRevision: p.canvasRevision - 1,
    canvasRevision: p.canvasRevision,
    status: prediction ? 'predicted' : 'completed',
    explanation: null,
  };
  r.attempts = [...(r.attempts ?? []), a].slice(-32);
  return a;
}
export function predictAllocation(
  r: ResourceAllocation,
  prediction: NonNullable<ResourceAllocation['prediction']>,
  p: AllocationProvenance,
) {
  supersede(r);
  const a = create(r, p, prediction.requestedCount, 'allocate', prediction);
  r.activeAttemptId = a.id;
  r.prediction = prediction;
}
export function executeAllocation(
  r: ResourceAllocation,
  requestedCount: number,
  student: boolean,
  p: AllocationProvenance,
  expectedAttemptId?: string,
) {
  let a = currentAllocationAttempt(r);
  if (expectedAttemptId && (expectedAttemptId !== a?.id || a.status !== 'predicted'))
    throw new Error('M5_STALE_ATTEMPT');
  if (student && requestedCount > r.allocatedCount) {
    if (
      !a ||
      a.status !== 'predicted' ||
      a.requestedCount !== requestedCount ||
      a.initial.allocatedCount !== r.allocatedCount ||
      a.modelRevision !== JSON.stringify(r.model) ||
      a.sessionId !== p.sessionId ||
      a.sourceRevisionId !== p.sourceRevisionId ||
      a.sourceHash !== p.sourceHash ||
      (expectedAttemptId && expectedAttemptId !== a.id)
    )
      throw new Error('M5_PREDICTION_REQUIRED');
  } else {
    supersede(r);
    a = create(
      r,
      p,
      requestedCount,
      !student ? 'demonstration' : requestedCount === 0 ? 'reset' : 'release',
      null,
    );
  }
  const o = {
    beforeCount: r.allocatedCount,
    requestedCount,
    prediction: a!.prediction,
    ...observeResourceAllocation(r.model, r.allocatedCount, requestedCount),
    attemptId: a!.id,
    observedAt: p.at,
    canvasRevision: p.canvasRevision,
  };
  a!.observedAt = p.at;
  a!.executedCount = requestedCount;
  a!.canvasRevision = p.canvasRevision;
  a!.status = a!.prediction ? 'observed' : 'completed';
  r.allocatedCount = o.allocatedCount;
  r.observations = [...r.observations, o].slice(-32);
  r.prediction = null;
  r.activeAttemptId = a!.prediction ? a!.id : null;
}
export function closeAllocationAttempt(
  r: ResourceAllocation,
  id: string,
  disposition: 'next' | 'cancel',
  revision: number,
) {
  const a = currentAllocationAttempt(r);
  if (!a || a.id !== id || (disposition === 'next' && a.status === 'predicted'))
    throw new Error('M5_STALE_ATTEMPT');
  a.status = disposition === 'cancel' ? 'cancelled' : 'completed';
  a.canvasRevision = revision;
  r.activeAttemptId = null;
  r.prediction = null;
}
export function explainAllocation(r: ResourceAllocation, text: string, p: AllocationProvenance) {
  const a = currentAllocationAttempt(r);
  if (a?.status === 'predicted') throw new Error('M5_OBSERVATION_REQUIRED');
  if (a && allocationAttemptObservation(r, a)) {
    if (!text.trim()) throw new Error('M5_EXPLANATION_REQUIRED');
    a.explanation = { text, at: p.at, canvasRevision: p.canvasRevision };
    a.status = 'explained';
    a.canvasRevision = p.canvasRevision;
  }
}
export function allocationExplanationReady(r: ResourceAllocation, annotation?: string) {
  if (currentAllocationAttempt(r)?.status === 'predicted') return false;
  const last = [...r.observations].reverse().find((o) => o.prediction);
  if (!last) return true;
  // Read-only compatibility for pre-attempt checkpoints. New receipts must join exactly.
  if (!r.attempts) return !!annotation?.trim();
  const a = r.attempts.find((a) => a.id === last.attemptId);
  return !!a?.explanation && a.explanation.text === annotation;
}
export function validateAllocationAttempts(r: ResourceAllocation) {
  const attempts = r.attempts ?? [];
  if (new Set(attempts.map((a) => a.id)).size !== attempts.length)
    throw new Error('M5_DUPLICATE_ATTEMPT');
  for (const a of attempts) {
    const initial = observeResourceAllocation(
      a.model,
      a.initial.allocatedCount,
      a.initial.allocatedCount,
    );
    if (
      a.modelRevision !== JSON.stringify(a.model) ||
      JSON.stringify(a.model) !== JSON.stringify(r.model) ||
      a.kernel !== r.model.kernel ||
      a.initial.availableGB !== initial.availableGB ||
      a.initial.allocatedGB !== initial.allocatedGB ||
      a.initial.remainingGB !== initial.remainingGB ||
      a.prediction?.requestedCount !== (a.prediction ? a.requestedCount : undefined) ||
      !!a.prediction !== !!a.predictedAt
    )
      throw new Error('M5_ATTEMPT_PIN_MISMATCH');
    const o = r.observations.find((o) => o.attemptId === a.id);
    if (
      (a.status === 'predicted' && (a.observedAt || a.executedCount !== null || a.explanation)) ||
      (['observed', 'explained'].includes(a.status) &&
        (!a.observedAt || a.executedCount !== a.requestedCount)) ||
      (a.status === 'explained' && !a.explanation)
    )
      throw new Error('M5_ATTEMPT_RESULT_MISMATCH');
    if (
      o &&
      (o.beforeCount !== a.initial.allocatedCount ||
        o.requestedCount !== a.requestedCount ||
        JSON.stringify(o.prediction) !== JSON.stringify(a.prediction) ||
        o.observedAt !== a.observedAt ||
        a.executedCount !== o.requestedCount)
    )
      throw new Error('M5_ATTEMPT_RESULT_MISMATCH');
    if (a.explanation && !a.observedAt) throw new Error('M5_OBSERVATION_REQUIRED');
  }
  const current = currentAllocationAttempt(r);
  if (r.activeAttemptId && !current) throw new Error('M5_STALE_ATTEMPT');
  if (current) {
    const o = allocationAttemptObservation(r, current);
    if (
      ['cancelled', 'superseded'].includes(current.status) ||
      (current.status === 'predicted' &&
        (JSON.stringify(current.prediction) !== JSON.stringify(r.prediction) ||
          current.initial.allocatedCount !== r.allocatedCount)) ||
      (current.observedAt && (!o || o.allocatedCount !== r.allocatedCount))
    )
      throw new Error('M5_STALE_ATTEMPT');
  } else if (r.attempts && r.prediction) throw new Error('M5_UNLINKED_PREDICTION');
}

/** Undo/redo restores acknowledged quantities, but never resurrects an old active test.
 * Superseded attempts stay in the same bounded history and earlier checkpoints. */
export function reconcileAllocationRestore(
  r: ResourceAllocation,
  prior: ResourceAllocation,
  p: AllocationProvenance,
) {
  const targetCount = r.allocatedCount;
  const combined = new Map(
    [...(r.attempts ?? []), ...(prior.attempts ?? [])].map((a) => [a.id, structuredClone(a)]),
  );
  for (const a of combined.values())
    if (['predicted', 'observed', 'explained'].includes(a.status)) a.status = 'superseded';
  r.attempts = [...combined.values()].slice(-31);
  r.prediction = null;
  r.activeAttemptId = null;
  r.allocatedCount = prior.allocatedCount;
  r.observations = structuredClone(prior.observations);
  const a = create(r, p, targetCount, 'restore', null);
  const o = {
    beforeCount: prior.allocatedCount,
    requestedCount: targetCount,
    prediction: null,
    ...observeResourceAllocation(r.model, prior.allocatedCount, targetCount),
    attemptId: a.id,
    observedAt: p.at,
    canvasRevision: p.canvasRevision,
  };
  a.observedAt = p.at;
  a.executedCount = targetCount;
  r.allocatedCount = targetCount;
  r.observations = [...r.observations, o].slice(-32);
}
