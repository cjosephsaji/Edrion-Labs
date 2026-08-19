import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PetrosContextAssistant } from './petros-context-assistant';
import { PetrosDoorButton } from './petros-door-button';

const mocks = vi.hoisted(() => ({
  post: vi.fn(),
  push: vi.fn(),
  id: 0,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push }),
}));

vi.mock('@/lib/api-client', () => ({
  useStudentApi: () => ({ post: mocks.post }),
  newIdempotencyKey: () => `00000000-0000-4000-8000-${String(++mocks.id).padStart(12, '0')}`,
  formatApiError: (error: unknown) => (error instanceof Error ? error.message : 'Request failed'),
}));

const intent = {
  schemaVersion: 'petros.session-intent.v1',
  id: '11111111-1111-4111-8111-111111111111',
  door: 'result_repair',
  institutionId: '22222222-2222-4222-8222-222222222222',
  campusId: null,
  studentId: '33333333-3333-4333-8333-333333333333',
  permissionContext: ['student.learn.use'],
  sessionType: 'repair',
  goal: 'Repair the published algebra gap.',
  targetConcepts: ['Algebra'],
  scope: {
    summary: 'Unit test: 31/80',
    boundaries: ['Published result only.'],
    curriculum: ['Algebra'],
    knownFailureDetails: ['Question-level evidence is not published.'],
    learningPathPosition: null,
  },
  time: { budgetSeconds: 900, deadline: null, examDate: null },
  emotionalRegister: 'flat_practical',
  registerFactors: ['A lower published mark was opened.'],
  sourceEntityIds: ['44444444-4444-4444-8444-444444444444'],
  citations: [{ sourceType: 'result', sourceId: '44444444-4444-4444-8444-444444444444', version: '1', label: 'Unit test', page: null, section: 'Algebra', excerpt: null }],
  language: 'en',
  accessibility: [],
  returnDestination: { href: '/results', label: 'Results', resumeToken: '55555555-5555-4555-8555-555555555555' },
  policyDisclosures: ['Petros cannot change marks.'],
  sourceFingerprint: 'a'.repeat(64),
  idempotencyKey: '66666666-6666-4666-8666-666666666666',
  correlationId: '77777777-7777-4777-8777-777777777777',
  status: 'resolved',
  expiresAt: '2099-08-12T08:30:00.000Z',
  createdAt: '2099-08-12T08:00:00.000Z',
} as const;

