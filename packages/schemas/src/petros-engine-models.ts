import { z } from 'zod';
import {
  evaluatePetrosProjectile,
  PETROS_PROJECTILE_ASSUMPTIONS,
  PETROS_PROJECTILE_CAPABILITY,
} from './petros-projectile-model';

/** Platform code only. Engineering fixture validation is not educator or pilot approval. */
export interface EngineModelCapability {
  id: string;
  version: 1;
  solver: string;
  inputs: Record<string, { unit: string; min: number; max: number; initial: number }>;
  outputs: Record<string, { unit: string }>;
  assumptions: string[];
  limitations: string[];
  trust: 'platform_validated';
  fixtures: string[];
  maxTime: number;
  maxSteps: number;
  license: string;
}
const input = (unit: string, min: number, max: number, initial: number) => ({ unit, min, max, initial });
const outputs = (units: Record<string, string>) => Object.fromEntries(
  Object.entries(units).map(([name, unit]) => [name, { unit }]),
);
const engineeringLimit = 'Engineering reference fixtures only; educator review and real-world acceptance are not established.';
const circuitLimits = [
  engineeringLimit,
  'Only a single directed series loop with one ideal source, resistor and switch is supported; RC adds one ideal capacitor.',
  'An open switch isolates the capacitor and retains charge; it does not connect a discharge resistor.',
  'No spatial electromagnetic fields, propagation, inductance, nonlinear components, parasitics or thermal model.',
  'Charge-flow motion is explanatory, not electron speed. Positive conventional current is opposite electron drift in metal.',
];
const circuitInputs = {
  voltage: input('V', -100, 100, 10), resistance: input('ohm', 1, 1_000_000, 1000),
  closed: input('1', 0, 1, 1),
};
const circuitOutputs = outputs({
  time: 's', sourceVoltage: 'V', resistorVoltage: 'V', capacitorVoltage: 'V', switchVoltage: 'V',
  current: 'A', charge: 'C', energy: 'J', closed: '1', timeConstant: 's', power: 'W',
  sourceCurrent: 'A', resistorCurrent: 'A', capacitorCurrent: 'A', switchCurrent: 'A',
  sourceNodeVoltage: 'V', resistorNodeVoltage: 'V', capacitorNodeVoltage: 'V', groundVoltage: 'V',
});
export const ENGINE_MODELS: readonly EngineModelCapability[] = [
  {
    ...PETROS_PROJECTILE_CAPABILITY,
    inputs: { vx: input('m/s', -100, 100, 12), vy: input('m/s', 0, 100, 20), gravity: input('m/s^2', 1, 25, 10) },
    outputs: outputs({ time: 's', x: 'm', y: 'm', vx: 'm/s', vy: 'm/s', ax: 'm/s^2', ay: 'm/s^2',
      range: 'm', apexHeight: 'm', apexTime: 's', duration: 's' }),
    assumptions: ['Point mass in stationary SI Cartesian coordinates: x right, y up.',
      'Uniform downward gravity; no air resistance, wind or other forces.',
      'Launch and landing are at the same level (y = 0); stop at first ground contact.'],
    limitations: [engineeringLimit, 'Stops at first level-ground contact; the contact sample is incoming velocity, not a post-impact simulation.'],
    trust: 'platform_validated', fixtures: ['projectile-launch-apex-contact', 'projectile-domain-extrema'],
    maxTime: 200, maxSteps: 1, license: 'Original implementation; no external assets. Formula reference: OpenStax University Physics 1 §4.3.',
  },
  {
    id: 'physics.pendulum.ideal', version: 1, solver: 'rk4.nonlinear-pendulum.dt-0.001.v1',
    inputs: { length: input('m', 0.1, 10, 1), mass: input('kg', 0.01, 100, 1),
      gravity: input('m/s^2', 1, 25, 9.81), angle: input('rad', -1.4, 1.4, 0.5) },
    outputs: outputs({ time: 's', angle: 'rad', omega: 'rad/s', x: 'm', y: 'm', vx: 'm/s', vy: 'm/s',
      ax: 'm/s^2', ay: 'm/s^2', tension: 'N', weight: 'N', tensionX: 'N', tensionY: 'N',
      weightX: 'N', weightY: 'N', radialAcceleration: 'm/s^2', tangentialAcceleration: 'm/s^2',
      kineticEnergy: 'J', potentialEnergy: 'J', energy: 'J', energyRelativeError: '1' }),
    assumptions: ['Nonlinear ideal point mass: theta double-dot = -(g/L) sin(theta); no small-angle substitution.',
      'Massless inextensible string, fixed pivot, no damping or driving, constant uniform gravity.',
      'Released from rest; angle from downward vertical, x right, y up relative to pivot.',
      'All physical parameter changes restart from the initial release; rewind replays forward from release.'],
    limitations: [engineeringLimit, 'Release angle limited to ±1.4 rad; no slack string, rotations, moving support or length intervention.',
      'Fixed 0.001 s RK4 steps plus a final partial step; energy error is monitored at every step (relative tolerance 1e-6).',
      'Equilibrium event times use linear interpolation within a step (fixture tolerance 2e-6 s).'],
    trust: 'platform_validated', fixtures: ['pendulum-elliptic-period', 'pendulum-small-angle-limit', 'pendulum-energy-domain-extrema', 'pendulum-mass-independence'],
    maxTime: 60, maxSteps: 60_000, license: 'Original implementation; no external assets. Formula reference: OpenStax University Physics 1 §15.4.',
  },
  {
    id: 'circuits.dc.series', version: 1, solver: 'analytic.series-dc.v1', inputs: circuitInputs,
    outputs: circuitOutputs, assumptions: ['Ideal constant voltage source, positive ohmic resistor, ideal instantaneous series switch.',
      'Positive current follows source positive terminal through resistor and switch to source negative terminal.'],
    limitations: circuitLimits, trust: 'platform_validated', fixtures: ['dc-kirchhoff-node-loop', 'dc-switch-discontinuity'],
    maxTime: 3600, maxSteps: 129, license: 'Original implementation; no external assets. Ohm/Kirchhoff reference: OpenStax University Physics 2 chapter 10.',
  },
  {
    id: 'circuits.rc.series', version: 1, solver: 'analytic.piecewise-series-rc.v1',
    inputs: { ...circuitInputs, capacitance: input('F', 0.000001, 1, 0.001), initialVoltage: input('V', -100, 100, 0) },
    outputs: circuitOutputs, assumptions: ['Ideal constant voltage source, positive ohmic resistor, ideal capacitor and instantaneous series switch.',
      'Capacitor voltage is continuous at switching; no current flows across an open switch.',
      'Closed intervals solve Vc(t)=Vs+(Vc(0)-Vs) exp(-t/(RC)); voltage=0 supports discharge from initialVoltage.',
      'Switch events intervene; all other physical parameter changes restart from the initial condition.'],
    limitations: circuitLimits, trust: 'platform_validated', fixtures: ['rc-time-constant-reference', 'rc-piecewise-switch-continuity', 'rc-discharge-energy', 'rc-kirchhoff-node-loop'],
    maxTime: 3600, maxSteps: 129, license: 'Original implementation; no external assets. Formula reference: OpenStax University Physics 2 §10.5.',
  },
  {
    id: 'thermal.newton-cooling.lumped', version: 1, solver: 'analytic.newton-cooling.exact.v1',
    inputs: { initialTemperature: input('K', 0, 2000, 373.15), ambientTemperature: input('K', 0, 2000, 293.15),
      rateConstant: input('s^-1', 0.00001, 0.1, 0.01) },
    outputs: outputs({ time: 's', temperature: 'K', ambientTemperature: 'K', temperatureDifference: 'K',
      temperatureRate: 'K/s', halfLife: 's' }),
    assumptions: ['One spatially uniform lumped body exchanges heat with a constant ambient temperature.',
      'A single positive effective rate constant gives dT/dt = -k(T - Ta); exact solution T(t)=Ta+(T0-Ta)exp(-kt).',
      'Temperatures are absolute kelvin values; the same unit K is used for temperature differences. Parameter changes restart at the stated initial temperature.'],
    limitations: [engineeringLimit, 'No spatial temperature gradients, changing ambient, phase changes, radiation-specific law, material-specific coefficient prediction, or coupled objects.',
      'The rate constant is an effective declared input; the model does not infer it from geometry or material properties.'],
    trust: 'platform_validated', fixtures: ['newton-cooling-closed-form-reference', 'newton-cooling-half-life', 'newton-cooling-ambient-asymptote'],
    maxTime: 86_400, maxSteps: 1,
    license: 'Original implementation; no external assets. Formula reference: OpenStax Calculus Volume 2 §2.8, https://openstax.org/books/calculus-volume-2/pages/2-8-exponential-growth-and-decay.',
  },
];
// Freeze nested metadata too: callers cannot mutate bounds or grant a different solver.
function freezeMetadata(value: object): void {
  for (const child of Object.values(value)) if (child && typeof child === 'object') freezeMetadata(child);
  Object.freeze(value);
}
freezeMetadata(ENGINE_MODELS);

