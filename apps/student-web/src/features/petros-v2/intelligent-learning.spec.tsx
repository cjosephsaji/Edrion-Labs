import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CanvasElement, EquationStep, SimulationRequest } from '@edrion/schemas';
import { GraphTable } from './canvas/graph-table';
import { CodeTrace } from './canvas/code-trace';
import { EquationModel } from './canvas/equation-model';
import { PredictionExplanation } from './experiences/prediction-explanation';

const base = {
  id: 'content',
  version: 1,
  sourceId: 'source',
  editable: false,
  label: 'Supplied example',
};
const graph: Extract<CanvasElement, { kind: 'graph' }> = {
  ...base,
  kind: 'graph',
  xUnit: 'seconds',
  yUnit: 'requests',
  points: [
    { x: 0, y: 0 },
    { x: 2, y: 12 },
    { x: 4, y: 24 },
  ],
};
const table: Extract<CanvasElement, { kind: 'table' }> = {
  ...base,
  kind: 'table',
  columns: ['Case', 'Responsibility'],
  rows: [
    ['Case A', 'Consumer'],
    ['Case B', 'Provider'],
  ],
  editableCells: [],
};
const trace: Extract<CanvasElement, { kind: 'trace' }> = {
  ...base,
  kind: 'trace',
  currentLine: 0,
  lines: [
    { id: 'first', text: 'count := 1', state: { count: 1 } },
    { id: 'next', text: 'count := count + 1', state: { count: 2 } },
  ],
};
const memory: SimulationRequest = {
  kernel: 'resource-capacity.v1',
  totalGB: 64,
  reservedGB: 16,
  perVMGB: 8,
};
afterEach(() => vi.useRealTimers());
describe('Automatically selected visual learning formats', () => {
  it('inspects actual graph points without modifying their supplied coordinates', () => {
    render(<GraphTable element={graph} />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Inspect point 2: 2 seconds, 12 requests' }),
    );
    const facts = screen.getByRole('status');
    expect(facts).toHaveTextContent('Selected seconds2');
    expect(facts).toHaveTextContent('Recorded requests12');
    expect(graph.points[1]).toEqual({ x: 2, y: 12 });
  });
  it('keeps every graph value available in text-only mode', () => {
    render(<GraphTable element={graph} textOnly />);
    expect(screen.queryByRole('figure')).not.toBeInTheDocument();
    expect(screen.getByRole('table')).toHaveTextContent('24');
    expect(screen.getByRole('table')).toHaveTextContent('secondsrequests');
  });
  it('compares chosen rows using exact source values', () => {
    render(<GraphTable element={table} />);
    fireEvent.click(screen.getByRole('button', { name: 'Compare row 1: Case A' }));
    fireEvent.click(screen.getByRole('button', { name: 'Compare row 2: Case B' }));
    const selected = screen.getByRole('region', { name: 'Selected row comparison' });
    expect(within(selected).getByText('Consumer')).toBeInTheDocument();
    expect(within(selected).getByText('Provider')).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });
  it('edits only the declared table cell through the existing canvas operation', () => {
    const edit = vi.fn(async () => undefined);
    render(
      <GraphTable
        element={{ ...table, editable: true, editableCells: [{ row: 1, column: 1 }] }}
        editable
        edit={edit}
      />,
    );
    expect(screen.getAllByRole('textbox')).toHaveLength(1);
    fireEvent.change(screen.getByRole('textbox', { name: 'Responsibility, row 2' }), {
      target: { value: 'My revision' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save cell' }));
    expect(edit).toHaveBeenCalledWith({
      type: 'replace_cell',
      id: 'content',
      expectedVersion: 1,
      row: 1,
      column: 1,
      value: 'My revision',
    });
  });
  it('keeps protected table cells read-only even if a caller requests editing', () => {
    render(
      <GraphTable
        element={{ ...table, editable: false, editableCells: [{ row: 1, column: 1 }] }}
        editable
        edit={vi.fn()}
      />,
    );
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });
  it('navigates finite process state and never executes displayed code', () => {
    render(<CodeTrace elements={[trace]} />);
    expect(screen.getByRole('button', { name: 'Previous process step' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Next process step' }));
    expect(screen.getByRole('status')).toHaveTextContent('Count2');
    expect(screen.getByRole('button', { name: 'Next process step' })).toBeDisabled();
    expect(trace.currentLine).toBe(0);
  });
  it('provides the whole process as a text table independently of timeline graphics', () => {
    render(<CodeTrace elements={[trace]} textOnly />);
    expect(
      screen.queryByRole('list', { name: 'Process sequence' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('table')).toHaveTextContent('count := count + 1');
  });
  it('draws quantity flow for a different checked unit relationship', () => {
    const step: EquationStep = {
      id: 'rate',
      elementId: 'rate-equation',
      rule: 'multiply',
      inputs: [
        { value: 5, unit: 'requests/second' },
        { value: 3, unit: 'seconds' },
      ],
      result: { value: 15, unit: 'requests' },
      assumptions: [],
      corrects: null,
    };
    render(<EquationModel step={step} />);
    expect(
      screen.getByRole('figure', { name: 'Quantity flow example' }),
    ).toHaveTextContent('15');
    expect(screen.getByRole('figure')).toHaveTextContent('requests/second');
    expect(screen.queryByText('VM')).not.toBeInTheDocument();
  });
  it('draws generic part and whole quantities without a subject-name branch', () => {
    const step: EquationStep = {
      id: 'sum',
      elementId: 'sum-equation',
      rule: 'add',
      inputs: [
        { value: 7, unit: 'requests' },
        { value: 4, unit: 'requests' },
      ],
      result: { value: 11, unit: 'requests' },
      assumptions: [],
      corrects: null,
    };
    render(<EquationModel step={step} />);
    expect(
      screen.getByRole('figure', { name: 'Part and whole example' }),
    ).toHaveTextContent('11 requests');
  });
});

describe('Content-driven experiments keep checked receipts separate from draft inputs', () => {
  it.each([
    [memory, 'Total memory (GB)'],
    [{ kernel: 'linear-rate.v1', rate: 5, seconds: 3 }, 'Request rate (requests/second)'],
    [
      { kernel: 'projectile-no-drag.v1', vx: 10, vy: 15, gravity: 9.8, seconds: 1 },
      'Gravity (m/s²)',
    ],
  ] as const)('automatically chooses friendly controls for %j', (initial, label) => {
    render(<PredictionExplanation initial={initial} busy={false} run={vi.fn()} />);
    expect(screen.getByRole('spinbutton', { name: label })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Run bounded experiment' })).toBeDisabled();
  });
  it('requires a prediction and sends only a valid typed request after an edit', async () => {
    vi.useFakeTimers();
    const run = vi.fn(async () => undefined);
    render(<PredictionExplanation initial={memory} busy={false} run={run} />);
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Total memory (GB)' }), {
      target: { value: '80' },
    });
    await act(async () => vi.advanceTimersByTime(500));
    expect(run).not.toHaveBeenCalled();
    fireEvent.change(
      screen.getByRole('textbox', { name: 'Your prediction and reason' }),
      { target: { value: 'I expect a larger capacity.' } },
    );
    await act(async () => vi.advanceTimersByTime(500));
    expect(run).toHaveBeenCalledWith({ ...memory, totalGB: 80 });
  });
  it('keeps the old checked result when draft parameters change instead of calculating a new answer', () => {
    render(
      <PredictionExplanation
        initial={memory}
        busy={false}
        run={vi.fn()}
        result={{
          input: memory,
          values: { availableGB: 48, capacity: 6 },
          summary: 'Checked memory observation.',
        }}
      />,
    );
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Total memory (GB)' }), {
      target: { value: '80' },
    });
    expect(
      screen.getByRole('heading', { name: 'Last checked observation' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('figure', {
        name: 'Checked memory model: 6 whole VMs, 48 GB available',
      }),
    ).toHaveTextContent('64 GB');
    expect(screen.queryByText('8 whole VMs')).not.toBeInTheDocument();
  });
  it('keeps invalid drafts local and does not request an impossible reservation', () => {
    const run = vi.fn();
    render(<PredictionExplanation initial={memory} busy={false} run={run} />);
    fireEvent.change(
      screen.getByRole('textbox', { name: 'Your prediction and reason' }),
      { target: { value: 'My prediction' } },
    );
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Memory set aside (GB)' }), {
      target: { value: '100' },
    });
    expect(screen.getByRole('alert')).toHaveTextContent('cannot exceed the total memory');
    expect(screen.getByRole('button', { name: 'Run bounded experiment' })).toBeDisabled();
    expect(run).not.toHaveBeenCalled();
  });
  it('draws the supplied rate observation without inventing intermediate samples', () => {
    const input = { kernel: 'linear-rate.v1' as const, rate: 5, seconds: 3 };
    render(
      <PredictionExplanation
        initial={input}
        busy={false}
        run={vi.fn()}
        result={{ input, values: { requests: 15 }, summary: 'A checked observation.' }}
      />,
    );
    expect(
      screen.getByRole('figure', { name: 'Checked rate observation' }),
    ).toHaveTextContent('15');
  });
  it('does not associate a historical receipt without input provenance with the current settings', () => {
    render(
      <PredictionExplanation
        initial={memory}
        busy={false}
        run={vi.fn()}
        result={{
          values: { availableGB: 48, capacity: 6 },
          summary: 'Saved historical observation.',
        }}
      />,
    );
    expect(
      screen.getByRole('heading', { name: 'Last checked observation' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('no recorded inputs');
    expect(screen.queryByRole('figure')).not.toBeInTheDocument();
  });
  it('shows an empty checked memory allocation without drawing a false proportional bar', () => {
    const input = { ...memory, totalGB: 0, reservedGB: 0 };
    render(
      <PredictionExplanation
        initial={input}
        busy={false}
        run={vi.fn()}
        result={{
          input,
          values: { availableGB: 0, capacity: 0 },
          summary: 'No capacity.',
        }}
      />,
    );
    expect(screen.getByRole('figure')).toHaveTextContent('No memory is available');
    expect(screen.getByRole('figure')).toHaveTextContent('0 whole VMs');
  });
  it('draws only the checked motion point and preserves the actual coordinates', () => {
    const input = {
      kernel: 'projectile-no-drag.v1' as const,
      vx: 10,
      vy: 15,
      gravity: 9.8,
      seconds: 1,
    };
    render(
      <PredictionExplanation
        initial={input}
        busy={false}
        run={vi.fn()}
        result={{
          input,
          values: { x: 10, y: 5, vx: 10, vy: 5.2 },
          summary: 'A checked point.',
        }}
      />,
    );
    expect(
      screen.getByRole('figure', { name: 'Checked position at the selected time' }),
    ).toHaveTextContent('x: 10 m · y: 5 m');
  });
});
