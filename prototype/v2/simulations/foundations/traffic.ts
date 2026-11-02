/** Intelligent Driver Model (IDM) on a closed one-lane ring. Simplified; no lane changes. */
export interface TrafficParams {
  roadLength: number;
  carLength: number;
  desiredSpeed: number;
  minimumGap: number;
  timeHeadway: number;
  maxAcceleration: number;
  comfortableDeceleration: number;
  exponent: number;
}
export interface Car {
  id: string;
  position: number;
  speed: number;
}
export interface TrafficState {
  cars: Car[];
  time: number;
}
export const defaultTrafficParams: TrafficParams = {
  roadLength: 350,
  carLength: 4.5,
  desiredSpeed: 22,
  minimumGap: 2,
  timeHeadway: 1.2,
  maxAcceleration: 1.3,
  comfortableDeceleration: 2,
  exponent: 4,
};
export function createTraffic(
  count = 16,
  p = defaultTrafficParams,
): TrafficState {
  if (
    !Number.isInteger(count) ||
    count < 2 ||
    count > 100 ||
    p.roadLength <= count * p.carLength
  )
    throw new Error('Invalid count or road length');
  return {
    cars: Array.from({ length: count }, (_, i) => ({
      id: `car_${i}`,
      position: (i * p.roadLength) / count,
      speed: 13,
    })),
    time: 0,
  };
}
export function tapBrakes(
  s: TrafficState,
  carId: string,
  newSpeed: number,
): TrafficState {
  if (!Number.isFinite(newSpeed) || newSpeed < 0)
    throw new Error('Invalid speed');
  if (!s.cars.some((c) => c.id === carId)) throw new Error('Unknown car');
  return {
    ...s,
    cars: s.cars.map((c) =>
      c.id === carId ? { ...c, speed: Math.min(c.speed, newSpeed) } : { ...c },
    ),
  };
}
const mod = (x: number, L: number) => ((x % L) + L) % L;
export function trafficStep(
  p: TrafficParams,
  s: TrafficState,
  dt = 0.05,
): TrafficState {
  if (
    !(
      dt > 0 &&
      dt <= 0.1 &&
      p.roadLength > 0 &&
      p.carLength > 0 &&
      p.desiredSpeed > 0 &&
      p.minimumGap >= 0 &&
      p.timeHeadway >= 0 &&
      p.maxAcceleration > 0 &&
      p.comfortableDeceleration > 0 &&
      p.exponent > 0
    )
  )
    throw new Error('Invalid traffic configuration');
  if (![dt, ...Object.values(p)].every(Number.isFinite))
    throw new Error('Non-finite traffic parameter');
  const ordered = [...s.cars].sort((a, b) => a.position - b.position);
  const next = ordered.map((c, i) => {
    const lead = ordered[(i + 1) % ordered.length];
    const rawGap = mod(lead.position - c.position, p.roadLength) - p.carLength;
    const gap = Math.max(0.01, rawGap);
    const deltaV = c.speed - lead.speed;
    const desiredGap =
      p.minimumGap +
      Math.max(
        0,
        c.speed * p.timeHeadway +
          (c.speed * deltaV) /
            (2 * Math.sqrt(p.maxAcceleration * p.comfortableDeceleration)),
      );
    let acceleration =
      p.maxAcceleration *
      (1 -
        Math.pow(c.speed / p.desiredSpeed, p.exponent) -
        Math.pow(desiredGap / gap, 2));
    // Cap acceleration to avoid nonphysical numerical excursions in the visual demo.
    acceleration = Math.max(-12, Math.min(p.maxAcceleration, acceleration));
    let speed = Math.max(0, c.speed + acceleration * dt);
    // Conservative safety clamp; collision-free motion is a numerical safeguard, not a proof of realism.
    speed = Math.min(speed, Math.max(0, rawGap / dt));
    return {
      ...c,
      speed,
      position: mod(c.position + speed * dt, p.roadLength),
    };
  });
  return { cars: next, time: s.time + dt };
}