const identifier = z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/);
const topologySchema = z.object({
  schemaVersion: z.literal('petros.circuit-topology.v1'),
  nodes: z.array(identifier).min(3).max(4),
  ground: identifier,
  components: z.array(z.object({
    id: identifier, kind: z.enum(['source', 'resistor', 'switch', 'capacitor']),
    ports: z.object({ from: identifier, to: identifier }).strict(),
  }).strict()).min(3).max(4),
}).strict();
export type EngineCircuitTopology = z.infer<typeof topologySchema>;
/** Nodes are ideal wires. Geometry/layout deliberately does not enter electrical topology. */
export function createEngineCircuitTopology(rc: boolean): EngineCircuitTopology {
  return {
    schemaVersion: 'petros.circuit-topology.v1',
    nodes: rc ? ['ground', 'supply', 'afterR', 'afterSwitch'] : ['ground', 'supply', 'afterR'], ground: 'ground',
    components: [
      { id: 'battery', kind: 'source', ports: { from: 'ground', to: 'supply' } },
      { id: 'resistor', kind: 'resistor', ports: { from: 'supply', to: 'afterR' } },
      { id: 'switch', kind: 'switch', ports: { from: 'afterR', to: rc ? 'afterSwitch' : 'ground' } },
      ...(rc ? [{ id: 'capacitor', kind: 'capacitor' as const, ports: { from: 'afterSwitch', to: 'ground' } }] : []),
    ],
  };
}
export function validateEngineCircuitTopology(raw: unknown, rc: boolean): EngineCircuitTopology {
  assertJsonData(raw, 'PETROS_ENGINE_UNSUPPORTED_TOPOLOGY', 6, 64);
  const preflight = raw as Partial<EngineCircuitTopology> | null;
  if (!preflight || !Array.isArray(preflight.nodes) || preflight.nodes.length > 4 ||
    !Array.isArray(preflight.components) || preflight.components.length > 4) throw new Error('PETROS_ENGINE_UNSUPPORTED_TOPOLOGY');
  const topology = topologySchema.parse(raw);
  const count = rc ? 4 : 3;
  const kinds = rc ? ['source', 'resistor', 'switch', 'capacitor'] : ['source', 'resistor', 'switch'];
  if (topology.nodes.length !== count || topology.components.length !== count ||
    new Set(topology.nodes).size !== count || new Set(topology.components.map(c => c.id)).size !== count)
    throw new Error('PETROS_ENGINE_UNSUPPORTED_TOPOLOGY');
  let node = topology.ground;
  const visited = new Set<string>();
  for (const kind of kinds) {
    const components = topology.components.filter(c => c.kind === kind);
    const component = components[0];
    if (components.length !== 1 || !component || component.ports.from !== node ||
      !topology.nodes.includes(node) || visited.has(node) || component.ports.to === node)
      throw new Error('PETROS_ENGINE_UNSUPPORTED_TOPOLOGY');
    visited.add(node);
    node = component.ports.to;
  }
  if (node !== topology.ground || visited.size !== count) throw new Error('PETROS_ENGINE_UNSUPPORTED_TOPOLOGY');
  return topology;
}
export interface EngineModelOptions { topology?: unknown; events?: Array<{ time: number; closed: boolean }> }
export interface EngineModelResult {
  values: Record<string, number | boolean>;
  events: Array<{ id: string; time: number }>;
  steps: number;
  limitations: string[];
}
function readParameters(model: EngineModelCapability, raw: Record<string, number | boolean>): Record<string, number> {
  assertJsonData(raw, 'PETROS_ENGINE_PARAMETER_DOMAIN', 2, 24);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || Reflect.ownKeys(raw).length > 8)
    throw new Error('PETROS_ENGINE_PARAMETER_DOMAIN');
  for (const key of Reflect.ownKeys(raw)) {
    if (typeof key !== 'string') throw new Error('PETROS_ENGINE_PARAMETER_DOMAIN');
    if (!Object.hasOwn(model.inputs, key)) throw new Error('PETROS_ENGINE_UNKNOWN_PARAMETER');
  }
  const result: Record<string, number> = {};
  for (const [key, spec] of Object.entries(model.inputs)) {
    const supplied = Object.hasOwn(raw, key) ? raw[key] : spec.initial;
    const value = key === 'closed' && typeof supplied === 'boolean' ? Number(supplied) : supplied;
    if (typeof value !== 'number' || !Number.isFinite(value) || value < spec.min || value > spec.max ||
      (key === 'closed' && value !== 0 && value !== 1)) throw new Error('PETROS_ENGINE_PARAMETER_DOMAIN');
    result[key] = value;
  }
  return result;
}
const switchEventsSchema = z.array(z.object({ time: z.number().finite().min(0).max(3600), closed: z.boolean() }).strict()).max(128);

