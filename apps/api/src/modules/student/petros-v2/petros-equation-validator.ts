import {
  equationStepSchema,
  simulationRequestSchema,
  evaluatePetrosProjectile,
  PETROS_PROJECTILE_ASSUMPTIONS,
  PETROS_PROJECTILE_CAPABILITY,
  type EquationStep,
  type SimulationRequest,
  evaluateResourceCapacity,
} from '@edrion/schemas';

const same = (a: number, b: number) =>
  Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
/** Closed arithmetic language. No eval, CAS, parser, symbolic cancellation or user code. */
export function validateEquationStep(raw: unknown): EquationStep {
  const step = equationStepSchema.parse(raw),
    [a, b] = step.inputs;
  let value: number, unit: string;
  if (step.rule === 'floor') {
    if (step.inputs.length !== 1) throw new Error('M5_ARITY');
    value = Math.floor(a!.value);
    unit = a!.unit;
  } else {
    if (!a || !b || step.inputs.length !== 2) throw new Error('M5_ARITY');
    if (step.rule === 'add' || step.rule === 'subtract') {
      if (a.unit !== b.unit) throw new Error('M5_UNIT_MISMATCH');
      value = step.rule === 'add' ? a.value + b.value : a.value - b.value;
      unit = a.unit;
    } else if (step.rule === 'divide') {
      if (b.value === 0) throw new Error('M5_ZERO_DIVISOR');
      value = a.value / b.value;
      unit =
        a.unit === b.unit
          ? '1'
          : a.unit === 'GB' && b.unit === 'GB/VM'
            ? 'VM'
            : a.unit === 'requests' && b.unit === 'seconds'
              ? 'requests/second'
              : b.unit === '1'
                ? a.unit
                : '';
    } else {
      value = a.value * b.value;
      unit =
        a.unit === '1'
          ? b.unit
          : b.unit === '1'
            ? a.unit
            : [a.unit, b.unit].includes('GB/VM') && [a.unit, b.unit].includes('VM')
              ? 'GB'
              : [a.unit, b.unit].includes('requests/second') && [a.unit, b.unit].includes('seconds')
                ? 'requests'
                : '';
    }
  }
  if (
    !unit ||
    unit !== step.result.unit ||
    !Number.isFinite(value) ||
    !same(value, step.result.value)
  )
    throw new Error('M5_INVALID_EQUATION');
  return step;
}
export const TRUSTED_KERNELS = Object.freeze({
  'resource-capacity.v1': {
    solverVersion: 'petros.capacity.floor.v1',
    maxRuntimeMs: 10,
    units: ['GB', 'GB/VM', 'VM'],
    assumptions: [
      'Fixed host reservation; uniform whole-VM allocations in GB; no memory overcommit.',
    ],
    limitations: ['Ignores CPU, storage, scheduling, oversubscription and workload variation.'],
    accessibleAlternative:
      'Numeric inputs and a table of available memory, per-VM memory and whole-VM capacity.',
  },
  'linear-rate.v1': {
    solverVersion: 'petros.rate.multiply.v1',
    maxRuntimeMs: 10,
    units: ['requests/second', 'seconds', 'requests'],
    assumptions: ['Constant rate over a bounded interval.'],
    limitations: ['No queue, bursts, latency or losses.'],
    accessibleAlternative:
      'Numeric rate and time controls with a textual multiplication and result table.',
  },
  'projectile-no-drag.v1': {
    solverVersion: 'analytic.uniform-gravity.v1',
    maxRuntimeMs: 10,
    units: ['m', 'm/s', 'm/s^2', 's'],
    assumptions: ['Point mass, uniform gravity, no drag, same launch and landing level.'],
    limitations: [
      'Existing platform reference fixtures only; independent scientific and educator qualification remains pending.',
    ],
    accessibleAlternative: 'Position and velocity table at a bounded elapsed time.',
  },
});
export function runTrustedExperiment(raw: unknown) {
  const input: SimulationRequest = simulationRequestSchema.parse(raw);
  const metadata = TRUSTED_KERNELS[input.kernel];
  if (input.kernel === 'projectile-no-drag.v1') {
    const state = evaluatePetrosProjectile({
      schemaVersion: 'petros.projectile-input.v1',
      capability: PETROS_PROJECTILE_CAPABILITY,
      assumptions: PETROS_PROJECTILE_ASSUMPTIONS,
      launchVelocity: { x: input.vx, y: input.vy, unit: 'm/s' },
      gravity: { value: input.gravity, unit: 'm/s^2' },
      elapsedTime: { value: input.seconds, unit: 's' },
    });
    return {
      input,
      ...metadata,
      output: {
        x: state.position.x,
        y: state.position.y,
        vx: state.velocity.x,
        vy: state.velocity.y,
      },
      origin: 'registered_deterministic_kernel' as const,
    };
  }
  if (input.kernel === 'resource-capacity.v1') {
    const { availableGB, capacity } = evaluateResourceCapacity(input);
    return {
      input,
      ...metadata,
      output: { availableGB, capacity },
      origin: 'registered_deterministic_kernel' as const,
    };
  }
  const requests = input.rate * input.seconds;
  if (!Number.isFinite(requests) || requests > 1e9) throw new Error('M5_KERNEL_OUTPUT_BOUNDS');
  return {
    input,
    ...metadata,
    output: { requests },
    origin: 'registered_deterministic_kernel' as const,
  };
}
