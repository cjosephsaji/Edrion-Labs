import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PetrosReflection } from './petros-reflection';

const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), push: vi.fn(), id: 0 }));
const mockApi = vi.hoisted(() => ({ get: mocks.get, post: mocks.post }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock('@/lib/api-client', () => ({
  useStudentApi: () => mockApi,
  newIdempotencyKey: () => `00000000-0000-4000-8000-${String(++mocks.id).padStart(12, '0')}`,
  formatApiError: (error: unknown) => error instanceof Error ? error.message : 'Request failed',
}));

const ids = {
  mapEvidence: '11111111-1111-4111-8111-111111111111',
  recommendation: '22222222-2222-4222-8222-222222222222',
  calibration: '33333333-3333-4333-8333-333333333333',
  recap: '44444444-4444-4444-8444-444444444444',
  session: '55555555-5555-4555-8555-555555555555',
  alarm: '66666666-6666-4666-8666-666666666666',
};

function fixture(overrides: Record<string, unknown> = {}) {
  const evidence = { id: ids.mapEvidence, sourceType: 'learner_evidence', sourceId: 'evidence-1', label: 'Wrong prerequisite gap evidence for forces', observedAt: '2026-08-12T10:00:00.000Z', ageDays: 1 };
  return {
    schemaVersion: 'petros.reflection.surface.v1', algorithmVersion: 'petros.reflection.stage11.v1', rebuiltAt: '2026-08-13T10:00:00.000Z', sourceThroughAt: '2026-08-13T09:59:00.000Z', stale: false, jobLagSeconds: 60,
    thresholds: { mapMinimumEvidence: 3, solidMasteryBasisPoints: 7500, maximumSolidUncertaintyBasisPoints: 3500, freshDays: 14, agingDays: 45, staleDays: 90, calibrationMinimumEvidence: 8, calibrationMinimumWindowEvidence: 4, gapMinimumIndependentEvidence: 3, gapMinimumAffectedTopics: 2, gapMinimumConfidenceBasisPoints: 6500 },
    map: {
      topics: [
        { conceptId: 'vectors', topicId: 'topic-vectors', title: 'Vectors', subjectLabel: 'Physics', curriculumLabel: 'Mechanics', state: 'shaky', stateExplanation: 'Enough evidence exists, but mastery is below solid.', evidenceCount: 4, masteryBasisPoints: 5200, uncertaintyBasisPoints: 2800, freshness: 'fresh', evidenceAgeDays: 1, lastEvidenceAt: evidence.observedAt, prerequisiteConceptIds: [], dependentConceptIds: ['forces'], examRelevance: { known: false, label: null, examDate: null }, evidence: [evidence], recommendationId: ids.recommendation },
        { conceptId: 'forces', topicId: 'topic-forces', title: 'Forces', subjectLabel: 'Physics', curriculumLabel: 'Mechanics', state: 'untouched', stateExplanation: 'Not attempted: there is no learner evidence for this topic yet.', evidenceCount: 0, masteryBasisPoints: null, uncertaintyBasisPoints: 10000, freshness: 'none', evidenceAgeDays: null, lastEvidenceAt: null, prerequisiteConceptIds: ['vectors'], dependentConceptIds: [], examRelevance: { known: false, label: null, examDate: null }, evidence: [], recommendationId: null },
      ],
      relationships: [{ fromConceptId: 'vectors', toConceptId: 'forces' }], coverage: { solid: 0, shaky: 1, untouched: 1, insufficient_evidence: 0 }, missingSyllabusLinks: 0,
    },
    recommendations: [{ id: ids.recommendation, conceptId: 'vectors', topicId: 'topic-vectors', title: 'Vectors', actionLabel: 'Repair Vectors', sessionType: 'repair', score: 8500, reasons: [{ code: 'prerequisite_gap', label: 'This is a prerequisite for one affected topic.', points: 5000, evidenceLinkIds: [ids.mapEvidence] }, { code: 'fragile_knowledge', label: 'Current evidence is fragile.', points: 3500, evidenceLinkIds: [ids.mapEvidence] }], whyThis: 'This is a prerequisite and current evidence is fragile.', evidenceAgeDays: 1, status: 'active' }],
    calibration: { id: ids.calibration, eligible: true, evidenceCount: 10, minimumEvidence: 8, direction: 'over', trend: 'narrowing', meanConfidenceBasisPoints: 8100, meanOutcomeBasisPoints: 6900, gapBasisPoints: 1200, uncertaintyBasisPoints: 3000, headline: 'The gap is narrowing', explanation: 'Recent confidence has tended to run ahead of outcomes. The recent gap is smaller.', actionRecommendationId: ids.recommendation, quietUntil: null, status: 'active', evidence: [evidence] },
    recaps: [{ id: ids.recap, sessionId: ids.session, topic: 'Vectors', closedAt: '2026-08-13T09:00:00.000Z', content: { schemaVersion: 'petros.reflection.recap.v1', sessionId: ids.session, headline: 'You changed strategy and recovered', observedFacts: [{ text: 'You recovered after revising an earlier attempt.', evidenceLinkIds: [ids.mapEvidence] }], tentativeInferences: [{ text: 'In this session, the diagram may have helped.', label: 'Tentative', evidenceLinkIds: [ids.mapEvidence] }], nextTry: 'Try a small sketch again.', durablePreferenceClaimed: false, abilityLabelUsed: false }, evidence: [evidence], status: 'active', correctedText: null, generation: { source: 'deterministic_fallback', functionKey: 'reflection.session_recap.generate', validationPassed: true } }],
    alarms: [{ id: ids.alarm, fingerprint: 'a'.repeat(64), content: { schemaVersion: 'petros.reflection.gap-alarm.v1', prerequisiteConceptId: 'vectors', prerequisiteLabel: 'Vectors', affectedTopics: [{ topicId: 'forces', label: 'Forces' }, { topicId: 'momentum', label: 'Momentum' }], independentEvidenceCount: 3, confidenceBasisPoints: 7000, hypothesis: 'Vectors may be the shared prerequisite behind these recent difficulties.', explanation: 'Three independent pieces of recent evidence point to the same prerequisite. This is a hypothesis, not a fact.', practicalMinutes: 16, uncertaintyLabel: 'Prerequisite hypothesis' }, evidence: [evidence, { ...evidence, id: '77777777-7777-4777-8777-777777777777' }, { ...evidence, id: '88888888-8888-4888-8888-888888888888' }], recommendationId: ids.recommendation, status: 'active', snoozedUntil: null, generation: { source: 'deterministic', functionKey: 'reflection.gap_explanation.generate', validationPassed: true } }],
    voiceRequired: false, productionReady: false, ...overrides,
  };
}

describe('Petros reflection accessible surface', () => {
  beforeEach(() => { mocks.get.mockReset(); mocks.post.mockReset(); mocks.push.mockReset(); mocks.id = 0; mocks.get.mockResolvedValue(fixture()); });

  it('renders a finite evidence-linked next action and keeps not attempted honest', async () => {
    render(<PetrosReflection />);
    expect(await screen.findByRole('heading', { name: 'What should I do next?' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: /Forces: Not attempted/i }));
    expect(screen.getByText(/Not attempted: there is no learner evidence/i)).toBeVisible();
    fireEvent.click(screen.getByText('Why this?'));
    expect(screen.getByText(/This is a prerequisite for one affected topic/i)).toBeVisible();
    expect(screen.getByText(/not a score, rank, feed, or public comparison/i)).toBeVisible();
  });

  it('provides visual and nonvisual map parity with accessible state names', async () => {
    render(<PetrosReflection />);
    const visual = await screen.findByLabelText(/Scrollable knowledge map/i);
    expect(within(visual).getByRole('button', { name: /Vectors: Shaky/i })).toBeVisible();
    expect(within(visual).getByRole('button', { name: /Forces: Not attempted/i })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Accessible list' }));
    const table = screen.getByRole('table', { name: 'Knowledge map list equivalent' });
    expect(within(table).getByRole('button', { name: 'Vectors' })).toBeVisible();
    expect(within(table).getByRole('button', { name: 'Forces' })).toBeVisible();
    expect(within(table).getAllByText('Not attempted').length).toBeGreaterThan(0);
  });

  it('shows gentle calibration, labelled recap inference, and a hypothesis alarm with controls', async () => {
    render(<PetrosReflection />);
    expect(await screen.findByRole('heading', { name: 'The gap is narrowing' })).toBeVisible();
    expect(screen.getByText(/Tentative:/)).toBeVisible();
    expect(screen.getAllByText(/Prerequisite hypothesis/i).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Snooze 14 days' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'These are unrelated' })).toBeVisible();
  });

  it('keeps the calibration mirror hidden below the sample threshold', async () => {
    mocks.get.mockResolvedValue(fixture({ calibration: { ...fixture().calibration, eligible: false, status: 'hidden', evidenceCount: 3, direction: 'hidden', trend: 'insufficient_history', headline: 'More predictions are needed', explanation: 'This mirror stays hidden until eight pairs exist.' } }));
    render(<PetrosReflection />);
    expect(await screen.findByRole('heading', { name: 'Calibration mirror is quiet' })).toBeVisible();
    expect(screen.getByText(/at least 8 confidence-and-outcome pairs/i)).toBeVisible();
    expect(screen.queryByText('More predictions are needed')).not.toBeInTheDocument();
  });

  it('creates a scoped Stage 8 reflection intent before starting the session', async () => {
    const intent = { id: '99999999-9999-4999-8999-999999999999', goal: 'Repair vectors from linked evidence.' };
    mocks.post.mockResolvedValueOnce(intent).mockResolvedValueOnce({ intent, session: { id: ids.session } });
    render(<PetrosReflection />);
    fireEvent.click(await screen.findByRole('button', { name: 'Repair Vectors' }));
    await waitFor(() => expect(mocks.post).toHaveBeenCalledWith(`/student/petros/reflection/recommendations/${ids.recommendation}/intent`, expect.objectContaining({ idempotencyKey: expect.any(String) })));
    expect(await screen.findByText('Stage 8 preview created')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: /Start this scoped session/i }));
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith(`/petros/session?session=${ids.session}`));
  });

  it('offers a legitimate learner-controlled dismissal for every recommendation', async () => {
    mocks.post.mockResolvedValueOnce({ status: 'dismissed' });
    render(<PetrosReflection />);
    fireEvent.click(await screen.findByRole('button', { name: 'Dismiss this suggestion' }));
    await waitFor(() => expect(mocks.post).toHaveBeenCalledWith(
      `/student/petros/reflection/recommendations/${ids.recommendation}/lifecycle`,
      expect.objectContaining({ action: 'dismiss', idempotencyKey: expect.any(String) }),
    ));
  });
});
