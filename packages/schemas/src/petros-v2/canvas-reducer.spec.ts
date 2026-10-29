import { describe, expect, it } from 'vitest';
import { applyTeachingAction, applyStudentCanvasCommand, commitFixtureSubmission, initialSharedCanvas, validateSharedCanvas } from './canvas-reducer';
import { sampleAction } from './test-fixture';

describe('shared fixture canvas reducer', () => {
  it('preserves stable IDs and deduplicates accepted action receipts', () => {
    const state = applyTeachingAction(initialSharedCanvas('fixture-activity'), sampleAction);
    expect(state.elements.map(e => e.id)).toEqual(['passage']);
    expect(applyTeachingAction(state, sampleAction)).toEqual(state);
  });
  it('rejects stale revision, wrong branch, dangling refs and atomically preserves prior state', () => {
    const initial = initialSharedCanvas('fixture-activity');
    expect(() => applyTeachingAction(initial, { ...sampleAction, expectedCanvasRevision: 2 })).toThrow('Stale');
    expect(() => applyTeachingAction(initial, { ...sampleAction, branchId: 'foreign' })).toThrow('Stale');
    expect(() => applyTeachingAction(initial, { ...sampleAction, operations: [{ type: 'add', element: { id: 'bad-edge', kind: 'edge', from: 'a', to: 'b', text: 'connects', relation: 'connects', label: 'bad edge', version: 1, sourceId: 'public-source', editable: false } }] })).toThrow('Dangling');
    expect(initial.elements).toEqual([]);
  });
  it('limits edits to the invitation, retains identity, freezes submissions and rejects late Petros writes', () => {
    const action = { ...sampleAction, operations: [{ type: 'add', element: { ...sampleAction.operations[0]!.element, editable: true } }],
      type: 'request_student_action', checkpoint: { id: 'edit-checkpoint', prompt: 'Rewrite this label', editableIds: ['passage'], allowedOperations: ['replace_content'], submitted: false } };
    const state = applyTeachingAction(initialSharedCanvas('fixture-activity'), action);
    const command = { mode: 'public_fixture', activityId: state.activityId, branchId: state.branchId, checkpointId: 'edit-checkpoint', expectedRevision: state.revision, expectedDraftRevision: 0,
      operations: [{ type: 'replace_content', id: 'passage', expectedVersion: 1, text: 'Student work' }] };
    const edited = applyStudentCanvasCommand(state, command);
    expect(edited.elements[0]).toMatchObject({ id: 'passage', version: 2, text: 'Student work' });
    expect(() => applyStudentCanvasCommand(edited, command)).toThrow('Stale');
    expect(() => applyTeachingAction(edited, { ...sampleAction, actionId: 'next-action', sequence: 2, expectedCanvasRevision: edited.revision })).toThrow('Student owns');
    const submitted = commitFixtureSubmission(edited, 'edit-checkpoint', edited.revision);
    expect(commitFixtureSubmission(submitted, 'edit-checkpoint', submitted.revision)).toEqual(submitted);
    expect(() => applyStudentCanvasCommand(submitted, { ...command, expectedRevision: submitted.revision, expectedDraftRevision: submitted.draftRevision })).toThrow('No open');
    expect(() => applyStudentCanvasCommand(state, { ...command, operations: [{ type: 'erase', id: 'passage', expectedVersion: 1 }] })).toThrow('outside');
  });
  it('rejects duplicate scene IDs and invalid highlight refs', () => {
    const state = applyTeachingAction(initialSharedCanvas('fixture-activity'), sampleAction);
    expect(() => validateSharedCanvas({ ...state, elements: [...state.elements, ...state.elements] })).toThrow('Duplicate');
    expect(() => validateSharedCanvas({ ...state, highlightedIds: ['absent'] })).toThrow('Unavailable');
  });
});
