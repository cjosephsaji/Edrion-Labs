import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TeachingTarget, TeachingTargetRegistry } from '@/features/learning-studio/target-registry';
import { PresentationController } from '../presentation-controller';
import { TEACHING_FIXTURES } from '../playground/teaching-fixtures';
import { CompanionPoseController, resolveCompanionCue } from './companion-controller';
import { resolveSupportedPose } from './companion-policy';
import { CompanionRig } from './companion-rig';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});
const setup = () => {
  const presentation = new PresentationController(TEACHING_FIXTURES[1]!.timeline);
  presentation.play();
  const state = presentation.getSnapshot(),
    cue = presentation.timeline.beats[0]!.action.cue;
  return {
    presentation,
    state,
    cue,
    actionId: state.canvas.completedActionIds.at(-1)!,
    governor: new CompanionPoseController(),
    options: { reducedMotion: false },
  };
};
describe('restrained supported poses', () => {
  it('holds a brief target gesture, settles, suppresses repeats and observes a six-second cooldown', () => {
    vi.useFakeTimers();
    const { presentation, state, cue, actionId, governor, options } = setup();
    expect(governor.resolve(state, cue, 'left', actionId, 0, options)).toBe('point-left');
    expect(governor.resolve(state, cue, 'left', actionId, 1000, options)).toBe('neutral');
    expect(governor.resolve(state, cue, 'left', actionId, 20000, options)).toBe('neutral');
    presentation.step();
    presentation.play();
    const next = presentation.getSnapshot(),
      nextCue = presentation.timeline.beats[next.index]!.action.cue,
      nextAction = next.canvas.completedActionIds.at(-1)!;
    expect(governor.resolve(next, nextCue, 'right', nextAction, 3000, options)).toBe('neutral');
    expect(governor.resolve(next, nextCue, 'right', nextAction, 6000, options)).toBe('point-right');
    presentation.dispose();
  });
  it('revokes immediately on pause, then resumes the same checkpoint without replaying the gesture', () => {
    vi.useFakeTimers();
    const { presentation, state, cue, actionId, governor, options } = setup();
    expect(governor.resolve(state, cue, 'up', actionId, 0, options)).toBe('point-up');
    vi.advanceTimersByTime(175);
    presentation.interrupt();
    const interrupted = presentation.getSnapshot();
    expect(
      governor.resolve(
        interrupted,
        resolveCompanionCue(interrupted, cue),
        'up',
        actionId,
        200,
        options,
      ),
    ).toBe('listening');
    presentation.resume();
    expect(governor.resolve(presentation.getSnapshot(), cue, 'up', actionId, 300, options)).toBe(
      'neutral',
    );
    expect(presentation.getSnapshot().canvas.completedActionIds).toEqual(
      state.canvas.completedActionIds,
    );
    expect(presentation.getSnapshot().progress).toBe(interrupted.progress);
    presentation.dispose();
  });
  it('uses neutral/highlight fallback for disabled, missing, unlocated and reduced-motion targets', () => {
    vi.useFakeTimers();
    const { presentation, state, cue, actionId, governor, options } = setup();
    expect(resolveSupportedPose(cue, state.canvas, null)).toBe('neutral');
    expect(resolveSupportedPose({ ...cue, targetId: 'gone' }, state.canvas, 'left')).toBe(
      'neutral',
    );
    expect(
      governor.resolve(state, cue, 'left', actionId, 0, {
        ...options,
        disabledCapabilities: ['directional-pointing'],
      }),
    ).toBe('neutral');
    expect(governor.resolve(state, cue, 'left', actionId, 0, { reducedMotion: true })).toBe(
      'neutral',
    );
    expect(state.canvas.highlightedIds).toContain(cue.targetId);
    presentation.dispose();
  });
  it('points in a narrow pane, revokes clipped targets and admits the same action again only in a fresh replay', () => {
    vi.useFakeTimers();
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(688);
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(849);
    let clipped = false;
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      if (this.hasAttribute('data-pose')) return new DOMRect(605, 170, 70, 94);
      if (this.hasAttribute('data-petros-target'))
        return new DOMRect(10, clipped ? 900 : 300, 560, 80);
      return new DOMRect(0, 0, 688, 849);
    });
    const { presentation, state, cue } = setup();
    const ui = (next = state, owner = presentation) => (
      <TeachingTargetRegistry>
        <TeachingTarget id={cue.targetId!}>Teaching target</TeachingTarget>
        <CompanionRig
          cue={cue}
          canvas={next.canvas}
          state={next}
          presentation={owner}
          reducedMotion={false}
        />
      </TeachingTargetRegistry>
    );
    const { container, rerender } = render(ui());
    act(() => vi.advanceTimersByTime(20));
    expect(container.querySelector('[data-pose]')).toHaveAttribute('data-pose', 'point-left');
    clipped = true;
    rerender(ui({ ...state }));
    expect(container.querySelector('[data-pose]')).toHaveAttribute('data-pose', 'neutral');
    clipped = false;
    rerender(ui({ ...state }));
    expect(container.querySelector('[data-pose]')).toHaveAttribute('data-pose', 'neutral');
    const replay = new PresentationController(TEACHING_FIXTURES[1]!.timeline);
    replay.play();
    rerender(ui(replay.getSnapshot(), replay));
    expect(container.querySelector('[data-pose]')).toHaveAttribute('data-pose', 'point-left');
    presentation.dispose();
    replay.dispose();
  });
  it('does not point through the sticky companion harbor at an obscured teaching target', () => {
    vi.useFakeTimers();
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(688);
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(849);
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      if (this.hasAttribute('data-pose')) return new DOMRect(590, 130, 70, 94);
      if (this.hasAttribute('data-workspace-heading')) return new DOMRect(10, 70, 650, 210);
      if (this.hasAttribute('data-petros-target')) return new DOMRect(10, 100, 560, 80);
      return new DOMRect(0, 0, 688, 849);
    });
    const { presentation, state, cue } = setup();
    const { container } = render(
      <TeachingTargetRegistry>
        <section>
          <div data-workspace-heading style={{ position: 'sticky' }} />
          <div aria-label="Teaching workspace content">
            <TeachingTarget id={cue.targetId!}>Teaching target</TeachingTarget>
          </div>
          <CompanionRig cue={cue} canvas={state.canvas} state={state} reducedMotion={false} />
        </section>
      </TeachingTargetRegistry>,
    );
    act(() => vi.advanceTimersByTime(20));
    expect(container.querySelector('[data-pose]')).toHaveAttribute('data-pose', 'neutral');
    presentation.dispose();
  });
  it('never pretends text-only teaching is speech, and revokes gestures during real audio stalls', () => {
    vi.useFakeTimers();
    const { presentation, state, cue, actionId, governor, options } = setup();
    expect(resolveSupportedPose({ ...cue, gesture: 'neutral' }, state.canvas, null)).toBe(
      'neutral',
    );
    expect(
      resolveSupportedPose({ ...cue, gesture: 'neutral' }, state.canvas, null, { speaking: true }),
    ).toBe('speaking');
    expect(
      governor.resolve(
        { ...state, speech: { ...state.speech, phase: 'stalled' } },
        cue,
        'left',
        actionId,
        0,
        options,
      ),
    ).toBe('neutral');
    presentation.dispose();
  });
  it('settles a narration gesture into the authored speech pose, then stops on real audio stall', () => {
    vi.useFakeTimers();
    const { presentation, state, cue, actionId, governor, options } = setup();
    const speaking = { ...state, speech: { ...state.speech, phase: 'speaking' as const } };
    expect(governor.resolve(speaking, cue, 'left', actionId, 0, options)).toBe('point-left');
    expect(governor.resolve(speaking, cue, 'left', actionId, 1000, options)).toBe('speaking');
    expect(
      governor.resolve(
        { ...speaking, speech: { ...speaking.speech, phase: 'stalled' } },
        cue,
        'left',
        actionId,
        1001,
        options,
      ),
    ).toBe('neutral');
    presentation.dispose();
  });
  it('rejects stale surviving targets and unaccepted actions, and keeps an admitted pose stable while placement changes', () => {
    vi.useFakeTimers();
    const { presentation, state, cue, actionId, governor, options } = setup();
    expect(governor.resolve(state, cue, 'left', 'never-accepted', 0, options)).toBe('neutral');
    expect(governor.resolve(state, cue, 'left', actionId, 0, options)).toBe('point-left');
    expect(governor.resolve(state, cue, 'right', actionId, 100, options)).toBe('point-left');
    presentation.step();
    presentation.play();
    const next = presentation.getSnapshot();
    expect(next.canvas.elements.some((e) => e.id === cue.targetId)).toBe(true);
    expect(resolveSupportedPose(cue, next.canvas, 'left')).toBe('neutral');
    expect(governor.resolve(next, cue, 'left', actionId, 7000, options)).toBe('neutral');
    presentation.dispose();
  });
  it('uses the static speech pose only during actual preview playback and clears it on stall or stop', () => {
    vi.useFakeTimers();
    const { presentation, state, cue, actionId, governor, options } = setup();
    const previewCue = { ...cue, targetId: null, gesture: 'neutral' as const };
    const previewState = {
      ...state,
      status: 'interrupted' as const,
      speech: {
        ...state.speech,
        phase: 'speaking' as const,
        preview: { caption: 'Public voice sample.' },
      },
    };
    expect(governor.resolve(previewState, previewCue, null, actionId, 0, options)).toBe('speaking');
    expect(
      governor.resolve(
        { ...previewState, speech: { ...previewState.speech, phase: 'stalled' } },
        previewCue,
        null,
        actionId,
        1,
        options,
      ),
    ).toBe('neutral');
    expect(
      governor.resolve(
        { ...previewState, speech: { ...state.speech, phase: 'text' } },
        previewCue,
        null,
        actionId,
        2,
        options,
      ),
    ).toBe('neutral');
    expect(
      governor.resolve(previewState, previewCue, null, actionId, 3, {
        ...options,
        disabledCapabilities: ['speech-pose'],
      }),
    ).toBe('neutral');
    presentation.dispose();
  });
  it('selects the original authored poses and keeps transitions disabled while waiting and under reduced motion', () => {
    vi.useFakeTimers();
    const { presentation, state } = setup();
    const cue = {
      mode: 'listening' as const,
      gesture: 'neutral' as const,
      targetId: null,
      caption: 'Take your time.',
    };
    const ui = (
      nextCue:
        | typeof cue
        | { mode: 'thinking'; gesture: 'neutral'; targetId: null; caption: string },
      nextState = state,
      reducedMotion = false,
    ) => (
      <TeachingTargetRegistry>
        <CompanionRig
          cue={nextCue}
          canvas={nextState.canvas}
          state={nextState}
          reducedMotion={reducedMotion}
        />
      </TeachingTargetRegistry>
    );
    const { container, rerender } = render(ui(cue));
    const listeningImage = screen.getByAltText(/Petros/),
      avatar = listeningImage.closest('[data-pose]');
    expect(container.querySelectorAll('[data-pose] img')).toHaveLength(8);
    expect(listeningImage).toHaveAttribute('src', '/petros/states/petros-listening.png');
    expect(avatar).toHaveAttribute('data-pose-transition', 'false');
    rerender(ui({ ...cue, mode: 'thinking' }));
    expect(listeningImage).toBeInTheDocument();
    expect(screen.getByAltText(/Petros/)).toHaveAttribute(
      'src',
      '/petros/states/petros-thinking.png',
    );
    rerender(ui(cue, { ...state, status: 'awaiting_response' }, true));
    expect(avatar).toHaveAttribute('data-pose-transition', 'false');
    expect(screen.getByRole('img')).toBe(screen.getByAltText(/Petros/));
    presentation.dispose();
  });
  it('keeps assessment cues neutral regardless of public feedback and rejects all target/expression reactions', () => {
    vi.useFakeTimers();
    const { presentation, state, cue, governor, options } = setup();
    const safe = resolveCompanionCue(
      { ...state, feedback: 'Example result' },
      cue,
      true,
      'Example reply',
      true,
    );
    expect(safe).toMatchObject({ mode: 'waiting', gesture: 'neutral', targetId: null });
    expect(safe.caption).not.toContain('result');
    expect(safe.caption).not.toContain('reply');
    expect(governor.resolve(state, cue, 'left', 'a', 0, { ...options, assessmentSafe: true })).toBe(
      'neutral',
    );
    presentation.dispose();
  });
  it('does not acknowledge edits as evaluated work or let saved feedback override the next teaching action', () => {
    const presentation = new PresentationController(TEACHING_FIXTURES[1]!.timeline);
    for (let i = 0; i < 4; i++) presentation.step();
    let state = presentation.getSnapshot(),
      cue = presentation.timeline.beats[state.index]!.action.cue;
    expect(resolveCompanionCue(state, cue)).toMatchObject({
      mode: 'waiting',
      gesture: 'neutral',
      targetId: null,
    });
    presentation.submit(() => 'Your value matches this fixture. Reasoning is not evaluated.');
    expect(resolveCompanionCue(presentation.getSnapshot(), cue).caption).toContain('not evaluated');
    presentation.play();
    state = presentation.getSnapshot();
    cue = presentation.timeline.beats[state.index]!.action.cue;
    expect(resolveCompanionCue(state, cue)).toEqual(cue);
    presentation.dispose();
  });
  it('falls back when an image fails and stops retrying when neutral is also absent', () => {
    const presentation = new PresentationController(TEACHING_FIXTURES[0]!.timeline),
      state = presentation.getSnapshot();
    const cue = {
      mode: 'listening' as const,
      gesture: 'neutral' as const,
      targetId: null,
      caption: 'Take your time.',
    };
    render(
      <TeachingTargetRegistry>
        <CompanionRig
          microphoneActive
          cue={cue}
          canvas={state.canvas}
          state={state}
          reducedMotion={false}
        />
      </TeachingTargetRegistry>,
    );
    expect(screen.getByAltText(/Petros/)).toHaveAttribute(
      'src',
      '/petros/states/petros-listening.png',
    );
    act(() => fireEvent.error(screen.getByAltText(/Petros/)));
    expect(screen.getByRole('img', { name: /Petros/ })).toHaveAttribute(
      'src',
      '/petros/states/petros-idle.png',
    );
    act(() => fireEvent.error(screen.getByAltText(/Petros/)));
    expect(screen.getByRole('img', { name: /Petros/ })).toHaveTextContent('Petros');
    expect(screen.getByText('Recording · Listening')).toBeInTheDocument();
    presentation.dispose();
  });
});
