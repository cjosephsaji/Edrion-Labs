import {
  initial,
  observe,
  step,
  brake,
  setParams,
  trafficFront,
  type Simulation,
} from '../simulations/runtime';
import {
  defaultTrafficParams,
  type Car,
} from '../simulations/foundations/traffic';
import type { V3 } from './lesson';
import { Color } from 'three';
import { palette } from './palette';
import { clamp } from './logic';
export interface TrafficStageState {
  sim: Simulation;
  cars: Car[];
  count: number;
  headway: number;
  desiredSpeed: number;
  mean: number;
  min: number;
  max: number;
  spread: number;
  density: number;
  time: number;
  front: { car: Car; gradient: number; exists: boolean };
  hero: Car;
  lead: Car;
  gap: number;
  history: number[];
}
export const roadLength = defaultTrafficParams.roadLength,
  roadRadius = 2.48;
export const wrapRoad = (v: number) =>
  ((v % roadLength) + roadLength) % roadLength;
export const roadDelta = (from: number, to: number) =>
  ((to - from + roadLength * 1.5) % roadLength) - roadLength / 2;
export function roadPosition(
  position: number,
  radius = roadRadius,
  y = 0.48,
): V3 {
  const angle = (wrapRoad(position) / roadLength) * Math.PI * 2;
  return [Math.sin(angle) * radius, y, Math.cos(angle) * radius];
}
/** The real bumper-to-bumper arc, shared by its mesh, focus shot and bounds. */
export function trafficGapPoints(s: TrafficStageState): V3[] {
  const start = s.hero.position + defaultTrafficParams.carLength / 2;
  return Array.from({ length: 33 }, (_, i) =>
    roadPosition(start + (s.gap * i) / 32, 2.66, 0.55),
  );
}
export function trafficGapCenter(s: TrafficStageState): V3 {
  const points = trafficGapPoints(s);
  return [0, 1, 2].map(
    (i) =>
      (Math.min(...points.map((p) => p[i])) +
        Math.max(...points.map((p) => p[i]))) /
      2,
  ) as V3;
}
/** Pad the actual points for round end posts and comfortable camera margins. */
export function paddedTrafficPoints(points: V3[], padding: number): V3[] {
  return points.flatMap((p) =>
    Array.from(
      { length: 8 },
      (_, i): V3 => [
        p[0] + (i & 1 ? padding : -padding),
        p[1] + (i & 2 ? padding : -padding),
        p[2] + (i & 4 ? padding : -padding),
      ],
    ),
  );
}
export function trafficStageState(sim: Simulation): TrafficStageState {
  if (sim.id !== 'traffic' || !sim.data.traffic)
    throw Error('Traffic Stage requires the Traffic engine');
  const o = observe(sim),
    cars = [...sim.data.traffic.cars].sort(
      (a, b) => +a.id.slice(4) - +b.id.slice(4),
    ),
    ordered = [...cars].sort((a, b) => a.position - b.position),
    hero = cars.find((c) => c.id === 'car_0')!,
    index = ordered.findIndex((c) => c.id === 'car_0'),
    lead = ordered[(index + 1) % ordered.length];
  return {
    sim,
    cars,
    count: cars.length,
    headway: +sim.params.headway,
    desiredSpeed: +sim.params.desiredSpeed,
    mean: +o.meanSpeed,
    min: +o.minSpeed,
    max: +o.maxSpeed,
    spread: +o.speedSpread,
    density: +o.density,
    time: sim.time,
    front: trafficFront(sim),
    hero,
    lead,
    gap:
      wrapRoad(lead.position - hero.position) - defaultTrafficParams.carLength,
    history: sim.history.map((h) => h.a),
  };
}
/** A visual interpolation along the existing cars; no traffic integration here. */
export function speedAt(position: number, cars: Car[]): number {
  return speedAtOrdered(
    position,
    [...cars].sort((a, b) => a.position - b.position),
  );
}
export function speedAtOrdered(position: number, sorted: Car[]): number {
  position = wrapRoad(position);
  let back = sorted.at(-1)!,
    ahead = sorted[0];
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i].position <= position) {
      back = sorted[i];
      ahead = sorted[(i + 1) % sorted.length];
    } else break;
  }
  const span = wrapRoad(ahead.position - back.position),
    distance = wrapRoad(position - back.position),
    f = span > 0 ? clamp(distance / span) : 0;
  return back.speed + (ahead.speed - back.speed) * f;
}
export const trafficColor = (speed: number, desired: number) =>
  new Color(palette.amber).lerp(
    new Color(palette.mint),
    clamp(speed / Math.max(1, desired)),
  );
/** Exactly the existing prepared eight-second headway comparison, using its runtime calls. */
export function trafficHeadwayComparison(sim: Simulation) {
  const base = step(initial('traffic', sim.params), 40);
  return {
    short: step(brake(base), 8),
    longer: step(brake(setParams(base, { headway: 2.4 })), 8),
  };
}
/** Prepared real-engine playback. Immutable snapshots, never a visual-side wave controller. */
export function trafficWaveFrames(
  sim: Simulation,
  seconds = 30,
  interval = 0.5,
) {
  const start = brake(step(initial('traffic', sim.params), 15)),
    frames: Simulation[] = [start];
  let state = start;
  for (let t = interval; t <= seconds + 1e-8; t += interval) {
    state = step(state, interval);
    frames.push(state);
  }
  return frames;
}

/** Snapshot-relative visual scale; numeric readouts preserve absolute speeds. */
export function trafficSnapshotColor(
  speed: number,
  s: Pick<TrafficStageState, 'min' | 'max' | 'spread'>,
) {
  const base = s.spread >= 2 ? s.min : 0,
    top = s.spread >= 2 ? s.max : Math.max(1, s.max);
  return trafficColor(Math.max(0, speed - base), Math.max(1, top - base));
}
