import { describe, it, expect } from 'vitest';
import {
  initialSharedCanvas,
  applyStudentCanvasCommand,
  restoreStudentPracticeState,
  validateSharedCanvas,
} from './canvas-reducer';
import { observeResourceAllocation } from './resource-capacity';
import {
  currentAllocationAttempt,
  allocationAttemptObservation,
  allocationExplanationReady,
} from './resource-experiment';
import type { CanvasElement, CanvasOperation, SharedCanvasState } from './canvas';
const model = { kernel: 'resource-capacity.v1' as const, totalGB: 64, reservedGB: 16, perVMGB: 8 };
const context = (s: SharedCanvasState) => ({
  commandId: `command-${s.revision + 1}`,
  sessionId: 'session-a',
  at: new Date(1760000000000 + s.revision * 1000).toISOString(),
  sourceRevisionId: 'revision-a',
  sourceHash: 'hash-a',
});
function fixture(count = 1) {
  const s = initialSharedCanvas('activity-a', 'branch-a');
  s.mode = 'session';
  s.elements = [
    {
      id: 'lab',
      kind: 'allocation',
      version: 1,
      label: 'Memory',
      editable: true,
      sourceId: 'source-a',
      resource: {
        model,
        allocatedCount: count,
        prediction: null,
        observations: [
          {
            beforeCount: 0,
            requestedCount: count,
            prediction: null,
            ...observeResourceAllocation(model, 0, count),
          },
        ],
      },
    },
  ];
  s.invitation = {
    id: 'checkpoint',
    editableIds: ['lab'],
    prompt: 'Test',
    submitted: false,
    allowedOperations: [
      'predict_allocation',
      'change_allocation',
      'close_allocation_attempt',
      'annotate',
    ],
  };
  return s;
}
const lab = (s: SharedCanvasState) =>
  s.elements[0] as Extract<CanvasElement, { kind: 'allocation' }>;
const r = (s: SharedCanvasState) => lab(s).resource;
function edit(s: SharedCanvasState, op: CanvasOperation, override = {}) {
  return applyStudentCanvasCommand(
    s,
    {
      mode: s.mode,
      activityId: s.activityId,
      branchId: s.branchId,
      checkpointId: s.invitation!.id,
      expectedRevision: s.revision,
      expectedDraftRevision: s.draftRevision,
      operations: [op],
    },
    { ...context(s), ...override },
  );
}
const predict = (s: SharedCanvasState, requestedCount = r(s).allocatedCount + 1) =>
  edit(s, {
    type: 'predict_allocation',
    id: 'lab',
    expectedVersion: lab(s).version,
    prediction: { requestedCount, expectation: 'fits' },
  });
const change = (
  s: SharedCanvasState,
  requestedCount = r(s).allocatedCount + 1,
  attemptId?: string,
) =>
  edit(s, {
    type: 'change_allocation',
    id: 'lab',
    expectedVersion: lab(s).version,
    requestedCount,
    ...(attemptId ? { attemptId } : {}),
  });
const close = (s: SharedCanvasState, disposition: 'next' | 'cancel') =>
  edit(s, {
    type: 'close_allocation_attempt',
    id: 'lab',
    expectedVersion: lab(s).version,
    attemptId: r(s).activeAttemptId!,
    disposition,
  });
