import { act, render, screen, fireEvent, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  type CanvasElement,
  observeResourceAllocation,
  predictAllocation,
  executeAllocation,
  explainAllocation,
} from '@edrion/schemas';
import { ResourceAllocationLab } from './resource-allocation-lab';
const provenance = {
  commandId: 'prediction',
  sessionId: 'session',
  at: '2026-10-20T10:00:00.000Z',
  sourceRevisionId: 'revision',
  sourceHash: 'hash',
  activityId: 'activity',
  branchId: 'branch',
  elementId: 'memory-lab',
  sourceId: 'source',
  canvasRevision: 1,
  operationIndex: 0,
};
function fixture(count = 1, phase: 'ready' | 'predicted' | 'observed' = 'ready') {
  const model = {
    kernel: 'resource-capacity.v1' as const,
    totalGB: 64,
    reservedGB: 16,
    perVMGB: 8,
  };
  const element: Extract<CanvasElement, { kind: 'allocation' }> = {
    id: 'memory-lab',
    kind: 'allocation',
    version: 2,
    label: 'Memory',
    editable: true,
    sourceId: 'source',
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
  };
  if (phase !== 'ready')
    predictAllocation(
      element.resource,
      { requestedCount: count + 1, expectation: 'fits' },
      provenance,
    );
  if (phase === 'observed')
    executeAllocation(element.resource, count + 1, true, {
      ...provenance,
      commandId: 'execution',
      canvasRevision: 2,
    });
  const edit = vi.fn(async () => ({ status: 'committed' }));
  return { element, edit };
}
describe('Attempt-specific memory lab UI', () => {
  it('never presents an old observation as the result of a ready question', () => {
    const f = fixture(4);
    f.element.resource.observations[0]!.prediction = { requestedCount: 4, expectation: 'fits' };
    render(<ResourceAllocationLab {...f} editable busy={false} />);
    expect(screen.getByRole('status', { name: 'Current experiment' })).not.toHaveTextContent(
      'Observed:',
    );
    expect(screen.queryByLabelText('What happened, and why?')).toBeNull();
    expect(screen.getByRole('button', { name: 'It will fit' })).toBeEnabled();
  });
  it('a new pending attempt has no result inherited from earlier tests', () => {
    const f = fixture(1, 'observed');
    predictAllocation(
      f.element.resource,
      { requestedCount: 3, expectation: 'does_not_fit' },
      { ...provenance, commandId: 'next', canvasRevision: 3 },
    );
    render(<ResourceAllocationLab {...f} editable busy={false} />);
    const current = screen.getByRole('status', { name: 'Current experiment' });
    expect(current).not.toHaveTextContent('Observed:');
    expect(current).toHaveTextContent('prediction is recorded');
    expect(screen.getByRole('group', { name: 'Your prediction · VM 3' })).toBeTruthy();
  });
  it('records a prediction without inventing resource quantities or correctness', () => {
    const f = fixture();
    render(<ResourceAllocationLab {...f} editable busy={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'It won’t fit' }));
    expect(f.edit).toHaveBeenCalledWith({
      type: 'predict_allocation',
      id: 'memory-lab',
      expectedVersion: 2,
      prediction: { requestedCount: 2, expectation: 'does_not_fit' },
    });
    expect(screen.getByText('40 GB')).toBeTruthy();
    expect(screen.queryByText('Correct')).toBeNull();
  });
  it('adds through the acknowledged attempt identity', () => {
    const f = fixture(1, 'predicted');
    render(<ResourceAllocationLab {...f} editable busy={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add one VM' }));
    expect(f.edit).toHaveBeenCalledWith({
      type: 'change_allocation',
      id: 'memory-lab',
      expectedVersion: 2,
      requestedCount: 2,
      attemptId: 'prediction:0',
    });
  });
  it('touch drag and Enter use the same scoped allocation operation', () => {
    vi.stubGlobal('PointerEvent', MouseEvent);
    const f = fixture(1, 'predicted');
    render(<ResourceAllocationLab {...f} editable busy={false} />);
    const handle = screen.getByRole('button', { name: /Drag a VM/ });
    vi.spyOn(
      screen.getByLabelText('Memory allocation area'),
      'getBoundingClientRect',
    ).mockReturnValue({ left: 0, top: 0, right: 300, bottom: 200 } as DOMRect);
    fireEvent.pointerDown(handle, { clientX: 50, clientY: 300, pointerType: 'touch' });
    fireEvent.pointerMove(handle, { clientX: 50, clientY: 100, pointerType: 'touch' });
    expect(document.querySelector('[data-allocation-drag-preview]')).toHaveTextContent(
      '8 GB memory',
    );
    expect(screen.getByText('Release to test this VM')).toBeTruthy();
    expect(f.edit).not.toHaveBeenCalled();
    expect(document.querySelector('[data-resource-count]')).toHaveAttribute(
      'data-resource-count',
      '1',
    );
    fireEvent.pointerUp(handle, { clientX: 50, clientY: 100, pointerType: 'touch' });
    expect(document.querySelector('[data-allocation-drag-preview]')).toBeNull();
    expect(f.edit).toHaveBeenCalledTimes(1);
    const operation = f.edit.mock.calls[0];
    fireEvent.click(handle, { detail: 0 });
    expect(f.edit.mock.calls[1]).toEqual(operation);
    vi.unstubAllGlobals();
  });
  it.each(['pointer cancellation', 'Escape', 'a drop outside memory'])(
    '%s dismisses the preview without allocating',
    (cancellation) => {
      vi.stubGlobal('PointerEvent', MouseEvent);
      const f = fixture(1, 'predicted');
      render(<ResourceAllocationLab {...f} editable busy={false} />);
      const handle = screen.getByRole('button', { name: /Drag a VM/ });
      vi.spyOn(
        screen.getByLabelText('Memory allocation area'),
        'getBoundingClientRect',
      ).mockReturnValue({ left: 0, top: 0, right: 300, bottom: 200 } as DOMRect);
      fireEvent.pointerDown(handle, { clientX: 50, clientY: 300 });
      fireEvent.pointerMove(handle, { clientX: 50, clientY: 100 });
      expect(document.querySelector('[data-allocation-drag-preview]')).not.toBeNull();
      if (cancellation === 'pointer cancellation') fireEvent.pointerCancel(handle);
      else if (cancellation === 'Escape') fireEvent.keyDown(window, { key: 'Escape' });
      else fireEvent.pointerUp(handle, { clientX: 350, clientY: 100 });
      expect(document.querySelector('[data-allocation-drag-preview]')).toBeNull();
      fireEvent.pointerUp(handle, { clientX: 50, clientY: 100 });
      expect(f.edit).not.toHaveBeenCalled();
      vi.unstubAllGlobals();
    },
  );
  it('cancels an in-progress drag when editing becomes locked', () => {
    vi.stubGlobal('PointerEvent', MouseEvent);
    const f = fixture(1, 'predicted');
    const { rerender } = render(<ResourceAllocationLab {...f} editable busy={false} />);
    const handle = screen.getByRole('button', { name: /Drag a VM/ });
    vi.spyOn(
      screen.getByLabelText('Memory allocation area'),
      'getBoundingClientRect',
    ).mockReturnValue({ left: 0, top: 0, right: 300, bottom: 200 } as DOMRect);
    fireEvent.pointerDown(handle, { clientX: 50, clientY: 300 });
    fireEvent.pointerMove(handle, { clientX: 50, clientY: 100 });
    rerender(<ResourceAllocationLab {...f} editable busy />);
    expect(document.querySelector('[data-allocation-drag-preview]')).toBeNull();
    fireEvent.pointerUp(handle, { clientX: 50, clientY: 100 });
    expect(f.edit).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
  it('cancels the exact current prediction', () => {
    const f = fixture(1, 'predicted');
    render(<ResourceAllocationLab {...f} editable busy={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel this test' }));
    expect(f.edit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'close_allocation_attempt',
        attemptId: 'prediction:0',
        disposition: 'cancel',
      }),
    );
  });
  it('a refused result compares only its own prediction, using neutral language', () => {
    const f = fixture(6, 'observed');
    render(<ResourceAllocationLab {...f} editable busy={false} />);
    const current = screen.getByRole('status', { name: 'Current experiment' });
    expect(current).toHaveTextContent('VM 7');
    expect(current).toHaveTextContent('allocation was refused');
    expect(current).toHaveTextContent('did not support your prediction');
    expect(within(current).queryByText('Incorrect')).toBeNull();
  });
  it('closing an observed test is an explicit state transition, not a frontend reset', () => {
    const f = fixture(1, 'observed');
    render(<ResourceAllocationLab {...f} editable busy={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'Try another VM' }));
    expect(f.edit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'close_allocation_attempt',
        attemptId: 'prediction:0',
        disposition: 'next',
      }),
    );
  });
  it('restores only a draft scoped to this activity, branch, element and attempt', () => {
    const f = fixture(1, 'observed');
    const draft = {
      key: 'activity:branch:lab',
      value: JSON.stringify({
        kind: 'resource-explanation.v1',
        key: 'activity:branch:lab:prediction:0',
        text: 'My checkpointed draft',
      }),
      change: vi.fn(),
      save: vi.fn(async () => null),
    };
    const { unmount } = render(
      <ResourceAllocationLab {...f} editable busy={false} draft={draft} />,
    );
    expect(screen.getByLabelText('What happened, and why?')).toHaveValue('My checkpointed draft');
    unmount();
    render(
      <ResourceAllocationLab
        {...f}
        editable
        busy={false}
        draft={{ ...draft, key: 'other-branch' }}
      />,
    );
    expect(screen.getByLabelText('What happened, and why?')).toHaveValue('');
  });
  it('keeps dirty explanation text through new acknowledgments within the same attempt', async () => {
    const f = fixture(1, 'observed'),
      onDirty = vi.fn();
    const { rerender } = render(
      <ResourceAllocationLab {...f} editable busy={false} onDraftDirty={onDirty} />,
    );
    fireEvent.change(screen.getByLabelText('What happened, and why?'), {
      target: { value: 'My unsaved reasoning' },
    });
    rerender(
      <ResourceAllocationLab
        {...f}
        element={{ ...f.element, version: 3 }}
        editable
        busy={false}
        onDraftDirty={onDirty}
      />,
    );
    expect(screen.getByLabelText('What happened, and why?')).toHaveValue('My unsaved reasoning');
    expect(screen.getByRole('button', { name: 'Try another VM' })).toBeDisabled();
    expect(onDirty).toHaveBeenLastCalledWith(true);
    await act(async () =>
      fireEvent.click(screen.getByRole('button', { name: 'Save explanation' })),
    );
    expect(f.edit).toHaveBeenCalledWith({
      type: 'annotate',
      id: 'memory-lab',
      expectedVersion: 3,
      text: 'My unsaved reasoning',
    });
  });
  it('shows a saved explanation as unchecked and leaves practice prose to the assessment form', () => {
    const f = fixture(1, 'observed');
    explainAllocation(f.element.resource, 'Saved reasoning.', { ...provenance, canvasRevision: 3 });
    f.element.annotation = 'Saved reasoning.';
    render(
      <ResourceAllocationLab
        {...f}
        editable
        busy={false}
        explanationEditable={false}
        activityMode="practice"
      />,
    );
    expect(screen.queryByLabelText('What happened, and why?')).toBeNull();
    expect(screen.getByText(/Explanation saved. It hasn’t been checked/)).toBeTruthy();
    expect(screen.getByText(/Assisted practice/)).toBeTruthy();
  });
  it('preserves numeric quantities and units in text mode without drag-only controls', () => {
    const f = fixture(1, 'predicted');
    render(<ResourceAllocationLab {...f} editable busy={false} textOnly />);
    expect(screen.queryByRole('button', { name: /Drag a VM/ })).toBeNull();
    expect(screen.getByText('40 GB')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Add one VM' })).toBeEnabled();
  });
  it('locks editing while an operation is running and after commitment', () => {
    const f = fixture(1, 'predicted');
    const { rerender } = render(<ResourceAllocationLab {...f} editable busy />);
    expect(screen.getByRole('button', { name: 'Add one VM' })).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('Testing your prediction');
    rerender(<ResourceAllocationLab {...f} editable={false} busy={false} />);
    expect(screen.queryByRole('button', { name: 'Add one VM' })).toBeNull();
  });
  it('exposes history and technical provenance through explicit disclosures', () => {
    const f = fixture(1, 'observed');
    predictAllocation(
      f.element.resource,
      { requestedCount: 3, expectation: 'fits' },
      { ...provenance, commandId: 'next', canvasRevision: 3 },
    );
    render(<ResourceAllocationLab {...f} editable busy={false} />);
    expect(screen.getByText('Earlier tests (1)')).toBeTruthy();
    expect(screen.getByText('Inspect test details')).toBeTruthy();
    expect(screen.getAllByText('revision').length).toBeGreaterThan(0);
  });
});

it('keeps a new attempt’s typed explanation across a late public draft refresh', () => {
  const f = fixture(1, 'observed');
  const draft = {
    key: 'activity:branch:memory-lab',
    value: '',
    change: vi.fn(),
    save: vi.fn(async () => ({ status: 'committed' })),
  };
  const { rerender } = render(<ResourceAllocationLab {...f} editable busy={false} draft={draft} />);
  predictAllocation(
    f.element.resource,
    { requestedCount: 3, expectation: 'fits' },
    { ...provenance, commandId: 'new-prediction', canvasRevision: 3 },
  );
  executeAllocation(f.element.resource, 3, true, {
    ...provenance,
    commandId: 'new-execution',
    canvasRevision: 4,
  });
  rerender(<ResourceAllocationLab {...f} editable busy={false} draft={draft} />);
  fireEvent.change(screen.getByLabelText('What happened, and why?'), {
    target: { value: 'Three VMs use 24 GB; 24 GB remain.' },
  });
  rerender(
    <ResourceAllocationLab
      {...f}
      editable
      busy={false}
      draft={{ ...draft, value: 'old public draft' }}
    />,
  );
  expect(screen.getByLabelText('What happened, and why?')).toHaveValue(
    'Three VMs use 24 GB; 24 GB remain.',
  );
  expect(screen.getByRole('button', { name: 'Save explanation' })).toBeEnabled();
});
