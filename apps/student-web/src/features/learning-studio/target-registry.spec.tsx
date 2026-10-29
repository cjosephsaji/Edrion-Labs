import { act, cleanup, render, screen } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TeachingTargetRegistry, TeachingTarget, useTeachingTargets } from './target-registry';
function Probe() {
  const { targets } = useTeachingTargets();
  const t = targets.get('same');
  return (
    <output data-testid="target">
      {JSON.stringify(
        t ? { available: t.available, text: t.element.textContent, scope: t.scope } : null,
      )}
    </output>
  );
}
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});
describe('target instance ownership and current revision', () => {
  it('registers targets after Strict Mode cancels and reconnects the first frame', () => {
    vi.useFakeTimers();
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(
      new DOMRect(0, 0, 100, 40),
    );
    render(
      <StrictMode>
        <TeachingTargetRegistry>
          <TeachingTarget id="same">connected</TeachingTarget>
          <Probe />
        </TeachingTargetRegistry>
      </StrictMode>,
    );
    act(() => vi.advanceTimersByTime(20));
    expect(screen.getByTestId('target')).toHaveTextContent('connected');
    expect(screen.getByTestId('target')).toHaveTextContent('"available":true');
  });
  it('refreshes the scope when the canvas revision changes without a resize', () => {
    vi.useFakeTimers();
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(
      new DOMRect(0, 0, 100, 40),
    );
    const ui = (revision: number) => (
      <TeachingTargetRegistry scope={{ sessionId: 'session', activityId: 'activity', revision }}>
        <TeachingTarget id="same">same</TeachingTarget>
        <Probe />
      </TeachingTargetRegistry>
    );
    const { rerender } = render(ui(1));
    act(() => vi.advanceTimersByTime(20));
    rerender(ui(2));
    act(() => vi.advanceTimersByTime(20));
    expect(screen.getByTestId('target')).toHaveTextContent('"revision":2');
  });
  it('does not let an old duplicate instance unregister the active target', () => {
    vi.useFakeTimers();
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(
      new DOMRect(0, 0, 100, 40),
    );
    const ui = (old = true) => (
      <TeachingTargetRegistry scope={{ sessionId: 'session', activityId: 'activity', revision: 3 }}>
        {old && <TeachingTarget id="same">old</TeachingTarget>}
        <TeachingTarget id="same">current</TeachingTarget>
        <Probe />
      </TeachingTargetRegistry>
    );
    const { rerender } = render(ui());
    act(() => vi.advanceTimersByTime(20));
    rerender(ui(false));
    act(() => vi.advanceTimersByTime(20));
    expect(screen.getByTestId('target')).toHaveTextContent('current');
    expect(screen.getByTestId('target')).toHaveTextContent('"revision":3');
  });
  it('revokes targets removed from the document', () => {
    vi.useFakeTimers();
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(
      new DOMRect(0, 0, 100, 40),
    );
    const { rerender } = render(
      <TeachingTargetRegistry>
        <TeachingTarget id="same">target</TeachingTarget>
        <Probe />
      </TeachingTargetRegistry>,
    );
    act(() => vi.advanceTimersByTime(20));
    rerender(
      <TeachingTargetRegistry>
        <Probe />
      </TeachingTargetRegistry>,
    );
    act(() => vi.advanceTimersByTime(20));
    expect(screen.getByTestId('target')).toHaveTextContent('null');
  });
});
