import { describe, it, expect } from 'vitest';
import {
  initialSharedCanvas,
  validateSharedCanvas,
  applyStudentCanvasCommand,
  applyTrustedCanvasOperations,
  restoreStudentPracticeState,
} from './canvas-reducer';
import type { SharedCanvasState } from './canvas';
const table = (): SharedCanvasState => ({
  ...initialSharedCanvas('activity'),
  mode: 'session',
  elements: [
    {
      id: 'data',
      kind: 'table',
      version: 1,
      label: 'Working table',
      sourceId: 'source',
      editable: true,
      columns: ['Quantity', 'Value'],
      rows: [['Capacity', '?']],
      editableCells: [{ row: 0, column: 1 }],
    },
  ],
  invitation: {
    id: 'edit',
    prompt: 'Complete the value.',
    editableIds: ['data'],
    allowedOperations: ['replace_cell'],
    submitted: false,
  },
});
describe('M5 semantic table, graph and inert trace operations', () => {
  it('edits only a reviewed table cell and restores acknowledged practice without altering protected labels', () => {
    const original = table();
    const next = applyStudentCanvasCommand(original, {
      mode: 'session',
      activityId: 'activity',
      branchId: original.branchId,
      checkpointId: 'edit',
      expectedRevision: 0,
      expectedDraftRevision: 0,
      operations: [
        { type: 'replace_cell', id: 'data', expectedVersion: 1, row: 0, column: 1, value: '6' },
      ],
    });
    expect(next.elements[0]).toMatchObject({ rows: [['Capacity', '6']] });
    expect(restoreStudentPracticeState(next, original).elements[0]).toMatchObject({
      rows: [['Capacity', '?']],
    });
    expect(() =>
      applyStudentCanvasCommand(original, {
        mode: 'session',
        activityId: 'activity',
        branchId: original.branchId,
        checkpointId: 'edit',
        expectedRevision: 0,
        expectedDraftRevision: 0,
        operations: [
          {
            type: 'replace_cell',
            id: 'data',
            expectedVersion: 1,
            row: 0,
            column: 0,
            value: 'Forged label',
          },
        ],
      }),
    ).toThrow('Protected table cell');
    const forged = structuredClone(original);
    if (forged.elements[0]?.kind === 'table') forged.elements[0].rows[0]![0] = 'Forged';
    expect(() => restoreStudentPracticeState(next, forged)).toThrow('Protected teaching fields');
  });
  it('rejects ragged tables and invalid editable coordinates', () => {
    const s = table();
    if (s.elements[0]?.kind === 'table') s.elements[0].rows = [['One cell']];
    expect(() => validateSharedCanvas(s)).toThrow();
  });
  it('executes only the next state of a finite inert trace', () => {
    const s = initialSharedCanvas('trace');
    s.elements = [
      {
        id: 'trace',
        kind: 'trace',
        version: 1,
        label: 'Finite trace',
        sourceId: 'source',
        editable: false,
        currentLine: 0,
        lines: [
          { id: 'one', text: 'x := 1', state: { x: 1 } },
          { id: 'two', text: 'x := 2', state: { x: 2 } },
        ],
      },
    ];
    expect(
      applyTrustedCanvasOperations(
        s,
        [{ type: 'trace_step', id: 'trace', expectedVersion: 1, line: 1 }],
        0,
      ).elements[0],
    ).toMatchObject({ currentLine: 1 });
    expect(() =>
      applyTrustedCanvasOperations(
        s,
        [{ type: 'trace_step', id: 'trace', expectedVersion: 1, line: 2 }],
        0,
      ),
    ).toThrow();
  });
  it('rejects repeated or unordered graph coordinates', () => {
    const s = initialSharedCanvas('graph');
    s.elements = [
      {
        id: 'graph',
        kind: 'graph',
        version: 1,
        label: 'Graph',
        sourceId: 'source',
        editable: false,
        xUnit: 'seconds',
        yUnit: 'requests',
        points: [
          { x: 1, y: 5 },
          { x: 1, y: 10 },
        ],
      },
    ];
    expect(() => validateSharedCanvas(s)).toThrow();
  });
  it('rejects cyclic group ancestry', () => {
    const s = initialSharedCanvas('group');
    s.elements = [
      {
        id: 'a',
        kind: 'text',
        version: 1,
        label: 'A',
        text: 'A',
        sourceId: 'source',
        editable: false,
        parentId: 'b',
      },
      {
        id: 'b',
        kind: 'text',
        version: 1,
        label: 'B',
        text: 'B',
        sourceId: 'source',
        editable: false,
        parentId: 'a',
      },
    ];
    expect(() => validateSharedCanvas(s)).toThrow();
  });
});
