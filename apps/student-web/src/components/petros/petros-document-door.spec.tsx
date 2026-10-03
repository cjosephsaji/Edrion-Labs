import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { StudentApiProvider } from '@/lib/api-client';
import { PetrosDocumentDoor } from './petros-door-button';

const mocks = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }));
const fetchMock = vi.fn();
const sourceId = '11111111-1111-4111-8111-111111111111';
const storageKey = `petros:intent:uploaded_document:${sourceId}:all:`;
// Synthetic response fixture only; the API suite exercises the actual producer over HTTP.
const intent = {
  id: '22222222-2222-4222-8222-222222222222',
  door: 'uploaded_document',
  sessionType: 'learn',
  goal: 'Understand the source',
  scope: { summary: 'Source', knownFailureDetails: [] },
  time: { budgetSeconds: 600 },
  citations: [],
  policyDisclosures: ['Extracted text only.'],
  planning: {
    suggestedTopicId: 'topic-1-1',
    suggestedPriority: 'understand',
    outlineStatus: 'generated',
    topics: [1, 2].map((page) => ({
      id: `topic-${page}-${page}`,
      title: `Topic ${page}`,
      pageStart: page,
      pageEnd: page,
      estimatedMinutes: 5,
    })),
  },
};
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const stale = () =>
  response(
    { code: 'PETROS_INTENT_STALE', message: 'The source changed. Open a new preview.' },
    409,
  );
const body = (index: number) => JSON.parse(fetchMock.mock.calls[index]![1].body);
function mount() {
  return render(
    <StudentApiProvider baseUrl="http://synthetic.invalid">
      <PetrosDocumentDoor sourceId={sourceId} title="Reference" pageCount={2} ready />
    </StudentApiProvider>,
  );
}
function open() {
  fireEvent.click(screen.getByRole('button', { name: 'Plan a lesson from Reference' }));
}

beforeEach(() => {
  sessionStorage.clear();
  fetchMock.mockReset();
  mocks.push.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe('actual document door and HTTP client', () => {
  it('replaces a stale stored key once, including after remount, and previews the new source', async () => {
    sessionStorage.setItem(storageKey, 'stale-key');
    fetchMock.mockResolvedValueOnce(stale()).mockResolvedValueOnce(response(intent));
    const view = mount();
    open();
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(body(0).idempotencyKey).toBe('stale-key');
    expect(body(1).idempotencyKey).not.toBe('stale-key');
    expect(sessionStorage.getItem(storageKey)).toBe(body(1).idempotencyKey);
    expect(new Headers(fetchMock.mock.calls[1]![1].headers).get('x-petros-document-source')).toBe(
      'petros.document-source.v1',
    );
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    view.unmount();
    fetchMock.mockResolvedValueOnce(response(intent));
    mount();
    open();
    await screen.findByRole('dialog');
    expect(body(2).idempotencyKey).toBe(body(1).idempotencyKey);
  });

  it('preserves preview and start keys on transport failures, while carrying topic selection', async () => {
    fetchMock
      .mockRejectedValueOnce(new TypeError('Connection lost'))
      .mockResolvedValueOnce(response(intent));
    mount();
    open();
    await screen.findByRole('alert');
    open();
    await screen.findByRole('dialog');
    expect(body(0).idempotencyKey).toBe(body(1).idempotencyKey);
    fireEvent.click(screen.getByRole('button', { name: /Topic 2/ }));
    expect(screen.getByRole('button', { name: /Topic 2/ })).toHaveAttribute('aria-pressed', 'true');
    fetchMock
      .mockRejectedValueOnce(new TypeError('Response lost'))
      .mockResolvedValueOnce(response({ session: { id: 'session-id' } }));
    fireEvent.click(screen.getByRole('button', { name: 'Start planned lesson' }));
    await screen.findByText('Response lost');
    fireEvent.click(screen.getByRole('button', { name: 'Start planned lesson' }));
    await waitFor(() =>
      expect(mocks.push).toHaveBeenCalledWith('/petros/session?session=session-id'),
    );
    expect(body(2).idempotencyKey).toBe(body(3).idempotencyKey);
    expect(body(3).plan.topicId).toBe('topic-2-2');
  });

  it('refreshes a stale start with a new preview key and requires confirmation again', async () => {
    fetchMock
      .mockResolvedValueOnce(response(intent))
      .mockResolvedValueOnce(stale())
      .mockResolvedValueOnce(response(intent));
    mount();
    open();
    await screen.findByRole('dialog');
    fireEvent.click(screen.getByRole('button', { name: 'Start planned lesson' }));
    await screen.findByText('The source preview was refreshed. Please confirm the current lesson scope before starting.');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(sessionStorage.getItem(`petros:intent-start:${intent.id}`)).toBeNull();
    expect(body(2).idempotencyKey).not.toBe(body(0).idempotencyKey);
    expect(sessionStorage.getItem(storageKey)).toBe(body(2).idempotencyKey);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(mocks.push).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Start planned lesson' })).toBeEnabled();
  });

  it('renders server readiness reasons and recovers by selecting an available physical page', async () => {
    fetchMock
      .mockResolvedValueOnce(
        response(
          {
            code: 'PETROS_DOCUMENT_SOURCE_NOT_READY',
            message: 'Source text needs confirmation.',
            meta: {
              readiness: {
                schemaVersion: 'petros.document-source.v1',
                sourceVersion: 'a'.repeat(64),
                status: 'needs_confirmation',
                extraction: 'digital_text',
                indexing: 'not_built',
                selectedPages: [1, 2],
                unavailablePages: [2],
                omittedPageCount: 0,
                scopeReady: false,
                coverage: 'extracted_text_only',
                teaching: 'not_assessed',
                reasons: ['confirmation_required'],
              },
            },
          },
          409,
        ),
      )
      .mockResolvedValueOnce(response(intent));
    mount();
    open();
    expect(await screen.findByText('Unavailable or unconfirmed pages: 2.')).toBeInTheDocument();
    expect(
      screen.getByText('Extracted text needs confirmation before teaching.'),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'page' } });
    fireEvent.click(screen.getByRole('button', { name: 'Plan a lesson from Reference' }));
    await screen.findByRole('dialog');
    expect(body(1).page).toBe(1);
    expect(screen.queryByText(/Unavailable or unconfirmed pages/)).not.toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Plan a lesson from Reference' })).toHaveFocus(),
    );
  });
});
