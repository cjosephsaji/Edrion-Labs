import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MaterialPreparationStatus } from '../../../../institution-web/src/components/materials/material-preparation-status';
import { PortalClient } from '../../../../institution-web/src/lib/portal-client';

vi.mock('../../../../institution-web/src/lib/scope', () => ({
  useScope: () => ({ scope: { mode: 'institution' } }),
}));
vi.mock('../../../../institution-web/src/lib/portal-client', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('../../../../institution-web/src/lib/portal-client')>();
  return { ...original, usePortalClient: () => new original.PortalClient('http://synthetic.test') };
});

const materialId = '11111111-1111-4111-8111-111111111111';
const row = {
  id: '22222222-2222-4222-8222-222222222222',
  materialId,
  materialVersion: 1,
  state: 'running',
  version: 2,
  attempts: 1,
  pagesDone: 2,
  errorCode: null,
  retryable: false,
  workerEnabled: true,
  updatedAt: '2026-09-16T00:00:00.000Z',
};
let query: QueryClient;
beforeEach(() => {
  query = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
});
afterEach(() => {
  cleanup();
  query.clear();
  vi.unstubAllGlobals();
});
function mount() {
  return render(
    <QueryClientProvider client={query}>
      <MaterialPreparationStatus materialId={materialId} />
    </QueryClientProvider>,
  );
}
const respond = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));

describe('teacher material preparation controls through the real HTTP client', () => {
  it.each([
    ['PETROS_PDF_INVALID', 'corrected or smaller PDF'],
    ['PETROS_SOURCE_UNAVAILABLE', 'Check access'],
    ['PETROS_PREPARATION_FANOUT_LIMIT', 'capacity for this audience'],
    ['PETROS_SANDBOX_UNAVAILABLE', 'Contact institution support'],
  ])('shows actionable terminal recovery for %s', async (errorCode, recovery) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => respond({ ...row, state: 'failed', errorCode, retryable: false })),
    );
    mount();
    expect(await screen.findByRole('status')).toHaveTextContent(recovery);
    expect(screen.queryByRole('button', { name: 'Retry preparation' })).not.toBeInTheDocument();
  });
  it('shows progress, sends a versioned cancellation, and offers retry without claiming teaching readiness', async () => {
    const fetch = vi
      .fn()
      .mockImplementationOnce(() => respond(row))
      .mockImplementationOnce(() =>
        respond({ ...row, state: 'cancelled', version: 3, retryable: true }),
      )
      .mockImplementationOnce(() => respond({ ...row, state: 'queued', version: 4, pagesDone: 0 }));
    vi.stubGlobal('fetch', fetch);
    mount();
    expect(await screen.findByRole('status')).toHaveTextContent('2 pages extracted');
    const cancel = screen.getByRole('button', { name: 'Cancel preparation' });
    cancel.focus();
    expect(cancel).toHaveFocus();
    fireEvent.click(cancel);
    const retry = await screen.findByRole('button', { name: 'Retry preparation' });
    expect(screen.getByRole('status')).toHaveTextContent('original remains shared');
    fireEvent.click(retry);
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Queued'));
    expect(fetch.mock.calls[1]![0]).toContain(`/${row.id}/cancel`);
    expect(JSON.parse(fetch.mock.calls[1]![1].body)).toEqual({ version: 2 });
    expect(JSON.parse(fetch.mock.calls[2]![1].body)).toEqual({ version: 3 });
    expect(fetch.mock.calls[1]![1].credentials).toBe('include');
    expect(new Headers(fetch.mock.calls[1]![1].headers).get('x-institution-scope')).toBe(
      'institution',
    );
  });
  it('recovers from a lost command response by reading the authoritative status', async () => {
    const fetch = vi
      .fn()
      .mockImplementationOnce(() => respond(row))
      .mockRejectedValueOnce(new TypeError('Network lost'))
      .mockImplementationOnce(() => respond({ ...row, state: 'succeeded', version: 3 }));
    vi.stubGlobal('fetch', fetch);
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel preparation' }));
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('Readable coverage is checked'),
    );
    expect(screen.queryByRole('button', { name: 'Retry preparation' })).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('not confirmed');
  });
  it('discloses disabled processing and status errors with an accessible refresh action', async () => {
    const fetch = vi
      .fn()
      .mockImplementationOnce(() => respond({ code: 'UNAVAILABLE' }, 503))
      .mockImplementationOnce(() => respond({ ...row, state: 'queued', workerEnabled: false }));
    vi.stubGlobal('fetch', fetch);
    mount();
    expect(await screen.findByRole('alert')).toHaveTextContent('status is unavailable');
    fireEvent.click(screen.getByRole('button', { name: 'Refresh preparation status' }));
    expect(await screen.findByRole('status')).toHaveTextContent('paused');
    expect(screen.queryByText(/ready to teach/i)).not.toBeInTheDocument();
    // Keep the client import in this test tied to the production implementation.
    expect(PortalClient).toBeTypeOf('function');
  });
});