describe('Petros contextual entry points', () => {
  beforeEach(() => {
    mocks.post.mockReset();
    mocks.push.mockReset();
    mocks.id = 0;
    sessionStorage.clear();
  });

  it('previews verified intent before starting exactly one shared-engine session', async () => {
    mocks.post
      .mockResolvedValueOnce(intent)
      .mockResolvedValueOnce({ intent: { ...intent, status: 'started' }, session: { id: '88888888-8888-4888-8888-888888888888' } });

    render(<PetrosDoorButton door="result_repair" sourceId={intent.sourceEntityIds[0]} label="Repair with Petros" />);
    fireEvent.click(screen.getByRole('button', { name: 'Repair with Petros' }));

    expect(await screen.findByRole('dialog', { name: 'Preview this Petros session' })).toBeInTheDocument();
    expect(screen.getByText('Unit test: 31/80')).toBeInTheDocument();
    expect(mocks.post).toHaveBeenCalledTimes(1);
    expect(mocks.push).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Start this session' }));
    await waitFor(() => expect(mocks.post).toHaveBeenCalledTimes(2));
    expect(mocks.post.mock.calls[1]?.[0]).toBe(`/student/petros/intents/${intent.id}/start`);
    expect(mocks.push).toHaveBeenCalledWith('/petros/session?session=88888888-8888-4888-8888-888888888888');
  });

  it('portals the preview outside transformed and clipped cards', async () => {
    mocks.post.mockResolvedValueOnce(intent);
    render(
      <article data-testid="material-card" style={{ overflow: 'hidden', transform: 'translateY(-1px)' }}>
        <PetrosDoorButton door="uploaded_document" sourceId={intent.sourceEntityIds[0]} label="Teach me this page" />
      </article>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Teach me this page' }));
    const dialog = await screen.findByRole('dialog', { name: 'Preview this Petros session' });
    expect(dialog.closest('article')).toBeNull();
    expect(dialog.parentElement).toHaveAttribute('data-petros-preview-layer', 'true');
    expect(dialog.parentElement?.parentElement).toBe(document.body);
  });

  it('keeps a small assistant answer inline without creating a session', async () => {
    mocks.post.mockResolvedValueOnce({ mode: 'quick_answer', answer: 'This is the published results screen.', contextLabel: 'Results', offer: null });
    render(<PetrosContextAssistant route="/results" />);
    fireEvent.click(screen.getByRole('button', { name: 'Talk to Petros' }));
    fireEvent.change(screen.getByPlaceholderText('Ask about this page, plan your next move, or explain something…'), { target: { value: 'What is this?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send to Petros' }));

    expect(await screen.findByText('This is the published results screen.')).toBeInTheDocument();
    expect(mocks.post).toHaveBeenCalledTimes(1);
    expect(mocks.post.mock.calls[0]?.[0]).toBe('/student/petros/assistant');
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it('sends the exact selected card with demonstrative questions', async () => {
    mocks.post.mockResolvedValueOnce({ mode: 'quick_answer', answer: 'This card is your Cloud revision assignment.', contextLabel: 'Assignments', offer: null });
    render(
      <>
        <article
          data-petros-target="primary"
          data-petros-title="Cloud revision assignment"
          data-petros-message="Due tomorrow"
          data-petros-source-id={intent.sourceEntityIds[0]}
          data-petros-href={`/assignments/${intent.sourceEntityIds[0]}`}
        />
        <PetrosContextAssistant route="/assignments" />
      </>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Talk to Petros' }));
    expect(await screen.findByText('Cloud revision assignment')).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText('Ask about “Cloud revision assignment”…'), { target: { value: 'What is this?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send to Petros' }));

    expect(await screen.findByText('This card is your Cloud revision assignment.')).toBeInTheDocument();
    expect(mocks.post.mock.calls[0]?.[1]).toMatchObject({
      route: '/assignments',
      sourceId: intent.sourceEntityIds[0],
      selectedCard: {
        title: 'Cloud revision assignment',
        description: 'Due tomorrow',
        href: `/assignments/${intent.sourceEntityIds[0]}`,
      },
    });
  });

  it('does not create a deep assistant session until the learner explicitly accepts', async () => {
    mocks.post
      .mockResolvedValueOnce({ mode: 'session_offer', answer: 'A focused session may help.', contextLabel: 'Results', offer: { description: 'Work through the result.', approximateMinutes: 15, sourceId: '/results' } })
      .mockResolvedValueOnce({ ...intent, door: 'assistant_handoff', sessionType: 'doubt' })
      .mockResolvedValueOnce({ intent, session: { id: '99999999-9999-4999-8999-999999999999' } });
    render(<PetrosContextAssistant route="/results" />);
    fireEvent.click(screen.getByRole('button', { name: 'Talk to Petros' }));
    fireEvent.change(screen.getByPlaceholderText('Ask about this page, plan your next move, or explain something…'), { target: { value: 'Explain step by step why I need a different method.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send to Petros' }));

    expect(await screen.findByRole('button', { name: 'Let’s do it' })).toBeInTheDocument();
    expect(mocks.post).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Let’s do it' }));
    await waitFor(() => expect(mocks.post).toHaveBeenCalledTimes(3));
    expect(mocks.post.mock.calls[1]?.[1]).toMatchObject({ door: 'assistant_handoff', question: 'Explain step by step why I need a different method.' });
    expect(mocks.push).toHaveBeenCalledWith('/petros/session?session=99999999-9999-4999-8999-999999999999');
  });
});
