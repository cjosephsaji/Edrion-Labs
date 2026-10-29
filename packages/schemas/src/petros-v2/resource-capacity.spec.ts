import { describe, it, expect } from 'vitest';
import { evaluateResourceCapacity, observeResourceAllocation } from './resource-capacity';
import {
  initialSharedCanvas,
  applyStudentCanvasCommand,
  applyTrustedCanvasOperations,
  validateSharedCanvas,
  restoreStudentPracticeState,
} from './canvas-reducer';
import {
  canvasOperationSchema,
  type CanvasElement,
  type CanvasOperation,
  type SharedCanvasState,
} from './canvas';

const model = { kernel: 'resource-capacity.v1' as const, totalGB: 64, reservedGB: 16, perVMGB: 8 };
const element = (): Extract<CanvasElement, { kind: 'allocation' }> => ({
  id: 'memory-lab',
  kind: 'allocation',
  version: 1,
  label: 'Memory model',
  editable: true,
  sourceId: 'source-memory',
  resource: { model, allocatedCount: 0, prediction: null, observations: [] },
});
function state() {
  const s = initialSharedCanvas('activity');
  s.elements = [
    element(),
    {
      id: 'source',
      kind: 'text',
      version: 1,
      label: 'Source',
      sourceId: 'source-memory',
      editable: false,
      text: 'Protected source',
    },
  ];
  s.invitation = {
    id: 'try',
    prompt: 'Predict and allocate',
    editableIds: ['memory-lab'],
    allowedOperations: ['predict_allocation', 'change_allocation', 'annotate'],
    submitted: false,
  };
  return s;
}
const lab = (s: SharedCanvasState) => s.elements[0] as ReturnType<typeof element>;
function edit(s: SharedCanvasState, operations: CanvasOperation[]) {
  return applyStudentCanvasCommand(s, {
    mode: s.mode,
    activityId: s.activityId,
    branchId: s.branchId,
    checkpointId: s.invitation!.id,
    expectedRevision: s.revision,
    expectedDraftRevision: s.draftRevision,
    operations,
  });
}
const predict = (
  s: SharedCanvasState,
  requestedCount: number,
  expectation: 'fits' | 'does_not_fit' = 'fits',
) =>
  edit(s, [
    {
      type: 'predict_allocation',
      id: 'memory-lab',
      expectedVersion: lab(s).version,
      prediction: { requestedCount, expectation },
    },
  ]);
const change = (s: SharedCanvasState, requestedCount: number) =>
  edit(s, [
    {
      type: 'change_allocation',
      id: 'memory-lab',
      expectedVersion: lab(s).version,
      requestedCount,
    },
  ]);
