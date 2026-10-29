import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  observeResourceAllocation,
  predictAllocation,
  executeAllocation,
  type ResourceAllocation,
} from '@edrion/schemas';
import { ClassicVMActivity } from './classic-vm-activity';
function resource(count: number, phase: 'ready' | 'predicted' | 'observed'): ResourceAllocation {
  const model = {
    kernel: 'resource-capacity.v1' as const,
    totalGB: 64,
    reservedGB: 16,
    perVMGB: 8,
  };
  const r: ResourceAllocation = {
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
  const p = {
    commandId: 'prediction',
    sessionId: 'session',
    at: '2026-10-25T10:00:00.000Z',
    sourceRevisionId: 'source-revision',
    sourceHash: 'a'.repeat(64),
    activityId: 'activity',
    branchId: 'branch',
    elementId: 'memory-lab',
    sourceId: 'source',
    canvasRevision: 1,
    operationIndex: 0,
  };
  if (phase !== 'ready')
    predictAllocation(r, { requestedCount: count + 1, expectation: 'fits' }, p);
  if (phase === 'observed') executeAllocation(r, count + 1, true, { ...p, commandId: 'allocate' });
  return r;
}
const props = (count = 0, phase: 'ready' | 'predicted' | 'observed' = 'ready') => ({
  resource: resource(count, phase),
  busy: false,
  canChange: true,
  editable: true,
  explanationEditable: true,
  textOnly: false,
  explanation: '',
  dirty: false,
  onExplanation: vi.fn(),
  saveExplanation: vi.fn(async () => null),
  predict: vi.fn(async () => null),
  allocate: vi.fn(async () => null),
  close: vi.fn(),
  memoryRef: vi.fn(),
});
describe('Classic VM interaction', () => {
  it('selects without committing and waits for the authoritative prediction before advancing', async () => {
    const p = props();
    render(<ClassicVMActivity {...p} />);
    expect(screen.getByRole('button', { name: 'Try my prediction' })).toBeDisabled();
    fireEvent.click(screen.getByRole('radio', { name: 'It will fit' }));
    expect(p.predict).not.toHaveBeenCalled();
    expect(screen.queryByLabelText('Accepted virtual machines')).toBeNull();
    await act(async () =>
      fireEvent.click(screen.getByRole('button', { name: 'Try my prediction' })),
    );
    expect(p.predict).toHaveBeenCalledWith('fits');
    expect(screen.queryByRole('button', { name: /Add a VM/ })).toBeNull();
  });
  it('prevents repeated clicks while an action is pending and retains selection on failure', async () => {
    let resolve: () => void = () => {};
    const p = props();
    p.predict = vi.fn(
      () =>
        new Promise<null>((r) => {
          resolve = () => r(null);
        }),
    );
    render(<ClassicVMActivity {...p} />);
    fireEvent.click(screen.getByRole('radio', { name: 'It won’t fit' }));
    fireEvent.click(screen.getByRole('button', { name: 'Try my prediction' }));
    fireEvent.click(screen.getByRole('button', { name: 'Saving prediction…' }));
    expect(p.predict).toHaveBeenCalledTimes(1);
    await act(async () => resolve());
    expect(screen.getByRole('radio', { name: 'It won’t fit' })).toBeChecked();
  });
  it('shows only six accepted allocations when the seventh is refused', () => {
    const { container } = render(<ClassicVMActivity {...props(6, 'observed')} />);
    expect(container.querySelectorAll('[data-filled="true"]')).toHaveLength(6);
    expect(screen.getByText('Not enough room')).toBeVisible();
    expect(screen.getByText('There is 0 GB left, but another VM needs 8 GB.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Explain what happened' })).toBeEnabled();
    expect(container.querySelector('[data-refusal-motion="true"]')).toBeNull();
  });
  it('uses changed source quantities without assuming the example configuration', () => {
    const p = props();
    p.resource.model = { kernel: 'resource-capacity.v1', totalGB: 32, reservedGB: 8, perVMGB: 4 };
    p.resource.observations = [
      {
        beforeCount: 0,
        requestedCount: 0,
        prediction: null,
        ...observeResourceAllocation(p.resource.model, 0, 0),
      },
    ];
    render(<ClassicVMActivity {...p} />);
    expect(screen.getByText('32 GB total')).toBeVisible();
    expect(screen.getByText('24 GB available · 4 GB per VM')).toBeVisible();
  });
  it('labels a restored multi-VM request with its actual requested memory', () => {
    const p = props(1);
    predictAllocation(
      p.resource,
      { requestedCount: 4, expectation: 'fits' },
      {
        commandId: 'restored',
        sessionId: 'session',
        at: '2026-10-25T10:00:00.000Z',
        sourceRevisionId: 'revision',
        sourceHash: 'hash',
        activityId: 'activity',
        branchId: 'branch',
        elementId: 'memory-lab',
        sourceId: 'source',
        canvasRevision: 2,
        operationIndex: 0,
      },
    );
    render(<ClassicVMActivity {...p} />);
    expect(screen.getByRole('button', { name: 'Add 3 VMs (24 GB)' })).toBeEnabled();
  });
  it('keeps explanation entry behind an observed result and saves without claiming evaluation', async () => {
    const p = props(6, 'observed');
    render(<ClassicVMActivity {...p} />);
    expect(screen.queryByRole('textbox')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Explain what happened' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Explain it in your own words' }), {
      target: { value: 'No memory remains.' },
    });
    expect(p.onExplanation).toHaveBeenCalledWith('No memory remains.');
    expect(screen.queryByText('Correct')).toBeNull();
  });
  it('does not display an old prediction as a new experiment result', () => {
    render(<ClassicVMActivity {...props(3, 'predicted')} />);
    expect(screen.getByRole('status', { name: 'Current experiment' })).toHaveTextContent(
      'prediction is saved',
    );
    expect(screen.queryByText('What happened')).toBeNull();
    expect(screen.getByText('3 VMs · 24 GB used · 24 GB free')).toBeVisible();
  });
});