describe('Exact, checkpoint-backed resource experiment lifecycle', () => {
  it('stamps the session, source, kernel, initial quantities, proposed operation, time and canvas revision', () => {
    const s = predict(fixture()),
      a = currentAllocationAttempt(r(s))!;
    expect(a).toMatchObject({
      id: 'command-1:0',
      sessionId: 'session-a',
      activityId: 'activity-a',
      branchId: 'branch-a',
      sourceRevisionId: 'revision-a',
      sourceHash: 'hash-a',
      kernel: 'resource-capacity.v1',
      initial: { allocatedCount: 1, availableGB: 48, allocatedGB: 8, remainingGB: 40 },
      requestedCount: 2,
      status: 'predicted',
      canvasRevision: 1,
      observedAt: null,
    });
    expect(a.predictedAt).toBe(context(fixture()).at);
  });
  it('joins an observation only to the exact prediction that was executed', () => {
    const before = predict(fixture()),
      s = change(before),
      a = currentAllocationAttempt(r(s))!;
    expect(allocationAttemptObservation(r(s), a)).toMatchObject({
      attemptId: a.id,
      beforeCount: 1,
      requestedCount: 2,
      allocatedCount: 2,
      remainingGB: 32,
      prediction: a.prediction,
      observedAt: a.observedAt,
    });
    expect(a.status).toBe('observed');
  });
  it('a new prediction keeps the previous result historical and has no current observation', () => {
    const observed = change(predict(fixture())),
      oldId = r(observed).activeAttemptId;
    const next = predict(observed),
      a = currentAllocationAttempt(r(next))!;
    expect(a.id).not.toBe(oldId);
    expect(a.requestedCount).toBe(3);
    expect(allocationAttemptObservation(r(next), a)).toBeNull();
    expect(r(next).attempts!.find((a) => a.id === oldId)?.status).toBe('superseded');
  });
  it('changing a pending prediction supersedes its identity without executing it', () => {
    const a = predict(fixture()),
      b = predict(a);
    expect(r(b).attempts).toHaveLength(2);
    expect(r(b).attempts![0]!.status).toBe('superseded');
    expect(r(b).observations).toHaveLength(1);
  });
  it('rejects a delayed operation targeting a previous attempt even with a current element version', () => {
    const a = predict(fixture()),
      old = r(a).activeAttemptId!,
      b = predict(a);
    expect(() => change(b, 2, old)).toThrow('M5_STALE_ATTEMPT');
  });
  it('rejects a predicted allocation under another session or source revision', () => {
    const s = predict(fixture()),
      op: CanvasOperation = {
        type: 'change_allocation',
        id: 'lab',
        expectedVersion: lab(s).version,
        requestedCount: 2,
      };
    for (const override of [
      { sessionId: 'other' },
      { sourceRevisionId: 'withdrawn' },
      { sourceHash: 'changed' },
    ])
      expect(() => edit(s, op, override)).toThrow('M5_PREDICTION_REQUIRED');
  });
  it('multiple consecutive tests retain different attempt IDs and exact before/after quantities', () => {
    let s = fixture();
    for (let i = 2; i <= 6; i++) s = change(predict(s));
    const attempts = r(s).attempts!;
    expect(new Set(attempts.map((a) => a.id)).size).toBe(5);
    expect(attempts.map((a) => a.initial.allocatedCount)).toEqual([1, 2, 3, 4, 5]);
  });
  it('cancel clears the pending test without inventing a result', () => {
    const s = close(predict(fixture()), 'cancel');
    expect(r(s).activeAttemptId).toBeNull();
    expect(r(s).prediction).toBeNull();
    expect(r(s).attempts![0]!.status).toBe('cancelled');
    expect(r(s).attempts![0]!.observedAt).toBeNull();
  });
  it('closing an observed test leaves its result in history while the next question is ready', () => {
    const s = close(change(predict(fixture())), 'next');
    expect(currentAllocationAttempt(r(s))).toBeNull();
    expect(r(s).attempts![0]!.status).toBe('completed');
  });
  it.each(['prediction', 'observation'])(
    'serialize/reload during %s preserves its exact lifecycle',
    (phase) => {
      const s = phase === 'prediction' ? predict(fixture()) : change(predict(fixture()));
      expect(validateSharedCanvas(JSON.parse(JSON.stringify(s)))).toEqual(s);
    },
  );
  it('undo after prediction cancels active work instead of reviving older observations', () => {
    const before = fixture(),
      s = predict(before),
      restored = restoreStudentPracticeState(s, before, context(s));
    expect(r(restored).prediction).toBeNull();
    expect(r(restored).activeAttemptId).toBeNull();
    expect(r(restored).attempts!.some((a) => a.status === 'superseded')).toBe(true);
  });
  it('undo and redo after observation restore quantities without resurrecting an old prediction', () => {
    const before = predict(fixture()),
      observed = change(before),
      undo = restoreStudentPracticeState(observed, before, context(observed));
    expect(r(undo).allocatedCount).toBe(1);
    expect(r(undo).activeAttemptId).toBeNull();
    const redo = restoreStudentPracticeState(undo, observed, context(undo));
    expect(r(redo).allocatedCount).toBe(2);
    expect(r(redo).activeAttemptId).toBeNull();
    expect(r(redo).observations.at(-1)?.prediction).toBeNull();
  });
  it.each([0, 1])(
    'reset/release to %s supersedes the current attempt and returns to ready',
    (count) => {
      const s = change(change(predict(fixture())), count);
      expect(r(s).allocatedCount).toBe(count);
      expect(r(s).activeAttemptId).toBeNull();
      expect(r(s).prediction).toBeNull();
    },
  );
  it('a refused allocation preserves the prediction and neutral observation without changing capacity', () => {
    const s = change(predict(fixture(6))),
      a = currentAllocationAttempt(r(s))!;
    expect(allocationAttemptObservation(r(s), a)).toMatchObject({
      requestedCount: 7,
      admitted: false,
      allocatedCount: 6,
    });
    expect(a.prediction?.expectation).toBe('fits');
    expect(a.status).toBe('observed');
  });
  it('a saved explanation is associated with its attempt and cannot satisfy a newer result', () => {
    let s = change(predict(fixture()));
    s = edit(s, {
      type: 'annotate',
      id: 'lab',
      expectedVersion: lab(s).version,
      text: 'My observed reasoning.',
    });
    expect(allocationExplanationReady(r(s), lab(s).annotation)).toBe(true);
    s = change(predict(s));
    expect(allocationExplanationReady(r(s), lab(s).annotation)).toBe(false);
  });
  it('does not attach an explanation to an unexecuted prediction', () => {
    const s = predict(fixture());
    expect(() =>
      edit(s, {
        type: 'annotate',
        id: 'lab',
        expectedVersion: lab(s).version,
        text: 'Not observed',
      }),
    ).toThrow('M5_OBSERVATION_REQUIRED');
  });
  it.each(['model', 'result', 'identity'])(
    'rejects a forged %s in a restored checkpoint',
    (field) => {
      const s = change(predict(fixture())),
        a = currentAllocationAttempt(r(s))!;
      if (field === 'model') r(s).model.totalGB = 80;
      if (field === 'result') r(s).observations.at(-1)!.attemptId = 'other-test';
      if (field === 'identity') a.activityId = 'other-activity';
      expect(() => validateSharedCanvas(s)).toThrow();
    },
  );
  it('old unlinked observations remain readable but cannot become the active test', () => {
    const s = fixture(4);
    expect(currentAllocationAttempt(r(s))).toBeNull();
    const next = predict(s);
    expect(allocationAttemptObservation(r(next), currentAllocationAttempt(r(next)))).toBeNull();
  });
});
