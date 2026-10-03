import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CURRICULUM_ALIGNMENT_VERSION,
  curriculumAlignmentSchema,
  curriculumAlignmentView,
} from '@edrion/schemas';
import { PetrosCompanionProvider } from './petros-companion-context';
import CourseDetailPage from '../../app/(app)/courses/[id]/page';

const mocks = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'course-1' }),
  usePathname: () => '/courses/course-1',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/lib/hooks', () => ({
  useStudentList: () => ({
    data: { items: [{ id: 'course-1', code: 'CSE102', name: 'Cloud Computing', credits: 4, professorName: 'Mary Saji' }] },
  }),
}));

vi.mock('@/lib/api-client', () => ({
  formatApiError: (error: unknown) => error instanceof Error ? error.message : 'Request failed',
  useStudentApi: () => ({ get: mocks.get, fileUrl: (path: string) => `http://synthetic.test/v1${path}` }),
}));

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const provenance = {
  method: 'manual' as const,
  sourceRef: 'synthetic curriculum',
  sourceHash: 'a'.repeat(64),
  observedAt: '2026-09-20T00:00:00.000Z',
  licence: 'synthetic-only',
};
const effective = { from: '2026-01-01T00:00:00.000Z', until: null };

function readyCurriculum() {
  const payload = curriculumAlignmentSchema.parse({
    schemaVersion: CURRICULUM_ALIGNMENT_VERSION,
    objectives: [
      { id: uuid(1), version: 1, provenance, descriptor: 'Explain elasticity.', effective },
      { id: uuid(2), version: 1, provenance, descriptor: 'Explain scalability.', effective },
    ],
    frameworks: [{ id: uuid(3), version: 1, provenance, title: 'Synthetic framework', jurisdiction: 'Test', subject: 'Computing', level: 'Intro', issuingBody: 'Test publisher', externalId: 'FW-1', uri: null }],
    releases: [{ id: uuid(4), version: 1, provenance, framework: { id: uuid(3), version: 1 }, publisherVersion: '2026', effective, supersedes: null }],
    items: [{ id: uuid(5), version: 1, provenance, release: { id: uuid(4), version: 1 }, externalId: 'STD-1', uri: null, descriptor: 'Explain elastic allocation.' }],
    relationships: [],
    alignments: [{ id: uuid(6), version: 1, provenance, objective: { id: uuid(1), version: 1 }, standard: { id: uuid(5), version: 1 }, relation: 'addresses', rationale: 'Direct match.', gaps: [], confidence: 1, status: 'approved', effective, overrideReason: null }],
    moduleObjectives: [{ weekNo: 1, objectives: [{ id: uuid(1), version: 1 }, { id: uuid(2), version: 1 }] }],
  });
  return {
    schemaVersion: CURRICULUM_ALIGNMENT_VERSION,
    revision: 3,
    evidence: 'not_assessed' as const,
    status: 'ready' as const,
    data: curriculumAlignmentView(payload, Date.parse('2026-09-20T00:00:00Z')),
  };
}

function respondToCourseRequests(syllabus: unknown) {
  mocks.get.mockImplementation((path?: string) => {
    if (!path) return Promise.resolve(null);
    if (path.endsWith('/announcements')) return Promise.resolve({ items: [] });
    if (path.endsWith('/syllabus')) return Promise.resolve(syllabus);
    if (path.endsWith('/materials')) return Promise.resolve({ items: [] });
    if (path.endsWith('/projects')) return Promise.resolve({ items: [] });
    if (path.endsWith('/about')) return Promise.resolve({ officeHours: null, gradingScheme: [], attendance: { present: 0, total: 0, requiredPct: 75, belowThreshold: false, warningLine: null } });
    return Promise.reject(new Error(`Unexpected path: ${path}`));
  });
}

function mount() {
  const query = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={query}>
      <PetrosCompanionProvider><CourseDetailPage /></PetrosCompanionProvider>
    </QueryClientProvider>,
  );
}

describe('S10/S11 negotiated student compatibility surfaces', () => {
  beforeEach(() => mocks.get.mockReset());
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('sends the exact contract header and renders approved plan data without learner-evidence claims', async () => {
    respondToCourseRequests({
      modules: [{ weekNo: 1, title: 'Elastic systems', topics: ['Scaling'], covered: false, isCurrentWeek: true }],
      curriculum: readyCurriculum(),
    });
    mount();
    fireEvent.click(await screen.findByText('Course objectives and standards'));
    expect(await screen.findByText('Explain elasticity.')).toBeVisible();
    expect(screen.getByText(/STD-1: Explain elastic allocation/)).toBeVisible();
    expect(screen.getByText(/not evidence of your learning/i)).toBeVisible();
    expect(screen.getByText('No current approved standard mapping.')).toBeVisible();
    const syllabusCall = mocks.get.mock.calls.find(([path]) => String(path).endsWith('/syllabus'));
    expect(syllabusCall?.[2]).toEqual({ 'x-petros-curriculum-alignment': CURRICULUM_ALIGNMENT_VERSION });
  });

  it.each([
    ['stale', 'The course plan changed; its standard mappings need review.'],
    ['unmapped', 'No standard mappings are published.'],
    ['unsupported_version', 'Standard mappings are currently unavailable.'],
  ] as const)('keeps %s negotiated state content-free', async (status, message) => {
    respondToCourseRequests({ modules: [], curriculum: {
      schemaVersion: CURRICULUM_ALIGNMENT_VERSION, revision: 4, evidence: 'not_assessed', status,
    } });
    mount();
    fireEvent.click(await screen.findByText('Course objectives and standards'));
    expect(await screen.findByText(message)).toBeVisible();
    expect(screen.queryByText('STD-1')).not.toBeInTheDocument();
  });

  it('keeps the legacy {modules} reader useful without inventing alignment data', async () => {
    respondToCourseRequests({ modules: [{ weekNo: 2, title: 'Legacy topic', topics: ['Queues'], covered: true, isCurrentWeek: false }] });
    mount();
    expect(await screen.findByText('Legacy topic')).toBeVisible();
    expect(screen.queryByText('Course objectives and standards')).not.toBeInTheDocument();
  });

  it('shows denied reads through the existing retryable course error surface', async () => {
    respondToCourseRequests({ modules: [] });
    mocks.get.mockImplementation((path?: string) => !path
      ? Promise.resolve(null)
      : path.endsWith('/syllabus')
      ? Promise.reject(new Error('You do not have access to this course plan.'))
      : path.endsWith('/about')
        ? Promise.resolve({ officeHours: null, gradingScheme: [], attendance: { present: 0, total: 0, requiredPct: 75, belowThreshold: false, warningLine: null } })
        : Promise.resolve({ items: [] }));
    mount();
    expect(await screen.findByText('You do not have access to this course plan.')).toBeVisible();
    expect(screen.getByRole('button', { name: /try again/i })).toBeVisible();
  });
});
