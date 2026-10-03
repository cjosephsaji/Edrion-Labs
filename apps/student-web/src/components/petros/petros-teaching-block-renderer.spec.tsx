import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PetrosCompanionBlock, PetrosLearningSessionDocument, PetrosSessionBlock } from '@edrion/schemas';
import { PetrosPreparedVisual, PetrosTeachingReference } from './petros-teaching-block-renderer';

const api = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@/lib/api-client', () => ({ useStudentApi: () => api }));

const sessionId = '11111111-1111-4111-8111-111111111111';
const blockId = '22222222-2222-4222-8222-222222222222';
const reference: Extract<PetrosCompanionBlock, { type: 'teaching_reference' }> = {
  type: 'teaching_reference', sessionId, blockId, sourceVersion: 'source-v3', sceneRevision: null, label: 'Your current lesson step',
};
const block = {
  id: blockId,
  content: { type: 'predict_then_reveal', title: 'Think before the result', prompt: 'What do you predict?', reveal: 'The private answer', explanation: 'Here is why.' },
  interactionState: { revealed: false },
  questions: [],
} as unknown as PetrosSessionBlock;

function renderReference() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><PetrosTeachingReference reference={reference} /></QueryClientProvider>);
}

afterEach(() => { vi.clearAllMocks(); vi.unstubAllGlobals(); });

describe('companion teaching reference', () => {
  it('renders only the currently visible lesson content and links back to practice', async () => {
    api.get.mockResolvedValue({ id: sessionId, sourceContext: { sourceFingerprint: 'source-v3' }, blocks: [block] } as Partial<PetrosLearningSessionDocument>);
    renderReference();

    expect(await screen.findByText('Your current lesson step')).toBeVisible();
    expect(screen.getByText('What do you predict?')).toBeVisible();
    expect(screen.queryByText('The private answer')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open this step in the lesson' })).toHaveAttribute('href', `/petros/session?session=${sessionId}`);
  });

  it('withholds stale source or scene references', async () => {
    api.get.mockResolvedValueOnce({ id: sessionId, sourceContext: { sourceFingerprint: 'source-v2' }, blocks: [block] });
    const view = renderReference();
    expect(await screen.findByText(/unavailable or has changed/i)).toBeVisible();
    view.unmount();

    api.get.mockReset();
    api.get.mockResolvedValueOnce({ id: sessionId, sourceContext: { sourceFingerprint: 'source-v3' }, blocks: [block] });
    api.get.mockResolvedValueOnce({ status: 'available', snapshot: { program: { revision: 8 } } });
    const visualReference: Extract<PetrosCompanionBlock, { type: 'teaching_reference' }> = { ...reference, sceneRevision: 7 };
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><PetrosTeachingReference reference={visualReference} /></QueryClientProvider>);
    expect(await screen.findByText(/unavailable or has changed/i)).toBeVisible();
    expect(api.get).toHaveBeenCalledTimes(2);
  });

  it('keeps the objective and prepared text visible while delaying expensive visuals until opted in', async () => {
    vi.stubGlobal('localStorage', { getItem: () => 'low_bandwidth' });
    render(<>
      <h2>Explain how plants store light energy.</h2>
      <PetrosPreparedVisual text="Light energy becomes stored chemical energy.">
        <div role="img" aria-label="Interactive model canvas" />
      </PetrosPreparedVisual>
    </>);

    expect(await screen.findByText('Light energy becomes stored chemical energy.')).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Explain how plants store light energy.' })).toBeVisible();
    expect(screen.queryByRole('img', { name: 'Interactive model canvas' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Load optional visual' }));
    expect(screen.getByRole('img', { name: 'Interactive model canvas' })).toBeVisible();
  });
});
