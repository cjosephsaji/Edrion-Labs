/** Special relativity for inertial frames. No gravity or acceleration unless modeled separately. */
export const C = 299_792_458;
export function lorentzFactor(beta: number): number {
  if (!Number.isFinite(beta) || Math.abs(beta) >= 1)
    throw new Error('Speed must be finite and strictly less than c');
  return 1 / Math.sqrt((1 - Math.abs(beta)) * (1 + Math.abs(beta)));
}
export function dilatedTime(properSeconds: number, beta: number): number {
  if (!Number.isFinite(properSeconds) || properSeconds < 0)
    throw new Error('Invalid proper time');
  return properSeconds * lorentzFactor(beta);
}
/** One dimensional Lorentz transform; x in meters, t in seconds, beta=v/c. */
export function lorentzTransform(
  x: number,
  t: number,
  beta: number,
): { x: number; t: number } {
  if (!Number.isFinite(x) || !Number.isFinite(t))
    throw new Error('Invalid event');
  const gamma = lorentzFactor(beta),
    v = beta * C;
  return { x: gamma * (x - v * t), t: gamma * (t - (v * x) / (C * C)) };
}
/** Interval divided by c² to avoid unnecessarily squaring astronomical SI values. */
export function intervalTimeSquared(x: number, t: number): number {
  return t * t - (x / C) * (x / C);
}
