import { describe, expect, it } from 'vitest';
import {
  MotionTrack,
  cameraPoint,
  ease,
  cameraDuration,
} from '../world/motion';
import { boardOperation } from '../world/board-motion';
import { initialState } from '../teaching/controller';
import { lessons } from '../lessons';
import { checkpointVisual } from '../teaching/checkpoint';
import type { ShowcaseState } from '../teaching/types';
describe('finite World presentation motion', () => {
  it('demonstrates a validated weight change and restores the student exercise', () => {
    const lesson = lessons.find((item) => item.id === 'open-ai')!;
    const q = lesson.questions[5]!;
    const state: ShowcaseState = {
      ...initialState,
      visualState: { kind: 'network', input: 2, weight: 0.5, target: 3 },
    };
    expect(checkpointVisual(state, lesson, q, 'demo').visualState).toEqual({
      kind: 'network',
      input: 2,
      weight: 1.5,
      target: 3,
    });
    expect(checkpointVisual(state, lesson, q, 'check').visualState).toEqual({
      kind: 'network',
      input: 2,
      weight: 0.5,
      target: 3,
    });
  });
  it.each([15, 30, 60, 120])(
    'finishes at the same time and exact endpoint at %s FPS',
    (fps) => {
      const track = new MotionTrack(1.25);
      for (let i = 0; i < Math.ceil(1.25 * fps); i++) track.advance(1 / fps);
      expect(track.done).toBe(true);
      expect(track.elapsed).toBe(1.25);
      expect(
        cameraPoint([-2.8, 1.6, 0.1], [-0.55, 1.65, 1.85], track.progress),
      ).toEqual([-0.55, 1.65, 1.85]);
    },
  );
  it('preserves progress during pause and resumes without restarting', () => {
    const track = new MotionTrack(1.15);
    track.advance(0.4);
    const saved = track.elapsed;
    track.advance(3, true);
    expect(track.elapsed).toBe(saved);
    track.advance(0.75);
    expect(track.done).toBe(true);
  });
  it('handles a dropped frame by elapsed time instead of prolonging travel', () => {
    const track = new MotionTrack(1);
    track.advance(0.45);
    track.advance(0.5);
    expect(track.progress).toBeCloseTo(0.95);
    track.advance(0.05);
    expect(track.done).toBe(true);
  });
  it('settles immediately under reduced motion and explicit skip', () => {
    const track = new MotionTrack(1.2);
    track.advance(0, true, true);
    expect(track.done).toBe(true);
    const other = new MotionTrack(1);
    other.finish();
    expect(other.done).toBe(true);
  });
  it('uses monotonic easing without overshoot and bounded approved paths', () => {
    let previous = 0;
    for (let i = 0; i <= 100; i++) {
      const p = ease(i / 100);
      expect(p).toBeGreaterThanOrEqual(previous);
      expect(p).toBeLessThanOrEqual(1);
      previous = p;
      const point = cameraPoint([0.2, 1.65, 3.95], [-2.8, 1.6, 0.1], p);
      expect(point[0]).toBeGreaterThanOrEqual(-2.8);
      expect(point[0]).toBeLessThanOrEqual(0.2);
      expect(point[2]).toBeLessThan(4.2);
    }
    expect(cameraDuration('bookshelf')).toBe(1.25);
    expect(cameraDuration('board')).toBe(1.15);
    expect(cameraDuration('experiment')).toBe(1.05);
  });
  it('builds only an explicitly requested demonstration and never gates a response on animation', () => {
    const state: ShowcaseState = {
      ...initialState,
      visualState: { kind: 'network', input: 2, weight: 0.5, target: 3 },
    };
    const demo: ShowcaseState = {
      ...state,
      teaching: { ...state.teaching, status: 'DEMONSTRATING' },
    };
    const op = boardOperation(demo, state);
    expect(op.kind).toBe('network-build');
    expect(op.duration).toBe(1450);
    expect(op.after).toEqual(state.visualState);
    expect(
      boardOperation(
        {
          ...demo,
          teaching: { ...demo.teaching, status: 'AWAITING_RESPONSE' },
        },
        demo,
      ).duration,
    ).toBe(0);
    expect(boardOperation(demo, null).duration).toBe(0);
    expect(state.completion).toEqual({});
    expect(op.inputGate).toBe('student-controlled');
  });
});
