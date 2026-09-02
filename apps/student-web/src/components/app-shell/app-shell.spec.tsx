import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StudentPreferencesProvider } from '@/lib/preferences';
import { AppShell } from './app-shell';

const mocks = vi.hoisted(() => ({ permissions: ['*'], pathname: '/progress' }));
vi.mock('next/navigation', () => ({ usePathname: () => mocks.pathname, useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/lib/hooks', () => ({
  useStudentMe: () => ({ data: { kind: 'institutional', programmeName: 'Computer Science', fullName: 'Test Student', permissions: mocks.permissions, surfaces: {} } }),
  useStudentLogout: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('@/components/petros/petros-companion-context', () => ({ PetrosCompanionProvider: ({ children }: { children: React.ReactNode }) => children }));
vi.mock('@/components/petros/petros-companion-panel', () => ({ PetrosCompanionPanel: () => null }));

function Portal() {
  return <StudentPreferencesProvider><AppShell><h1>Progress</h1></AppShell></StudentPreferencesProvider>;
}
function directory() {
  fireEvent.click(within(screen.getByRole('navigation', { name: 'Student portal' })).getByRole('button', { name: 'Explore' }));
  return screen.getByRole('dialog');
}

describe('Explore quick navigation', () => {
  beforeEach(() => {
    const storage = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    });
    mocks.permissions = ['*'];
    mocks.pathname = '/progress';
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  });

  it('adds favourites beyond the five defaults and preserves them after remounting', async () => {
    const first = render(<Portal />);
    const menu = directory();
    expect(within(menu).getByText('Quick navigation · 5 starred')).toBeVisible();
    fireEvent.click(within(menu).getByRole('button', { name: 'Add Library to quick navigation' }));
    fireEvent.click(within(menu).getByRole('button', { name: 'Add Progress to quick navigation' }));
    expect(within(menu).getByRole('button', { name: 'Remove Progress from quick navigation' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(menu).getByText('Quick navigation · 7 starred')).toBeVisible();
    for (const name of ['Student portal', 'Quick navigation']) {
      expect(within(screen.getByRole('navigation', { name })).getByRole('link', { name: 'Progress' })).toHaveAttribute('href', '/progress');
    }
    first.unmount();
    render(<Portal />);
    await waitFor(() => expect(within(screen.getByRole('navigation', { name: 'Student portal' })).getByRole('link', { name: 'Progress' })).toBeVisible());
    const restored = directory();
    expect(within(restored).getByRole('button', { name: 'Remove Library from quick navigation' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(within(restored).getByRole('button', { name: 'Remove Progress from quick navigation' }));
    expect(within(screen.getByRole('navigation', { name: 'Student portal' })).queryByRole('link', { name: 'Progress' })).not.toBeInTheDocument();
    expect(within(restored).getByRole('button', { name: 'Add Progress to quick navigation' })).toBeEnabled();
    fireEvent.click(within(restored).getByRole('button', { name: 'Restore default quick navigation' }));
    expect(within(restored).getByText('Quick navigation · 5 starred')).toBeVisible();
  });

  it('exposes the learning pages and respects each page permission', () => {
    mocks.permissions = ['student.classes.view'];
    render(<Portal />);
    const menu = directory();
    expect(within(menu).getByRole('link', { name: 'Library' })).toHaveAttribute('href', '/materials');
    expect(within(menu).getByRole('link', { name: 'Notes' })).toHaveAttribute('href', '/notes');
    expect(within(menu).queryByRole('link', { name: 'Overview' })).not.toBeInTheDocument();
    expect(within(menu).queryByRole('link', { name: /Progress/ })).not.toBeInTheDocument();
    expect(within(menu).queryByRole('link', { name: 'Learning workspace' })).not.toBeInTheDocument();
  });

  it('shows the same section navigation pattern beyond Learn', () => {
    mocks.pathname = '/calendar';
    render(<Portal />);

    const nav = screen.getByRole('navigation', { name: 'Academics navigation' });
    expect(within(nav).getByRole('link', { name: 'Calendar' })).toHaveAttribute('aria-current', 'page');
    expect(within(nav).getByRole('link', { name: 'Timetable' })).toHaveAttribute('href', '/timetable');
    expect(within(nav).getByRole('link', { name: 'Courses' })).toHaveAttribute('href', '/courses');
  });

  it('marks notes as its own visible Learn destination', () => {
    mocks.pathname = '/notes/teacher-note';
    render(<Portal />);

    const nav = screen.getByRole('navigation', { name: 'Learn navigation' });
    expect(within(nav).getByRole('link', { name: 'Notes' })).toHaveAttribute('aria-current', 'page');
  });
});
