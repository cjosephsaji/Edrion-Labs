import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StudentMe } from '@/lib/hooks';
import { PetrosHome } from './petros-home';

const mocks = vi.hoisted(() => ({ get: vi.fn(), page: vi.fn() }));
vi.mock('@/lib/api-client', async (original) => ({
  ...(await original<typeof import('@/lib/api-client')>()),
  useStudentApi: () => ({ get: mocks.get }),
}));
vi.mock('./petros-companion-context', () => ({ usePetrosPage: mocks.page }));
vi.mock('./petros-input-modes', () => ({ PetrosInputModes: () => <p>Independent input modes</p> }));
vi.mock('@/features/learning-studio/teaching-studio-launcher', () => ({
  TeachingStudioLauncher: () => <p>Calculus teaching demo</p>,
}));

const account: StudentMe = {
  kind: 'institutional',
  fullName: 'Student',
  email: null,
  studentId: 'student-1',
  institutionId: 'institution-1',
  campusId: null,
  programmeName: null,
  className: null,
  sectionName: null,
  termName: null,
  academicYearName: null,
  permissions: ['student.learn.use', 'student.classes.view'],
  surfaces: {},
};
function open() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <PetrosHome />
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  mocks.get.mockReset();
  mocks.page.mockReset();
  mocks.get.mockImplementation(async (path: string) =>
    path === '/student/me' ? account : { items: [] },
  );
});

describe('Institution-linked Petros content', () => {
  it('shows an empty state when the institution has shared nothing, without a demo or personal sources', async () => {
    open();
    expect(
      await screen.findByRole('heading', { name: 'No learning content shared yet' }),
    ).toBeVisible();
    expect(screen.queryByText('Calculus teaching demo')).not.toBeInTheDocument();
    expect(screen.queryByText('Independent input modes')).not.toBeInTheDocument();
    expect(mocks.get.mock.calls.map(([path]) => path)).toEqual(
      expect.arrayContaining([
        '/student/me',
        '/student/assignments/learning-goals',
        '/student/materials',
        '/student/notes',
      ]),
    );
    expect(mocks.get).not.toHaveBeenCalledWith('/student/petros/sources');
  });

  it('shows actual teacher goals, uploaded materials and published lesson notes with their correct destinations', async () => {
    const shared = {
      '/student/assignments/learning-goals': [
        { id: 'goal-1', title: 'Explain friction', subjectName: 'Physics' },
      ],
      '/student/materials': [
        { id: 'file-1', title: 'Friction slides', subjectName: 'Physics', kindLabel: 'Slides' },
      ],
      '/student/notes': [
        {
          id: 'note-1',
          title: 'Today’s friction lesson',
          subjectName: 'Physics',
          summary: 'Contact surfaces resist relative motion.',
        },
      ],
    };
    mocks.get.mockImplementation(async (path: string) =>
      path === '/student/me' ? account : { items: shared[path as keyof typeof shared] ?? [] },
    );
    open();
    expect(await screen.findByRole('heading', { name: 'Explain friction' })).toBeVisible();
    expect(await screen.findByRole('heading', { name: 'Friction slides' })).toBeVisible();
    expect(await screen.findByRole('heading', { name: 'Today’s friction lesson' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'View goal and guidance' })).toHaveAttribute(
      'href',
      '/learn/goals/goal-1',
    );
    expect(screen.getByRole('link', { name: 'Open materials' })).toHaveAttribute(
      'href',
      '/materials',
    );
    expect(screen.getByRole('link', { name: 'Read lesson note' })).toHaveAttribute(
      'href',
      '/notes/note-1',
    );
    expect(
      screen.queryByRole('heading', { name: 'No learning content shared yet' }),
    ).not.toBeInTheDocument();
    expect(mocks.page).toHaveBeenLastCalledWith(
      expect.objectContaining({
        candidates: expect.arrayContaining([
          expect.objectContaining({ entityType: 'assignment', entityId: 'goal-1' }),
          expect.objectContaining({ entityType: 'material', entityId: 'file-1' }),
          expect.objectContaining({ entityType: 'note', entityId: 'note-1' }),
        ]),
      }),
    );
  });

  it('allows notes and goals to appear even when no files have been uploaded', async () => {
    mocks.get.mockImplementation(async (path: string) =>
      path === '/student/me'
        ? account
        : {
            items:
              path === '/student/notes'
                ? [{ id: 'note-1', title: 'Teacher’s lesson', subjectName: null }]
                : [],
          },
    );
    open();
    expect(await screen.findByRole('heading', { name: 'Teacher’s lesson' })).toBeVisible();
    expect(
      screen.queryByRole('heading', { name: 'No learning content shared yet' }),
    ).not.toBeInTheDocument();
  });

  it('reports load failures without claiming the institution shared nothing', async () => {
    mocks.get.mockImplementation(async (path: string) => {
      if (path === '/student/me') return account;
      if (path === '/student/materials') throw new Error('Material service unavailable');
      return { items: [] };
    });
    open();
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load study materials.');
    expect(
      screen.queryByRole('heading', { name: 'No learning content shared yet' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeVisible();
    expect(screen.queryByText('Calculus teaching demo')).not.toBeInTheDocument();
  });

  it('loads only permitted institutional sections for a learner with Learn access', async () => {
    mocks.get.mockImplementation(async (path: string) =>
      path === '/student/me' ? { ...account, permissions: ['student.learn.use'] } : { items: [] },
    );
    open();
    await screen.findByRole('heading', { name: 'No learning content shared yet' });
    expect(mocks.get).toHaveBeenCalledWith('/student/assignments/learning-goals');
    expect(mocks.get).not.toHaveBeenCalledWith('/student/materials');
    expect(mocks.get).not.toHaveBeenCalledWith('/student/notes');
  });

  it('waits for the account before rendering any teaching choices', async () => {
    mocks.get.mockImplementation(() => new Promise(() => {}));
    open();
    expect(screen.queryByText('Calculus teaching demo')).not.toBeInTheDocument();
    expect(screen.queryByText('Independent input modes')).not.toBeInTheDocument();
    expect(mocks.get).toHaveBeenCalledTimes(1);
  });

  it('preserves independent-account input modes without fetching institutional content', async () => {
    mocks.get.mockResolvedValue({
      ...account,
      kind: 'independent',
      studentId: null,
      institutionId: null,
    });
    open();
    expect(await screen.findByText('Independent input modes')).toBeVisible();
    expect(mocks.get).toHaveBeenCalledTimes(1);
  });
});
