import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyEngineCommand, compileEngineProgram, createEngineReferenceProgram, engineProgramSchema, evaluateEngineSnapshot,
  initialEngineSnapshot, localEngineAuthority, resolveEngineViews, type EngineCommand, type EngineSnapshot,
} from '@edrion/schemas';
import { StudentApiProvider } from '@/lib/api-client';
import { PetrosProgramWorkspace, PetrosProgramWorkspaceCompanion, PetrosProgramWorkspaceProvider } from './petros-program-workspace';

vi.mock('@/lib/hooks', () => ({ useStudentMe: () => ({ data: { kind: 'independent' } }) }));

const program = engineProgramSchema.parse({
  schemaVersion: 'petros.visual-program.v2', programId: '00000000-0000-4000-8000-000000000101',
  ownerScopeRef: 'student:test:block', revision: 1, title: 'Linked point', source: null,
  provenance: 'engineering_comparison',
  description: { summary: 'A point in a bounded scene.', details: ['Select the point.'], dataDescription: 'One point at (20, 30).' },
  capabilities: [{ id: 'render.svg', version: 1 }, { id: 'physics.pendulum.ideal', version: 1 }],
  entities: [{ id: 'ball', label: 'Ball', conceptId: null, description: 'A selectable point.' }],
  parameters: [
    { id: 'length', label: 'Length', type: 'number', unit: 'm', initial: 1, min: .1, max: 10, change: 'restart' },
    { id: 'mass', label: 'Mass', type: 'number', unit: 'kg', initial: 1, min: .01, max: 100, change: 'restart' },
    { id: 'gravity', label: 'Gravity', type: 'number', unit: 'm/s^2', initial: 9.81, min: 1, max: 25, change: 'restart' },
    { id: 'angle', label: 'Release angle', type: 'number', unit: 'rad', initial: .5, min: -1.4, max: 1.4, change: 'restart' },
  ], state: [], models: [{ id: 'pendulumModel', capabilityId: 'physics.pendulum.ideal', version: 1,
    solver: 'rk4.nonlinear-pendulum.dt-0.001.v1', inputs: { length: 'length', mass: 'mass', gravity: 'gravity', angle: 'angle' },
    outputs: { angle: 'pendulumAngle' } }], computations: [], behaviors: [],
  views: [{ id: 'main', title: 'Main view', width: 100, height: 80, layers: ['foreground'], primitives: [
    { id: 'ballPoint', entityId: 'ball', layerId: 'foreground', kind: 'point', description: 'Ball point', x: 20, y: 30, visible: true },
  ] }],
  bindings: [], plots: [], inverseInputs: [],
  teachingTrack: [{ id: 'beatOne', text: 'Watch the ball.', targets: ['ball'], sync: { kind: 'explanation' } }],
  assumptions: ['Ideal nonlinear pendulum comparison.'], executionLimits: { operations: 100, solverSteps: 20_000, duration: 20 },
});
const initial = initialEngineSnapshot(compileEngineProgram(program, localEngineAuthority(program)), '00000000-0000-4000-8000-000000000102');

class ComputeWorker {
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  postMessage(message: { id: number; snapshot: EngineSnapshot; time: number }) {
    const snapshot = evaluateEngineSnapshot(message.snapshot, message.time);
    queueMicrotask(() => this.onmessage?.({ data: { id: message.id, ok: true, snapshot, views: JSON.parse(JSON.stringify(resolveEngineViews(snapshot))) } } as MessageEvent));
  }
  terminate() { /* no asynchronous work remains */ }
}

function Harness({ lesson = true }: { lesson?: boolean }) {
  return <StudentApiProvider baseUrl="http://localhost:3333"><PetrosProgramWorkspaceProvider>
    {lesson && <PetrosProgramWorkspace sessionId="00000000-0000-4000-8000-000000000103" blockId="00000000-0000-4000-8000-000000000104" />}
    <PetrosProgramWorkspaceCompanion />
  </PetrosProgramWorkspaceProvider></StudentApiProvider>;
}

