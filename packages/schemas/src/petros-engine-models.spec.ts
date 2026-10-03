import { describe, expect, it } from 'vitest';
import {
  createEngineCircuitTopology,
  ENGINE_MODELS,
  evaluateEngineModel,
  validateEngineCircuitTopology,
} from './petros-engine-models';
import { compileEngineProgram } from './petros-engine-compiler';
import { initialEngineSnapshot } from './petros-engine-controller';
import { evaluateEngineSnapshot } from './petros-engine-interpreter';
import { createEngineReferenceProgram } from './petros-engine-presets';
import { describeEngineCapabilities } from './petros-engine-registry';
import { ENGINE_UNITS, engineUnitsCompatible } from './petros-engine-units';

const run = (id: string, parameters: Record<string, number | boolean>, time: number,
  options?: Parameters<typeof evaluateEngineModel>[3]) => evaluateEngineModel(id, parameters, time, options);
const pendulum = 'physics.pendulum.ideal';
const projectile = 'physics.projectile.no-drag';
const dc = 'circuits.dc.series';
const rc = 'circuits.rc.series';
const cooling = 'thermal.newton-cooling.lumped';

/** Independent RK4 reference with a smaller step than the production solver. */
function referencePendulum(length: number, gravity: number, initialAngle: number, time: number, step: number) {
  let angle = initialAngle;
  let omega = 0;
  const acceleration = (theta: number) => -gravity / length * Math.sin(theta);
  const count = Math.ceil(time / step);
  for (let index = 0; index < count; index++) {
    const h = Math.min(step, time - index * step);
    const k1a = omega;
    const k1w = acceleration(angle);
    const k2a = omega + h * k1w / 2;
    const k2w = acceleration(angle + h * k1a / 2);
    const k3a = omega + h * k2w / 2;
    const k3w = acceleration(angle + h * k2a / 2);
    const k4a = omega + h * k3w;
    const k4w = acceleration(angle + h * k3a);
    angle += h * (k1a + 2 * k2a + 2 * k3a + k4a) / 6;
    omega += h * (k1w + 2 * k2w + 2 * k3w + k4w) / 6;
  }
  return { angle, omega };
}

/** Elliptic-integral period from energy conservation, quadrature independent of time stepping. */
function exactPendulumPeriod(length: number, gravity: number, releaseAngle: number): number {
  const k = Math.sin(Math.abs(releaseAngle) / 2);
  const n = 20_000;
  const end = Math.PI / 2;
  const h = end / n;
  const f = (phi: number) => 1 / Math.sqrt(1 - k * k * Math.sin(phi) ** 2);
  let sum = f(0) + f(end);
  for (let i = 1; i < n; i++) sum += (i % 2 === 0 ? 2 : 4) * f(i * h);
  return 4 * Math.sqrt(length / gravity) * h * sum / 3;
}

