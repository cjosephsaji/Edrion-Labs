import { z } from 'zod';

/**
 * Isolated Phase 2 groundwork. This trusted analytic model is not registered with the
 * visual runtime. It grants no generated-code or solver capability to a visual program.
 * These engineering bounds and assumptions still require scientific verification.
 */
export const PETROS_PROJECTILE_CAPABILITY = Object.freeze({
  id: 'physics.projectile.no-drag',
  version: 1,
  solver: 'analytic.uniform-gravity.v1',
} as const);

export const PETROS_PROJECTILE_LIMITS = Object.freeze({
  maxLaunchSpeedComponent: 100,
  minGravity: 1,
  maxGravity: 25,
  maxTimeSeconds: 200,
} as const);

export const PETROS_PROJECTILE_ASSUMPTIONS = Object.freeze({
  body: 'point_mass',
  referenceFrame: 'stationary_cartesian_positive_y_up',
  launchAndLanding: 'same_level_y_zero',
  gravity: 'constant_downward',
  airResistance: 'none',
  wind: 'none',
  surfaceResponse: 'stop_at_first_ground_contact',
} as const);

const finite = z.number().finite();
const capabilitySchema = z.object({
  id: z.literal(PETROS_PROJECTILE_CAPABILITY.id),
  version: z.literal(PETROS_PROJECTILE_CAPABILITY.version),
  solver: z.literal(PETROS_PROJECTILE_CAPABILITY.solver),
}).strict();
const assumptionsSchema = z.object({
  body: z.literal(PETROS_PROJECTILE_ASSUMPTIONS.body),
  referenceFrame: z.literal(PETROS_PROJECTILE_ASSUMPTIONS.referenceFrame),
  launchAndLanding: z.literal(PETROS_PROJECTILE_ASSUMPTIONS.launchAndLanding),
  gravity: z.literal(PETROS_PROJECTILE_ASSUMPTIONS.gravity),
  airResistance: z.literal(PETROS_PROJECTILE_ASSUMPTIONS.airResistance),
  wind: z.literal(PETROS_PROJECTILE_ASSUMPTIONS.wind),
  surfaceResponse: z.literal(PETROS_PROJECTILE_ASSUMPTIONS.surfaceResponse),
}).strict();

/** SI only; unsupported versions, solvers, units and extra fields are rejected. */
export const petrosProjectileInputSchema = z.object({
  schemaVersion: z.literal('petros.projectile-input.v1'),
  capability: capabilitySchema,
  assumptions: assumptionsSchema,
  launchVelocity: z.object({
    x: finite.min(-100).max(100),
    y: finite.min(0).max(100),
    unit: z.literal('m/s'),
  }).strict(),
  gravity: z.object({ value: finite.min(1).max(25), unit: z.literal('m/s^2') }).strict(),
  elapsedTime: z.object({ value: finite.min(0).max(200), unit: z.literal('s') }).strict(),
}).strict().superRefine((input, ctx) => {
  const duration = 2 * input.launchVelocity.y / input.gravity.value;
  if (input.elapsedTime.value > duration) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['elapsedTime', 'value'],
      message: 'PETROS_PROJECTILE_TIME_AFTER_LANDING' });
  }
});

export type PetrosProjectileInput = z.infer<typeof petrosProjectileInputSchema>;

function derive(input: PetrosProjectileInput) {
  const { x: vx, y: vy } = input.launchVelocity;
  const gravity = input.gravity.value;
  const time = input.elapsedTime.value;
  const duration = 2 * vy / gravity;
  const atLanding = time === duration;
  // Ground contact reports the incoming velocity. No bounce or post-impact model exists.
  return {
    phase: atLanding ? 'ground_contact' as const : time === 0 ? 'launch' as const : 'flight' as const,
    position: { x: vx * time, y: atLanding ? 0 : Math.max(0, vy * time - gravity * time * time / 2), unit: 'm' as const },
    velocity: { x: vx, y: atLanding ? -vy : Math.max(-vy, vy - gravity * time), unit: 'm/s' as const },
    readouts: {
      flightDuration: { value: duration, unit: 's' as const },
      maximumHeight: { value: vy * vy / (2 * gravity), unit: 'm' as const },
      horizontalDisplacementAtLanding: { value: vx * duration, unit: 'm' as const },
    },
  };
}

/** The checkpoint contains its complete input; replay always recomputes from launch. */
export const petrosProjectileStateSchema = z.object({
  schemaVersion: z.literal('petros.projectile-state.v1'),
  input: petrosProjectileInputSchema,
  phase: z.enum(['launch', 'flight', 'ground_contact']),
  position: z.object({ x: finite.min(-20_000).max(20_000), y: finite.min(0).max(5_000), unit: z.literal('m') }).strict(),
  velocity: z.object({ x: finite.min(-100).max(100), y: finite.min(-100).max(100), unit: z.literal('m/s') }).strict(),
  readouts: z.object({
    flightDuration: z.object({ value: finite.min(0).max(200), unit: z.literal('s') }).strict(),
    maximumHeight: z.object({ value: finite.min(0).max(5_000), unit: z.literal('m') }).strict(),
    horizontalDisplacementAtLanding: z.object({ value: finite.min(-20_000).max(20_000), unit: z.literal('m') }).strict(),
  }).strict(),
}).strict().superRefine((state, ctx) => {
  const expected = derive(state.input);
  if (state.phase !== expected.phase ||
    state.position.x !== expected.position.x || state.position.y !== expected.position.y ||
    state.velocity.x !== expected.velocity.x || state.velocity.y !== expected.velocity.y ||
    state.readouts.flightDuration.value !== expected.readouts.flightDuration.value ||
    state.readouts.maximumHeight.value !== expected.readouts.maximumHeight.value ||
    state.readouts.horizontalDisplacementAtLanding.value !== expected.readouts.horizontalDisplacementAtLanding.value) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'PETROS_PROJECTILE_STATE_MISMATCH' });
  }
});

export type PetrosProjectileState = z.infer<typeof petrosProjectileStateSchema>;

/** Fixed arithmetic only: no LLM, I/O, arbitrary expressions, code execution or integration steps. */
export function evaluatePetrosProjectile(input: unknown): PetrosProjectileState {
  const parsed = petrosProjectileInputSchema.parse(input);
  return petrosProjectileStateSchema.parse({
    schemaVersion: 'petros.projectile-state.v1', input: parsed, ...derive(parsed),
  });
}
