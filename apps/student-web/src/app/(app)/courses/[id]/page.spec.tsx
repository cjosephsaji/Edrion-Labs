import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PetrosCompanionProvider } from '@/components/petros/petros-companion-context';
import CourseDetailPage from './page';

const mocks = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'cloud-course' }),
  usePathname: () => '/courses/cloud-course',
  useSearchParams: () => new URLSearchParams('name=Cloud+Computing&code=CSE102&professor=Mary+Saji'),
}));

vi.mock('@/lib/hooks', () => ({
  useStudentList: () => ({
    data: {
      items: [{
        id: 'cloud-course',
        code: 'CSE102',
        name: 'Cloud Computing',
        credits: 4,
        professorName: 'Mary Saji',
      }],
    },
  }),
}));

vi.mock('@/lib/api-client', () => ({
  formatApiError: (error: unknown) => error instanceof Error ? error.message : 'Request failed',
  useStudentApi: () => ({
    get: mocks.get,
    fileUrl: (path: string) => `http://localhost:3007/v1${path}`,
  }),
}));

describe('Course detail page', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        format: 'word',
        sections: [{ title: 'Page 1', text: 'NIST cloud architecture', rows: null }],
        truncated: false,
        note: null,
      }),
    }));
    mocks.get.mockImplementation((path: string) => {
      if (path.endsWith('/announcements')) return Promise.resolve({ items: [] });
      if (path.endsWith('/syllabus')) return Promise.resolve({ modules: [] });
      if (path.endsWith('/materials')) return Promise.resolve({ items: [{ id: 'material-1', title: 'Module 1 Revision Questions', kindLabel: 'DOCX', weekNo: 1, description: 'NIST and cloud models', filename: 'module-1.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }] });
      if (path.endsWith('/projects')) return Promise.resolve({ items: [{ id: 'assignment-1', title: 'Distributed systems design', dueDate: '2026-08-21' }] });
      if (path.endsWith('/about')) return Promise.resolve({ officeHours: 'Monday 14:00–16:00', gradingScheme: [], attendance: { present: 0, total: 0, requiredPct: 75, belowThreshold: false, warningLine: null } });
      return Promise.reject(new Error(`Unexpected path: ${path}`));
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  it('opens a useful Cloud Computing workspace with its material and assignment', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <PetrosCompanionProvider>
          <CourseDetailPage />
        </PetrosCompanionProvider>
      </QueryClientProvider>,
    );

    screen.getByRole('heading', { level: 1, name: 'Cloud Computing' });
    expect(screen.getByRole('button', { name: 'Ask Petros about Cloud Computing' })).toBeInTheDocument();
    expect(await screen.findByRole('region', { name: 'Course overview' })).toHaveTextContent('Materials1file ready to open');
    const material = screen.getByRole('button', { name: 'Open Module 1 Revision Questions' });
    fireEvent.click(material);
    expect(await screen.findByRole('dialog', { name: 'Module 1 Revision Questions' })).toBeInTheDocument();
    expect(await screen.findByText('NIST cloud architecture')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Distributed systems design/ })).toHaveAttribute(
      'href',
      '/assignments/assignment-1',
    );
  });

  it('negotiates the curriculum contract while retaining a legacy modules-only response', async () => {
    mocks.get.mockImplementation((path: string) => {
      if (path.endsWith('/announcements')) return Promise.resolve({ items: [] });
      if (path.endsWith('/syllabus')) return Promise.resolve({
        modules: [{ weekNo: 2, title: 'Legacy queues', topics: ['Scheduling'], covered: false, isCurrentWeek: true }],
      });
      if (path.endsWith('/materials') || path.endsWith('/projects')) return Promise.resolve({ items: [] });
      if (path.endsWith('/about')) return Promise.resolve({ officeHours: null, gradingScheme: [], attendance: { present: 0, total: 0, requiredPct: 75, belowThreshold: false, warningLine: null } });
      return Promise.reject(new Error(`Unexpected path: ${path}`));
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <PetrosCompanionProvider><CourseDetailPage /></PetrosCompanionProvider>
      </QueryClientProvider>,
    );

    expect(await screen.findByText('Legacy queues')).toBeVisible();
    expect(screen.queryByText('Course objectives and standards')).not.toBeInTheDocument();
    expect(mocks.get).toHaveBeenCalledWith(
      '/student/courses/cloud-course/syllabus',
      undefined,
      { 'x-petros-curriculum-alignment': 'petros.curriculum-alignment.v1' },
    );
  });
});
