export const sampleAction = {
  schemaVersion: 'petros.v2.teaching-action.v1', mode: 'public_fixture', compilerVersion: 'fixture-subset.v1', capabilityVersion: 'canvas-subset.v1',
  actionId: 'fixture-action-1', activityId: 'fixture-activity', branchId: 'fixture-practice', sequence: 1, expectedCanvasRevision: 0,
  sourceId: 'public-source', purpose: 'Read the public passage', type: 'read_source', cancellation: 'preserve-semantic-prefix',
  operations: [{ type: 'add', element: { id: 'passage', version: 1, label: 'Public passage', sourceId: 'public-source', editable: false, kind: 'text', text: 'An original public example.' } }],
  cue: { mode: 'teaching', gesture: 'point-right', targetId: 'passage', caption: 'Read this passage.' },
};
