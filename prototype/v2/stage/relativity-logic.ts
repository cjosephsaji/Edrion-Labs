import {
  initial,
  observe,
  step,
  type Simulation,
  specs,
} from '../simulations/runtime';
import { C, lorentzTransform } from '../simulations/foundations/relativity';
import type { StageAction, V3 } from './lesson';
import { clamp } from './logic';

export interface RelativityStageState {
  sim: Simulation;
  beta: number;
  duration: number;
  frame: 'earth' | 'ship';
  gamma: number;
  earthClock: number;
  shipClock: number;
  earthInterval: number;
  shipInterval: number;
  history: number[];
}
export function relativityStageState(sim: Simulation): RelativityStageState {
  if (sim.id !== 'relativity')
    throw Error('Time dilation Stage requires the relativity engine');
  const o = observe(sim);
  return {
    sim,
    beta: +o.beta,
    duration: +sim.params.duration,
    frame: o.frame === 'ship' ? 'ship' : 'earth',
    gamma: +o.gamma,
    earthClock: +o.earthClock,
    shipClock: +o.shipClock,
    earthInterval: +o.earthSeconds,
    shipInterval: +o.shipSeconds,
    history: sim.history.map((p) => p.b),
  };
}
export const betaLimits: [number, number] = [
  specs.relativity.beta.min!,
  specs.relativity.beta.max!,
];
/** Drawing scale only. Both clocks share seconds, zero and the same extent. */
export function clockRuler(s: RelativityStageState) {
  // Integrator round-off must not turn a completed 10 s scale into 15 s.
  const extent = Number(
      Math.max(s.duration, s.earthClock, s.shipClock, 1).toPrecision(12),
    ),
    power = 10 ** Math.floor(Math.log10(extent / 5)),
    rough = extent / 5 / power,
    tick = (rough <= 1 ? 1 : rough <= 2 ? 2 : rough <= 5 ? 5 : 10) * power,
    max = Math.ceil(extent / tick) * tick;
  return {
    max,
    ticks: Array.from(
      { length: Math.round(max / tick) + 1 },
      (_, i) => i * tick,
    ),
  };
}
export const clockX = (seconds: number, s: RelativityStageState) =>
  -2.45 + clamp(seconds / clockRuler(s).max) * 4.9;
export const clockAngle = (seconds: number, s: RelativityStageState) =>
  ((-135 + clamp(seconds / clockRuler(s).max) * 270) * Math.PI) / 180;
export function clockStep(s: RelativityStageState, seconds = 1): StageAction {
  return {
    tool: 'sim_step',
    args: {
      seconds: Math.max(1e-6, Math.min(60, seconds, s.duration - s.earthClock)),
    },
  };
}
export const intervalComplete = (s: RelativityStageState) =>
  s.earthClock >= s.duration - 1e-8;
/** Immutable snapshots from the original integrator; never a visual-side clock. */
export function relativityFrames(sim: Simulation, count = 60): Simulation[] {
  if (sim.id !== 'relativity') throw Error('Expected relativity');
  let frame = initial('relativity', sim.params);
  const frames = [frame],
    samples = Math.max(2, Math.round(count)),
    dt = +sim.params.duration / samples;
  for (let i = 0; i < samples; i++) {
    let left = dt;
    while (left > 1e-9) {
      const h = Math.min(60, left);
      frame = step(frame, h);
      left -= h;
    }
    frames.push(frame);
  }
  return frames;
}
export function constantSpeedExample(beta: number, duration = 10) {
  return relativityFrames(
    initial('relativity', { beta, duration }),
    Math.max(2, Math.ceil(duration / 10)),
  ).at(-1)!;
}
/** Coordinates of the same endpoint events, using the existing Lorentz engine.
 * x is in light-seconds; changing the frame does not exchange clock readings. */
export function spacetimeDiagram(s: RelativityStageState) {
  const span = Math.max(s.duration, s.earthClock, 1);
  const event = (x: number, t: number) => {
    const p =
      s.frame === 'ship' ? lorentzTransform(x * C, t, s.beta) : { x: x * C, t };
    return { x: p.x / C, t: p.t };
  };
  const earth = event(0, span),
    ship = event(s.beta * span, span),
    horizon = Math.max(earth.t, ship.t, 1e-6),
    scale = 1.18 / horizon,
    point = (p: { x: number; t: number }): V3 => [
      p.x * scale,
      0.105,
      0.15 - p.t * scale,
    ];
  return {
    origin: point({ x: 0, t: 0 }),
    earth: point(earth),
    ship: point(ship),
    earthNow: point(event(0, s.earthClock)),
    shipNow: point(event(s.beta * s.earthClock, s.earthClock)),
    left: point({ x: -horizon, t: horizon }),
    right: point({ x: horizon, t: horizon }),
    earthEvent: earth,
    shipEvent: ship,
    horizon,
  };
}
export const clockBounds = (x: number): V3[] =>
  boxPoints([x - 0.86, 0.05, -0.7], [x + 0.86, 2.65, 0.17]);
export function boxPoints(min: V3, max: V3): V3[] {
  return Array.from(
    { length: 8 },
    (_, i): V3 => [
      i & 1 ? max[0] : min[0],
      i & 2 ? max[1] : min[1],
      i & 4 ? max[2] : min[2],
    ],
  );
}
export const relativityBounds: V3[] = [
  ...Array.from(
    { length: 20 },
    (_, i): V3 => [
      Math.sin((i / 20) * Math.PI * 2) * 3.7,
      -0.35,
      Math.cos((i / 20) * Math.PI * 2) * 3.7,
    ],
  ),
  ...clockBounds(-1.65),
  ...clockBounds(1.65),
];
