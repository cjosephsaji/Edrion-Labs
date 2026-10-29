import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TeachingTargetRegistry } from '@/features/learning-studio/target-registry';
import { CompanionRig } from '@/features/petros-v2/companion/companion-rig';
import { resolveCompanionCue } from '@/features/petros-v2/companion/companion-controller';
import { PresentationController } from '@/features/petros-v2/presentation-controller';
import { TEACHING_FIXTURES } from '@/features/petros-v2/playground/teaching-fixtures';
import { PetrosAvatar } from './petros-avatar';
import { petrosStatus } from './petros-speech-cloud';

afterEach(() => { cleanup(); vi.useRealTimers(); delete document.documentElement.dataset.reducedMotion; });
describe('shared presentation without media or teaching ownership', () => {
  it('keeps original V2 artwork static before Play, while typing, paused and under reduced motion', () => {
    const presentation = new PresentationController(TEACHING_FIXTURES[0]!.timeline);
    const state = presentation.getSnapshot(), published = presentation.timeline.beats[0]!.action.cue;
    const element = (typing = false, reducedMotion = false) => <TeachingTargetRegistry><CompanionRig presentation={presentation} state={state}
      canvas={state.canvas} cue={resolveCompanionCue(state, published, typing)} reducedMotion={reducedMotion} /></TeachingTargetRegistry>;
    const { container, rerender } = render(element());
    expect(container.querySelector('[data-shared-petros]')).toHaveAttribute('data-idle-motion', 'false');
    expect(container.querySelectorAll('[data-shared-petros]')).toHaveLength(1);
    rerender(element(true)); expect(container.querySelector('[data-shared-petros]')).toHaveAttribute('data-idle-motion', 'false');
    rerender(element(false, true)); expect(container.querySelector('[data-shared-petros]')).toHaveAttribute('data-motion', 'false');
    presentation.dispose();
  });
  it('moves the approximate mouth only for confirmed playback and closes immediately on stop or reduced motion', async () => {
    vi.useFakeTimers();
    const { container, rerender } = render(<PetrosAvatar pose="speaking" speaking={false} />);
    expect(container.querySelector('svg')).toBeNull();
    rerender(<PetrosAvatar pose="speaking" speaking transition />);
    expect(container.querySelector('svg')).toHaveAttribute('data-mouth', 'open');
    expect(container.querySelector('[data-shared-petros]')).toHaveAttribute('data-transition', 'false');
    act(() => vi.advanceTimersByTime(135)); expect(container.querySelector('svg')).toHaveAttribute('data-mouth', 'closed');
    rerender(<PetrosAvatar pose="neutral" />); expect(container.querySelector('svg')).toBeNull();
    act(() => vi.advanceTimersByTime(1_000)); expect(container.querySelector('[data-shared-petros]')).toHaveAttribute('data-mouth', 'closed');
    rerender(<PetrosAvatar pose="speaking" speaking reducedMotion />); expect(container.querySelector('svg')).toHaveAttribute('data-mouth', 'closed');
    rerender(<PetrosAvatar pose="speaking" speaking />);
    await act(async () => { document.documentElement.dataset.reducedMotion = 'true'; });
    expect(container.querySelector('svg')).toHaveAttribute('data-mouth', 'closed');
  });
  it('keeps status claims tied to observed operation phases', () => {
    expect(petrosStatus({ questionReady: true })).toBe('Ready for your question');
    expect(petrosStatus({ recording: true })).toBe('Recording');
    expect(petrosStatus({ transcribing: true })).toBe('Transcribing');
    expect(petrosStatus({ preparing: true })).toBe('Preparing speech');
    expect(petrosStatus({ speaking: true })).toBe('Speaking');
    expect(petrosStatus({ teaching: true })).toBe('Teaching');
    expect(petrosStatus({ waiting: true })).toBe('Waiting');
    expect(petrosStatus({ paused: true })).toBe('Paused');
  });
});
