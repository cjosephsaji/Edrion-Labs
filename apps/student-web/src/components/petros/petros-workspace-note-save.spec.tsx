import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PetrosQueuedNote } from '@edrion/schemas';
import { PetrosWorkspaceNoteSave } from './petros-workspace-note-save';

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
const queue = vi.hoisted(() => ({ rows: [] as PetrosQueuedNote[] }));
const storage = vi.hoisted(() => ({
  cacheJourneyForOwner: vi.fn(async () => undefined),
  listQueuedNotes: vi.fn(async () => queue.rows),
  readCachedJourney: vi.fn(async () => null),
  removeQueuedNotes: vi.fn(async (ids: string[]) => { queue.rows = queue.rows.filter((row) => !ids.includes(row.commandId)); }),
  saveQueuedNote: vi.fn(async (_owner, input) => ({ ...input, owner, deviceId, sequence: 2, payloadHash } as PetrosQueuedNote)),
}));
const owner = { institutionId: '11111111-1111-4111-8111-111111111111', studentId: '22222222-2222-4222-8222-222222222222' };
const deviceId = '33333333-3333-4333-8333-333333333333';
const payloadHash = 'a'.repeat(64);
const sessionId = '44444444-4444-4444-8444-444444444444';
const blockId = '55555555-5555-4555-8555-555555555555';

vi.mock('@/lib/api-client', () => ({
  useStudentApi: () => api,
  formatApiError: (error: unknown) => error instanceof Error ? error.message : 'Request failed.',
}));
vi.mock('@/lib/hooks', () => ({ useStudentMe: () => ({ data: { kind: 'institutional', ...owner } }) }));
vi.mock('@/lib/petros-offline-notes', () => storage);

function queuedNote(): PetrosQueuedNote {
  return {
    schemaVersion: 'petros.queued-note.v1', owner, deviceId, commandId: '66666666-6666-4666-8666-666666666666', sequence: 1,
    journeyId: '77777777-7777-4777-8777-777777777777', baseVersion: 1, sourceVersion: 'source-4', policyVersion: 'policy-2',
    programRevision: 7, expectedExperimentVersion: 3, expectedDraftVersion: 3, rubricVersion: null,
    payload: { sessionId, blockId, text: 'My private offline reflection.' }, payloadHash,
    dependencies: [], localOccurredAt: '2026-10-02T00:00:00.000Z',
  };
}

function renderSave() {
  return render(<PetrosWorkspaceNoteSave
    sessionId={sessionId} blockId={blockId}
    snapshot={{
      program: { revision: 7 }, execution: { version: 3, branchId: 'main' }, draft: { version: 3 },
    } as never}
    text="A note to keep" setText={vi.fn()} disabled={false} onSave={vi.fn()} onReconciled={vi.fn()}
  />);
}

beforeEach(() => {
  vi.clearAllMocks();
  queue.rows = [queuedNote()];
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: vi.fn() });
  api.get.mockResolvedValue({
    id: '77777777-7777-4777-8777-777777777777', version: 1,
    returnPoint: { sessionId, blockId, connectivity: 'online', acknowledgedEventCursor: 0, workspace: { blockId, checkpointId: '88888888-8888-4888-8888-888888888888', programRevision: 7, experimentVersion: 3, draftVersion: 3, branchId: 'main' } },
    source: { sourceVersion: 'source-4' }, policyVersion: 'policy-2',
    workspace: { checkpointId: '88888888-8888-4888-8888-888888888888', programRevision: 7, experimentVersion: 3, draftVersion: 3, branchId: 'main' },
  });
  api.post.mockResolvedValue({ results: [{ commandId: queuedNote().commandId, status: 'needs_review', reason: 'The checkpoint changed.' }] });
});

afterEach(() => {
  vi.unstubAllGlobals();
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: true });
});

describe('workspace private note continuity', () => {
  it('does not reuse another session return point when this tab loses its cached state', async () => {
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: false });
    storage.readCachedJourney.mockResolvedValueOnce({ id: 'another-journey', source: { sourceVersion: 'source-other' },
      policyVersion: 'policy-2', returnPoint: { sessionId: 'another-session' }, workspace: { checkpointId: 'checkpoint-other' } } as never);
    renderSave();
    fireEvent.click(screen.getByRole('button', { name: 'Keep note on this device' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('A current saved return point is unavailable.');
    expect(storage.saveQueuedNote).not.toHaveBeenCalled();
  });

  it('restores a queued note visibly on the device when offline', async () => {
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: false });
    renderSave();

    fireEvent.click(await screen.findByText(/Private draft · awaiting sync/));
    expect(await screen.findByText('My private offline reflection.')).toBeVisible();
    expect(screen.getByText(/stored on this device and is not yet saved/i)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Keep note on this device' })).toBeEnabled();
  });

  it('keeps version-conflicted notes readable and lets the student discard them', async () => {
    renderSave();

    fireEvent.click(await screen.findByText(/Private draft · needs review/));
    expect(await screen.findByRole('alert')).toHaveTextContent(/needs review: The checkpoint changed/i);
    expect(api.get).toHaveBeenCalledWith(`/student/petros/continuity/sessions/${sessionId}/journey`);
    expect(screen.getByText('My private offline reflection.')).toBeVisible();
    expect(storage.removeQueuedNotes).not.toHaveBeenCalledWith([queuedNote().commandId]);
    fireEvent.click(screen.getByRole('button', { name: 'Discard this private draft' }));
    await waitFor(() => expect(storage.removeQueuedNotes).toHaveBeenCalledWith([queuedNote().commandId]));
    await waitFor(() => expect(screen.queryByText('My private offline reflection.')).not.toBeInTheDocument());
  });
});
