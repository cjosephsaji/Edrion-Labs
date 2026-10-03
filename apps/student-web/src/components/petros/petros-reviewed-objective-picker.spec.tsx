import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PetrosReviewedObjectivePicker } from './petros-reviewed-objective-picker';

const sessionA = '11111111-1111-4111-8111-111111111111';
const sessionB = '22222222-2222-4222-8222-222222222222';
const packId = '33333333-3333-4333-8333-333333333333';
const objectiveId = '44444444-4444-4444-8444-444444444444';
const receiptId = '55555555-5555-4555-8555-555555555555';

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
const keys = vi.hoisted(() => ({ next: 0 }));

vi.mock('@/lib/api-client', () => ({
  useStudentApi: () => api,
  formatApiError: (error: unknown) => error instanceof Error ? error.message : 'Request failed.',
  newIdempotencyKey: () => `00000000-0000-4000-8000-${String(++keys.next).padStart(12, '0')}`,
}));

afterEach(() => {
  vi.clearAllMocks();
  keys.next = 0;
});

describe('Petros reviewed objective picker', () => {
  it.each(['disabled', 'legacy_unavailable'] as const)('renders nothing for %s availability', async (status) => {
    api.get.mockResolvedValue({ status });
    const view = render(<PetrosReviewedObjectivePicker sessionId={sessionA} onBound={vi.fn()} />);
    await waitFor(() => expect(api.get).toHaveBeenCalled());
    expect(view.container).toBeEmptyDOMElement();
  });

  it('shows only server-provided educator-reviewed objectives and binds after an explicit choice', async () => {
    api.get.mockResolvedValue(available());
    api.post.mockResolvedValue({ status: 'bound' });
    const onBound = vi.fn();
    render(<PetrosReviewedObjectivePicker sessionId={sessionA} onBound={onBound} beforeLesson />);

    fireEvent.click(await screen.findByText(/reviewed objectives \(1\)/i));
    expect(screen.getByText('Explain why plants store energy.')).toBeVisible();
    expect(screen.getByText(/not evidence that you have demonstrated/i)).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Choose reviewed objective' }));

    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      `/student/petros/sessions/${sessionA}/adaptive`,
      { commandId: '00000000-0000-4000-8000-000000000001', pack: { id: packId, version: 3 } },
    ));
    expect(onBound).toHaveBeenCalledOnce();
  });

  it('retries a lost bind response with the same command identity', async () => {
    api.get.mockResolvedValue(available());
    api.post.mockRejectedValueOnce(new Error('Connection lost.')).mockResolvedValueOnce({ status: 'bound' });
    render(<PetrosReviewedObjectivePicker sessionId={sessionA} onBound={vi.fn()} />);

    fireEvent.click(await screen.findByText(/reviewed objectives \(1\)/i));
    fireEvent.click(screen.getByRole('button', { name: 'Choose reviewed objective' }));
    expect(await screen.findByText('Connection lost.')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Retry choosing reviewed objective' }));

    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(2));
    expect(api.post.mock.calls[1]).toEqual(api.post.mock.calls[0]);
  });

  it('keeps a revoked or denied bind truthful and retryable', async () => {
    api.get.mockResolvedValue(available());
    api.post.mockRejectedValue(new Error('This reviewed pack is no longer available.'));
    render(<PetrosReviewedObjectivePicker sessionId={sessionA} onBound={vi.fn()} />);

    fireEvent.click(await screen.findByText(/reviewed objectives \(1\)/i));
    fireEvent.click(screen.getByRole('button', { name: 'Choose reviewed objective' }));
    expect(await screen.findByText('This reviewed pack is no longer available.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Retry choosing reviewed objective' })).toBeEnabled();
  });

  it('does not bind a command after its session identity changes', async () => {
    api.get.mockImplementation((path: string) => Promise.resolve(path.includes(sessionA) ? available() : { status: 'available', packs: [] }));
    const view = render(<PetrosReviewedObjectivePicker sessionId={sessionA} onBound={vi.fn()} />);
    fireEvent.click(await screen.findByText(/reviewed objectives \(1\)/i));
    view.rerender(<PetrosReviewedObjectivePicker sessionId={sessionB} onBound={vi.fn()} />);
    await screen.findByText(/no reviewed teaching objective/i);
    expect(api.post).not.toHaveBeenCalled();
  });

  it('does not report a stale bind response to the replacement session', async () => {
    let resolveBind: ((value: { status: string }) => void) | undefined;
    api.get.mockResolvedValue(available());
    api.post.mockImplementationOnce(() => new Promise((resolve) => { resolveBind = resolve; }));
    const onBound = vi.fn();
    const view = render(<PetrosReviewedObjectivePicker sessionId={sessionA} onBound={onBound} />);

    fireEvent.click(await screen.findByText(/reviewed objectives \(1\)/i));
    fireEvent.click(screen.getByRole('button', { name: 'Choose reviewed objective' }));
    await waitFor(() => expect(api.post).toHaveBeenCalledOnce());
    view.rerender(<PetrosReviewedObjectivePicker sessionId={sessionB} onBound={onBound} />);
    await screen.findByText(/reviewed objectives \(1\)/i);
    resolveBind?.({ status: 'bound' });
    await waitFor(() => expect(onBound).not.toHaveBeenCalled());
  });
});

function available() {
  return {
    status: 'available' as const,
    packs: [{
      pack: { id: packId, version: 3 },
      objective: { id: objectiveId, version: 2, statement: 'Explain why plants store energy.' },
      concepts: [{ id: 'energy-storage', label: 'Energy storage' }],
      review: { receiptId, version: 4, reviewedAt: '2026-09-20T00:00:00.000Z' },
    }],
  };
}
