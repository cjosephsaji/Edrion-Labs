import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { initialSharedCanvas, type M4Snapshot } from '@edrion/schemas';
import { feedbackFixture } from './feedback-fixtures';
const session = vi.hoisted(() => ({ snapshot: null as M4Snapshot | null }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('./use-petros-session', () => ({
  usePetrosSession: () => ({
    ...session,
    error: '',
    busy: false,
    hasUnconfirmedSubmission: false,
    draft: '',
    dirty: false,
    command: vi.fn(),
    pause: vi.fn(),
    leave: vi.fn(),
    save: vi.fn(),
    submit: vi.fn(),
    changeDraft: vi.fn(),
  }),
}));
import { PetrosSessionShell } from './petros-session-shell';
beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
  }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it('retains the original settled companion when a saved paused canvas has no active teaching presentation', () => {
  session.snapshot = {
    ...feedbackFixture('partial'),
    status: 'paused',
    teaching: undefined,
    canvas: initialSharedCanvas('saved-activity'),
    actions: ['resume', 'close'],
  };
  const { container } = render(<PetrosSessionShell sessionId={session.snapshot.id} />);
  expect(screen.getByRole('complementary', { name: 'Petros companion' })).toBeVisible();
  expect(screen.getByRole('img', { name: 'Original Petros' })).toHaveAttribute(
    'src',
    '/petros/states/petros-idle.png',
  );
  expect(container.querySelector('[data-cloud-kind]')).toBeNull();
  expect(screen.getByRole('button', { name: 'Continue learning' })).toBeEnabled();
  expect(session.snapshot.canvas?.activityId).toBe('saved-activity');
});
