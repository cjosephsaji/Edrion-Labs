import { createHash } from 'node:crypto';
import {
  companionEventSchema,
  currentAllocationAttempt,
  allocationAttemptObservation,
  type CompanionEvent,
  type M4Snapshot,
} from '@edrion/schemas';

/** Reads only the already sanitized public snapshot. Never reads an instrument,
 * invokes a model, mutates evidence, or accepts client-authored cues. */
export function buildCompanionCue(s: M4Snapshot, now = Date.now()): CompanionEvent {
  const t = s.teaching,
    canvas = s.canvas;
  const ref = t?.reference ?? s.lesson?.references[0];
  const cue: CompanionEvent = {
    schemaVersion: 'petros.v2.companion-event.v1',
    eventId: '',
    sessionId: s.id,
    revision: s.revision,
    epoch: s.epoch,
    activityId: canvas?.activityId ?? null,
    activityRevision: canvas?.revision ?? 0,
    sourceRevisionId: ref?.sourceRevisionId ?? null,
    sourceHash: ref?.sourceHash ?? null,
    actionId: t?.actionId ?? null,
    beatId: t ? `${t.actionId}:${t.nextBeat}` : null,
    intent: 'waiting',
    expression: 'neutral',
    gesture: 'settled',
    targetId: null,
    utteranceId: '',
    caption: 'Take your time. Your work stays here.',
    assistancePolicy: 'procedural',
    result: 'none',
    priority: 10,
    issuedAt: now,
    expiresAt: now + 120000,
    acknowledgment: 'presentation-only',
  };
  if (s.status !== 'active' || !s.lesson) {
    cue.intent = s.status === 'paused' ? 'paused' : 'blocked';
    cue.caption =
      s.status === 'paused'
        ? 'Your place is saved. Continue when you’re ready.'
        : 'This lesson is unavailable. Your saved work is preserved.';
    cue.priority = 100;
  } else if (s.task && !s.submission) {
    cue.assistancePolicy = 'neutral_verification';
    cue.caption = 'Your response stays yours. Submit when you’re ready.';
    cue.priority = 80;
  } else if (t) {
    cue.assistancePolicy = 'public_teaching';
    // A referenced source must still be in the current authorized public lesson.
    const sourceCurrent = s.lesson.references.some(
      (r) =>
        r.sourceRevisionId === t.reference.sourceRevisionId &&
        r.sourceHash === t.reference.sourceHash &&
        r.unitId === t.reference.unitId,
    );
    if (!sourceCurrent) {
      cue.intent = 'blocked';
      cue.caption = 'The current teaching source is unavailable.';
      cue.priority = 100;
    } else if (t.status === 'presenting') {
      cue.intent = 'demonstrating';
      cue.expression = 'attentive';
      cue.caption = t.caption;
      const target = canvas?.elements.find((e) => e.id === t.targetId);
      if (
        target &&
        target.sourceId === `source-${t.reference.unitId}` &&
        (canvas?.focusedId === target.id || canvas?.highlightedIds.includes(target.id))
      ) {
        cue.targetId = target.id;
        cue.gesture = 'point';
      }
      cue.priority = 40;
    } else if (t.status === 'participating') {
      cue.expression = 'attentive';
      const e = canvas?.elements.find((e) => e.kind === 'allocation');
      const a = e?.kind === 'allocation' ? currentAllocationAttempt(e.resource) : null;
      if (
        e?.kind === 'allocation' &&
        a &&
        a.sessionId === s.id &&
        a.activityId === canvas?.activityId &&
        a.branchId === canvas?.branchId &&
        a.sourceRevisionId === ref?.sourceRevisionId &&
        a.sourceHash === ref?.sourceHash &&
        a.canvasRevision <= canvas.revision &&
        (a.canvasRevision === canvas.revision || canvas.focusedId === e.id)
      ) {
        const o = allocationAttemptObservation(e.resource, a);
        if (a.status === 'predicted')
          cue.caption = `Your prediction is saved for VM ${a.requestedCount}. Test it when you’re ready.`;
        else if (a.status === 'explained')
          cue.caption =
            'Your explanation is saved. It hasn’t been evaluated. Submit your correction for feedback.';
        else if (o && !o.admitted) {
          cue.intent = 'explaining';
          cue.gesture = 'point';
          cue.targetId = e.id;
          cue.caption = `That allocation was refused. Before the test, ${a.initial.remainingGB} GB remained; a whole VM needs ${e.resource.model.perVMGB} GB. Compare this with your prediction.`;
        }
      }
    } else {
      cue.intent = 'inviting';
      cue.expression = 'attentive';
      cue.caption = 'The example is here to refer to. Continue when you’re ready.';
    }
  } else if (s.submission) {
    cue.priority = 60;
    cue.assistancePolicy = 'committed_feedback';
    const e = s.evaluation;
    if (s.submission.status === 'pending') {
      cue.intent = 'processing';
      cue.expression = 'neutral';
      cue.result = 'pending';
      cue.caption = 'Checking your submitted answer…';
    } else if (
      !e ||
      e.responseId !== s.submission.id ||
      e.status === 'unavailable' ||
      e.status === 'invalidated'
    ) {
      cue.intent = 'uncertain';
      cue.expression = 'uncertain';
      cue.result = 'unavailable';
      cue.caption = 'Your response is saved. Confirmed feedback is unavailable.';
    } else if (
      e.status === 'review_required' ||
      !e.criteria.length ||
      e.criteria.some((c) => c.origin !== 'trusted_kernel' || c.status === 'abstained')
    ) {
      cue.intent = 'uncertain';
      cue.expression = 'uncertain';
      cue.result = 'review';
      cue.caption = 'Your response is saved. This interpretation needs teacher review.';
    } else {
      const passed = e.criteria.filter((c) => c.status === 'satisfied').length;
      cue.intent = 'responding';
      cue.result = passed === e.criteria.length ? 'correct' : passed ? 'partial' : 'incorrect';
      cue.expression = cue.result === 'correct' ? 'pleased' : 'attentive';
      cue.gesture = cue.result === 'correct' ? 'acknowledge' : 'settled';
      cue.caption =
        cue.result === 'correct'
          ? s.assistance === 'assisted'
            ? 'You corrected the checked parts. This was assisted practice; your criterion feedback is saved.'
            : 'All checked parts passed. You can look back at the criterion feedback.'
          : cue.result === 'partial'
            ? `${passed} of ${e.criteria.length} checked parts passed. Look at the feedback for the part to revisit.`
            : 'The checked criteria need another look. Your submitted work is saved.';
    }
  } else {
    cue.intent = 'introducing';
    cue.expression = 'attentive';
    cue.gesture = 'open-hand';
    cue.assistancePolicy = 'public_teaching';
    cue.caption = 'Let’s look at the reviewed source together. You can pause whenever you need.';
  }
  // Identity excludes read-time timestamps; polling cannot manufacture a fresh gesture.
  const digest = createHash('sha256')
    .update(
      JSON.stringify({
        ...cue,
        eventId: '',
        utteranceId: '',
        issuedAt: 0,
        expiresAt: 0,
        revision: 0,
        epoch: 0,
        activityRevision: 0,
        responseIdentity: s.submission?.id ?? null,
        evaluationIdentity: s.evaluation?.id ?? null,
      }),
    )
    .digest('hex');
  cue.eventId = `m6:${digest}`;
  cue.utteranceId = `${cue.eventId}:public`;
  return companionEventSchema.parse(cue);
}
