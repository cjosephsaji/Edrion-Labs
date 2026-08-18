import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ModuleListPage } from './module-page';

vi.mock('@/lib/hooks', () => ({
  useStudentList: () => ({
    data: { items: [{ id: 'cloud-course', name: 'Cloud Computing' }] },
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
}));

describe('ModuleListPage links', () => {
  it('makes a course card navigable and gives Petros the same destination', () => {
    render(
      <ModuleListPage<{ id: string; name: string }>
        title="Courses"
        path="/student/courses"
        queryKey="courses"
        emptyTitle="No courses"
        getItemHref={(item) => `/courses/${item.id}`}
        renderItem={(item) => <span>{item.name}</span>}
      />,
    );

    expect(screen.getByRole('link', { name: 'Cloud Computing' })).toHaveAttribute(
      'href',
      '/courses/cloud-course',
    );
    expect(screen.getByText('Cloud Computing').closest('li')).toHaveAttribute(
      'data-petros-href',
      '/courses/cloud-course',
    );
  });
});