describe('Registered capacity kernel and durable allocation operations', () => {
  it.each([
    [64, 16, 8, 48, 6],
    [80, 16, 8, 64, 8],
    [72, 8, 4, 64, 16],
    [63, 16, 8, 47, 5],
    [0, 0, 8, 0, 0],
    [16, 16, 8, 0, 0],
    [1.5, 0.5, 0.25, 1, 4],
    [0.3, 0, 0.1, 0.3, 3],
  ])(
    'uses qualified parameters %s/%s/%s without universal constants',
    (totalGB, reservedGB, perVMGB, availableGB, capacity) => {
      expect(evaluateResourceCapacity({ ...model, totalGB, reservedGB, perVMGB })).toEqual({
        availableGB,
        capacity,
      });
    },
  );
  it.each([
    { totalGB: -1 },
    { reservedGB: -1 },
    { perVMGB: 0 },
    { perVMGB: -8 },
    { totalGB: Infinity },
    { reservedGB: 65 },
    { perVMGB: 1e-12 },
    { unit: 'MB' },
    { totalGB: 1e7 },
  ])('rejects invalid model %j', (override) =>
    expect(() => evaluateResourceCapacity({ ...model, ...override })).toThrow(),
  );
  it('requires a saved prediction before a student allocation', () =>
    expect(() => change(state(), 1)).toThrow('M5_PREDICTION_REQUIRED'));
  it('keeps a prediction separate from the checked observation', () => {
    const s = predict(state(), 1, 'does_not_fit');
    expect(lab(s).resource.allocatedCount).toBe(0);
    const next = change(s, 1),
      o = lab(next).resource.observations[0]!;
    expect(o.prediction).toEqual({ requestedCount: 1, expectation: 'does_not_fit' });
    expect(o).toMatchObject({ admitted: true, allocatedCount: 1, allocatedGB: 8, remainingGB: 40 });
    expect(lab(next).resource.prediction).toBeNull();
    expect(JSON.stringify(next)).not.toMatch(/satisfied|mastery|grade|correct/);
  });
  it('admits the exact capacity boundary', () => {
    const s = change(predict(state(), 6), 6);
    expect(lab(s).resource.observations.at(-1)).toMatchObject({
      allocatedCount: 6,
      remainingGB: 0,
      utilizationPercent: 100,
    });
  });
  it('refuses overflow without changing the allocation and retains the failed prediction', () => {
    let s = change(predict(state(), 6), 6);
    s = change(predict(s, 7), 7);
    expect(lab(s).resource.allocatedCount).toBe(6);
    expect(lab(s).resource.observations.at(-1)).toMatchObject({
      admitted: false,
      requestedCount: 7,
      allocatedCount: 6,
      prediction: { expectation: 'fits' },
    });
  });
  it('releases memory and resets without erasing observation history', () => {
    let s = change(predict(state(), 6), 6);
    s = change(s, 5);
    s = change(s, 0);
    expect(lab(s).resource.observations).toHaveLength(3);
    expect(lab(s).resource.observations.at(-1)).toMatchObject({
      allocatedCount: 0,
      remainingGB: 48,
    });
  });
  it.each([-1, 0.5, 1e10, NaN])('rejects invalid allocation count %s', (requestedCount) => {
    expect(
      canvasOperationSchema.safeParse({
        type: 'change_allocation',
        id: 'memory-lab',
        expectedVersion: 1,
        requestedCount,
      }).success,
    ).toBe(false);
  });
  it('rejects stale element versions atomically', () => {
    const s = predict(state(), 1);
    expect(() =>
      edit(s, [
        { type: 'change_allocation', id: 'memory-lab', expectedVersion: 1, requestedCount: 1 },
      ]),
    ).toThrow('Stale element');
    expect(lab(s).resource.allocatedCount).toBe(0);
  });
  it('rejects edits to protected source elements', () =>
    expect(() =>
      edit(state(), [{ type: 'annotate', id: 'source', expectedVersion: 1, text: 'overwrite' }]),
    ).toThrow('outside edit'));
  it('does not allow Petros to overwrite a student invitation', () =>
    expect(() => applyTrustedCanvasOperations(state(), [], 0)).toThrow('OWNERSHIP_CONFLICT'));
  it('rejects operations outside the reviewed invitation', () => {
    const s = state();
    s.invitation!.allowedOperations = ['annotate'];
    expect(() => predict(s, 1)).toThrow('outside invitation');
  });
  it('preserves a saved explanation, prediction and observation on serialize/reload', () => {
    let s = change(predict(state(), 1), 1);
    s = edit(s, [
      {
        type: 'annotate',
        id: 'memory-lab',
        expectedVersion: lab(s).version,
        text: 'The fixed reservation cannot be assigned to VMs.',
      },
    ]);
    expect(validateSharedCanvas(JSON.parse(JSON.stringify(s)))).toEqual(s);
  });
  it('undo/redo restores acknowledged allocations with increasing revision', () => {
    const before = predict(state(), 1),
      after = change(before, 1);
    const undone = restoreStudentPracticeState(after, before);
    expect(lab(undone).resource.allocatedCount).toBe(0);
    const redone = restoreStudentPracticeState(undone, after);
    expect(lab(redone).resource.allocatedCount).toBe(1);
    expect(redone.revision).toBeGreaterThan(after.revision);
  });
  it('undo cannot cross a submitted boundary', () => {
    const before = state(),
      after = change(predict(before, 1), 1);
    after.invitation!.submitted = true;
    expect(() => restoreStudentPracticeState(after, before)).toThrow('Outside practice');
  });
  it('rejects forged acknowledged model output', () => {
    const s = change(predict(state(), 1), 1);
    lab(s).resource.observations[0]!.remainingGB = 999;
    expect(() => validateSharedCanvas(s)).toThrow('UNCHECKED_OBSERVATION');
  });
  it('does not accept changing the pinned model through undo', () => {
    const before = state(),
      after = state();
    lab(after).resource.model = { ...model, totalGB: 80 };
    expect(() => restoreStudentPracticeState(before, after)).toThrow('Protected teaching fields');
  });
  it('the reusable observation accounts for nondivisible resource remainder', () =>
    expect(observeResourceAllocation({ ...model, totalGB: 63 }, 0, 5)).toMatchObject({
      remainingGB: 7,
      capacity: 5,
      allocatedGB: 40,
    }));
});
