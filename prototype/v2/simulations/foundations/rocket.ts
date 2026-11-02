/** Simplified 1D vertical landing, upward positive; no drag, attitude or guidance. */
export interface RocketParams {
  gravity: number;
  dryMass: number;
  maxThrust: number;
  exhaustVelocity: number;
  safeLandingSpeed: number;
}
export interface RocketState {
  altitude: number;
  velocity: number;
  fuelMass: number;
  time: number;
  thrustFraction: number;
  status: 'flying' | 'landed' | 'crashed';
}
export const defaultRocketParams: RocketParams = {
  gravity: 9.81,
  dryMass: 1000,
  maxThrust: 24000,
  exhaustVelocity: 2900,
  safeLandingSpeed: 2,
};
export function createRocket(): RocketState {
  return {
    altitude: 120,
    velocity: -12,
    fuelMass: 450,
    time: 0,
    thrustFraction: 0,
    status: 'flying',
  };
}
function check(p: RocketParams, s: RocketState, dt: number) {
  if (
    !(
      p.gravity > 0 &&
      p.dryMass > 0 &&
      p.maxThrust >= 0 &&
      p.exhaustVelocity > 0 &&
      p.safeLandingSpeed >= 0 &&
      dt > 0 &&
      dt <= 0.1
    )
  )
    throw new Error('Invalid rocket configuration');
  if (
    ![
      p.gravity,
      p.dryMass,
      p.maxThrust,
      p.exhaustVelocity,
      p.safeLandingSpeed,
      dt,
      s.altitude,
      s.velocity,
      s.fuelMass,
      s.thrustFraction,
    ].every(Number.isFinite)
  )
    throw new Error('Non-finite rocket value');
  if (s.fuelMass < 0 || s.thrustFraction < 0 || s.thrustFraction > 1)
    throw new Error('Invalid fuel/throttle');
}
export function rocketStep(
  p: RocketParams,
  s: RocketState,
  dt = 1 / 120,
): RocketState {
  check(p, s, dt);
  if (s.status !== 'flying') return s;
  const requestedThrust = p.maxThrust * s.thrustFraction;
  const fuelRequested = (requestedThrust * dt) / p.exhaustVelocity;
  const fuelUsed = Math.min(s.fuelMass, fuelRequested);
  const actualThrust = (fuelUsed * p.exhaustVelocity) / dt;
  const midMass = p.dryMass + s.fuelMass - fuelUsed / 2;
  const a = actualThrust / midMass - p.gravity;
  // Constant-acceleration displacement for the small step, with midpoint mass approximation.
  const vNew = s.velocity + a * dt;
  const hNew = s.altitude + s.velocity * dt + 0.5 * a * dt * dt;
  const base = {
    ...s,
    velocity: vNew,
    altitude: hNew,
    fuelMass: Math.max(0, s.fuelMass - fuelUsed),
    time: s.time + dt,
  };
  if (hNew > 0) return base;
  // Interpolate within final step rather than using the below-ground velocity.
  const fraction = Math.max(
    0,
    Math.min(1, s.altitude / Math.max(1e-9, s.altitude - hNew)),
  );
  const impactV = s.velocity + (vNew - s.velocity) * fraction;
  return {
    ...base,
    altitude: 0,
    velocity: impactV,
    time: s.time + dt * fraction,
    status: Math.abs(impactV) <= p.safeLandingSpeed ? 'landed' : 'crashed',
  };
}
export function rocketRun(
  p: RocketParams,
  s: RocketState,
  seconds: number,
  dt = 1 / 120,
): RocketState {
  if (!(seconds >= 0 && seconds <= 600))
    throw new Error('Invalid run duration');
  let next = s;
  let remaining = seconds;
  while (remaining > 1e-10 && next.status === 'flying') {
    const slice = Math.min(dt, remaining);
    next = rocketStep(p, next, slice);
    remaining -= slice;
  }
  return next;
}