describe('bounded scientific engine models', () => {
  it('publishes immutable, versioned capability metadata and declared units', () => {
    expect(ENGINE_MODELS.map(({ id, version }) => [id, version])).toEqual([
      [projectile, 1], [pendulum, 1], [dc, 1], [rc, 1], [cooling, 1],
    ]);
    const pendulumCapability = ENGINE_MODELS.find(model => model.id === pendulum)!;
    expect(pendulumCapability.inputs.gravity!.unit).toBe('m/s^2');
    expect(Object.isFrozen(ENGINE_MODELS)).toBe(true);
    expect(Object.isFrozen(pendulumCapability.inputs.gravity)).toBe(true);
    expect(() => { (pendulumCapability.inputs as Record<string, unknown>).newInput = {}; }).toThrow();
  });

  it('reuses the projectile capability and returns its analytic reference values', () => {
    const result = run(projectile, { vx: 3, vy: 8, gravity: 10 }, 0.8);
    for (const [key, value] of Object.entries({ x: 2.4, y: 3.2, vx: 3, vy: 0, ax: 0, ay: -10,
      range: 4.8, apexHeight: 3.2, apexTime: 0.8, duration: 1.6 }))
      expect(result.values[key]).toBeCloseTo(value, 12);
    expect(result.events).toEqual([{ id: 'launch', time: 0 }, { id: 'apex', time: 0.8 },
      { id: 'ground_contact', time: 1.6 }]);
    expect(() => run(projectile, { vx: 3, vy: 8, gravity: 10 }, 1.61)).toThrow(/PETROS_PROJECTILE_TIME_AFTER_LANDING/);
  });

  it('matches an independent nonlinear pendulum reference and checks energy at bounded extrema', () => {
    const inputs = { length: 0.1, mass: 100, gravity: 25, angle: 1.4 };
    const time = 0.2375;
    const result = run(pendulum, inputs, time);
    const reference = referencePendulum(inputs.length, inputs.gravity, inputs.angle, time, 0.000025);
    expect(result.steps).toBe(238);
    expect(result.values.angle).toBeCloseTo(reference.angle, 9);
    expect(result.values.omega).toBeCloseTo(reference.omega, 7);
    expect(result.values.energyRelativeError).toBeLessThan(1e-6);
    expect(result.values.tension).toBeCloseTo(inputs.mass * (inputs.gravity * Math.cos(result.values.angle as number) +
      inputs.length * (result.values.omega as number) ** 2), 9);
    expect(result.values.weight).toBe(inputs.mass * inputs.gravity);
  });

  it('matches the nonlinear elliptic period and converges to the small-angle period', () => {
    const length = 2.5;
    const gravity = 9.81;
    const amplitude = 0.9;
    const finiteAmplitude = run(pendulum, { length, gravity, mass: 1, angle: amplitude }, 12);
    const crossings = finiteAmplitude.events.filter(event => event.id.startsWith('equilibrium_'));
    expect(crossings.length).toBeGreaterThanOrEqual(3);
    const measuredPeriod = 2 * (crossings[1]!.time - crossings[0]!.time);
    expect(measuredPeriod).toBeCloseTo(exactPendulumPeriod(length, gravity, amplitude), 5);

    const smallAngle = 0.002;
    const nearLinear = run(pendulum, { length, gravity, mass: 1, angle: smallAngle }, 5);
    const smallCrossings = nearLinear.events.filter(event => event.id.startsWith('equilibrium_'));
    const linearPeriod = 2 * Math.PI * Math.sqrt(length / gravity);
    const measuredSmallPeriod = 2 * (smallCrossings[1]!.time - smallCrossings[0]!.time);
    expect(Math.abs(measuredSmallPeriod - linearPeriod) / linearPeriod).toBeLessThan(1e-5);
  });

  it('keeps nonlinear energy within the declared tolerance at physical domain corners', () => {
    for (const length of [0.1, 10]) for (const gravity of [1, 25]) for (const angle of [-1.4, 1.4]) {
      const result = run(pendulum, { length, mass: 100, gravity, angle }, 60);
      expect(result.steps).toBe(60_000);
      expect(result.values.energyRelativeError).toBeLessThan(1e-6);
    }
  });

  it('keeps the pendulum trajectory independent of mass while scaling force and energy', () => {
    const light = run(pendulum, { length: 1.4, mass: 0.01, gravity: 9.81, angle: -0.7 }, 2.3);
    const heavy = run(pendulum, { length: 1.4, mass: 100, gravity: 9.81, angle: -0.7 }, 2.3);
    for (const key of ['angle', 'omega', 'x', 'y', 'vx', 'vy', 'ax', 'ay', 'radialAcceleration',
      'tangentialAcceleration', 'energyRelativeError']) expect(heavy.values[key]).toBe(light.values[key]);
    expect(heavy.values.weight).toBeCloseTo((light.values.weight as number) * 10_000, 9);
    expect(heavy.values.tension).toBeCloseTo((light.values.tension as number) * 10_000, 9);
    expect(heavy.values.energy).toBeCloseTo((light.values.energy as number) * 10_000, 9);
  });

  it('solves the DC series loop with KVL and the open-switch boundary', () => {
    const closed = run(dc, { voltage: 12, resistance: 6, closed: true }, 0.5);
    expect(closed.values).toMatchObject({ current: 2, sourceCurrent: 2, resistorCurrent: 2,
      switchCurrent: 2, resistorVoltage: 12, switchVoltage: 0, capacitorVoltage: 0,
      sourceNodeVoltage: 12, resistorNodeVoltage: 0, groundVoltage: 0, power: 24 });
    expect((closed.values.resistorVoltage as number) + (closed.values.switchVoltage as number)).toBe(closed.values.sourceVoltage);

    const open = run(dc, { voltage: 12, resistance: 6, closed: false }, 0.5);
    expect(open.values).toMatchObject({ current: 0, sourceCurrent: 0, resistorCurrent: 0,
      switchCurrent: 0, resistorVoltage: 0, switchVoltage: 12, capacitorVoltage: 0 });
    expect((open.values.resistorVoltage as number) + (open.values.switchVoltage as number)).toBe(open.values.sourceVoltage);
  });

  it('solves RC charge, open-circuit retention, zero-source discharge and energy independently', () => {
    const values = run(rc, { voltage: 10, resistance: 1000, capacitance: 0.001, initialVoltage: 0 }, 1);
    const expectedVoltage = 10 * (1 - Math.exp(-1));
    expect(values.values.timeConstant).toBe(1);
    expect(values.values.capacitorVoltage).toBeCloseTo(expectedVoltage, 12);
    expect(values.values.charge).toBeCloseTo(0.001 * expectedVoltage, 12);
    expect(values.values.energy).toBeCloseTo(0.5 * 0.001 * expectedVoltage ** 2, 12);
    expect(values.values.current).toBeCloseTo((10 - expectedVoltage) / 1000, 12);
    expect((values.values.resistorVoltage as number) + (values.values.capacitorVoltage as number) +
      (values.values.switchVoltage as number)).toBeCloseTo(10, 12);

    const switched = run(rc, { voltage: 0, resistance: 4, capacitance: 0.5, initialVoltage: 8 }, 2,
      { events: [{ time: 0, closed: false }, { time: 1, closed: true }] });
    const expectedAfterDischarge = 8 * Math.exp(-1 / 2);
    expect(switched.events).toEqual([{ id: 'switch_0_open', time: 0 }, { id: 'switch_1_closed', time: 1 }]);
    expect(switched.values.capacitorVoltage).toBeCloseTo(expectedAfterDischarge, 12);
    expect(switched.values.current).toBeCloseTo(-expectedAfterDischarge / 4, 12);
    expect(switched.values.energy).toBeCloseTo(0.25 * expectedAfterDischarge ** 2, 12);

    const open = run(rc, { voltage: 10, resistance: 1000, capacitance: 0.001, initialVoltage: -3, closed: false }, 100);
    expect(open.values.capacitorVoltage).toBe(-3);
    expect(open.values.current).toBe(0);
    expect(open.values.capacitorCurrent).toBe(0);
  });

  it('uses declared temperature dimensions and matches an independent exact cooling reference', () => {
    expect(ENGINE_UNITS.K.d).toEqual([0, 0, 0, 0, 0, 0, 1]);
    expect(ENGINE_UNITS['K/s'].d).toEqual([0, 0, -1, 0, 0, 0, 1]);
    expect(engineUnitsCompatible('K', 'K/s')).toBe(false);
    expect(engineUnitsCompatible('K/s', 'm/s')).toBe(false);
    const inputs = { initialTemperature: 373.15, ambientTemperature: 293.15, rateConstant: 0.01 };
    const halfLife = Math.LN2 / inputs.rateConstant;
    const half = run(cooling, inputs, halfLife);
    expect(half.values.temperature).toBeCloseTo(333.15, 12);
    expect(half.values.ambientTemperature).toBe(293.15);
    expect(half.values.temperatureDifference).toBeCloseTo(40, 12);
    expect(half.values.temperatureRate).toBeCloseTo(-0.4, 12);
    expect(half.values.halfLife).toBe(halfLife);
    const oneTimeConstant = run(cooling, inputs, 100);
    // Independent closed-form value: Ta + (T0-Ta)e^(-kt), evaluated separately from adapter.
    expect(oneTimeConstant.values.temperature).toBeCloseTo(322.5803552937154, 12);
    expect(oneTimeConstant.values.temperatureRate).toBeCloseTo(-0.2943035529371539, 12);
    // OpenStax Calculus Vol. 2 §2.8 Example 2.45: coffee starts at 200°F and is 180°F
    // after 2 minutes in 70°F ambient. Derive k from that stated observation independently.
    const fahrenheitToKelvin = (fahrenheit: number) => (fahrenheit - 32) * 5 / 9 + 273.15;
    const openStaxRate = Math.log(13 / 11) / 120;
    const openStax = run(cooling, { initialTemperature: fahrenheitToKelvin(200),
      ambientTemperature: fahrenheitToKelvin(70), rateConstant: openStaxRate }, 120);
    expect(openStax.values.temperature).toBeCloseTo(fahrenheitToKelvin(180), 11);
    const equilibrium = run(cooling, { ...inputs, initialTemperature: inputs.ambientTemperature }, 86_400).values;
    expect(equilibrium.temperature).toBe(293.15);
    expect(equilibrium.temperatureDifference).toBe(0);
    expect(equilibrium.temperatureRate).toBe(0);
    const warmed = run(cooling, { initialTemperature: 280, ambientTemperature: 300, rateConstant: 0.02 }, 10);
    expect(warmed.values.temperature).toBeGreaterThan(280);
    expect(warmed.values.temperature).toBeLessThan(300);
    expect(warmed.values.temperatureRate).toBeGreaterThan(0);
    expect(() => run(cooling, { ...inputs, ambientTemperature: -0.01 }, 1)).toThrow(/PETROS_ENGINE_PARAMETER_DOMAIN/);
    expect(() => run(cooling, inputs, 86_400.1)).toThrow(/PETROS_ENGINE_TIME_DOMAIN/);
  });

  it('composes cooling as ordinary restartable program data with a linked temperature-time plot', () => {
    const authority = { ownerScopeRef: 'synthetic-owner', programId: '22222222-2222-4222-8222-222222222222', source: null,
      allowedCapabilities: describeEngineCapabilities().capabilities.filter(capability => capability.enabled).map(c => c.id) };
    const program = createEngineReferenceProgram(authority, cooling);
    const compiled = compileEngineProgram(program, authority);
    expect(program.provenance).toBe('engineering_comparison');
    expect(program.models[0]).toMatchObject({ capabilityId: cooling, solver: 'analytic.newton-cooling.exact.v1' });
    expect(program.parameters.map(parameter => [parameter.id, parameter.unit, parameter.change])).toEqual([
      ['initialTemperature', 'K', 'restart'], ['ambientTemperature', 'K', 'restart'], ['rateConstant', 's^-1', 'restart'],
    ]);
    expect(program.plots).toContainEqual(expect.objectContaining({ viewId: 'plot', x: 'time', y: 'normalizedTemperatureDifference', from: 0, to: 200 }));
    expect(program.views.find(view => view.id === 'data')?.primitives.some(primitive => primitive.text?.includes('T(t) = Ta + (T₀'))).toBe(true);
    expect(program.bindings).toContainEqual(expect.objectContaining({ source: 'model.temperature', primitiveId: 'temperatureLabel', viewId: 'motion' }));
    expect(compiled.report.scientificStatus).toBe('validated_capabilities_only');
    const initial = initialEngineSnapshot(compiled, '33333333-3333-4333-8333-333333333333');
    const firstReplay = evaluateEngineSnapshot(initial, 100).execution.values;
    evaluateEngineSnapshot(initial, 20);
    expect(evaluateEngineSnapshot(initial, 100).execution.values).toEqual(firstReplay);
  });

  it('validates separate DC and RC series topologies and denies alternate wiring', () => {
    const dcTopology = createEngineCircuitTopology(false);
    const rcTopology = createEngineCircuitTopology(true);
    expect(validateEngineCircuitTopology(dcTopology, false)).toEqual(dcTopology);
    expect(validateEngineCircuitTopology(rcTopology, true)).toEqual(rcTopology);
    expect(() => validateEngineCircuitTopology(dcTopology, true)).toThrow(/PETROS_ENGINE_UNSUPPORTED_TOPOLOGY/);
    expect(() => run(rc, {}, 1, { topology: dcTopology })).toThrow(/PETROS_ENGINE_UNSUPPORTED_TOPOLOGY/);

    const parallel = structuredClone(rcTopology);
    parallel.components[2]!.ports.to = 'ground';
    expect(() => validateEngineCircuitTopology(parallel, true)).toThrow(/PETROS_ENGINE_UNSUPPORTED_TOPOLOGY/);
    const wrongComponent = structuredClone(rcTopology);
    wrongComponent.components[1]!.kind = 'switch';
    expect(() => validateEngineCircuitTopology(wrongComponent, true)).toThrow(/PETROS_ENGINE_UNSUPPORTED_TOPOLOGY/);
    expect(() => validateEngineCircuitTopology({ ...rcTopology, surprise: true }, true)).toThrow();
    expect(() => validateEngineCircuitTopology({ ...rcTopology, schemaVersion: 'petros.circuit-topology.v2' }, true)).toThrow();
  });

  it('rejects unknown capability, unsupported version, units, parameters, options and domains', () => {
    expect(() => run('physics.pendulum.ideal.v2', {}, 0)).toThrow(/PETROS_ENGINE_UNKNOWN_CAPABILITY/);
    expect(() => run(projectile, { vx: 1, vy: 2, gravity: 9.81, mass: 1 }, 0)).toThrow(/PETROS_ENGINE_UNKNOWN_PARAMETER/);
    expect(() => run(pendulum, { length: Number.NaN }, 0)).toThrow(/PETROS_ENGINE_PARAMETER_DOMAIN/);
    expect(() => run(pendulum, { length: 10.1 }, 0)).toThrow(/PETROS_ENGINE_PARAMETER_DOMAIN/);
    expect(() => run(rc, { voltage: 10, resistance: 1000, capacitance: 0.001, initialVoltage: 0, unit: 'mV' } as never, 1))
      .toThrow(/PETROS_ENGINE_UNKNOWN_PARAMETER/);
    expect(() => run(pendulum, {}, 60.1)).toThrow(/PETROS_ENGINE_TIME_DOMAIN/);
    expect(() => run(dc, {}, -0.1)).toThrow(/PETROS_ENGINE_TIME_DOMAIN/);
    expect(() => run(pendulum, {}, 1, { events: [] })).toThrow(/PETROS_ENGINE_OPTIONS/);
    expect(() => run(dc, {}, 1, { other: true } as never)).toThrow(/PETROS_ENGINE_OPTIONS/);
    expect(() => run(dc, {}, 3600.1)).toThrow(/PETROS_ENGINE_TIME_DOMAIN/);
  });

  it('admits declared parameter endpoints and rejects adjacent out-of-domain values', () => {
    for (const model of ENGINE_MODELS) {
      const defaults = Object.fromEntries(Object.entries(model.inputs).map(([key, input]) => [key, input.initial]));
      for (const [key, input] of Object.entries(model.inputs)) {
        expect(() => run(model.id, { ...defaults, [key]: input.min }, 0)).not.toThrow();
        expect(() => run(model.id, { ...defaults, [key]: input.max }, 0)).not.toThrow();
        expect(() => run(model.id, { ...defaults, [key]: input.min - 1 }, 0)).toThrow(/PETROS_ENGINE_PARAMETER_DOMAIN/);
        expect(() => run(model.id, { ...defaults, [key]: input.max + 1 }, 0)).toThrow(/PETROS_ENGINE_PARAMETER_DOMAIN/);
      }
    }
  });

  it('rejects accessors, cyclic structures, malformed events, duplicate event times and oversized budgets', () => {
    const accessor = Object.defineProperty({}, 'angle', { enumerable: true, get: () => { throw new Error('executed'); } });
    expect(() => run(pendulum, accessor as never, 0)).toThrow(/PETROS_ENGINE_PARAMETER_DOMAIN/);
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(() => run(rc, {}, 1, { topology: cyclic })).toThrow();
    expect(() => run(rc, {}, 1, { events: [{ time: 1, closed: false }, { time: 1, closed: true }] }))
      .toThrow(/PETROS_ENGINE_EVENT_ORDER/);
    expect(() => run(rc, {}, 1, { events: [{ time: Number.POSITIVE_INFINITY, closed: false }] })).toThrow();
    expect(() => run(rc, {}, 1, { events: Array.from({ length: 129 }, (_, i) => ({ time: i, closed: i % 2 === 0 })) }))
      .toThrow(/PETROS_ENGINE_EVENT_BUDGET/);
    expect(() => run(rc, {}, 1, { events: new Array(1_000_000) })).toThrow(/PETROS_ENGINE_EVENT_BUDGET/);
  });

  it('enforces the explicit pendulum solver budget at the longest supported run', () => {
    const result = run(pendulum, {}, 60);
    expect(result.steps).toBe(60_000);
    expect(result.values.energyRelativeError).toBeLessThan(1e-6);
    expect(() => run(pendulum, {}, 60.001)).toThrow(/PETROS_ENGINE_TIME_DOMAIN/);
  });
});