/** Reject non-JSON objects/accessors before Zod or model code can traverse caller data. */
function assertJsonData(raw: unknown, code: string, maxDepth = 8, maxNodes = 256): void {
  const pending: Array<{ value: unknown; depth: number }> = [{ value: raw, depth: 0 }];
  const seen = new Set<object>();
  let nodes = 0;
  try {
    while (pending.length) {
      const { value, depth } = pending.pop()!;
      if (++nodes > maxNodes || depth > maxDepth) throw new Error(code);
      if (value === null || typeof value === 'string' || typeof value === 'boolean' ||
        (typeof value === 'number' && Number.isFinite(value))) continue;
      if (typeof value !== 'object') throw new Error(code);
      if (seen.has(value)) throw new Error(code);
      seen.add(value);
      const prototype = Object.getPrototypeOf(value);
      if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null) throw new Error(code);
      for (const key of Reflect.ownKeys(value)) {
        if (Array.isArray(value) && key === 'length') continue;
        if (typeof key !== 'string' || ['__proto__', 'constructor', 'prototype'].includes(key)) throw new Error(code);
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        if (!descriptor || !('value' in descriptor) || !descriptor.enumerable) throw new Error(code);
        pending.push({ value: descriptor.value, depth: depth + 1 });
      }
    }
  } catch {
    throw new Error(code);
  }
}

