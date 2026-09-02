import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AssignmentListScreen, type AssignmentRow } from './assignment-list-screen';

const mocks = vi.hoisted(() => ({
  useStudentList: vi.fn(),
  usePetrosPage: vi.fn(),
}));

vi.mock('@/lib/hooks', () => ({
  useStudentMe: () => ({
    data: {
      programmeName: 'BSc Computer Science',
      permissions: ['student.assignments.view', 'student.homework.view'],
    },
    isLoading: false,
  }),
  useStudentList: mocks.useStudentList,
}));

vi.mock('@/components/petros/petros-companion-context', () => ({
  usePetrosPage: mocks.usePetrosPage,
}));

vi.mock('@/components/petros/petros-ask-button', () => ({
  PetrosAskButton: () => null,
}));

const assignment: AssignmentRow = {
  id: 'assignment-1',
  title: 'Database report',
  subjectName: 'Databases',
  dueAt: '2026-09-12',
  status: 'assigned',
};

const submittedHomework: AssignmentRow = {
  id: 'homework-1',
  title: 'Cloud revision questions',
  subjectName: 'Cloud Computing',
  dueAt: '2026-09-10T12:00:00.000Z',
  status: 'submitted',
};

const returnedAssignment: AssignmentRow = {
  id: 'assignment-2',
  title: 'Returned essay',
  subjectName: 'Writing',
  dueAt: '2026-08-20',
  status: 'graded',
};

function itemsFor(path: string) {
  if (path.includes('/assignments?filter=all')) return [assignment];
  if (path.includes('/homework?filter=all')) return [submittedHomework];
  if (path.includes('/assignments?filter=progress')) return [assignment];
  if (path.includes('/homework?filter=submitted')) return [submittedHomework];
  if (path.includes('/assignments?filter=returned')) return [returnedAssignment];
  return [];
}

describe('college assignment filters', () => {
  beforeEach(() => {
    mocks.useStudentList.mockImplementation((_key: unknown, path: string, enabled = true) => ({
      data: enabled ? { items: itemsFor(path) } : undefined,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    }));
  });

  it('combines both coursework sources and keeps every filter on the correct status', () => {
    render(<AssignmentListScreen kind="assignments" />);

    expect(screen.getByRole('heading', { name: 'Database report' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Cloud revision questions' })).toBeVisible();
    expect(screen.getByRole('link', { name: /Cloud revision questions/ })).toHaveAttribute(
      'href',
      '/homework/homework-1',
    );

    fireEvent.click(screen.getByRole('tab', { name: 'Submitted' }));
    expect(screen.getByRole('heading', { name: 'Cloud revision questions' })).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Database report' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'In progress' }));
    expect(screen.getByRole('heading', { name: 'Database report' })).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Cloud revision questions' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Returned' }));
    expect(screen.getByRole('heading', { name: 'Returned essay' })).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Database report' })).not.toBeInTheDocument();

    expect(mocks.useStudentList).toHaveBeenCalledWith(
      ['assignments', 'submitted'],
      '/student/assignments?filter=submitted',
      true,
    );
    expect(mocks.useStudentList).toHaveBeenCalledWith(
      ['homework', 'submitted'],
      '/student/homework?filter=submitted',
      true,
    );
  });
});