describe('shared Petros program workspace', () => {
  beforeEach(() => {
    vi.stubGlobal('Worker', ComputeWorker);
    vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
    HTMLDialogElement.prototype.showModal = function showModal() { this.open = true; this.setAttribute('open', ''); };
    HTMLDialogElement.prototype.close = function close() { this.open = false; this.removeAttribute('open'); };
  });

  it('preserves the same acknowledged scene across lesson and companion and retries a lost reply with the exact command', async () => {
    let snapshot: EngineSnapshot | null = null;
    let lostSelect = true;
    const commands: EngineCommand[] = [];
    let applied = 0;
    const receipts = new Map<string, EngineSnapshot>();
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'GET') return new Response(JSON.stringify(snapshot
        ? { status: 'available', snapshot, checkpoints: [], recovery: { acknowledgedExperimentVersion: snapshot.execution.version, unacknowledgedInterval: 'not_persisted' } }
        : { status: 'ready', program }), { status: 200 });
      const command = JSON.parse(String(init?.body)) as EngineCommand;
      commands.push(command);
      const replayed = receipts.has(command.operationId);
      if (replayed) snapshot = receipts.get(command.operationId)!;
      else {
        snapshot = command.action.type === 'create' ? initial : applyEngineCommand(snapshot!, command, localEngineAuthority(program));
        receipts.set(command.operationId, snapshot); applied++;
      }
      if (command.action.type === 'select' && lostSelect) { lostSelect = false; throw new TypeError('Connection lost'); }
      return new Response(JSON.stringify({ status: 'available', snapshot, replayed,
        receipt: { operationId: command.operationId, commandHash: 'synthetic', checkpointId: '00000000-0000-4000-8000-000000000105' } }), { status: 200 });
    }));

    const mounted = render(<Harness />);
    fireEvent.click(await screen.findByRole('button', { name: 'Start scene' }));
    expect(await screen.findByText('Watch the ball.')).toBeVisible();
    fireEvent.click(screen.getAllByRole('button', { name: 'Ball point' })[0]!);
    expect(await screen.findByRole('button', { name: 'Retry exact action' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Retry exact action' }));
    expect(await screen.findByText('Selected: Ball')).toBeVisible();
    expect(commands[1]).toEqual(commands[2]);
    expect(applied).toBe(2);

    fireEvent.change(screen.getByRole('textbox', { name: 'My notes' }), { target: { value: 'I selected the point.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save notes' }));
    await waitFor(() => expect(snapshot?.draft.text).toBe('I selected the point.'));
    mounted.rerender(<Harness lesson={false} />);
    expect(screen.getByText(/Learning scene: Linked point/)).toBeVisible();
    mounted.rerender(<Harness />);
    expect(await screen.findByDisplayValue('I selected the point.')).toBeVisible();
    expect(screen.getByText('Selected: Ball')).toBeVisible();
    mounted.unmount();
    render(<Harness />);
    expect(await screen.findByDisplayValue('I selected the point.')).toBeVisible();
    expect(screen.getByText('Selected: Ball')).toBeVisible();
  });

  it('keeps the model value hidden until submit and retries a lost answer with its exact request', async () => {
    let snapshot: EngineSnapshot | null = null;
    const issueBodies: unknown[] = [];
    const answerBodies: unknown[] = [];
    let lostAnswer = true;
    const challenge = { status: 'challenge', challengeId: '00000000-0000-4000-8000-000000000201',
      checkpointId: '00000000-0000-4000-8000-000000000202', programRevision: 1, experimentVersion: 0,
      modelId: 'pendulumModel', capabilityId: 'physics.pendulum.ideal', targetTime: .5, outputPort: 'angle',
      unit: 'rad', prompt: 'Before advancing the model, predict angle at 0.5 s in rad.', priorExploration: true,
      assistanceStatus: 'external_help_unknown', evidenceEligibility: 'observation_only', replayed: false };
    const evaluation = { status: 'evaluated', challenge: { ...challenge, status: undefined, replayed: undefined },
      result: 'within_tolerance', referenceValue: .31, tolerance: .02, predictedValue: .31,
      assistance: 'external_declared', externalHelp: 'unknown', masteryAdmitted: false, replayed: false };
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === 'GET') return new Response(JSON.stringify(snapshot
        ? { status: 'available', snapshot, checkpoints: [] }
        : { status: 'ready', program }), { status: 200 });
      if (init?.method === 'PUT') {
        const command = JSON.parse(String(init.body)) as EngineCommand;
        snapshot = command.action.type === 'create' ? initial : applyEngineCommand(snapshot!, command, localEngineAuthority(program));
        return new Response(JSON.stringify({ status: 'available', snapshot,
          receipt: { operationId: command.operationId, commandHash: 'synthetic', checkpointId: challenge.checkpointId } }), { status: 200 });
      }
      const body = JSON.parse(String(init?.body));
      if (url.endsWith('/workspace/predictions')) {
        issueBodies.push(body);
        return new Response(JSON.stringify(challenge), { status: 200 });
      }
      answerBodies.push(body);
      if (lostAnswer) { lostAnswer = false; throw new TypeError('Connection lost after server commit'); }
      return new Response(JSON.stringify(evaluation), { status: 200 });
    }));

    render(<Harness />);
    fireEvent.click(await screen.findByRole('button', { name: 'Start scene' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Request prediction prompt' }));
    expect(await screen.findByText(challenge.prompt)).toBeVisible();
    expect(screen.queryByText(/Model value:/)).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole('spinbutton', { name: /My prediction/ }), { target: { value: '0.31' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Help used for prediction' }), { target: { value: 'external_declared' } });
    fireEvent.click(screen.getByRole('button', { name: 'Check prediction' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Retry exact prediction request' }));
    expect(await screen.findByText(/Your prediction was within the model tolerance/)).toBeVisible();
    expect(screen.getByText(/Outside help remains unknown. No mastery was admitted/)).toBeVisible();
    expect(issueBodies).toHaveLength(1);
    expect(answerBodies).toHaveLength(2);
    expect(answerBodies[0]).toEqual(answerBodies[1]);
    expect(answerBodies[0]).toMatchObject({ challengeId: challenge.challengeId, predictedValue: .31, assistance: 'external_declared' });
    expect(screen.getByText(/Model value: 0.31 rad/)).toBeVisible();
  });

  it('does not turn a cleared numeric time into zero and exposes accessible scene values in the companion', async () => {
    let snapshot: EngineSnapshot | null = initial;
    const actions: EngineCommand[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'GET') return new Response(JSON.stringify({ status: 'available', snapshot, checkpoints: [] }), { status: 200 });
      const command = JSON.parse(String(init?.body)) as EngineCommand;
      actions.push(command);
      snapshot = applyEngineCommand(snapshot!, command, localEngineAuthority(program));
      return new Response(JSON.stringify({ status: 'available', snapshot }), { status: 200 });
    }));
    vi.stubGlobal('Worker', undefined);
    render(<Harness />);
    const time = await screen.findByRole('spinbutton', { name: /Time \(s\)/ });
    // Keyboard navigation through unchanged controls must not restart the model
    // or create a pending mutation that swallows the next step button press.
    fireEvent.blur(time);
    fireEvent.blur(screen.getByRole('spinbutton', { name: /Length/ }));
    expect(actions).toHaveLength(0);
    fireEvent.change(time, { target: { value: '' } });
    fireEvent.blur(time);
    expect(actions.filter(command => command.action.type === 'seek')).toHaveLength(0);
    expect(within(screen.getByRole('region', { name: 'Current learning scene' })).getByRole('table')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Current learning scene' })).getByText('pendulumAngle')).toBeInTheDocument();
  });

  it('shows intervention switches at displayed time and replays their history when seeking', async () => {
    const circuitProgram = createEngineReferenceProgram({ ownerScopeRef: 'student:test:block',
      programId: '00000000-0000-4000-8000-000000000301', source: null,
      allowedCapabilities: ['render.svg', 'language.typed', 'circuits.dc.series'] }, 'circuits.dc.series');
    const circuitInitial = initialEngineSnapshot(compileEngineProgram(circuitProgram, localEngineAuthority(circuitProgram)), '00000000-0000-4000-8000-000000000302');
    let snapshot: EngineSnapshot | null = circuitInitial;
    const actions: EngineCommand[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'GET') return new Response(JSON.stringify({ status: 'available', snapshot, checkpoints: [] }), { status: 200 });
      const command = JSON.parse(String(init?.body)) as EngineCommand;
      actions.push(command);
      snapshot = applyEngineCommand(snapshot!, command, localEngineAuthority(circuitProgram));
      return new Response(JSON.stringify({ status: 'available', snapshot }), { status: 200 });
    }));
    render(<Harness />);
    const closed = await screen.findByRole('combobox', { name: /closed/ });
    expect(closed).toHaveValue('true');

    fireEvent.click(screen.getByRole('button', { name: 'Step' }));
    await waitFor(() => expect(snapshot?.execution.time).toBe(.1));
    fireEvent.change(closed, { target: { value: 'false' } });
    await waitFor(() => expect(snapshot?.execution.inputEvents).toHaveLength(1));
    expect(closed).toHaveValue('false');

    fireEvent.click(screen.getByRole('button', { name: 'Step' }));
    await waitFor(() => expect(snapshot?.execution.time).toBe(.2));
    fireEvent.change(screen.getByRole('combobox', { name: /closed/ }), { target: { value: 'true' } });
    await waitFor(() => expect(snapshot?.execution.inputEvents).toHaveLength(2));
    expect(screen.getByRole('combobox', { name: /closed/ })).toHaveValue('true');

    const time = screen.getByRole('spinbutton', { name: /Time \(s\)/ });
    fireEvent.change(time, { target: { value: '.15' } });
    fireEvent.blur(time);
    await waitFor(() => expect(snapshot?.execution.time).toBe(.15));
    expect(screen.getByRole('combobox', { name: /closed/ })).toHaveValue('false');
    fireEvent.change(time, { target: { value: '.25' } });
    fireEvent.blur(time);
    await waitFor(() => expect(snapshot?.execution.time).toBe(.25));
    expect(screen.getByRole('combobox', { name: /closed/ })).toHaveValue('true');
    expect(snapshot?.execution.inputEvents.map(event => event.value)).toEqual([false, true]);
  });

  it('checkpoints the live preview before changing views and resumes only continue-mode interruptions', async () => {
    let snapshot: EngineSnapshot | null = { ...initial, execution: { ...initial.execution, playing: true } };
    const actions: EngineCommand[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'GET') return new Response(JSON.stringify({ status: 'available', snapshot, checkpoints: [] }), { status: 200 });
      const command = JSON.parse(String(init?.body)) as EngineCommand;
      actions.push(command);
      snapshot = applyEngineCommand(snapshot!, command, localEngineAuthority(program));
      return new Response(JSON.stringify({ status: 'available', snapshot }), { status: 200 });
    }));
    render(<Harness />);
    const time = await screen.findByRole('spinbutton', { name: /Time \(s\)/ });
    fireEvent.change(time, { target: { value: '1.25' } });
    await waitFor(() => expect(screen.getByText(/local preview at 1\.25 seconds/)).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Main view' }));
    await waitFor(() => expect(actions.map(command => command.action.type)).toEqual(['seek', 'switch_representation', 'play']));
    expect(actions[0]?.action).toMatchObject({ type: 'seek', time: 1.25 });
    expect(snapshot?.execution.playing).toBe(true);

    fireEvent.change(time, { target: { value: '1.5' } });
    await waitFor(() => expect(screen.getByText(/local preview at 1\.50 seconds/)).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Interrupt; let simulation continue' }));
    await waitFor(() => expect(actions.slice(3).map(command => command.action.type)).toEqual(['seek', 'interrupt', 'play']));
    expect(snapshot?.execution.playing).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Interrupt and freeze' }));
    await waitFor(() => expect(snapshot?.teaching.mode).toBe('freeze'));
    expect(snapshot?.execution.playing).toBe(false);
    expect(actions.at(-1)?.action.type).toBe('interrupt');
  });

  it('keeps a failed time checkpoint pending and does not run the view change before its exact retry', async () => {
    let snapshot: EngineSnapshot | null = { ...initial, execution: { ...initial.execution, playing: true } };
    let lostFirstReply = true;
    const commands: EngineCommand[] = [];
    const receipts = new Map<string, EngineSnapshot>();
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'GET') return new Response(JSON.stringify({ status: 'available', snapshot, checkpoints: [] }), { status: 200 });
      const command = JSON.parse(String(init?.body)) as EngineCommand;
      commands.push(command);
      snapshot = receipts.get(command.operationId) ?? applyEngineCommand(snapshot!, command, localEngineAuthority(program));
      receipts.set(command.operationId, snapshot);
      if (lostFirstReply) { lostFirstReply = false; throw new TypeError('Connection lost after checkpoint commit'); }
      return new Response(JSON.stringify({ status: 'available', snapshot }), { status: 200 });
    }));
    render(<Harness />);
    const time = await screen.findByRole('spinbutton', { name: /Time \(s\)/ });
    fireEvent.change(time, { target: { value: '1.25' } });
    await waitFor(() => expect(screen.getByText(/local preview at 1\.25 seconds/)).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Main view' }));
    expect(await screen.findByRole('button', { name: 'Retry exact action' })).toBeVisible();
    expect(commands).toHaveLength(1);
    expect(commands[0]?.action).toMatchObject({ type: 'seek', time: 1.25 });

    fireEvent.click(screen.getByRole('button', { name: 'Retry exact action' }));
    await waitFor(() => expect(commands).toHaveLength(2));
    expect(commands[1]).toEqual(commands[0]);
    expect(commands.some(command => command.action.type === 'switch_representation' || command.action.type === 'play')).toBe(false);
  });

  it('uses a reduced-motion step by default and only plays continuously after explicit opt-in', async () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
    let snapshot: EngineSnapshot | null = null;
    const actions: EngineCommand[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'GET') return new Response(JSON.stringify(snapshot
        ? { status: 'available', snapshot, checkpoints: [] }
        : { status: 'ready', program }), { status: 200 });
      const command = JSON.parse(String(init?.body)) as EngineCommand;
      actions.push(command);
      snapshot = command.action.type === 'create' ? initial : applyEngineCommand(snapshot!, command, localEngineAuthority(program));
      return new Response(JSON.stringify({ status: 'available', snapshot }), { status: 200 });
    }));
    render(<Harness />);
    fireEvent.click(await screen.findByRole('button', { name: 'Start scene' }));
    const advance = await screen.findByRole('button', { name: 'Advance one step' });
    fireEvent.click(advance);
    await waitFor(() => expect(actions.at(-1)?.action.type).toBe('step'));
    expect(actions.some(command => command.action.type === 'play')).toBe(false);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Allow continuous simulation motion' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Play' }));
    await waitFor(() => expect(actions.at(-1)?.action.type).toBe('play'));
  });

  it('resumes narration from the last confirmed character across the expanded view and returns the unsaved draft', async () => {
    class TestUtterance {
      text: string;
      onboundary: ((event: SpeechSynthesisEvent) => void) | null = null;
      onend: ((event: SpeechSynthesisEvent) => void) | null = null;
      onerror: ((event: SpeechSynthesisErrorEvent) => void) | null = null;
      constructor(text: string) { this.text = text; }
    }
    const spoken: TestUtterance[] = [];
    vi.stubGlobal('SpeechSynthesisUtterance', TestUtterance);
    vi.stubGlobal('speechSynthesis', { cancel: vi.fn(), speak: (utterance: TestUtterance) => spoken.push(utterance) });
    let snapshot: EngineSnapshot | null = null;
    const actions: EngineCommand[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'GET') return new Response(JSON.stringify(snapshot
        ? { status: 'available', snapshot, checkpoints: [] }
        : { status: 'ready', program }), { status: 200 });
      const command = JSON.parse(String(init?.body)) as EngineCommand;
      actions.push(command);
      snapshot = command.action.type === 'create' ? initial : applyEngineCommand(snapshot!, command, localEngineAuthority(program));
      return new Response(JSON.stringify({ status: 'available', snapshot }), { status: 200 });
    }));
    render(<Harness />);
    fireEvent.click(await screen.findByRole('button', { name: 'Start scene' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Speak' }));
    act(() => spoken[0]!.onboundary?.({ charIndex: 5, elapsedTime: 1.25 } as SpeechSynthesisEvent));
    const opener = screen.getByRole('button', { name: 'Expand' });
    opener.focus();
    fireEvent.click(opener);
    await waitFor(() => expect(actions.at(-1)?.action.type).toBe('expand'));
    fireEvent.click((await screen.findAllByRole('button', { name: 'Interrupt and freeze' })).at(-1)!);
    await waitFor(() => expect(actions.at(-1)?.action).toMatchObject({ type: 'interrupt', character: 5, offset: 1.25 }));
    fireEvent.change(screen.getAllByRole('textbox', { name: 'My notes' }).at(-1)!, { target: { value: 'An unsaved draft across views.' } });
    fireEvent.click((await screen.findAllByRole('button', { name: 'Resume explanation' })).at(-1)!);
    await waitFor(() => expect(spoken).toHaveLength(2));
    expect(spoken[1]!.text).toBe(' the ball.');
    fireEvent.click(screen.getByRole('button', { name: 'Return to lesson' }));
    expect(await screen.findByDisplayValue('An unsaved draft across views.')).toBeVisible();
    await waitFor(() => expect(opener).toHaveFocus());
  });

  it('returns focus to the triggering workspace button when pointer activation did not focus it', async () => {
    let snapshot: EngineSnapshot | null = null;
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'GET') return new Response(JSON.stringify(snapshot
        ? { status: 'available', snapshot, checkpoints: [] }
        : { status: 'ready', program }), { status: 200 });
      const command = JSON.parse(String(init?.body)) as EngineCommand;
      snapshot = command.action.type === 'create' ? initial : applyEngineCommand(snapshot!, command, localEngineAuthority(program));
      return new Response(JSON.stringify({ status: 'available', snapshot }), { status: 200 });
    }));
    render(<Harness />);
    fireEvent.click(await screen.findByRole('button', { name: 'Start scene' }));
    const opener = await screen.findByRole('button', { name: 'Expand' });
    const notes = screen.getByRole('textbox', { name: 'My notes' });
    notes.focus();
    expect(notes).toHaveFocus();

    // fireEvent.click models pointer activation without the focus behavior some engines
    // provide implicitly, so the opener must come from the event target itself.
    fireEvent.click(opener);
    await screen.findByRole('dialog', { name: 'Expanded Petros scene' });
    fireEvent.click(screen.getByRole('button', { name: 'Return to lesson' }));
    await waitFor(() => expect(opener).toHaveFocus());
  });
});
