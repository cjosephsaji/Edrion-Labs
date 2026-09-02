import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PetrosReflection } from './petros-reflection';

const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), push: vi.fn(), id: 0 }));
const mockApi = vi.hoisted(() => ({ get: mocks.get, post: mocks.post }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }), usePathname: () => '/progress' }));
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
    expect(await screen.findByRole('heading', { name: 'Progress' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: /Forces: Not attempted/i }));
    expect(screen.getByText(/Not attempted: there is no learner evidence/i)).toBeVisible();
    fireEvent.click(screen.getByText('Why this?'));
    expect(screen.getByText(/This is a prerequisite for one affected topic/i)).toBeVisible();
    expect(screen.getByText(/Based on your own work/i)).toBeVisible();
  });

  it('provides subject and list views with the same topics and accessible progress labels', async () => {
    render(<PetrosReflection />);
    const visual = await screen.findByRole('region', { name: 'Your topics' });
    expect(within(visual).getByRole('button', { name: /Vectors: Needs practice/i })).toBeVisible();
    expect(within(visual).getByRole('button', { name: /Forces: Not attempted/i })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'List' }));
    const table = screen.getByRole('table', { name: 'Topic progress list' });
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
    expect(await screen.findByRole('heading', { name: 'Progress' })).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Calibration mirror is quiet' })).not.toBeInTheDocument();
    expect(screen.queryByText('More predictions are needed')).not.toBeInTheDocument();
  });

  it('creates a scoped Stage 8 reflection intent before starting the session', async () => {
    const intent = { id: '99999999-9999-4999-8999-999999999999', goal: 'Repair vectors from linked evidence.' };
    mocks.post.mockResolvedValueOnce(intent).mockResolvedValueOnce({ intent, session: { id: ids.session } });
    render(<PetrosReflection />);
    fireEvent.click(await screen.findByRole('button', { name: 'Repair Vectors' }));
    await waitFor(() => expect(mocks.post).toHaveBeenCalledWith(`/student/petros/reflection/recommendations/${ids.recommendation}/intent`, expect.objectContaining({ idempotencyKey: expect.any(String) })));
    expect(await screen.findByText('Your session is ready')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: /Start session/i }));
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

  it('combines topic search and progress filters without labelling untried topics as weak', async () => {
    render(<PetrosReflection />);
    await screen.findByRole('button', { name: 'Vectors: Needs practice' });
    fireEvent.change(screen.getByRole('combobox', { name: 'Filter topics by progress' }), { target: { value: 'untouched' } });
    expect(screen.queryByRole('button', { name: 'Vectors: Needs practice' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Forces: Not attempted' })).toBeVisible();
    fireEvent.change(screen.getByRole('textbox', { name: 'Search topics or subjects' }), { target: { value: 'vectors' } });
    expect(screen.getByRole('heading', { name: 'No matching topics' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(screen.getByRole('button', { name: 'Vectors: Needs practice' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Forces: Not attempted' })).toBeVisible();
  });

  it('keeps stale recommendations disabled until refresh succeeds', async () => {
    mocks.get.mockResolvedValue(fixture({ stale: true }));
    mocks.post.mockRejectedValueOnce(new Error('Refresh unavailable')).mockResolvedValueOnce(fixture());
    render(<PetrosReflection />);
    expect(await screen.findByRole('button', { name: 'Repair Vectors' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Refresh now' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Refresh unavailable');
    expect(screen.getByRole('button', { name: 'Repair Vectors' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Refresh now' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Repair Vectors' })).toBeEnabled());
    expect(mocks.post).toHaveBeenCalledWith('/student/petros/reflection/rebuild', expect.objectContaining({ idempotencyKey: expect.any(String) }));
    expect(screen.queryByRole('button', { name: 'Refresh now' })).not.toBeInTheDocument();
  });

  it('offers a useful first step with no learning history or optional insights', async () => {
    mocks.get.mockResolvedValue(fixture({ map: { topics: [], relationships: [], coverage: {}, missingSyllabusLinks: 0 }, recommendations: [], calibration: null, recaps: [], alarms: [] }));
    render(<PetrosReflection />);
    expect(await screen.findByRole('heading', { name: 'Your progress starts here' })).toBeVisible();
    expect(screen.getAllByRole('link', { name: 'Start learning' }).every((link) => link.getAttribute('href') === '/learn')).toBe(true);
    expect(screen.queryByRole('heading', { name: 'A foundation to revisit' })).not.toBeInTheDocument();
  });

});
