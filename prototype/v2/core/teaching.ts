import {
  initial,
  observe,
  step,
  setParams,
  brake,
  execute,
  attentionOf,
  type Topic,
  type Simulation,
  type SimTool,
  type Params,
} from '../simulations/runtime';
import type { TeachingCommand } from './scene-ir';
export type TeachingPhase =
  | 'ORIENT'
  | 'EXPLAIN'
  | 'DEMONSTRATE'
  | 'PREDICT'
  | 'OBSERVE_RESPONSE'
  | 'RETEACH_OR_EXTEND'
  | 'TRANSFER_CHECK'
  | 'EXPLORE';
export interface TeachingBeat {
  id: string;
  topicId: Topic;
  teachingMove: TeachingPhase;
  say: string;
  caption: string;
  visualCommands: TeachingCommand[];
  evidence: { engineId: Topic; observationId: string };
  awaitStudent: boolean;
  allowedInputs: ('voice' | 'text' | 'select' | 'slider')[];
  interruptionPolicy: 'pause-and-resume';
}
export interface GuidedState {
  started: boolean;
  phase: TeachingPhase;
  openingIndex: number;
  beatId: string;
  answer: string;
  transferAnswer: string;
  representation: 'scene' | 'compare' | 'math';
}
export const freshGuide = (): GuidedState => ({
  started: false,
  phase: 'ORIENT',
  openingIndex: 0,
  beatId: '',
  answer: '',
  transferAnswer: '',
  representation: 'scene',
});
export const goals: Record<Topic, string> = {
  neural: 'Explain how changing one weight can reduce a prediction error.',
  rocket:
    'Discover why a safe landing needs the right thrust at the right time.',
  attention: 'Follow how a word mixes information from its context.',
  traffic: 'Trace how one brief brake becomes a wave of slowing cars.',
  relativity: 'Compare the time measured on Earth and on a moving ship.',
};
export const hooks: Record<Topic, string> = {
  neural:
    'Our model wants to predict 4, but right now it predicts 1. Let’s find out why.',
  rocket:
    'This rocket is 120 metres above its pad, falling at 12 metres per second. Can we bring it home gently?',
  attention:
    'Look at “the cat chased the ball”. Which earlier words will “ball” draw information from? Let’s follow the connections.',
  traffic:
    'Watch this one car brake briefly. Can a jam appear even though the road is clear?',
  relativity:
    'Imagine the ship travels very fast. Will its clock tick the same amount as the clock on Earth?',
};
export function lessonModel(id: Topic) {
  return initial(
    id,
    id === 'neural'
      ? { model: 'linear', x1: 2, target: 4, learningRate: 0.1, weight: 0.5 }
      : {},
  );
}
const f = (v: unknown, d = 2) => Number(v).toFixed(d);
const mainTarget: Record<Topic, string> = {
  neural: 'weight',
  rocket: 'rocket',
  attention: 'token-4',
  traffic: 'car_0',
  relativity: 'ship-clock',
};
export function makeBeat(
  sim: Simulation,
  phase: TeachingPhase,
  say: string,
  target = mainTarget[sim.id],
  comparison?: string[],
): TeachingBeat {
  if (
    sim.id === 'neural' &&
    sim.params.model !== 'linear' &&
    target === 'weight'
  )
    target = 'prediction';
  if (sim.id === 'attention' && target.startsWith('token-'))
    target = `token-${Math.min(+sim.params.query, attentionOf(sim).tokens.length - 1)}`;
  const sceneId = `guided-${sim.id}`;
  const commands: TeachingCommand[] = [
    { op: 'create_scene', sceneId, layout: comparison ? 'compare' : 'flow' },
  ];
  if (comparison)
    comparison.forEach((content, i) =>
      commands.push({
        op: 'add',
        sceneId,
        object: {
          id: `explain-${i}`,
          kind: 'equation',
          content: content.slice(0, 80),
        },
      }),
    );
  if (comparison && comparison.length > 1)
    commands.push({
      op: 'connect',
      fromId: 'explain-0',
      toId: 'explain-1',
      relation: 'causes',
    });
  commands.push(
    { op: 'focus_target', targetId: target },
    { op: 'highlight', targetId: target, mode: 'circle' },
  );
  return {
    id: `${sim.id}-${phase}-${sim.time}-${say.length}`,
    topicId: sim.id,
    teachingMove: phase,
    say,
    caption: say,
    visualCommands: commands,
    evidence: { engineId: sim.id, observationId: JSON.stringify(observe(sim)) },
    awaitStudent: [
      'PREDICT',
      'TRANSFER_CHECK',
      'EXPLORE',
      'RETEACH_OR_EXTEND',
    ].includes(phase),
    allowedInputs: ['voice', 'text', 'select', 'slider'],
    interruptionPolicy: 'pause-and-resume',
  };
}
export function opening(
  sim: Simulation,
  index: number,
): { sim: Simulation; beat: TeachingBeat } {
  const id = sim.id,
    o = observe(sim);
  if (index === 0) {
    const state = id === 'traffic' ? brake(step(sim, 15)) : sim;
    return { sim: state, beat: makeBeat(state, 'ORIENT', hooks[id]) };
  }
  if (index === 1) {
    const text: Record<Topic, string> = {
      neural: `Follow the line: input ${f(sim.params.x1, 0)} times weight ${f(sim.params.weight)} gives ${f(o.prediction)}. The target is ${f(o.target, 0)}. Our half squared error is ${f(o.loss)}. The weight controls this prediction.`,
      rocket: `The arrow down is gravity: ${f(+o.mass * +sim.params.gravity, 0)} newtons. The arrow up is thrust: ${f(o.thrust, 0)} newtons. Their difference changes velocity, not position instantly.`,
      attention:
        'The gold word is our query. Each curved connection carries a computed share of information from a key word. These are toy vectors, with Q equal to K and V; this is not a view inside ChatGPT.',
      traffic:
        'Cars travel around this clear, one-lane road. Gold marks our lead car. Each driver reacts to the gap and speed of the car ahead. That reaction can pass a slowdown backward.',
      relativity: `In Earth’s frame, the ship travels at ${f(sim.params.beta)} times light speed. Compare a ${f(o.earthSeconds, 0)} second Earth interval with ${f(o.shipSeconds)} seconds of ship proper time. We assume constant velocity, with no turnaround.`,
    };
    return {
      sim,
      beat: makeBeat(
        sim,
        'EXPLAIN',
        text[id],
        id === 'neural' ? 'input-0' : mainTarget[id],
      ),
    };
  }
  if (index === 2) {
    let next = sim;
    if (id === 'neural') next = step(sim, 1 / 60);
    if (id === 'rocket') next = step(sim, 1);
    if (id === 'traffic') next = step(brake(step(sim, 15)), 1.5);
    if (id === 'relativity') next = step(sim, +sim.params.duration);
    const n = observe(next);
    const text: Record<Topic, string> = {
      neural: `One actual gradient step changes the weight to ${f(next.params.weight)}. The prediction is now ${f(n.prediction)}, and loss falls from ${f(o.loss)} to ${f(n.loss)}. We used the error to choose a direction.`,
      rocket: `After one computed second at ${f(+sim.params.throttle * 100, 0)} percent thrust, altitude is ${f(n.altitude, 1)} metres and velocity is ${f(n.velocity, 1)} metres per second. Upward acceleration can coexist with downward motion.`,
      attention: `For “${o.query}”, the strongest connection is “${o.strongestToken}”. Every share is recomputed by softmax, and the row adds to ${f(o.rowSum, 0)}. A word can attend to itself; this toy is not a grammatical explanation.`,
      traffic: `After braking, the slowest speed is ${f(n.minSpeed, 1)} metres per second. Watch the gold car and its followers: the slowdown belongs to different cars over time. It is a pattern, not a vehicle.`,
      relativity: `We have advanced the actual model by ${f(n.earthClock, 0)} Earth seconds. The ship clock reads ${f(n.shipClock)} seconds. Gamma is ${f(n.gamma, 4)}, so ship proper time equals Earth time divided by gamma.`,
    };
    return {
      sim: next,
      beat: makeBeat(
        next,
        'DEMONSTRATE',
        text[id],
        id === 'traffic' ? 'jam-front' : mainTarget[id],
      ),
    };
  }
  return { sim, beat: makeBeat(sim, 'PREDICT', predictions[id].question) };
}
export const predictions: Record<
  Topic,
  { question: string; options: string[]; correct: number }
