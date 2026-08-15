import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  PETROS_ARTIFACT_PROPOSAL_VERSION,
  PETROS_ARTIFACT_SCHEMA_VERSION,
  type PetrosArtifactBundle,
} from '@edrion/schemas';
import { PetrosArtifactCuration } from './petros-artifact-curation';

const sessionId = '11111111-1111-4111-8111-111111111111';
const bundleId = '22222222-2222-4222-8222-222222222222';
const proposalId = '33333333-3333-4333-8333-333333333333';
const artifactId = '44444444-4444-4444-8444-444444444444';

const memory = vi.hoisted(() => ({ bundle: null as PetrosArtifactBundle | null }));
const api = vi.hoisted(() => ({
  get: vi.fn(async () => memory.bundle),
  put: vi.fn(async (_path: string, body: { selected: boolean; content: PetrosArtifactBundle['proposals'][number]['content'] }) => {
    memory.bundle = {
      ...memory.bundle!,
      version: memory.bundle!.version + 1,
      updatedAt: new Date().toISOString(),
      proposals: memory.bundle!.proposals.map((proposal) => proposal.id === proposalId ? {
        ...proposal, selected: body.selected, content: body.content, state: 'edited' as const,
        version: proposal.version + 1, updatedAt: new Date().toISOString(),
      } : proposal),
    };
    return memory.bundle;
  }),
  post: vi.fn(async (path: string) => {
    if (path.endsWith('/discard')) return memory.bundle;
    memory.bundle = {
      ...memory.bundle!, state: 'saved' as const, version: memory.bundle!.version + 1,
      counts: { proposed: 0, saved: 1, failed: 0 },
      proposals: memory.bundle!.proposals.map((proposal) => ({ ...proposal, state: 'saved' as const, selected: true, savedArtifactId: artifactId })),
    };
    return {
      bundle: memory.bundle,
      results: [{ proposalId, status: 'saved', artifactId, errorCode: null, recovery: null }],
    };
  }),
}));

vi.mock('@/lib/api-client', () => ({
  useStudentApi: () => api,
  formatApiError: (error: unknown) => error instanceof Error ? error.message : 'Request failed.',
  newIdempotencyKey: () => '55555555-5555-4555-8555-555555555555',
}));

afterEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  memory.bundle = bundle();
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: true });
});

describe('Petros explicit artifact curation', () => {
  it('does not preselect a proposal and saves the student-edited version only after explicit selection', async () => {
    memory.bundle = bundle();
    const onCounts = vi.fn();
    render(<PetrosArtifactCuration sessionId={sessionId} onCounts={onCounts} />);

    const select = await screen.findByRole('checkbox', { name: /select for save/i });
    expect(select).not.toBeChecked();
    expect(screen.getByRole('button', { name: /save.*selected artifacts/i })).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Front'), { target: { value: 'What form does light become?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Keep these edits' }));
    await waitFor(() => expect(api.put).toHaveBeenCalledWith(
      expect.stringContaining(proposalId),
      expect.objectContaining({ content: expect.objectContaining({ front: 'What form does light become?' }) }),
    ));

    fireEvent.click(screen.getByRole('checkbox', { name: /select for save/i }));
    await waitFor(() => expect(screen.getByRole('button', { name: /save 1 selected artifact/i })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: /save 1 selected artifact/i }));

    expect(await screen.findByText(/1 artifact saved to your products/i)).toBeVisible();
    expect(screen.getByText('1', { selector: 'strong' })).toBeVisible();
    expect(api.post).toHaveBeenCalledWith(
      expect.stringContaining(`/bundles/${bundleId}/commit`),
      expect.objectContaining({ proposalIds: [proposalId] }),
    );
  });

  it('restores an unsaved local edit after refresh without claiming ownership', async () => {
    memory.bundle = bundle();
    const first = render(<PetrosArtifactCuration sessionId={sessionId} onCounts={vi.fn()} />);
    const front = await screen.findByLabelText('Front');
    fireEvent.change(front, { target: { value: 'Offline draft wording' } });
    first.unmount();

    const onCounts = vi.fn();
    render(<PetrosArtifactCuration sessionId={sessionId} onCounts={onCounts} />);
    expect(await screen.findByDisplayValue('Offline draft wording')).toBeVisible();
    expect(onCounts).toHaveBeenLastCalledWith({ proposed: 1, saved: 0, failed: 0 });
    expect(api.post).not.toHaveBeenCalled();
  });

  it('keeps edits and explains that reconnect is required for commit', async () => {
    memory.bundle = bundle({
      proposals: [{ ...bundle().proposals[0]!, selected: true, state: 'edited' }],
    });
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: false });
    render(<PetrosArtifactCuration sessionId={sessionId} onCounts={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: /save 1 selected artifact/i }));
    expect(await screen.findByText(/reconnect before saving/i)).toBeVisible();
    expect(api.post).not.toHaveBeenCalled();
  });
});

function bundle(patch: Partial<PetrosArtifactBundle> = {}): PetrosArtifactBundle {
  const time = '2026-08-10T10:00:00.000Z';
  const content = {
    kind: 'flashcard' as const,
    title: 'Energy change',
    front: 'What form does light become?',
    back: 'Stored chemical energy.',
    hint: null,
    explanation: null,
    tags: ['photosynthesis'],
  };
  return {
    schemaVersion: PETROS_ARTIFACT_SCHEMA_VERSION,
    id: bundleId,
    sessionId,
    state: 'open',
    version: 0,
    counts: { proposed: 1, saved: 0, failed: 0 },
    forwardLink: 'How does the stored energy get released?',
    proposals: [{
      schemaVersion: PETROS_ARTIFACT_PROPOSAL_VERSION,
      id: proposalId,
      bundleId,
      kind: 'flashcard',
      state: 'proposed',
      selected: false,
      content,
      originalContent: content,
      sources: [{ kind: 'session_block', sessionId, blockId: proposalId, knowledgeItemId: null, pageIndex: null, assessmentId: null, label: 'Petros session: photosynthesis', excerpt: null, institutionRestricted: false }],
      version: 0,
      savedArtifactId: null,
      failureCode: null,
      createdAt: time,
      updatedAt: time,
    }],
    createdAt: time,
    updatedAt: time,
    ...patch,
  };
}
