import { describe, expect, it } from 'vitest';
import {
  initial,
  step,
  setParams,
  execute,
  observe,
  namedAnchors,
} from '../simulations/runtime';
import {
  relativityStageState,
  clockRuler,
  clockX,
  clockAngle,
  clockStep,
  intervalComplete,
  relativityFrames,
  constantSpeedExample,
  spacetimeDiagram,
} from '../stage/relativity-logic';
import { relativityLesson } from '../stage/lessons/relativity';
import { isStageTopic, stageTarget, stageTopics } from '../stage/navigation';

describe('Time dilation Stage uses existing relativity values', () => {
  it('distinguishes selected totals from elapsed readings, including the prepared 0.8c case', () => {
    const start = relativityStageState(initial('relativity')),
      end = relativityStageState(step(start.sim, 10));
    expect(start.earthClock).toBe(0);
    expect(start.shipClock).toBe(0);
    expect(start.earthInterval).toBe(10);
    expect(start.shipInterval).toBeCloseTo(6, 12);
    expect(end.earthClock).toBeCloseTo(10, 10);
    expect(end.shipClock).toBeCloseTo(6, 10);
    expect(end.gamma).toBe(observe(end.sim).gamma);
    expect(clockRuler(end).max).toBe(10);
    expect(() => relativityStageState(initial('traffic'))).toThrow();
  });
  it('handles zero, near-light speed, the transfer case and long selected intervals', () => {
    for (const beta of [0, 0.8, 0.99, 0.999])
      for (const duration of [1, 10, 120]) {
        const sim = constantSpeedExample(beta, duration),
          s = relativityStageState(sim),
          o = observe(sim);
        expect(s.shipClock).toBe(o.shipClock);
        expect(s.earthClock).toBeCloseTo(duration, 8);
        expect(s.shipClock).toBeCloseTo(s.shipInterval, 8);
        expect(s.shipClock).toBeLessThanOrEqual(s.earthClock);
        expect(intervalComplete(s)).toBe(true);
      }
    expect(relativityStageState(constantSpeedExample(0)).shipClock).toBeCloseTo(
      10,
      10,
    );
    expect(
      relativityStageState(constantSpeedExample(0.99)).shipClock,
    ).toBeLessThan(6);
    expect(() => setParams(initial('relativity'), { beta: 1 })).toThrow();
  });
  it('keeps both rows on one zero-referenced scale at all allowed spans', () => {
    for (const duration of [1, 10, 20, 120]) {
      const s = relativityStageState(constantSpeedExample(0.8, duration)),
        r = clockRuler(s);
      expect(r.ticks[0]).toBe(0);
      expect(r.max).toBeGreaterThanOrEqual(duration - 1e-8);
      expect(clockX(0, s)).toBe(-2.45);
      expect(clockX(s.shipClock, s)).toBeLessThan(clockX(s.earthClock, s));
      expect(clockX(s.earthClock, s)).toBeLessThanOrEqual(2.45);
      expect(clockAngle(s.shipClock, s)).toBeLessThan(
        clockAngle(s.earthClock, s),
      );
    }
    const beyond = relativityStageState(step(initial('relativity'), 30));
    expect(clockRuler(beyond).max).toBeGreaterThanOrEqual(beyond.earthClock);
  });
  it('selects bounded worker steps and stops exactly at the selected duration', () => {
    const s = relativityStageState(step(initial('relativity'), 9.95)),
      a = clockStep(s, 0.1);
    expect(a.tool).toBe('sim_step');
    expect(+a.args!.seconds!).toBeCloseTo(0.05, 8);
    const done = relativityStageState(execute(s.sim, a.tool, a.args).state);
    expect(intervalComplete(done)).toBe(true);
    expect(
      +clockStep(
        relativityStageState(initial('relativity', { duration: 120 })),
        100,
      ).args!.seconds!,
    ).toBe(60);
  });
  it('does not invent integrated acceleration when beta changes', () => {
    const before = step(initial('relativity'), 10),
      after = setParams(before, { beta: 0.99 }),
      s = relativityStageState(after);
    expect(s.earthClock).toBe(before.time);
    expect(s.shipClock).toBe(observe(after).shipClock);
    expect(s.shipClock).toBeLessThan(+observe(before).shipClock);
    expect(relativityLesson.story.description).toMatch(/separate/);
  });
  it('changes selected duration without advancing either elapsed clock', () => {
    const a = relativityStageState(step(initial('relativity'), 3)),
      b = relativityStageState(setParams(a.sim, { duration: 20 }));
    expect(b.earthClock).toBe(a.earthClock);
    expect(b.shipClock).toBe(a.shipClock);
    expect(b.earthInterval).toBe(20);
    expect(b.shipInterval).toBeCloseTo(12, 12);
  });
  it('transforms the same endpoint events using the existing Lorentz engine', () => {
    for (const beta of [0, 0.8, 0.99, 0.999]) {
      const earth = relativityStageState(constantSpeedExample(beta)),
        ship = relativityStageState(setParams(earth.sim, { frame: 'ship' })),
        e = spacetimeDiagram(earth),
        s = spacetimeDiagram(ship);
      expect(ship.shipClock).toBe(earth.shipClock);
      expect(ship.earthClock).toBe(earth.earthClock);
      expect(s.shipEvent.x).toBeCloseTo(0, 8);
      expect(s.shipEvent.t).toBeCloseTo(ship.shipClock, 8);
      expect(s.earthEvent.x).toBeLessThanOrEqual(0);
      expect(e.shipEvent.t ** 2 - e.shipEvent.x ** 2).toBeCloseTo(
        s.shipEvent.t ** 2 - s.shipEvent.x ** 2,
        7,
      );
      for (const p of [s.earth, s.ship, s.left, s.right, s.earthNow, s.shipNow])
        expect(p.every(Number.isFinite)).toBe(true);
      expect(Math.abs(s.left[0])).toBeCloseTo(
        Math.abs(s.left[2] - s.origin[2]),
        12,
      );
    }
  });
  it('prepares immutable samples from the real integrator without extra elapsed ticks', () => {
    const source = initial('relativity', { duration: 120, beta: 0.99 }),
      saved = JSON.stringify(source),
      frames = relativityFrames(source, 2);
    expect(frames).toHaveLength(3);
    expect(frames[0].time).toBe(0);
    expect(frames.at(-1)!.time).toBeCloseTo(120, 7);
    expect(JSON.stringify(source)).toBe(saved);
    expect(+observe(frames.at(-1)!).shipClock).toBeCloseTo(
      +observe(source).shipSeconds,
      7,
    );
  });
  it('has nine short valid explainers and keeps every existing semantic target', () => {
    const parts = new Set(relativityLesson.parts.map((p) => p.id));
    expect(relativityLesson.chips).toHaveLength(9);
    for (const s of [
      relativityStageState(initial('relativity')),
      relativityStageState(constantSpeedExample(0.999, 120)),
    ]) {
      for (const q of relativityLesson.chips) {
        expect(parts.has(q.part)).toBe(true);
        expect(
          q.answer(s).trim().split(/\s+/).length,
          q.id,
        ).toBeLessThanOrEqual(50);
        expect(relativityLesson.demos[q.demo]).toBeDefined();
        for (const p of q.also ?? []) expect(parts.has(p)).toBe(true);
      }
    }
    const ids = namedAnchors(initial('relativity'));
    for (const p of relativityLesson.parts)
      expect(ids).toContain(stageTarget('relativity', p.id));
    expect(isStageTopic('relativity')).toBe(true);
    expect(isStageTopic('unknown')).toBe(false);
    expect(stageTopics.every((t) => t.enabled)).toBe(true);
  });
});
