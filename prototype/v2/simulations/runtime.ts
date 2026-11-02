import {
  createNeural,
  neuralForward,
  trainNeural,
  type NeuralState,
} from './foundations/neural';
import {
  createRocket,
  rocketStep,
  defaultRocketParams,
  type RocketState,
} from './foundations/rocket';
import { attention } from './foundations/attention';
import {
  createTraffic,
  trafficStep,
  tapBrakes,
  defaultTrafficParams,
  type TrafficState,
} from './foundations/traffic';
import { lorentzFactor } from './foundations/relativity';
import { linearObservation } from './foundations/linear';
export const TOPICS = [
  'neural',
  'rocket',
  'attention',
  'traffic',
  'relativity',
] as const;
export type Topic = (typeof TOPICS)[number];
export type Param = number | string | boolean;
export type Params = Record<string, Param>;
export interface Sample {
  t: number;
  a: number;
  b: number;
}
export interface Simulation {
  version: 1;
  id: Topic;
  params: Params;
  time: number;
  data: { neural?: NeuralState; rocket?: RocketState; traffic?: TrafficState };
  history: Sample[];
  running: boolean;
}
export interface ParamSpec {
  label: string;
  default: Param;
  min?: number;
  max?: number;
  step?: number;
  options?: string[];
}
export const specs: Record<Topic, Record<string, ParamSpec>> = {
  neural: {
    model: {
      label: 'Model',
      default: 'network',
      options: ['linear', 'network'],
    },
    weight: {
      label: 'Connection weight',
      default: 0.5,
      min: -10,
      max: 10,
      step: 0.01,
    },
    x1: { label: 'Input x₁', default: 1, min: -5, max: 5, step: 0.1 },
    x2: { label: 'Input x₂', default: 0.5, min: -5, max: 5, step: 0.1 },
    target: { label: 'Target', default: 1, min: -5, max: 5, step: 0.1 },
    learningRate: {
      label: 'Learning rate',
      default: 0.03,
      min: 0.001,
      max: 0.3,
      step: 0.001,
    },
  },
  rocket: {
    dryMass: {
      label: 'Dry mass · kg',
      default: 1000,
      min: 100,
      max: 10000,
      step: 100,
    },
    fuel: {
      label: 'Initial fuel · kg',
      default: 450,
      min: 0,
      max: 2000,
      step: 50,
    },
    throttle: { label: 'Thrust · %', default: 0.6, min: 0, max: 1, step: 0.01 },
    gravity: {
      label: 'Gravity · m/s²',
      default: 9.81,
      min: 0.1,
      max: 25,
      step: 0.01,
    },
    altitude: {
      label: 'Initial height · m',
      default: 120,
      min: 5,
      max: 2000,
      step: 5,
    },
  },
  attention: {
    tokens: { label: 'Token sequence', default: 'the cat chased the ball' },
    causal: { label: 'Causal mask', default: true },
    query: { label: 'Query token', default: 4, min: 0, max: 11, step: 1 },
  },
  traffic: {
    count: { label: 'Cars on ring', default: 20, min: 5, max: 45, step: 1 },
    desiredSpeed: {
      label: 'Desired speed · m/s',
      default: 22,
      min: 5,
      max: 35,
      step: 1,
    },
    headway: {
      label: 'Following time · s',
      default: 1.2,
      min: 0.5,
      max: 3,
      step: 0.1,
    },
  },
  relativity: {
    beta: {
      label: 'Speed · v/c',
      default: 0.8,
      min: 0,
      max: 0.999,
      step: 0.001,
    },
    duration: {
      label: 'Earth interval · s',
      default: 10,
      min: 1,
      max: 120,
      step: 1,
    },
    frame: {
      label: 'Reference frame',
      default: 'earth',
      options: ['earth', 'ship'],
    },
  },
};
export const topicInfo: Record<
  Topic,
  {
    title: string;
    kicker: string;
    question: string;
    disclosure: string;
    prompt: string;
  }
