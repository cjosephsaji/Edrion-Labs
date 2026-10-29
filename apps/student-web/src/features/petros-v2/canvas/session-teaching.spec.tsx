import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  initialSharedCanvas,
  predictAllocation,
  executeAllocation,
  type CanvasElement,
  type M4Snapshot,
} from '@edrion/schemas';
import { TeachingTargetRegistry } from '@/features/learning-studio/target-registry';
import { TeachingCanvas } from './session-teaching-canvas';
import type { usePetrosSession } from '../use-petros-session';

function fixture() {
  const canvas = {
    ...initialSharedCanvas('activity'),
    mode: 'session' as const,
    elements: [
      {
        id: 'equation',
        kind: 'equation' as const,
        version: 1,
        label: 'Capacity',
        sourceId: 'source',
        editable: true,
        tex: '48 / 8 = 6 VM',
        explanation: 'Capacity in VM',
        value: '7',
      },
    ],
    invitation: {
      id: 'correct',
      prompt: 'Correct the step.',
      editableIds: ['equation'],
      allowedOperations: ['replace_content' as const, 'annotate' as const],
      submitted: false,
    },
  };
  const s = {
    id: 'session',
    epoch: 0,
    status: 'active',
    canvas,
    teaching: {
      actionId: 'action',
      status: 'participating',
      caption: 'Check this step.',
      decision: {
        strategy: 'method_repair',
        reason: 'The committed arithmetic criterion needs attention.',
      },
      nextBeat: 1,
      beatCount: 1,
      limitations: [],
    },
  } as unknown as M4Snapshot;
  const session = {
    busy: false,
    draft: '',
    changeDraft: vi.fn(),
    save: vi.fn(async () => null),
    command: vi.fn(async () => ({ status: 'committed' })),
  } as unknown as ReturnType<typeof usePetrosSession>;
  return { s, session };
}
describe('Durable teaching canvas accessibility and epoch fencing', () => {
  it('saves the actual edited value through a bounded session command', async () => {
    const { s, session } = fixture();
    render(
      <TeachingTargetRegistry>
        <TeachingCanvas snapshot={s} session={session} textOnly reducedMotion />
      </TeachingTargetRegistry>,
    );
    fireEvent.change(screen.getByRole('textbox', { name: 'Capacity' }), {
      target: { value: '6' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save Capacity step' }));
    expect(session.command).toHaveBeenCalledWith('canvas_edit', {
      edit: expect.objectContaining({
        expectedRevision: 0,
        operations: [{ type: 'replace_content', id: 'equation', expectedVersion: 1, text: '6' }],
      }),
    });
  });
  it('fences a scheduled presentation when the session pauses or epoch changes', async () => {
    const { s, session } = fixture();
    s.teaching!.status = 'presenting';
    const { rerender } = render(
      <TeachingTargetRegistry>
        <TeachingCanvas snapshot={s} session={session} textOnly reducedMotion />
      </TeachingTargetRegistry>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Play demonstration' }));
    rerender(
      <TeachingTargetRegistry>
        <TeachingCanvas
          snapshot={{ ...s, status: 'paused', epoch: 1 }}
          session={session}
          textOnly
          reducedMotion
        />
      </TeachingTargetRegistry>,
    );
    await act(async () => {
      await new Promise((r) => setTimeout(r, 220));
    });
    expect(session.command).not.toHaveBeenCalled();
  });
  it('keeps participation usable without audio, the character or graphical motion', async () => {
    const { s, session } = fixture();
    render(
      <TeachingTargetRegistry>
        <TeachingCanvas snapshot={s} session={session} textOnly reducedMotion />
      </TeachingTargetRegistry>,
    );
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Review your correction',
      }),
    );
    await waitFor(() => expect(session.command).toHaveBeenCalledWith('practice'));
    expect(screen.getByRole('textbox', { name: 'Capacity' })).toBeEnabled();
  });
  it('keeps actual criterion feedback visible when an evaluated calculation becomes compact', () => {
    const { s, session } = fixture();
    s.teaching = null;
    if (s.canvas!.elements[0]!.kind === 'equation') s.canvas!.elements[0]!.value = '6';
    s.submission = {
      id: 'corrected',
      commandId: 'commit',
      status: 'complete',
      response: { kind: 'text', text: 'Six VMs.' },
    };
    s.evaluation = {
      id: 'evaluation',
      responseId: 'corrected',
      status: 'evaluated',
      evaluatorVersion: 'petros.m4.kernel.v1',
      supersedes: null,
      reason: null,
      criteria: [
        {
          criterionId: 'capacity-check',
          label: 'Corrected capacity',
          origin: 'trusted_kernel',
          status: 'satisfied',
          feedback: 'Your committed work meets this bounded criterion.',
          target: { elementIds: ['equation'] },
        },
      ],
    };
    render(
      <TeachingTargetRegistry>
        <TeachingCanvas snapshot={s} session={session} textOnly reducedMotion />
      </TeachingTargetRegistry>,
    );
    expect(screen.getByRole('button', { name: /Capacity — 6/ })).toBeTruthy();
    expect(screen.getByText('Corrected capacity')).toBeVisible();
    expect(screen.getByText('Your committed work meets this bounded criterion.')).toBeVisible();
    expect(screen.queryByRole('textbox', { name: 'Capacity' })).toBeNull();
  });
  it('opens completed work in a contained dialog without remounting the lab or losing a dirty explanation', async () => {
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
      configurable: true,
      value: function () {
        this.setAttribute('open', '');
      },
    });
    Object.defineProperty(HTMLDialogElement.prototype, 'close', {
      configurable: true,
      value: function () {
        this.removeAttribute('open');
      },
    });
    const { s, session } = fixture();
    s.submission = {
      id: 'prior-response',
      commandId: 'prior-command',
      status: 'complete',
      response: { kind: 'structured', values: { available: 48, capacity: 7 } },
    };
    s.teaching!.progressResponseId = 'prior-response';
    s.teaching!.completedStepIds = ['available'];
    s.teaching!.equationSteps = [
      {
        id: 'subtract',
        elementId: 'available',
        rule: 'subtract',
        inputs: [
          { value: 64, unit: 'GB' },
          { value: 16, unit: 'GB' },
        ],
        result: { value: 48, unit: 'GB' },
        assumptions: [],
        corrects: null,
      },
    ];
    const resource: Extract<CanvasElement, { kind: 'allocation' }> = {
      id: 'lab',
      kind: 'allocation',
      sourceId: 'source',
      version: 2,
      label: 'Memory lab',
      editable: true,
      resource: {
        model: { kernel: 'resource-capacity.v1', totalGB: 64, reservedGB: 16, perVMGB: 8 },
        allocatedCount: 1,
        prediction: null,
        observations: [],
      },
    };
    const provenance = {
      commandId: 'prediction',
      sessionId: s.id,
      at: '2026-10-20T10:00:00.000Z',
      sourceRevisionId: 'revision',
      sourceHash: 'hash',
      activityId: s.canvas!.activityId,
      branchId: s.canvas!.branchId,
      elementId: 'lab',
      sourceId: 'source',
      canvasRevision: 1,
      operationIndex: 0,
    };
    predictAllocation(resource.resource, { requestedCount: 2, expectation: 'fits' }, provenance);
    executeAllocation(resource.resource, 2, true, {
      ...provenance,
      commandId: 'execution',
      canvasRevision: 2,
    });
    s.canvas!.elements.push(resource, {
      id: 'available',
      kind: 'equation',
      sourceId: 'source',
      version: 1,
      label: 'Available memory',
      editable: true,
      tex: '64 - 16 = 48 GB',
      explanation: 'Subtract the fixed reservation.',
      value: '48',
    });
    s.canvas!.invitation!.editableIds.push('lab', 'available');
    render(
      <TeachingTargetRegistry>
        <TeachingCanvas snapshot={s} session={session} textOnly reducedMotion />
      </TeachingTargetRegistry>,
    );
    const textarea = screen.getByLabelText('What happened, and why?');
    fireEvent.change(textarea, { target: { value: 'Keep this unfinished reasoning.' } });
    const before = screen.getByLabelText('Memory allocation area');
    const opener = screen.getByRole('button', { name: /Available memory — 48 GB/ });
    opener.focus();
    fireEvent.click(opener);
    expect(screen.getByRole('dialog')).toHaveTextContent('Subtract the fixed reservation.');
    expect(screen.queryByRole('textbox', { name: 'Available memory' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Close Available memory/ }));
    expect(screen.getByLabelText('Memory allocation area')).toBe(before);
    expect(textarea).toHaveValue('Keep this unfinished reasoning.');
    expect(opener).toHaveFocus();
    expect(session.command).not.toHaveBeenCalled();
  });
});
