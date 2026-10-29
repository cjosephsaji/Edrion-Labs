import { cleanup, fireEvent, render, screen, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { usePetrosSession } from '../use-petros-session';
import { ClassicCompanion } from './classic-companion';
import { classicFixture, now } from './classic-cloud.fixture';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  sessionStorage.clear();
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
      this.querySelector('button')?.focus();
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.removeAttribute('open');
    },
  });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function fixture() {
  const { snapshot } = classicFixture();
  snapshot.lesson = {
    ...snapshot.lesson!,
    title: 'Source-bound lesson',
    subject: 'English',
    citation: 'Reviewed passage, paragraph 2',
    limitations: [],
    explanation: 'Exact reviewed explanation. '.repeat(35),
  };
  const command = vi.fn(async () => ({ status: 'committed' }));
  const session = {
    busy: false,
    dirty: false,
    command,
    getSnapshot: () => snapshot,
  } as unknown as ReturnType<typeof usePetrosSession>;
  return { snapshot, session, command };
}

describe('Classic companion reading and interruption', () => {
  it.each([false, true])(
    'dismisses safely with reduced motion %s and never lets an exit timer clear a newer notice',
    (reducedMotion) => {
      const props = fixture();
      const view = render(
        <ClassicCompanion
          {...props}
          typing={false}
          suspended={false}
          hidden={false}
          reducedMotion={reducedMotion}
          explanationAttempt={null}
        />,
      );
      act(() => vi.advanceTimersByTime(701));
      const dismiss = screen.getByRole('button', { name: 'Dismiss Petros cloud' });
      dismiss.focus();
      fireEvent.click(dismiss);
      expect(screen.getByRole('button', { name: '✦ Ask Petros' })).toHaveFocus();
      expect(view.container.querySelector('[data-cloud-phase="exit"]')).toBe(
        reducedMotion ? null : view.container.querySelector('[data-cloud-kind]'),
      );
      const next = classicFixture(6, 'observed').snapshot;
      view.rerender(
        <ClassicCompanion
          {...props}
          snapshot={next}
          typing={false}
          suspended={false}
          hidden={false}
          reducedMotion={reducedMotion}
          explanationAttempt={null}
        />,
      );
      act(() => vi.advanceTimersByTime(181));
      expect(view.container.querySelectorAll('[data-cloud-kind]')).toHaveLength(1);
      expect(view.container.querySelector('[data-cloud-kind="notice"]')).toBeTruthy();
    },
  );
  it('uses original artwork and presents one bounded thought with a full authorized reader', async () => {
    const props = fixture();
    const view = render(
      <ClassicCompanion
        {...props}
        typing={false}
        suspended={false}
        hidden={false}
        reducedMotion
        explanationAttempt={null}
      />,
    );
    expect(screen.getByRole('img')).toHaveAttribute('src', '/petros/states/petros-idle.png');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '✦ Ask Petros' }));
    });
    expect(view.container.querySelectorAll('[data-cloud-kind]')).toHaveLength(1);
    expect(view.container.querySelector('[data-cloud-kind] [role="status"]')).toHaveTextContent(
      'Your reviewed explanation is ready to read.',
    );
    const read = screen.getByRole('button', { name: 'Read full explanation' });
    read.focus();
    fireEvent.click(read);
    const dialog = screen.getByRole('dialog', { name: 'Full reviewed explanation' });
    expect(dialog).toHaveTextContent(props.snapshot.lesson!.explanation.trim());
    expect(dialog).toHaveTextContent(props.snapshot.lesson!.citation);
    expect(props.command).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole('button', { name: 'Close Full reviewed explanation' }));
    expect(read).toHaveFocus();
    expect(props.command).toHaveBeenCalledTimes(2);
    view.rerender(
      <ClassicCompanion
        {...props}
        typing
        suspended={false}
        hidden={false}
        reducedMotion
        explanationAttempt={null}
      />,
    );
    expect(view.container.querySelector('[data-cloud-kind]')).toBeNull();
    expect(screen.getByRole('button', { name: 'Read full explanation' })).toBeVisible();
    view.rerender(
      <ClassicCompanion
        {...props}
        typing={false}
        suspended={false}
        hidden={false}
        reducedMotion
        explanationAttempt={null}
      />,
    );
    expect(view.container.querySelector('[data-cloud-kind="thought"]')).toBeTruthy();
    props.snapshot.epoch++;
    view.rerender(
      <ClassicCompanion
        {...props}
        typing={false}
        suspended={false}
        hidden={false}
        reducedMotion
        explanationAttempt={null}
      />,
    );
    expect(view.container.querySelector('[data-cloud-kind]')).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
  });
  it('disposes timers and removes content immediately on session invalidation', async () => {
    const clear = vi.spyOn(globalThis, 'clearTimeout');
    const props = fixture();
    const view = render(
      <ClassicCompanion
        {...props}
        typing={false}
        suspended={false}
        hidden={false}
        reducedMotion={false}
        explanationAttempt={null}
      />,
    );
    act(() => vi.advanceTimersByTime(701));
    expect(view.container.querySelector('[data-cloud-kind="speech"]')).toBeTruthy();
    props.snapshot.status = 'blocked';
    view.rerender(
      <ClassicCompanion
        {...props}
        typing={false}
        suspended={false}
        hidden={false}
        reducedMotion={false}
        explanationAttempt={null}
      />,
    );
    expect(view.container.querySelector('[data-cloud-kind]')).toBeNull();
    expect(screen.getByRole('button', { name: '✦ Ask Petros' })).toBeDisabled();
    view.unmount();
    expect(clear).toHaveBeenCalled();
  });
});
