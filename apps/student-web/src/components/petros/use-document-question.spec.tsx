import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StudentApiClient } from '../../lib/api-client';
import { useDocumentQuestion } from './use-document-question';

describe('document question request recovery through the real HTTP client', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    sessionStorage.clear();
  });
  const sessionId = '11111111-1111-4111-8111-111111111111';
  const key = '22222222-2222-4222-8222-222222222222';
  const body = { question: 'What is elasticity?', expectedSessionVersion: 0, idempotencyKey: key };
  const json = (value: unknown, status = 200) =>
    new Response(JSON.stringify(value), {
      status,
      headers: { 'content-type': 'application/json' },
    });

  it('preserves the exact input/key on a lost submission response and never falls back on a transport error', async () => {
    const posts: unknown[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url, init: RequestInit) => {
        if (init.method !== 'POST') return json(null);
        posts.push(JSON.parse(init.body as string));
        if (posts.length === 1) throw new TypeError('Synthetic lost connection');
        return json({
          schemaVersion: 'petros.document-question-execution.v1',
          id: key,
          sessionId,
          idempotencyKey: key,
          state: 'failed',
          version: 3,
          attempts: 1,
          retryable: true,
          processingEnabled: true,
          errorCode: 'PETROS_QUESTION_TIMEOUT',
          result: null,
        });
      }),
    );
    const client = new StudentApiClient('http://synthetic.test');
    const hook = renderHook(() => useDocumentQuestion(client, sessionId, vi.fn()));
    await act(async () => {
      await expect(hook.result.current.ask(body)).rejects.toThrow('Synthetic lost connection');
    });
    expect(sessionStorage.getItem(`petros-document-question:${sessionId}`)).toBe(key);
    await act(async () => {
      await expect(
        hook.result.current.ask({
          ...body,
          idempotencyKey: '33333333-3333-4333-8333-333333333333',
        }),
      ).rejects.toThrow('did not finish');
    });
    expect(posts).toEqual([body, body]);
    expect(sessionStorage.getItem(`petros-document-question:${sessionId}`)).toBeNull();
  });

  it('returns to the previous question route only on a definitive disabled response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url, init: RequestInit) =>
        init.method === 'POST'
          ? json({ code: 'PETROS_QUESTION_EXECUTION_DISABLED', message: 'Disabled' }, 409)
          : json(null),
      ),
    );
    const client = new StudentApiClient('http://synthetic.test');
    const hook = renderHook(() => useDocumentQuestion(client, sessionId, vi.fn()));
    await act(async () => {
      expect(await hook.result.current.ask(body)).toBeNull();
    });
    expect(sessionStorage.getItem(`petros-document-question:${sessionId}`)).toBeNull();
    await waitFor(() => expect(hook.result.current.status).toBeNull());
  });

  it('explains a budget denial without offering a futile retry', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({
      schemaVersion: 'petros.document-question-execution.v1', id: key, sessionId,
      idempotencyKey: key, state: 'failed', version: 3, attempts: 1,
      retryable: false, processingEnabled: true,
      errorCode: 'PETROS_QUESTION_BUDGET_LIMIT', result: null,
    })));
    const client = new StudentApiClient('http://synthetic.test');
    const Harness = () => <>{useDocumentQuestion(client, sessionId, vi.fn()).status}</>;
    render(<Harness />);
    expect(await screen.findByText('The AI usage limit prevented another attempt. Your lesson remains available.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retry question' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Refresh question status' })).toBeInTheDocument();
  });

  it('negotiates policy disclosure and renders a categorized denial through the existing live region', async () => {
    const requests: Headers[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_url, init: RequestInit) => {
      requests.push(new Headers(init.headers));
      return json({ schemaVersion: 'petros.document-question-execution.v1', id: key, sessionId,
        idempotencyKey: key, state: 'failed', version: 3, attempts: 1, retryable: false, processingEnabled: true,
        errorCode: 'PETROS_KNOWLEDGE_POLICY_CHANGED', result: null,
        admission: { category: 'pedagogical_attempt_policy', code: 'PETROS_KNOWLEDGE_POLICY_CHANGED',
          correlationId: key, retry: 'new_question', message: 'The policy changed. Ask a new question.' },
        knowledgePolicy: { schemaVersion: 'petros.knowledge-policy.v1', mode: 'source_bound', requestedMode: null,
          policyVersionIds: [], authorityHash: 'a'.repeat(64), sourceId: key, sourceFingerprint: 'b'.repeat(64),
          pages: [1], subjectId: null, maximumDepth: 3, assignmentRestrictions: [], retrieval: { designatedSource: true, external: false },
          authority: 'designated_material_with_institution_restrictions', explanation: 'Only the selected material is permitted.' },
      });
    }));
    const client = new StudentApiClient('http://synthetic.test');
    const Harness = () => <>{useDocumentQuestion(client, sessionId, vi.fn()).status}</>;
    render(<Harness />);
    expect(await screen.findByText('The policy changed. Ask a new question.')).toBeInTheDocument();
    expect(screen.getByText('Only the selected material is permitted.')).toBeInTheDocument();
    expect(screen.getByText(/Limit category: pedagogical attempt policy/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retry question' })).not.toBeInTheDocument();
    expect(requests.every(headers => headers.get('x-petros-knowledge-policy') === 'petros.knowledge-policy.v1')).toBe(true);
  });
});