> = {
  neural: {
    question:
      'If I increase this positive weight a little, will the prediction get closer to 4 or farther away?',
    options: ['Closer to 4', 'Farther from 4'],
    correct: 0,
  },
  rocket: {
    question:
      'Will firing at full power all the time always give us a safer landing?',
    options: [
      'Yes, maximum thrust is always safer',
      'No, the timing matters too',
    ],
    correct: 1,
  },
  attention: {
    question:
      'With the causal mask on, can the first word use a word that comes later?',
    options: [
      'Yes, every word can use every other word',
      'No, future words are masked',
    ],
    correct: 1,
  },
  traffic: {
    question:
      'When drivers leave more following time, can that help absorb a small braking disturbance?',
    options: [
      'Yes, the extra room can help',
      'No, tighter gaps always absorb it better',
    ],
    correct: 0,
  },
  relativity: {
    question:
      'At 0.8c, if Earth measures 10 seconds, how much proper time passes on the ship?',
    options: ['6 seconds', '10 seconds'],
    correct: 0,
  },
};
export function rocketComparison() {
  const start = initial('rocket');
  const under = step(setParams(start, { throttle: 0 }), 20);
  const over = step(setParams(start, { throttle: 1 }), 10);
  let timed = start;
  for (let i = 0; i < 7200 && timed.data.rocket!.status === 'flying'; i++) {
    const r = timed.data.rocket!,
      desiredV = -Math.sqrt(1.6 * r.altitude + 1);
    const a = 4 * (desiredV - r.velocity);
    const throttle = Math.max(
      0,
      Math.min(1, ((a + 9.81) * (+timed.params.dryMass + r.fuelMass)) / 24000),
    );
    timed = step(setParams(timed, { throttle }), 1 / 120);
  }
  return { under, timed, over };
}
export function respond(sim: Simulation, choice: number) {
  const correct = choice === predictions[sim.id].correct;
  const before = observe(sim);
  let next = sim,
    explanation = '',
    compare: string[] = [];
  if (sim.id === 'neural') {
    next = setParams(sim, { weight: +sim.params.weight + 0.2 });
    const n = observe(next);
    explanation = `The engine gives ${f(n.prediction)} instead of ${f(before.prediction)}; loss changes from ${f(before.loss)} to ${f(n.loss)}. Multiplying a positive input by a larger weight raises the output. Here it moves toward 4.`;
    compare = [
      `${f(sim.params.x1)} × ${f(sim.params.weight)} = ${f(before.prediction)}`,
      `${f(next.params.x1)} × ${f(next.params.weight)} = ${f(n.prediction)}`,
    ];
  } else if (sim.id === 'rocket') {
    const c = rocketComparison(),
      u = observe(c.under),
      t = observe(c.timed),
      o = observe(c.over);
    next = c.timed;
    explanation = `No thrust hits at ${f(u.velocity, 1)} metres per second. The timed burn touches down at ${f(t.velocity, 1)}. Full power is still at ${f(o.altitude, 1)} metres after 10 seconds, moving ${f(o.velocity, 1)} metres per second. More thrust alone does not mean a gentle arrival.`;
    compare = [
      `No burn: ${f(u.velocity, 1)} m/s at impact`,
      `Timed burn: ${f(t.velocity, 1)} m/s at touchdown`,
      `Full burn: h=${f(o.altitude, 1)} m after 10 s`,
    ];
  } else if (sim.id === 'attention') {
    next = setParams(sim, { query: 0, causal: true });
    const a = attentionOf(next);
    explanation = `The first query has weight ${f(a.weights[0][0], 0)} on itself and zero on every later token. The mask sets future scores out of reach before softmax. Similarity cannot override it.`;
    compare = ['Unmasked past: scores → softmax', 'Masked future: share = 0'];
  } else if (sim.id === 'traffic') {
    const base = step(initial('traffic', sim.params), 40);
    const short = step(brake(base), 8),
      longer = step(brake(setParams(base, { headway: 2.4 })), 8);
    const a = observe(short),
      b = observe(longer);
    next = longer;
    explanation = `In the same eight-second test, the speed spread is ${f(a.speedSpread, 1)} metres per second with ${f(sim.params.headway, 1)} second following time and ${f(b.speedSpread, 1)} with 2.4 seconds. More room changes how braking spreads. It also changes mean speed; density and observation time matter.`;
    compare = [
      `${f(sim.params.headway, 1)} s gap: spread ${f(a.speedSpread, 1)} m/s`,
      `2.4 s gap: spread ${f(b.speedSpread, 1)} m/s`,
    ];
  } else {
    next = step(initial('relativity', { beta: 0.8, duration: 10 }), 10);
    const n = observe(next);
    explanation = `In Earth’s frame, gamma is ${f(n.gamma, 4)}. Ten divided by gamma is ${f(n.shipSeconds, 0)} seconds, not ten. The ship’s proper time is measured along its own path. This is not an absolute ranking of whose clock is slow.`;
    compare = [
      `Earth coordinate time: ${f(n.earthSeconds, 0)} s`,
      `Ship proper time: ${f(n.shipSeconds, 0)} s`,
    ];
  }
  const prefix = correct
    ? 'Your prediction matches this example. '
    : 'Let’s compare your prediction with the measured result. ';
  return {
    sim: next,
    correct,
    beat: makeBeat(
      next,
      'RETEACH_OR_EXTEND',
      prefix + explanation,
      mainTarget[sim.id],
      compare,
    ),
  };
}
export const transfers: Record<
  Topic,
  { question: string; options: string[]; correct: number; patch: Params }
