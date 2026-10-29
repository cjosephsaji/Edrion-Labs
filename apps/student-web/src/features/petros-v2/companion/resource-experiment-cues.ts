import {
  currentAllocationAttempt,
  allocationAttemptObservation,
  type M4Snapshot,
  type CompanionCue,
} from '@edrion/schemas';
/** Only current acknowledged checkpoints can ask the existing companion governor
 * for attention. Ordinary allocations and pointer frames emit no new cue. */
export function resourceExperimentCue(s: M4Snapshot) {
  if (s.status !== 'active' || s.teaching?.status !== 'participating' || !s.canvas) return null;
  const e = s.canvas.elements.find((e) => e.kind === 'allocation');
  if (e?.kind !== 'allocation') return null;
  const r = e.resource,
    a = currentAllocationAttempt(r),
    source = s.teaching.reference;
  if (
    !a ||
    a.sessionId !== s.id ||
    a.activityId !== s.canvas.activityId ||
    a.branchId !== s.canvas.branchId ||
    a.sourceRevisionId !== source.sourceRevisionId ||
    a.sourceHash !== source.sourceHash ||
    a.canvasRevision > s.canvas.revision ||
    // A draft-only checkpoint advances the canvas revision without changing the
    // focused experiment. Another element's edit must not replay its old cue.
    (a.canvasRevision !== s.canvas.revision && s.canvas.focusedId !== e.id) ||
    (!s.canvas.highlightedIds.includes(e.id) && s.canvas.focusedId !== e.id)
  )
    return null;
  const o = allocationAttemptObservation(r, a),
    earlier = (r.attempts ?? []).filter((p) => p.id !== a.id && p.prediction && p.observedAt);
  let kind: string, caption: string;
  if (a.status === 'predicted') {
    kind = 'prediction';
    caption = `Your prediction is recorded for VM ${a.requestedCount}. Test it to see what happens.`;
  } else if (a.status === 'explained' && a.explanation) {
    kind = 'explanation';
    caption =
      'Your explanation is saved. It hasn’t been checked. Revise your answer, then submit your correction for feedback.';
  } else if (
    o &&
    !o.admitted &&
    !earlier.some((p) => allocationAttemptObservation(r, p)?.admitted === false)
  ) {
    kind = 'boundary';
    caption = `That allocation was refused. Before the test, ${a.initial.remainingGB} GB remained; a whole VM needs ${r.model.perVMGB} GB. Compare that with your prediction and explain what happened.`;
  } else if (
    o?.admitted &&
    o.allocatedCount === o.capacity - 1 &&
    !earlier.some((p) => {
      const prior = allocationAttemptObservation(r, p);
      return prior?.admitted && prior.allocatedCount === prior.capacity - 1;
    })
  ) {
    kind = 'threshold';
    caption = `You’re approaching the limit: ${o.remainingGB} GB remain. Compare that with one whole VM before trying the next test.`;
  } else if (o?.admitted && earlier.length === 0) {
    kind = 'first-result';
    caption = `${o.allocatedCount} VMs now use ${o.allocatedGB} GB; ${o.remainingGB} GB remain. Compare what happened with your prediction.`;
  } else return null;
  const cue: CompanionCue = { mode: 'teaching', gesture: 'point-right', targetId: e.id, caption };
  return {
    cue,
    event: {
      id: `${a.id}:${kind}:${a.canvasRevision}`,
      targetId: e.id,
      canvasRevision: s.canvas.revision,
      elementVersion: e.version,
      epoch: s.epoch,
    },
    kind,
  };
}
