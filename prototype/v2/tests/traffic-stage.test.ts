import { describe, it, expect } from 'vitest';
import {
  initial,
  observe,
  step,
  brake,
  setParams,
  namedAnchors,
} from '../simulations/runtime';
import { respond, predictions } from '../core/teaching';
import { defaultTrafficParams } from '../simulations/foundations/traffic';
import {
  trafficStageState,
  trafficHeadwayComparison,
  trafficWaveFrames,
  roadPosition,
  roadDelta,
  wrapRoad,
  speedAt,
  trafficColor,
  trafficSnapshotColor,
  trafficGapPoints,
  trafficGapCenter,
  roadLength,
} from '../stage/traffic-logic';
import { createTrafficLesson } from '../stage/lessons/traffic';
import { stageTarget, isStageTopic } from '../stage/navigation';
import { Color } from 'three';
import { palette } from '../stage/palette';
describe('Traffic Stage binds to the existing IDM engine', () => {
  it('frames the entire real bumper-to-bumper arc at sparse and dense counts', () => {
    for (const count of [5, 20, 45]) {
      const s = trafficStageState(
          step(brake(initial('traffic', { count })), 6),
        ),
        points = trafficGapPoints(s),
        center = trafficGapCenter(s),
        ends = [
          roadPosition(
            s.hero.position + defaultTrafficParams.carLength / 2,
            2.66,
            0.55,
          ),
          roadPosition(
            s.lead.position - defaultTrafficParams.carLength / 2,
            2.66,
            0.55,
          ),
        ];
      expect(points).toHaveLength(33);
      for (const [p, q] of [
        [points[0], ends[0]],
        [points.at(-1)!, ends[1]],
      ])
        p.forEach((v, i) => expect(v).toBeCloseTo(q[i], 12));
      center.forEach((v, i) => {
        expect(v).toBeGreaterThanOrEqual(Math.min(...points.map((p) => p[i])));
        expect(v).toBeLessThanOrEqual(Math.max(...points.map((p) => p[i])));
      });
      const lesson = createTrafficLesson(count);
      expect(
        lesson.parts.find((p) => p.id === 'gap')!.boundsPoints!(s),
      ).toHaveLength(33 * 8);
      expect(
        lesson.shots.find((p) => p.part === 'gap')!.framePoints!(s),
      ).toHaveLength(33 * 8);
      expect(lesson.shots.find((p) => p.part === 'density')!.fitBounds).toBe(
        true,
      );
    }
  });
  it('keeps slower/faster ribbon colors legible without changing numeric speeds', () => {
    const scale = { min: 4, max: 10, spread: 6 };
    const close = (actual: Color, expected: Color) => {
      actual
        .toArray()
        .forEach((v, i) => expect(v).toBeCloseTo(expected.toArray()[i], 12));
    };
    close(trafficSnapshotColor(4, scale), new Color(palette.amber));
    close(trafficSnapshotColor(10, scale), new Color(palette.mint));
    close(trafficSnapshotColor(7, scale), trafficColor(3, 6));
    close(
      trafficSnapshotColor(13, { min: 13, max: 13, spread: 0 }),
      new Color(palette.mint),
    );
  });
  it('reads default cars, mean/min/max, density, headway and real history', () => {
    const sim = initial('traffic'),
      s = trafficStageState(sim),
      o = observe(sim);
    expect(s.count).toBe(20);
    expect(s.mean).toBe(o.meanSpeed);
    expect(s.min).toBe(o.minSpeed);
    expect(s.max).toBe(o.maxSpeed);
    expect(s.density).toBe(o.density);
    expect(s.headway).toBe(1.2);
    expect(s.desiredSpeed).toBe(22);
    expect(s.hero.id).toBe('car_0');
    expect(s.gap).toBeCloseTo(350 / 20 - 4.5);
    expect(s.front.exists).toBe(false);
    expect(() => trafficStageState(initial('rocket'))).toThrow();
    const running = trafficStageState(step(sim, 2));
    expect(running.history).toEqual(running.sim.history.map((h) => h.a));
  });
  it('one brief brake changes only car_0 speed, not position, time or other cars', () => {
    const before = initial('traffic'),
      after = brake(before),
      s = trafficStageState(after);
    expect(s.hero.speed).toBe(1);
    expect(after.time).toBe(0);
    for (const c of before.data.traffic!.cars) {
      const next = after.data.traffic!.cars.find((n) => n.id === c.id)!;
      expect(next.position).toBe(c.position);
      if (c.id !== 'car_0') expect(next.speed).toBe(c.speed);
    }
    expect(s.front.exists).toBe(true);
  });
  it('headway and desired-speed edits preserve current cars; count changes reset them', () => {
    const s = step(brake(initial('traffic')), 3),
      next = setParams(s, { headway: 2.4, desiredSpeed: 28 });
    expect(next.data.traffic).toEqual(s.data.traffic);
    expect(next.time).toBe(s.time);
    const counted = setParams(s, { count: 35 });
    expect(counted.data.traffic!.cars).toHaveLength(35);
    expect(counted.time).toBe(0);
  });
  it('the boundary is not permanently the slowest car or one fixed car', () => {
    const frames = trafficWaveFrames(initial('traffic')),
      states = frames.map(trafficStageState),
      ids = new Set(
        states.filter((s) => s.front.exists).map((s) => s.front.car.id),
      );
    expect(ids.size).toBeGreaterThan(5);
    expect(
      states.some(
        (s) => s.front.exists && s.front.car.id !== observe(s.sim).slowestCar,
      ),
    ).toBe(true);
    expect(
      states.some(
        (s, i) =>
          i > 0 &&
          s.front.exists &&
          states[i - 1].front.exists &&
          roadDelta(states[i - 1].front.car.position, s.front.car.position) <
            -1,
      ),
    ).toBe(true);
    for (let i = 1; i < states.length; i++)
      for (const car of states[i].cars) {
        const prev = states[i - 1].cars.find((c) => c.id === car.id)!;
        expect(roadDelta(prev.position, car.position)).toBeGreaterThanOrEqual(
          -1e-8,
        );
      }
  });
  it('never fabricates a front in uniform flow, and preserves a detected front exactly', () => {
    for (const count of [5, 20, 45]) {
      const sim = initial('traffic', { count }),
        s = trafficStageState(sim);
      expect(s.front.exists).toBe(false);
      expect(s.front.gradient).toBe(0);
    }
    const sim = step(brake(step(initial('traffic'), 15)), 10),
      s = trafficStageState(sim),
      o = observe(sim);
    expect(s.front.exists).toBe(o.jamFrontExists);
    expect(s.front.car.id).toBe(o.jamFrontCar);
    expect(s.front.car.position).toBe(o.jamFrontPosition);
  });
  it('the prepared headway comparison exactly matches the original tutor outcome', () => {
    const sim = initial('traffic'),
      comparison = trafficHeadwayComparison(sim),
      original = respond(sim, predictions.traffic.correct);
    expect(comparison.longer).toEqual(original.sim);
    expect(comparison.short.params.headway).toBe(1.2);
    expect(comparison.longer.params.headway).toBe(2.4);
    expect(comparison.short.time).toBeCloseTo(48);
    expect(comparison.longer.time).toBeCloseTo(48);
    expect(+observe(comparison.short).speedSpread).toBeGreaterThan(
      +observe(comparison.longer).speedSpread,
    );
  });
  it('prepared snapshots are immutable, engine-clocked and satisfy the existing invariants', () => {
    const frames = trafficWaveFrames(initial('traffic'), 4, 0.5);
    expect(frames).toHaveLength(9);
    expect(frames[0].time).toBeCloseTo(15);
    expect(frames.at(-1)!.time).toBeCloseTo(19);
    expect(trafficStageState(frames[0]).hero.speed).toBe(1);
    for (let i = 1; i < frames.length; i++) {
      expect(frames[i].time).toBeGreaterThan(frames[i - 1].time);
      expect(
        frames[i].data.traffic!.cars.every(
          (c) => c.speed >= 0 && c.position >= 0 && c.position < 350,
        ),
      ).toBe(true);
    }
    expect(trafficStageState(frames[0]).hero.speed).toBe(1);
  });
});
describe('Traffic visual ranges and concept data', () => {
  it('wraps the road without reversing cars and interpolates actual endpoint speeds', () => {
    expect(roadLength).toBe(defaultTrafficParams.roadLength);
    expect(wrapRoad(-1)).toBe(349);
    expect(roadDelta(349, 1)).toBe(2);
    expect(roadDelta(1, 349)).toBe(-2);
    expect(roadPosition(0)).toEqual(roadPosition(350));
    const cars = initial('traffic').data.traffic!.cars.map((c, i) => ({
      ...c,
      speed: i,
    }));
    for (const c of cars)
      expect(speedAt(c.position, cars)).toBeCloseTo(c.speed);
    expect(
      speedAt((cars[0].position + cars[1].position) / 2, cars),
    ).toBeCloseTo(0.5);
    expect(trafficColor(0, 22).getHex()).toBe(
      new Color(palette.amber).getHex(),
    );
    expect(trafficColor(22, 22).getHex()).toBe(
      new Color(palette.mint).getHex(),
    );
    expect(trafficColor(100, 22).getHex()).toBe(
      new Color(palette.mint).getHex(),
    );
  });
  it('all 5–45 stable car IDs map to existing tutor anchors and valid shots', () => {
    for (const count of [5, 20, 45]) {
      const sim = initial('traffic', { count }),
        s = trafficStageState(sim),
        l = createTrafficLesson(count),
        anchors = namedAnchors(sim),
        ids = l.parts.map((p) => p.id),
        shots = l.shots.map((p) => p.part);
      expect(isStageTopic('traffic')).toBe(true);
      for (const part of l.parts) {
        expect(shots).toContain(part.id);
        expect(anchors).toContain(stageTarget('traffic', part.id));
        expect(l.chips.some((c) => c.id === part.chip)).toBe(true);
        expect(part.anchor(s).every(Number.isFinite)).toBe(true);
      }
      for (const q of l.chips) {
        expect(ids).toContain(q.part);
        for (const id of q.also ?? []) expect(ids).toContain(id);
        expect(l.demos[q.demo]).toBeDefined();
      }
    }
  });
  it('short answers stay grounded for absent/present waves, dense traffic and zero speeds', () => {
    const sims = [
      initial('traffic'),
      step(brake(initial('traffic')), 4),
      step(brake(initial('traffic', { count: 45 })), 15),
      initial('traffic', { count: 5, headway: 3 }),
    ];
    for (const sim of sims) {
      const s = trafficStageState(sim),
        l = createTrafficLesson(s.count);
      for (const q of l.chips) {
        expect(
          q.answer(s).trim().split(/\s+/).length,
          q.id,
        ).toBeLessThanOrEqual(50);
        expect(q.answer(s)).not.toMatch(/NaN|undefined/);
      }
      for (const id of Object.values(l.glossary))
        expect(l.chips.some((q) => q.id === id)).toBe(true);
    }
  });
});