> = {
  neural: {
    title: 'How a network learns',
    kicker: '01 / NEURAL LEARNING',
    question: 'Can a mistake teach a machine?',
    disclosure:
      'One-weight linear model; optional 2 → 3 → 1 tanh network. Loss = ½(prediction − target)². One example does not demonstrate generalization.',
    prompt: 'What if the input becomes negative?',
  },
  rocket: {
    title: 'The last 120 metres',
    kicker: '02 / ROCKET LANDING',
    question: 'Can you slow down before touchdown?',
    disclosure:
      'Simplified vertical flight with changing fuel mass. No drag, attitude, or automatic guidance.',
    prompt: 'Double the mass and show how the landing changes.',
  },
  attention: {
    title: 'Where words look',
    kicker: '03 / TRANSFORMER ATTENTION',
    question: 'What does a word pay attention to?',
    disclosure:
      'Toy deterministic 4D embeddings, Q = K = V. Unknown words use hash vectors, not semantic embeddings. Not ChatGPT weights.',
    prompt: 'Replace the noun cat with dog; what changed?',
  },
  traffic: {
    title: 'A jam without a cause?',
    kicker: '04 / TRAFFIC WAVES',
    question: 'Why does traffic stop for no reason?',
    disclosure:
      'IDM on a 350 m one-lane ring. No lane changes. Acceleration and gap clamps keep the numerical model bounded.',
    prompt: 'Brake one car and point to the jam front.',
  },
  relativity: {
    title: 'Two clocks, one journey',
    kicker: '05 / SPECIAL RELATIVITY',
    question: 'Can two clocks disagree?',
    disclosure:
      'Inertial special relativity. No gravity, turnaround, or travel into the past. Spacetime axes use light-seconds.',
    prompt: 'At 0.99c, how much time passes?',
  },
};
export function isTopic(x: unknown): x is Topic {
  return TOPICS.includes(x as Topic);
}
export function validateParams(id: Topic, patch: unknown): Params {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch))
    throw Error('Parameters must be an object.');
  const result: Params = {};
  for (const [key, value] of Object.entries(patch)) {
    const spec = specs[id][key];
    if (!spec)
      throw Error(
        `Unsupported ${id} parameter: ${key}. Supported: ${Object.keys(specs[id]).join(', ')}.`,
      );
    if (typeof spec.default === 'number') {
      if (
        typeof value !== 'number' ||
        !Number.isFinite(value) ||
        value < spec.min! ||
        value > spec.max! ||
        (spec.step === 1 && !Number.isInteger(value))
      )
        throw Error(
          `${key} must be between ${spec.min} and ${spec.max}${spec.step === 1 ? ' and an integer' : ''}.`,
        );
    } else if (typeof value !== typeof spec.default)
      throw Error(`Invalid ${key}.`);
    if (spec.options && !spec.options.includes(value as string))
      throw Error(`Invalid ${key}.`);
    if (
      key === 'tokens' &&
      (typeof value !== 'string' ||
        value.length > 240 ||
        value.trim().split(/\s+/).length > 12 ||
        value
          .trim()
          .split(/\s+/)
          .some((t) => !t || t.length > 20))
    )
      throw Error('Use 1–12 tokens of at most 20 characters each.');
    result[key] = value;
  }
  return result;
}
export function initial(id: Topic, patch: Params = {}): Simulation {
  if (!isTopic(id)) throw Error('Unknown topic.');
  const params = {
    ...Object.fromEntries(
      Object.entries(specs[id]).map(([k, s]) => [k, s.default]),
    ),
    ...validateParams(id, patch),
  };
  if (id === 'attention')
    params.query = Math.min(
      +params.query,
      String(params.tokens).trim().split(/\s+/).length - 1,
    );
  const data: Simulation['data'] = {};
  if (id === 'neural')
    data.neural = createNeural([+params.x1, +params.x2], +params.target);
  if (id === 'rocket')
    data.rocket = {
      ...createRocket(),
      altitude: +params.altitude,
      fuelMass: +params.fuel,
      thrustFraction: +params.throttle,
    };
  if (id === 'traffic') data.traffic = createTraffic(+params.count);
  return { version: 1, id, params, time: 0, data, history: [], running: false };
}
export function setParams(s: Simulation, patch: Params): Simulation {
  const params = { ...s.params, ...validateParams(s.id, patch) };
  let next = { ...s, params, data: { ...s.data } };
  if (s.id === 'neural')
    next.data.neural = {
      ...s.data.neural!,
      input: [+params.x1, +params.x2],
      target: +params.target,
    };
  if (s.id === 'rocket')
    next.data.rocket =
      'fuel' in patch || 'altitude' in patch
        ? initial('rocket', params).data.rocket
        : { ...s.data.rocket!, thrustFraction: +params.throttle };
  if (s.id === 'traffic' && 'count' in patch) next = initial('traffic', params);
  if (s.id === 'attention')
    params.query = Math.min(
      +params.query,
      String(params.tokens).trim().split(/\s+/).length - 1,
    );
  return next;
}
export function attentionOf(s: Simulation) {
  return attention(
    String(s.params.tokens).trim().split(/\s+/),
    !!s.params.causal,
  );
}
function trafficParams(s: Simulation) {
  return {
    ...defaultTrafficParams,
    desiredSpeed: +s.params.desiredSpeed,
    timeHeadway: +s.params.headway,
  };
}
export function step(s: Simulation, dt: number): Simulation {
  if (!Number.isFinite(dt) || dt <= 0 || dt > 60)
    throw Error('Step must be > 0 and ≤ 60 seconds.');
  const start = observe(s);
  let next = {
    ...s,
    params: { ...s.params },
    data: { ...s.data },
    history: s.history.length
      ? [...s.history]
      : [
          {
            t: s.time,
            a: s.id === 'relativity' ? s.time : Number(start.primary),
            b:
              s.id === 'relativity'
                ? Number(start.shipClock)
                : Number(start.secondary),
          },
        ],
  };
  const sample = () => {
    const o = observe(next);
    next.history.push({
      t: next.time,
      a: s.id === 'relativity' ? next.time : Number(o.primary),
      b: s.id === 'relativity' ? Number(o.shipClock) : Number(o.secondary),
    });
  };
  let left = dt;
  while (left > 1e-9) {
    const h = Math.min(left, s.id === 'rocket' ? 1 / 120 : 1 / 60);
    left -= h;
    if (s.id === 'neural') {
      if (s.params.model === 'linear') {
        const f = linearObservation(
          +next.params.x1,
          +next.params.weight,
          +next.params.target,
        );
        next.params.weight = Math.max(
          -10,
          Math.min(
            10,
            +next.params.weight - +s.params.learningRate * f.gradient,
          ),
        );
        next.data.neural = {
          ...next.data.neural!,
          steps: next.data.neural!.steps + 1,
        };
      } else
        next.data.neural = trainNeural(
          next.data.neural!,
          +s.params.learningRate,
        );
    }
    if (s.id === 'rocket')
      next.data.rocket = rocketStep(
        {
          ...defaultRocketParams,
          dryMass: +s.params.dryMass,
          gravity: +s.params.gravity,
        },
        next.data.rocket!,
        h,
      );
    if (s.id === 'traffic')
      next.data.traffic = trafficStep(trafficParams(s), next.data.traffic!, h);
    next.time += h;
    if (s.id === 'rocket' && next.data.rocket!.status !== 'flying') {
      next.time = next.data.rocket!.time;
      left = 0;
    }
    if (next.time - (next.history.at(-1)?.t ?? -Infinity) >= 0.1 - 1e-8)
      sample();
  }
  if (next.history.at(-1)?.t !== next.time) sample();
  next.history = next.history.slice(-180);
  const inv = invariants(next);
  if (!inv.ok) throw Error(inv.violations.join('; '));
  return next;
}
export function brake(s: Simulation): Simulation {
  if (s.id !== 'traffic') throw Error('Braking only applies to traffic.');
  return { ...s, data: { traffic: tapBrakes(s.data.traffic!, 'car_0', 1) } };
}
export function trafficFront(s: Simulation) {
  const cars = [...s.data.traffic!.cars].sort(
    (a, b) => a.position - b.position,
  );
  const candidates = cars.map((car, i) => ({
    car,
    gradient: cars[(i + 1) % cars.length].speed - car.speed,
  }));
  const edge = candidates.reduce((a, b) => (b.gradient > a.gradient ? b : a));
  const exists =
    Math.min(...cars.map((c) => c.speed)) <
      Number(s.params.desiredSpeed) * 0.4 && edge.gradient > 1;
  return { car: edge.car, gradient: edge.gradient, exists };
}
export function observe(
  s: Simulation,
): Record<string, number | string | boolean> {
  if (s.id === 'neural') {
    const f =
      s.params.model === 'linear'
        ? linearObservation(+s.params.x1, +s.params.weight, +s.params.target)
        : neuralForward(s.data.neural!);
    return {
      primary: f.loss,
      secondary: f.prediction,
      loss: f.loss,
      prediction: f.prediction,
      target: +s.params.target,
      steps: s.data.neural!.steps,
      x1: +s.params.x1,
      x2: +s.params.x2,
      learningRate: +s.params.learningRate,
      model: String(s.params.model),
      weight: +s.params.weight,
      gradient: 'gradient' in f ? Number(f.gradient) : 0,
    };
  }
  if (s.id === 'rocket') {
    const r = s.data.rocket!,
      mass = +s.params.dryMass + r.fuelMass;
    return {
      primary: r.altitude,
      secondary: r.velocity,
      altitude: r.altitude,
      velocity: r.velocity,
      fuel: r.fuelMass,
      mass,
      thrust: r.fuelMass > 0 ? 24000 * +s.params.throttle : 0,
      acceleration:
        (r.fuelMass > 0 ? 24000 * +s.params.throttle : 0) / mass -
        +s.params.gravity,
      status: r.status,
      flightTime: r.time,
    };
  }
  if (s.id === 'attention') {
    const a = attentionOf(s),
      q = Math.min(+s.params.query, a.tokens.length - 1);
    return {
      primary: Math.max(...a.weights[q]),
      secondary: q,
      query: a.tokens[q],
      rowSum: a.weights[q].reduce((a, b) => a + b, 0),
      strongestToken: a.tokens[a.weights[q].indexOf(Math.max(...a.weights[q]))],
      context: JSON.stringify(a.contexts[q]),
      weights: JSON.stringify(a.weights),
      queries: JSON.stringify(a.queries),
      keys: JSON.stringify(a.keys),
      values: JSON.stringify(a.values),
      causal: !!s.params.causal,
    };
  }
  if (s.id === 'traffic') {
    const cars = s.data.traffic!.cars,
      slowest = [...cars].sort((a, b) => a.speed - b.speed)[0],
      speeds = cars.map((c) => c.speed),
      mean = speeds.reduce((a, b) => a + b, 0) / cars.length;
    const front = trafficFront(s);
    return {
      jamFrontCar: front.car.id,
      jamFrontPosition: front.car.position,
      jamFrontExists: front.exists,
      jamFrontGradient: front.gradient,
      primary: mean,
      secondary: slowest.speed,
      meanSpeed: mean,
      minSpeed: slowest.speed,
      maxSpeed: Math.max(...speeds),
      density: (cars.length / 350) * 1000,
      slowestCar: slowest.id,
      slowestPosition: slowest.position,
      speedSpread: Math.max(...speeds) - slowest.speed,
      elapsed: s.time,
      headway: +s.params.headway,
      desiredSpeed: +s.params.desiredSpeed,
    };
  }
  const gamma = lorentzFactor(+s.params.beta),
    duration = +s.params.duration;
  return {
    primary: gamma,
    secondary: duration / gamma,
    gamma,
    beta: +s.params.beta,
    earthSeconds: duration,
    shipSeconds: duration / gamma,
    properInterval: duration / gamma,
    earthClock: s.time,
    shipClock: s.time / gamma,
    frame: String(s.params.frame),
  };
}
export function invariants(s: Simulation): {
  ok: boolean;
  violations: string[];
} {
  const violations: string[] = [];
  const visit = (v: unknown) => {
    if (typeof v === 'number' && !Number.isFinite(v))
      violations.push('Non-finite numerical state');
    else if (v && typeof v === 'object') Object.values(v).forEach(visit);
  };
  visit(s);
  if (
    s.data.rocket &&
    (s.data.rocket.altitude < 0 || s.data.rocket.fuelMass < 0)
  )
    violations.push('Rocket below ground or negative fuel');
  if (
    s.data.traffic?.cars.some(
      (c) =>
        c.position < 0 || c.position >= 350 || c.speed < 0 || c.speed > 100,
    )
  )
    violations.push('Traffic out of bounds');
  return { ok: !violations.length, violations };
}
/** Validate untrusted persisted/API snapshots structurally, not just a type assertion. */
export function restore(raw: unknown): Simulation {
  if (!raw || typeof raw !== 'object' || JSON.stringify(raw).length > 100000)
    throw Error('Invalid snapshot.');
  const s = raw as Simulation;
  if (s.version !== 1 || !isTopic(s.id)) throw Error('Unsupported snapshot.');
  const base = initial(s.id, validateParams(s.id, s.params));
  if (
    !Number.isFinite(s.time) ||
    s.time < 0 ||
    s.time > 1e6 ||
    !Array.isArray(s.history) ||
    s.history.length > 180 ||
    s.history.some((p) => !p || ![p.t, p.a, p.b].every(Number.isFinite))
  )
    throw Error('Invalid simulation history.');
  function shape(template: unknown, value: unknown): boolean {
    if (typeof template === 'number')
      return (
        typeof value === 'number' &&
        Number.isFinite(value) &&
        Math.abs(value) < 1e12
      );
    if (typeof template === 'string')
      return typeof value === 'string' && value.length < 100;
    if (Array.isArray(template))
      return (
        Array.isArray(value) &&
        template.length === value.length &&
        template.every((t, i) => shape(t, value[i]))
      );
    if (template && typeof template === 'object')
      return (
        !!value &&
        typeof value === 'object' &&
        Object.entries(template).every(([k, v]) =>
          shape(v, (value as Record<string, unknown>)[k]),
        )
      );
    return template === value;
  }
  if (!shape(base.data, s.data)) throw Error('Invalid model state.');
  if (
    s.id === 'rocket' &&
    !['flying', 'landed', 'crashed'].includes(s.data.rocket!.status)
  )
    throw Error('Invalid flight status.');
  if (s.id === 'traffic') {
    const ids = new Set(s.data.traffic!.cars.map((c) => c.id));
    if (
      ids.size !== +s.params.count ||
      Array.from({ length: +s.params.count }, (_, i) => `car_${i}`).some(
        (id) => !ids.has(id),
      )
    )
      throw Error('Invalid car IDs.');
  }
  if (
    s.id === 'neural' &&
    (s.data.neural!.input[0] !== +s.params.x1 ||
      s.data.neural!.input[1] !== +s.params.x2 ||
      s.data.neural!.target !== +s.params.target)
  )
    throw Error('Neural inputs do not match parameters.');
  if (s.id === 'rocket' && s.data.rocket!.thrustFraction !== +s.params.throttle)
    throw Error('Rocket throttle mismatch.');
  const inv = invariants(s);
  if (!inv.ok) throw Error(inv.violations.join('; '));
  return {
    ...base,
    data: structuredClone(s.data),
    time: s.time,
    history: structuredClone(s.history),
    running: false,
  };
}
export function namedAnchors(s: Simulation): string[] {
  return {
    neural:
      s.params.model === 'linear'
        ? ['input-0', 'prediction', 'loss', 'weight', 'target']
        : [
            'input-0',
            'input-1',
            'hidden-0',
            'hidden-1',
            'hidden-2',
            'prediction',
            'loss',
            'target',
          ],
    rocket: ['rocket', 'fuel', 'ground', 'altitude', 'velocity'],
    attention: [
      'attention-matrix',
      'context',
      ...attentionOf(
        initial('attention', s.id === 'attention' ? s.params : {}),
      ).tokens.map((_, i) => `token-${i}`),
    ],
    traffic: [
      'ring',
      'jam-front',
      ...(s.data.traffic?.cars ?? []).map((c) => c.id),
    ],
    relativity: [
      'earth-clock',
      'ship-clock',
      'worldline',
      'light-cone',
      'gamma',
    ],
  }[s.id];
}
export type SimTool =
  | 'sim_set_params'
  | 'sim_run'
  | 'sim_pause'
  | 'sim_step'
  | 'sim_observe'
  | 'sim_experiment'
  | 'sim_reset'
  | 'sim_restore'
  | 'sim_brake'
  | 'sim_scale_mass';