function assertOptions(options: EngineModelOptions): void {
  if (!options || typeof options !== 'object' || Array.isArray(options) ||
    Object.getPrototypeOf(options) !== Object.prototype && Object.getPrototypeOf(options) !== null)
    throw new Error('PETROS_ENGINE_OPTIONS');
  for (const key of Reflect.ownKeys(options)) {
    if (key !== 'topology' && key !== 'events') throw new Error('PETROS_ENGINE_OPTIONS');
    const descriptor = Object.getOwnPropertyDescriptor(options, key);
    if (!descriptor || !('value' in descriptor) || !descriptor.enumerable) throw new Error('PETROS_ENGINE_OPTIONS');
  }
  if (Reflect.ownKeys(options).length > 2)
    throw new Error('PETROS_ENGINE_OPTIONS');
}

/** Pure bounded adapters. Callers own scheduling, last-valid-state recovery and authorization. */
export function evaluateEngineModel(
  id: string, parameters: Record<string, number | boolean>, time: number, options: EngineModelOptions = {},
): EngineModelResult {
  const model = ENGINE_MODELS.find(candidate => candidate.id === id);
  if (!model) throw new Error('PETROS_ENGINE_UNKNOWN_CAPABILITY');
  if (!Number.isFinite(time) || time < 0 || time > model.maxTime) throw new Error('PETROS_ENGINE_TIME_DOMAIN');
  assertOptions(options);
  const p = readParameters(model, parameters);
  const isCircuit = id.startsWith('circuits.');
  if (!isCircuit && (options.topology !== undefined || options.events !== undefined)) throw new Error('PETROS_ENGINE_OPTIONS');
  let result: EngineModelResult;
  if (id === 'physics.projectile.no-drag') {
    const state = evaluatePetrosProjectile({
      schemaVersion: 'petros.projectile-input.v1', capability: PETROS_PROJECTILE_CAPABILITY,
      assumptions: PETROS_PROJECTILE_ASSUMPTIONS, launchVelocity: { x: p.vx, y: p.vy, unit: 'm/s' },
      gravity: { value: p.gravity, unit: 'm/s^2' }, elapsedTime: { value: time, unit: 's' },
    });
    const apexTime = p.vy! / p.gravity!;
    result = { values: { time, x: state.position.x, y: state.position.y, vx: state.velocity.x, vy: state.velocity.y,
      ax: 0, ay: -p.gravity!, range: state.readouts.horizontalDisplacementAtLanding.value,
      apexHeight: state.readouts.maximumHeight.value, apexTime, duration: state.readouts.flightDuration.value },
    events: [{ id: 'launch', time: 0 }, { id: 'apex', time: apexTime }, { id: 'ground_contact', time: state.readouts.flightDuration.value }],
    steps: 1, limitations: [...model.limitations] };
  } else if (id === 'physics.pendulum.ideal') result = pendulum(p, time, model);
  else if (id === 'thermal.newton-cooling.lumped') result = newtonCooling(p, time, model);
  else result = circuit(p, time, options, model);
  if (Object.values(result.values).some(value => typeof value === 'number' && !Number.isFinite(value)))
    throw new Error('PETROS_ENGINE_NONFINITE_RESULT');
  if (result.steps > model.maxSteps) throw new Error('PETROS_ENGINE_STEP_BUDGET');
  return result;
}