> = {
  neural: {
    question:
      'A fresh example: input −2, weight 0.5, target 4. Would increasing the weight to 0.7 move the prediction closer to 4?',
    options: ['Closer', 'Farther away'],
    correct: 1,
    patch: { model: 'linear', x1: -2, weight: 0.5, target: 4 },
  },
  rocket: {
    question:
      'Keep the same thrust and double total mass. Will the initial upward acceleration be larger or smaller?',
    options: ['Larger', 'Smaller'],
    correct: 1,
    patch: {},
  },
  attention: {
    question:
      'Now query the second word with the mask on. How many words are eligible, including itself?',
    options: ['Two words', 'All five words'],
    correct: 0,
    patch: { query: 1, causal: true },
  },
  traffic: {
    question:
      'Imagine following the wave from above. Must the same car stay at its front?',
    options: [
      'Yes, it is one slow vehicle',
      'No, different cars enter and leave',
    ],
    correct: 1,
    patch: {},
  },
  relativity: {
    question:
      'A new speed: 0.99c, with the same 10 Earth seconds. Will the ship accumulate more or less than 6 seconds?',
    options: ['More than 6', 'Less than 6'],
    correct: 1,
    patch: { beta: 0.99, duration: 10 },
  },
};
export function transferSetup(sim: Simulation) {
  const t = transfers[sim.id];
  const next =
    sim.id === 'rocket' ? initial('rocket') : setParams(sim, t.patch);
  return { sim: next, beat: makeBeat(next, 'TRANSFER_CHECK', t.question) };
}
export function transferResult(sim: Simulation, choice: number) {
  const correct = choice === transfers[sim.id].correct;
  let next = sim;
  if (sim.id === 'neural') next = setParams(sim, { weight: 0.7 });
  if (sim.id === 'rocket')
    next = execute(sim, 'sim_scale_mass', { factor: 2 }).state;
  const o = observe(next);
  const text: Record<Topic, string> = {
    neural: `With a negative input, the larger weight makes the prediction ${f(o.prediction)}. It moves farther from positive 4. The direction depends on the input sign.`,
    rocket: `Total mass is now ${f(o.mass, 0)} kilograms and acceleration is ${f(o.acceleration)} metres per second squared. Thrust divided by mass is smaller, while gravity is unchanged.`,
    attention: `For query “${o.query}”, the first two words are eligible. All later weights are exactly zero. Eligibility comes from the mask, not which word sounds relevant.`,
    traffic:
      'A car can slow down, pass through the congested region and speed up again. The pattern moves between cars; follow the colored speed boundary while the vehicles move forward.',
    relativity: `At 0.99c, gamma is ${f(o.gamma, 4)} and ship proper time is ${f(o.shipSeconds)} seconds per 10 Earth seconds. Each inertial observer can describe the other clock as slow because they use different simultaneous events.`,
  };
  return {
    sim: next,
    correct,
    beat: makeBeat(
      next,
      'EXPLORE',
      (correct
        ? 'You applied the idea to a new case. '
        : 'Here is the useful difference in this new case. ') +
        text[sim.id] +
        ' What would you like to investigate next?',
    ),
  };
}
export function interpret(sim: Simulation, before: Simulation, tool: SimTool) {
  const o = observe(sim),
    b = observe(before);
  const texts: Record<Topic, string> = {
    neural: `The prediction is now ${f(o.prediction)} and half squared error is ${f(o.loss)} (previously ${f(b.loss)}). ${sim.params.model === 'linear' ? `Input ${f(sim.params.x1)} × weight ${f(sim.params.weight)} determines the output.` : 'The tanh network is active; its hidden units now determine the output.'}`,
    rocket: `At ${f(o.altitude, 1)} metres, velocity is ${f(o.velocity, 1)} metres per second and acceleration ${f(o.acceleration)} metres per second squared. Total mass is ${f(o.mass, 0)} kilograms. ${+o.acceleration > 0 && +o.velocity < 0 ? 'The ship is still descending while upward acceleration slows it.' : 'Compare the force arrows with the direction of motion.'}`,
    attention: `For query “${o.query}”, the strongest computed key is “${o.strongestToken}”; the weights add to ${f(o.rowSum, 0)}. ${sim.params.causal ? 'Future words remain masked.' : 'The causal mask is off, so later words are eligible.'}`,
    traffic: `Mean speed is ${f(o.meanSpeed, 1)} metres per second, the slowest car is at ${f(o.minSpeed, 1)}, and spread is ${f(o.speedSpread, 1)}. ${o.jamFrontExists ? 'The ring marks the measured slow-to-fast boundary.' : 'A strong congestion boundary is not present in this snapshot.'}`,
    relativity: `At ${f(sim.params.beta, 3)}c, gamma is ${f(o.gamma, 4)}. In Earth’s frame, ${f(o.earthSeconds, 0)} seconds corresponds to ${f(o.shipSeconds)} seconds of ship proper time for a constant-velocity interval.`,
  };
  return makeBeat(sim, 'EXPLORE', texts[sim.id]);
}
