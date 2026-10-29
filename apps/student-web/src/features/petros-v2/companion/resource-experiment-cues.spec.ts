import { describe, it, expect } from 'vitest';
import {
  initialSharedCanvas,
  predictAllocation,
  executeAllocation,
  explainAllocation,
  type M4Snapshot,
  type CanvasElement,
} from '@edrion/schemas';
import { resourceExperimentCue } from './resource-experiment-cues';
import { CompanionPoseController } from './companion-controller';
import type { PresentationState } from '../presentation-controller';
const p = {
  commandId: 'prediction',
  sessionId: 'session',
  at: '2026-10-20T10:00:00.000Z',
  sourceRevisionId: 'revision',
  sourceHash: 'hash',
  activityId: 'activity',
  branchId: 'branch',
  elementId: 'lab',
  sourceId: 'source',
  canvasRevision: 1,
  operationIndex: 0,
};
function fixture(count = 1) {
  const canvas = initialSharedCanvas('activity', 'branch');
  canvas.revision = 1;
  canvas.highlightedIds = ['lab'];
  canvas.completedActionIds = ['accepted-beat'];
  const e: Extract<CanvasElement, { kind: 'allocation' }> = {
    id: 'lab',
    kind: 'allocation',
    sourceId: 'source',
    version: 2,
    label: 'Memory',
    editable: true,
    resource: {
      model: { kernel: 'resource-capacity.v1', totalGB: 64, reservedGB: 16, perVMGB: 8 },
      allocatedCount: count,
      prediction: null,
      observations: [],
    },
  };
  predictAllocation(e.resource, { requestedCount: count + 1, expectation: 'fits' }, p);
  canvas.elements = [e];
  const s = {
    id: 'session',
    status: 'active',
    epoch: 0,
    canvas,
    teaching: {
      status: 'participating',
      reference: { sourceRevisionId: 'revision', sourceHash: 'hash' },
    },
  } as unknown as M4Snapshot;
  return { s, e };
}
function observe(f: ReturnType<typeof fixture>) {
  f.s.canvas!.revision++;
  f.e.version++;
  executeAllocation(f.e.resource, f.e.resource.allocatedCount + 1, true, {
    ...p,
    commandId: 'execute',
    canvasRevision: f.s.canvas!.revision,
  });
}
describe('Current experiment checkpoints through the existing companion governor', () => {
  it('acknowledges a prediction without claiming it is correct', () => {
    const { s } = fixture();
    const event = resourceExperimentCue(s)!;
    expect(event.kind).toBe('prediction');
    expect(event.cue.caption).toContain('recorded for VM 2');
    expect(event.cue.caption).not.toMatch(/correct|mastery|passed/);
  });
  it('uses the server-focused lab when the teaching highlight remains on the correction', () => {
    const { s } = fixture();
    s.canvas!.highlightedIds = ['capacity'];
    s.canvas!.focusedId = 'lab';
    expect(resourceExperimentCue(s)?.kind).toBe('prediction');
  });
  it('retains a saved explanation cue across its draft-only checkpoint without replay identity', () => {
    const f = fixture();
    observe(f);
    f.s.canvas!.focusedId = 'lab';
    f.s.canvas!.revision++;
    explainAllocation(f.e.resource, 'Reasoning', { ...p, canvasRevision: f.s.canvas!.revision });
    const id = resourceExperimentCue(f.s)!.event.id;
    f.s.canvas!.revision++;
    expect(resourceExperimentCue(f.s)?.kind).toBe('explanation');
    expect(resourceExperimentCue(f.s)?.event.id).toBe(id);
    f.s.canvas!.focusedId = 'capacity';
    expect(resourceExperimentCue(f.s)).toBeNull();
  });
  it.each(['session', 'source', 'canvas', 'target', 'paused'])(
    'rejects a %s mismatch rather than targeting old work',
    (kind) => {
      const { s } = fixture();
      if (kind === 'session') s.id = 'other';
      if (kind === 'source') s.teaching!.reference.sourceHash = 'other';
      if (kind === 'canvas') s.canvas!.revision++;
      if (kind === 'target') s.canvas!.highlightedIds = [];
      if (kind === 'paused') s.status = 'paused';
      expect(resourceExperimentCue(s)).toBeNull();
    },
  );
  it('acknowledges the first result and the approaching limit, but leaves routine allocations quiet', () => {
    const first = fixture();
    observe(first);
    expect(resourceExperimentCue(first.s)?.kind).toBe('first-result');
    first.s.canvas!.revision++;
    first.e.version++;
    predictAllocation(
      first.e.resource,
      { requestedCount: 3, expectation: 'fits' },
      { ...p, commandId: 'next', canvasRevision: first.s.canvas!.revision },
    );
    observe(first);
    expect(resourceExperimentCue(first.s)).toBeNull();
    const threshold = fixture(4);
    observe(threshold);
    expect(resourceExperimentCue(threshold.s)?.kind).toBe('threshold');
  });
  it('responds to an actual refusal without repeated boundary interruptions', () => {
    const f = fixture(6);
    observe(f);
    expect(resourceExperimentCue(f.s)?.kind).toBe('boundary');
    f.s.canvas!.revision++;
    f.e.version++;
    predictAllocation(
      f.e.resource,
      { requestedCount: 7, expectation: 'fits' },
      { ...p, commandId: 'again', canvasRevision: f.s.canvas!.revision },
    );
    observe(f);
    expect(resourceExperimentCue(f.s)).toBeNull();
  });
  it('an explanation cue says saved and unchecked, then stops after another canvas revision', () => {
    const f = fixture();
    observe(f);
    f.s.canvas!.revision++;
    explainAllocation(f.e.resource, 'Reasoning', { ...p, canvasRevision: f.s.canvas!.revision });
    expect(resourceExperimentCue(f.s)?.cue.caption).toContain('hasn’t been checked');
    f.s.canvas!.revision++;
    expect(resourceExperimentCue(f.s)).toBeNull();
  });
  it('uses the same pose cooldown and cancels stale, paused or reduced-motion checkpoint gestures', () => {
    const { s } = fixture(),
      checkpoint = resourceExperimentCue(s)!;
    const state = {
      canvas: s.canvas!,
      epoch: 0,
      index: 0,
      status: 'playing',
      progress: 0.5,
      selectedId: null,
      explanation: '',
      feedback: null,
      speech: { phase: 'text', currentTime: 0, duration: null, reason: null },
      interactionCue: checkpoint.event,
    } as PresentationState;
    const governor = new CompanionPoseController();
    expect(
      governor.resolve(state, checkpoint.cue, 'right', checkpoint.event.id, 10000, {
        reducedMotion: false,
      }),
    ).toBe('point-right');
    expect(
      governor.resolve(
        { ...state, status: 'paused' },
        checkpoint.cue,
        'right',
        checkpoint.event.id,
        10100,
        { reducedMotion: false },
      ),
    ).toBe('neutral');
    expect(
      governor.resolve(state, checkpoint.cue, 'right', checkpoint.event.id, 20000, {
        reducedMotion: false,
      }),
    ).toBe('neutral');
    expect(
      new CompanionPoseController().resolve(
        { ...state, epoch: 1 },
        checkpoint.cue,
        'right',
        checkpoint.event.id,
        10000,
        { reducedMotion: false },
      ),
    ).toBe('neutral');
    expect(
      new CompanionPoseController().resolve(
        state,
        checkpoint.cue,
        'right',
        checkpoint.event.id,
        10000,
        { reducedMotion: true },
      ),
    ).toBe('neutral');
  });
});