function newtonCooling(p: Record<string, number>, time: number, model: EngineModelCapability): EngineModelResult {
  const initialTemperature = p.initialTemperature!;
  const ambientTemperature = p.ambientTemperature!;
  const rateConstant = p.rateConstant!;
  const difference = (initialTemperature - ambientTemperature) * Math.exp(-rateConstant * time);
  const temperature = ambientTemperature + difference;
  const halfLife = Math.LN2 / rateConstant;
  return { values: { time, temperature, ambientTemperature, temperatureDifference: difference,
    temperatureRate: difference === 0 ? 0 : -rateConstant * difference, halfLife },
  events: [{ id: 'initial', time: 0 }], steps: 1, limitations: [...model.limitations] };
}

function pendulum(p: Record<string, number>, time: number, model: EngineModelCapability): EngineModelResult {
  const length = p.length!, mass = p.mass!, gravity = p.gravity!;
  let angle = p.angle!, omega = 0;
  const initialSpecificEnergy = gravity * length * (1 - Math.cos(angle));
  const scale = Math.max(initialSpecificEnergy, gravity * length * 1e-10);
  const energy = (a: number, w: number) => 0.5 * length * length * w * w + gravity * length * (1 - Math.cos(a));
  const acceleration = (a: number) => -gravity / length * Math.sin(a);
  const steps = Math.ceil(time / 0.001);
  if (steps > model.maxSteps) throw new Error('PETROS_ENGINE_STEP_BUDGET');
  const events: EngineModelResult['events'] = [{ id: 'release', time: 0 }];
  for (let index = 0; index < steps; index++) {
    const elapsed = index * 0.001, h = Math.min(0.001, time - elapsed);
    const a1 = omega, w1 = acceleration(angle);
    const a2 = omega + h * w1 / 2, w2 = acceleration(angle + h * a1 / 2);
    const a3 = omega + h * w2 / 2, w3 = acceleration(angle + h * a2 / 2);
    const a4 = omega + h * w3, w4 = acceleration(angle + h * a3);
    const previousAngle = angle;
    angle += h * (a1 + 2 * a2 + 2 * a3 + a4) / 6;
    omega += h * (w1 + 2 * w2 + 2 * w3 + w4) / 6;
    if (!Number.isFinite(angle) || !Number.isFinite(omega) || Math.abs(energy(angle, omega) - initialSpecificEnergy) / scale > 1e-6)
      throw new Error('PETROS_ENGINE_NUMERICAL_TOLERANCE');
    if (previousAngle * angle < 0) events.push({ id: `equilibrium_${events.length}`, time: elapsed + h * previousAngle / (previousAngle - angle) });
  }
  const sine = Math.sin(angle), cosine = Math.cos(angle);
  const radialAcceleration = length * omega * omega, tangentialAcceleration = -gravity * sine;
  const kineticEnergy = mass * length * length * omega * omega / 2;
  const potentialEnergy = mass * gravity * length * (1 - cosine);
  const tension = mass * (gravity * cosine + radialAcceleration);
  return { values: { time, angle, omega, x: length * sine, y: -length * cosine,
    vx: length * omega * cosine, vy: length * omega * sine,
    ax: tangentialAcceleration * cosine - radialAcceleration * sine,
    ay: tangentialAcceleration * sine + radialAcceleration * cosine,
    tension, weight: mass * gravity, tensionX: -tension * sine, tensionY: tension * cosine,
    weightX: 0, weightY: -mass * gravity, radialAcceleration, tangentialAcceleration,
    kineticEnergy, potentialEnergy, energy: kineticEnergy + potentialEnergy,
    energyRelativeError: Math.abs(energy(angle, omega) - initialSpecificEnergy) / scale }, events, steps,
  limitations: [...model.limitations] };
}

