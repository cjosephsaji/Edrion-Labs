import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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

  it('gathers a schedule-aware lesson plan before creating the teaching session', async () => {
    const planned = {
      ...intent,
      door: 'uploaded_document' as const,
      planning: {
        topics: [
          { id: 'topic-1-2', title: 'Cloud foundations', summary: 'Core models', pageStart: 1, pageEnd: 2, estimatedMinutes: 12, keyTerms: ['elasticity'], likelyDoubts: [] },
          { id: 'topic-3-4', title: 'Service models', summary: 'IaaS and PaaS', pageStart: 3, pageEnd: 4, estimatedMinutes: 14, keyTerms: ['iaas'], likelyDoubts: [] },
        ],
        suggestedTopicId: 'topic-1-2',
        suggestedPriority: 'exam_prep' as const,
        deadline: { kind: 'exam' as const, title: 'Cloud Computing final', at: '2099-09-20T09:30:00.000Z', source: 'teacher_schedule' as const },
        outlineCacheKey: 'doc:3:fingerprint',
        outlineStatus: 'generated' as const,
        estimatedTotalMinutes: 26,
      },
    };
    mocks.post
      .mockResolvedValueOnce(planned)
      .mockResolvedValueOnce({ intent: { ...planned, status: 'started' }, session: { id: '88888888-8888-4888-8888-888888888888' } });

    render(<PetrosDoorButton door="uploaded_document" sourceId={planned.sourceEntityIds[0]} label="Teach this document" />);
    fireEvent.click(screen.getByRole('button', { name: 'Teach this document' }));

    expect(await screen.findByText(/Cloud Computing final/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Service models/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Quick review' }));
    fireEvent.click(screen.getByRole('button', { name: '10 min' }));
    fireEvent.change(screen.getByLabelText(/Any doubt already in mind/), { target: { value: 'Why does responsibility shift?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Start planned lesson' }));

    await waitFor(() => expect(mocks.post).toHaveBeenCalledTimes(2));
    expect(mocks.post.mock.calls[1]?.[1]).toMatchObject({
      plan: {
        topicId: 'topic-3-4',
        priority: 'quick_review',
        timeBudgetSeconds: 600,
        existingDoubt: 'Why does responsibility shift?',
      },
    });
  });

});
