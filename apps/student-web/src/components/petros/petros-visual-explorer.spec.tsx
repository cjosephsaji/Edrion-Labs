import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  applyPetrosVisualCommand,
  initialPetrosVisualCheckpoint,
  petrosVisualSnapshotSchema,
  type PetrosVisualCommand,
} from '@edrion/schemas';
import {
  visualCompositionFixture,
  visualFixtureId,
} from '../../../../../packages/schemas/src/__fixtures__/petros-visual';
import { StudentApiClient } from '@/lib/api-client';
import { PetrosVisualExplorer } from './petros-visual-explorer';
const api = new StudentApiClient('http://synthetic.test');
vi.mock('@/lib/api-client', async (original) => ({
  ...(await original<typeof import('@/lib/api-client')>()),
  useStudentApi: () => api,
}));
afterEach(() => vi.unstubAllGlobals());
function transport() {
  const program = visualCompositionFixture();
  let snapshot = petrosVisualSnapshotSchema.parse({
    program,
    checkpoint: initialPetrosVisualCheckpoint(program),
    validatorVersion: 'petros.visual-validator.v1',
    lastOperation: null,
  });
  const requests: PetrosVisualCommand[] = [];
  const state = { fail: false, disabled: false, corrupt: false, revoked: false };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init?: RequestInit) => {
      if (state.revoked)
        return new Response(JSON.stringify({ code: 'NOT_FOUND' }), { status: 404 });
      if (init?.method === 'PUT') {
        const command = JSON.parse(String(init.body));
        requests.push(command);
        if (snapshot.lastOperation?.id !== command.operationId)
          snapshot = {
            ...snapshot,
            checkpoint: applyPetrosVisualCommand(program, snapshot.checkpoint, command),
            lastOperation: { id: command.operationId, hash: 'a'.repeat(64) },
          };
        if (state.fail) {
          state.fail = false;
          throw new Error('Lost response after commit');
        }
      }
      const body = state.disabled
        ? { status: 'disabled', reason: 'Exploration disabled' }
        : {
            status: 'available',
            snapshot: state.corrupt
              ? {
                  ...snapshot,
                  program: { ...program, capabilities: [{ id: 'javascript', version: 1 }] },
                }
              : snapshot,
          };
      return new Response(JSON.stringify(body), { status: 200 });
    }),
  );
  return { state, requests };
}
async function open() {
  const component = render(
    <PetrosVisualExplorer
      sessionId="11111111-1111-4111-8111-111111111111"
      blockId={visualFixtureId}
    />,
  );
  const summary = await screen.findByText('Explore the original representation');
  fireEvent.click(summary);
  return component;
}
describe('composed visual production consumer and HTTP client', () => {
  it('renders unfamiliar linked views and persists number, toggle and progressive controls', async () => {
    const t = transport();
    await open();
    expect(screen.getByRole('img', { name: 'Metres' })).toHaveTextContent('Distance: 2 m');
    expect(screen.getByRole('img', { name: 'Centimetres' })).toHaveTextContent('Distance: 200 cm');
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Length (m)' }), {
      target: { value: '3' },
    });
    await waitFor(() =>
      expect(screen.getByRole('img', { name: 'Centimetres' })).toHaveTextContent(
        'Distance: 300 cm',
      ),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Next explanation' }));
    await screen.findByText('Inspect it in centimetres.');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Show values' }));
    await waitFor(() =>
      expect(screen.getByRole('img', { name: 'Metres' })).not.toHaveTextContent('Distance:'),
    );
    expect(t.requests.map((c) => c.action.type)).toEqual([
      'set_parameter',
      'set_beat',
      'set_parameter',
    ]);
    expect(t.requests.map((c) => c.expectedVersion)).toEqual([0, 1, 2]);
  });
  it('retains last acknowledged view, retries exact command and restores the committed state after remount', async () => {
    const t = transport();
    const mounted = await open();
    t.state.fail = true;
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Length (m)' }), {
      target: { value: '4' },
    });
    await screen.findByRole('button', { name: 'Retry change' });
    expect(screen.getByRole('img', { name: 'Metres' })).toHaveTextContent('Distance: 2 m');
    fireEvent.click(screen.getByRole('button', { name: 'Retry change' }));
    await waitFor(() =>
      expect(screen.getByRole('img', { name: 'Metres' })).toHaveTextContent('Distance: 4 m'),
    );
    expect(t.requests[1]).toEqual(t.requests[0]);
    mounted.unmount();
    await open();
    expect(screen.getByRole('spinbutton', { name: 'Length (m)' })).toHaveValue(4);
  });
  it('removes the composed view on definitive access loss and does not offer command replay', async () => {
    const t = transport();
    await open();
    t.state.revoked = true;
    fireEvent.click(screen.getByRole('checkbox', { name: 'Show values' }));
    await screen.findByText('This representation is no longer available.');
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Retry change' })).toBeNull();
  });
  it('gates disabled rollout and rejects unsupported received programs with refresh recovery', async () => {
    const t = transport();
    t.state.disabled = true;
    const mounted = render(
      <PetrosVisualExplorer
        sessionId="11111111-1111-4111-8111-111111111111"
        blockId={visualFixtureId}
      />,
    );
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(screen.queryByText('Explore the original representation')).toBeNull();
    mounted.unmount();
    t.state.disabled = false;
    t.state.corrupt = true;
    render(
      <PetrosVisualExplorer
        sessionId="11111111-1111-4111-8111-111111111111"
        blockId={visualFixtureId}
      />,
    );
    await screen.findByRole('button', { name: 'Refresh exploration' });
    expect(screen.queryByRole('img')).toBeNull();
    t.state.corrupt = false;
    fireEvent.click(screen.getByRole('button', { name: 'Refresh exploration' }));
    await screen.findByText('Explore the original representation');
  });
});