export function execute(
  s: Simulation,
  tool: SimTool,
  args: Record<string, unknown> = {},
): {
  state: Simulation;
  observation: ReturnType<typeof observe>;
  before: ReturnType<typeof observe>;
  baseline?: ReturnType<typeof observe>;
} {
  const before = observe(s);
  let state = s;
  let baseline: ReturnType<typeof observe> | undefined;
  switch (tool) {
    case 'sim_set_params':
      state = setParams(s, args.patch as Params);
      break;
    case 'sim_run':
      state = { ...s, running: true };
      break;
    case 'sim_pause':
      state = { ...s, running: false };
      break;
    case 'sim_step':
      state = step(s, args.seconds === undefined ? 0.25 : Number(args.seconds));
      break;
    case 'sim_observe':
      break;
    case 'sim_experiment':
      baseline = observe(step(s, Number(args.seconds ?? 2)));
      state = setParams(s, (args.patch ?? {}) as Params);
      if (args.brake === true) state = brake(state);
      state = step(state, Number(args.seconds ?? 2));
      break;
    case 'sim_scale_mass':
      if (
        s.id !== 'rocket' ||
        typeof args.factor !== 'number' ||
        !Number.isFinite(args.factor) ||
        args.factor <= 0
      )
        throw Error(
          'Mass scaling needs a rocket and a positive finite factor.',
        );
      state = setParams(s, {
        dryMass:
          (+s.params.dryMass + s.data.rocket!.fuelMass) * args.factor -
          s.data.rocket!.fuelMass,
      });
      break;
    case 'sim_brake':
      state = brake(s);
      break;
    case 'sim_reset':
      state = initial(s.id, s.params);
      break;
    case 'sim_restore':
      state = restore(args.snapshot);
      if (state.id !== s.id) throw Error('Snapshot belongs to another topic.');
      break;
    default:
      throw Error('Unknown simulation tool.');
  }
  return {
    state,
    observation: observe(state),
    before,
    ...(baseline ? { baseline } : {}),
  };
}
