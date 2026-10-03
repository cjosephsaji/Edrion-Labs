import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PetrosContinuityOverview, PetrosMemoryControls } from './petros-continuity';

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
const me = vi.hoisted(() => ({ current: { kind: 'institutional', institutionId: '11111111-1111-4111-8111-111111111111', studentId: '22222222-2222-4222-8222-222222222222' } }));
vi.mock('@/lib/api-client', () => ({ useStudentApi: () => api, formatApiError: (error: unknown) => error instanceof Error ? error.message : 'Request failed.' }));
vi.mock('@/lib/hooks', () => ({ useStudentMe: () => ({ data: me.current }) }));

const sessionId = '33333333-3333-4333-8333-333333333333';
const journeyId = '44444444-4444-4444-8444-444444444444';
const journey = {
  id: journeyId, version: 3,
  returnPoint: { sessionId, unresolvedRequest: 'Why does stored energy matter?', returnTarget: 'lesson', connectivity: 'intermittent' },
  source: { sourceVersion: 'source-fingerprint' }, objective: { statement: 'Explain stored energy.' },
  policyVersion: 'policy-v2', resumeHref: `/petros/session?session=${sessionId}&journey=${journeyId}`,
  recovery: { acknowledgedOnly: true, unacknowledgedInterval: 'not_persisted' },
};

function renderWithQuery(children: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{children}</QueryClientProvider>);
}

afterEach(() => { vi.clearAllMocks(); me.current.kind = 'institutional'; });

describe('student continuity surfaces', () => {
  it('shows a resumable journey, recovery limit, reasoned recommendation, and owner-version dismiss', async () => {
    api.get.mockImplementation((path: string) => {
      if (path.endsWith('/capabilities')) return Promise.resolve({ enabled: true, independentSupported: false, guardianSharing: false, fullOffline: false });
      if (path.endsWith('/journeys')) return Promise.resolve({ journeys: [journey], unavailableCount: 0 });
      if (path.endsWith('/recommendations')) return Promise.resolve({ items: [{ id: 'recommendation-1', journeyId, sessionId, state: 'not_assessed', reason: 'This objective has not been assessed.', evidenceIds: [], watermark: 2, source: journey.source, objective: journey.objective, policyVersion: 'policy-v2', href: journey.resumeHref, uncertainty: 'Outside assistance remains unknown.' }], memoryRevision: 2 });
      return Promise.reject(new Error(`Unexpected path: ${path}`));
    });
    api.post.mockResolvedValue({ dismissed: true });
    renderWithQuery(<PetrosContinuityOverview />);

    expect(await screen.findByText('Your open question: Why does stored energy matter?')).toBeVisible();
    expect(screen.getByText(/Only acknowledged progress is restored/i)).toBeVisible();
    expect(screen.getByText('Not assessed')).toBeVisible();
    expect(screen.getByText('Outside assistance remains unknown.')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss suggestion' }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith(`/student/petros/continuity/recommendations/${journeyId}/dismiss`, expect.objectContaining({ expectedVersion: 3 })));
  });

  it('offers scoped memory controls using the shared response-depth contract', async () => {
    api.get.mockImplementation((path: string) => {
      if (path.endsWith('/memory')) return Promise.resolve({ memoryRevision: 4, optionalMemoryEnabled: true,
        preferences: { responseDepth: 'balanced', language: 'en', quietMode: false }, records: [], retainedEvidenceNotice: 'Assessment evidence stays with its existing owner.' });
      if (path.endsWith('/journeys')) return Promise.resolve({ journeys: [journey], unavailableCount: 0 });
      return Promise.reject(new Error(`Unexpected path: ${path}`));
    });
    api.post.mockResolvedValue({ memoryRevision: 5 });
    renderWithQuery(<PetrosMemoryControls />);

    fireEvent.change(await screen.findByLabelText('Response detail'), { target: { value: 'thorough' } });
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/student/petros/continuity/memory', expect.objectContaining({ action: 'preferences', responseDepth: 'thorough', expectedMemoryRevision: 4 })));
    fireEvent.change(screen.getByLabelText('Learning session'), { target: { value: sessionId } });
    fireEvent.change(screen.getByLabelText('What should Petros remember?'), { target: { value: 'Use a small diagram first.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Remember this' }));
    await waitFor(() => expect(api.post).toHaveBeenLastCalledWith('/student/petros/continuity/memory', expect.objectContaining({ action: 'remember', category: 'episodic', sessionId, content: 'Use a small diagram first.' })));
  });
});
