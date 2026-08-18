import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CourseDetailPage from './page';

const mocks = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'cloud-course' }),
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
    mocks.get.mockImplementation((path: string) => {
      if (path.endsWith('/announcements')) return Promise.resolve({ items: [] });
      if (path.endsWith('/syllabus')) return Promise.resolve({ modules: [] });
      if (path.endsWith('/materials')) return Promise.resolve({ items: [{ id: 'material-1', title: 'Module 1 Revision Questions', kindLabel: 'DOCX', weekNo: 1, description: 'NIST and cloud models' }] });
      if (path.endsWith('/projects')) return Promise.resolve({ items: [{ id: 'assignment-1', title: 'Distributed systems design', dueDate: '2026-08-21' }] });
      if (path.endsWith('/about')) return Promise.resolve({ officeHours: 'Monday 14:00–16:00', gradingScheme: [], attendance: { present: 0, total: 0, requiredPct: 75, belowThreshold: false, warningLine: null } });
      return Promise.reject(new Error(`Unexpected path: ${path}`));
    });
  });

  it('opens a useful Cloud Computing workspace with its material and assignment', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><CourseDetailPage /></QueryClientProvider>);

    const heading = screen.getByRole('heading', { level: 1, name: 'Cloud Computing' });
    expect(heading.closest('section')).toHaveAttribute('data-petros-href', '/courses/cloud-course');
    expect(await screen.findByRole('link', { name: /Module 1 Revision Questions/ })).toHaveAttribute(
      'href',
      'http://localhost:3007/v1/student/materials/material-1/file',
    );
    expect(screen.getByRole('link', { name: /Distributed systems design/ })).toHaveAttribute(
      'href',
      '/assignments/assignment-1',
    );
  });
});