function circuit(p: Record<string, number>, time: number, options: EngineModelOptions, model: EngineModelCapability): EngineModelResult {
  const rc = model.id === 'circuits.rc.series';
  if (options.topology !== undefined) assertJsonData(options.topology, 'PETROS_ENGINE_UNSUPPORTED_TOPOLOGY', 6, 64);
  validateEngineCircuitTopology(options.topology ?? createEngineCircuitTopology(rc), rc);
  if (options.events !== undefined) assertJsonData(options.events, 'PETROS_ENGINE_EVENT_BUDGET', 4, 1_040);
  if (options.events !== undefined && (!Array.isArray(options.events) || options.events.length > 128))
    throw new Error('PETROS_ENGINE_EVENT_BUDGET');
  const events = switchEventsSchema.parse(options.events ?? []);
  if (events.some((event, index) => index > 0 && event.time <= events[index - 1]!.time))
    throw new Error('PETROS_ENGINE_EVENT_ORDER');
  const voltage = p.voltage!, resistance = p.resistance!, capacitance = rc ? p.capacitance! : 0;
  const timeConstant = resistance * capacitance;
  let capacitorVoltage = rc ? p.initialVoltage! : 0, closed = p.closed === 1, previousTime = 0, steps = 0;
  const occurred: EngineModelResult['events'] = [];
  const advance = (until: number) => {
    if (closed && rc) capacitorVoltage += (voltage - capacitorVoltage) * -Math.expm1(-(until - previousTime) / timeConstant);
    previousTime = until;
    steps++;
  };
  for (let index = 0; index < events.length; index++) {
    const event = events[index]!;
    if (event.time > time) break;
    advance(event.time);
    closed = event.closed;
    occurred.push({ id: `switch_${index}_${closed ? 'closed' : 'open'}`, time: event.time });
  }
  advance(time);
  const current = closed ? (voltage - capacitorVoltage) / resistance : 0;
  const resistorVoltage = current * resistance;
  const switchVoltage = voltage - resistorVoltage - capacitorVoltage;
  return { values: { time, sourceVoltage: voltage, capacitorVoltage, resistorVoltage, switchVoltage,
    current, closed, charge: capacitance * capacitorVoltage, energy: capacitance * capacitorVoltage * capacitorVoltage / 2,
    timeConstant, power: current * current * resistance,
    sourceCurrent: current, resistorCurrent: current, switchCurrent: current, capacitorCurrent: rc ? current : 0,
    sourceNodeVoltage: voltage, resistorNodeVoltage: voltage - resistorVoltage,
    capacitorNodeVoltage: capacitorVoltage, groundVoltage: 0 }, events: occurred, steps, limitations: [...model.limitations] };
}
