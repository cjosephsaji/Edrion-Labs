import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ModuleListPage } from './module-page';
import { PetrosCompanionProvider } from './petros/petros-companion-context';

vi.mock('next/navigation', () => ({ usePathname: () => '/courses' }));

vi.mock('@/lib/hooks', () => ({
  useStudentList: () => ({
    data: { items: [{ id: 'cloud-course', name: 'Cloud Computing' }] },
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
}));

describe('ModuleListPage links', () => {
  it('makes a course card navigable and lets the student point Petros at it', () => {
    render(
      <PetrosCompanionProvider>
        <ModuleListPage<{ id: string; name: string }>
          title="Courses"
          path="/student/courses"
          queryKey="courses"
          emptyTitle="No courses"
          getItemHref={(item) => `/courses/${item.id}`}
          petros={(item) => ({ entityType: 'course', entityId: item.id, title: item.name })}
          renderItem={(item) => <span>{item.name}</span>}
        />
      </PetrosCompanionProvider>,
    );

    expect(screen.getByRole('link', { name: 'Cloud Computing' })).toHaveAttribute(
      'href',
      '/courses/cloud-course',
    );
    expect(screen.getByRole('button', { name: 'Ask Petros about Cloud Computing' })).toBeInTheDocument();
  });

  it('offers no Petros affordance when the page describes nothing to it', () => {
    render(
      <PetrosCompanionProvider>
        <ModuleListPage<{ id: string; name: string }>
          title="Courses"
          path="/student/courses"
          queryKey="courses"
          emptyTitle="No courses"
          getItemHref={(item) => `/courses/${item.id}`}
          renderItem={(item) => <span>{item.name}</span>}
        />
      </PetrosCompanionProvider>,
    );

    expect(screen.queryByRole('button', { name: /Ask Petros about/ })).toBeNull();
  });
});
