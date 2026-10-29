import {
  initialSharedCanvas,
  observeResourceAllocation,
  predictAllocation,
  executeAllocation,
  type M4Snapshot,
  type CompanionEvent,
} from '@edrion/schemas';
export const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const source = { sourceRevisionId: id(2), sourceHash: 'a'.repeat(64) };
export const now = 100000;
export const local = {
  interaction: 'idle' as const,
  visibility: 'visible' as const,
  paused: false,
  revoked: false,
  reducedMotion: false,
};
export function classicFixture(count = 0, phase: 'ready' | 'predicted' | 'observed' = 'ready') {
  const canvas = initialSharedCanvas('activity', 'branch');
  canvas.revision = 1;
  const model = {
    kernel: 'resource-capacity.v1' as const,
    totalGB: 64,
    reservedGB: 16,
    perVMGB: 8,
  };
  const resource = {
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
  };
  canvas.elements = [
    {
      id: 'memory-lab',
      kind: 'allocation',
      version: 1,
      label: 'Memory',
      sourceId: 'source',
      editable: true,
      resource,
    },
  ];
  const provenance = {
    commandId: 'prediction',
    sessionId: id(1),
    at: '2026-10-25T10:00:00.000Z',
    ...source,
    activityId: 'activity',
    branchId: 'branch',
    elementId: 'memory-lab',
    sourceId: 'source',
    canvasRevision: 1,
    operationIndex: 0,
  };
  if (phase !== 'ready')
    predictAllocation(resource, { requestedCount: count + 1, expectation: 'fits' }, provenance);
  if (phase === 'observed')
    executeAllocation(resource, count + 1, true, { ...provenance, commandId: 'allocation' });
  const event: CompanionEvent = {
    schemaVersion: 'petros.v2.companion-event.v1',
    eventId: 'accepted-event',
    sessionId: id(1),
    revision: 1,
    epoch: 0,
    activityId: 'activity',
    activityRevision: 1,
    ...source,
    actionId: null,
    beatId: null,
    intent: 'inviting',
    expression: 'neutral',
    gesture: 'settled',
    targetId: null,
    utteranceId: 'public',
    caption: 'Reviewed activity',
    assistancePolicy: 'public_teaching',
    result: 'none',
    priority: 30,
    issuedAt: now,
    expiresAt: now + 120000,
    acknowledgment: 'presentation-only',
  };
  const snapshot = {
    id: id(1),
    status: 'active',
    revision: 1,
    epoch: 0,
    canvas,
    lesson: { references: [source], explanation: 'Exact reviewed explanation.' },
    teaching: { status: 'participating', reference: source },
    task: null,
    submission: null,
    companion: event,
    actions: ['ask'],
    assistance: 'independent',
  } as unknown as M4Snapshot;
  return { snapshot, resource };
}
