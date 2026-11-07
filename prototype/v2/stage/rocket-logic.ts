import { observe, type Simulation } from '../simulations/runtime';
import { defaultRocketParams } from '../simulations/foundations/rocket';
import { rocketComparison } from '../core/teaching';
import { clamp } from './logic';
export interface RocketStageState {
  altitude: number;
  velocity: number;
  fuel: number;
  initialFuel: number;
  initialAltitude: number;
  dryMass: number;
  mass: number;
  gravity: number;
  throttle: number;
  thrust: number;
  gravityForce: number;
  acceleration: number;
  time: number;
  status: 'flying' | 'landed' | 'crashed';
  safeSpeed: number;
  history: number[];
}
export function rocketStageState(sim: Simulation): RocketStageState {
  if (sim.id !== 'rocket' || !sim.data.rocket)
    throw Error('Rocket Stage requires the Rocket engine');
  const o = observe(sim),
    r = sim.data.rocket;
  return {
    altitude: +o.altitude,
    velocity: +o.velocity,
    fuel: +o.fuel,
    initialFuel: +sim.params.fuel,
    initialAltitude: +sim.params.altitude,
    dryMass: +sim.params.dryMass,
    mass: +o.mass,
    gravity: +sim.params.gravity,
    throttle: +sim.params.throttle,
    thrust: +o.thrust,
    gravityForce: +o.mass * +sim.params.gravity,
    acceleration: +o.acceleration,
    time: r.time,
    status: r.status,
    safeSpeed: defaultRocketParams.safeLandingSpeed,
    history: sim.history.map((s) => s.b),
  };
}
/** Plot scaling only. Flight is exclusively computed by the existing engine. */
export function rocketRuler(s: RocketStageState) {
  const extent = Math.max(120, s.initialAltitude, s.altitude),
    magnitude = 10 ** Math.floor(Math.log10(extent / 4));
  const rough = extent / 4 / magnitude,
    step =
      (rough <= 1 ? 1 : rough <= 2 ? 2 : rough <= 3 ? 3 : rough <= 5 ? 5 : 10) *
      magnitude;
  const max = Math.ceil(extent / step) * step;
  return {
    max,
    step,
    ticks: Array.from(
      { length: Math.round(max / step) + 1 },
      (_, i) => i * step,
    ),
  };
}
export const altitudeY = (altitude: number, s: RocketStageState) =>
  0.14 + clamp(altitude / rocketRuler(s).max) * 3.65;
export function rocketPose(s: RocketStageState) {
  const y = altitudeY(s.altitude, s),
    forceScale = 1.15 / Math.max(24000, s.thrust, s.gravityForce);
  return {
    y,
    thrustLength: s.thrust * forceScale,
    gravityLength: s.gravityForce * forceScale,
    thrustAnchor: [-1.3, y + 0.25 + (s.thrust * forceScale) / 2, 0] as [
      number,
      number,
      number,
    ],
    gravityAnchor: [1.3, y + 1.35 - (s.gravityForce * forceScale) / 2, 0] as [
      number,
      number,
      number,
    ],
  };
}
/** Samples the original prepared controller, not a new visual-side autopilot. */
export function preparedRocketLanding(): Simulation[] {
  const frames: Simulation[] = [];
  rocketComparison((frame) => frames.push(frame));
  return frames;
}
