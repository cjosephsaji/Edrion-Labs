import {
  attentionOf,
  execute,
  observe,
  setParams,
  step,
  type Simulation,
  type Topic,
} from '../simulations/runtime';
import { makeBeat, type TeachingBeat } from './teaching';

interface Question {
  id: string;
  question: string;
  aliases: string[];
}
export const preparedQuestions: Record<Topic, Question[]> = {
  neural: [
    {
      id: 'negative',
      question: 'What if the input becomes negative?',
      aliases: [
        'what happens with a negative input',
        'make the input negative',
      ],
    },
    {
      id: 'loss',
      question: 'What is loss?',
      aliases: [
        'explain loss',
        'what does loss mean',
        'show the maths',
        'show the math',
      ],
    },
    {
      id: 'train',
      question: 'Show me one training step.',
      aliases: [
        'how does a weight learn',
        'how does training work',
        'train one step',
      ],
    },
    {
      id: 'rate',
      question: 'What does the learning rate do?',
      aliases: ['what is the learning rate', 'explain learning rate'],
    },
  ],
  rocket: [
    {
      id: 'mass',
      question: 'Double the mass and show how the landing changes.',
      aliases: ['double the mass', 'what if the rocket is twice as heavy'],
    },
    {
      id: 'fall',
      question: 'Why is it falling with the engine on?',
      aliases: [
        'how can the rocket be falling while its acceleration is upward',
        'how can the rocket be falling while its acceleration is upward show me using the current numbers',
        'why is the rocket still falling',
        'show the maths',
        'show the math',
      ],
    },
    {
      id: 'landing',
      question: 'Is maximum thrust always safer?',
      aliases: [
        'how do i land safely',
        'how do you land the rocket',
        'why not use full thrust',
      ],
    },
    {
      id: 'fuel',
      question: 'What happens when fuel runs out?',
      aliases: ['what does fuel do', 'what if there is no fuel'],
    },
  ],
  attention: [
    {
      id: 'replace',
      question: 'Replace the noun cat with dog; what changed?',
      aliases: ['replace cat with dog', 'change cat to dog'],
    },
    {
      id: 'weights',
      question: 'What do the attention weights mean?',
      aliases: [
        'what is attention',
        'explain attention',
        'what do the beams mean',
      ],
    },
    {
      id: 'mask',
      question: 'Why can’t the first word see later words?',
      aliases: [
        'what is a causal mask',
        'explain the causal mask',
        'why can the first word not use ball with the causal mask on show the difference when you remove it',
      ],
    },
    {
      id: 'qkv',
      question: 'What are Q, K and V?',
      aliases: [
        'what are q k v',
        'explain qkv',
        'show the maths',
        'show the math',
      ],
    },
  ],
  traffic: [
    {
      id: 'brake',
      question: 'Brake one car and point to the jam front.',
      aliases: ['brake one car', 'show a traffic wave', 'show the jam front'],
    },
    {
      id: 'wave',
      question: 'Why does the wave move backward?',
      aliases: [
        'why does traffic move backwards',
        'why does a traffic jam move backward',
        'explain traffic waves',
      ],
    },
    {
      id: 'gap',
      question: 'What if everyone follows more closely?',
      aliases: [
        'what happens if everyone follows more closely',
        'reduce the following time',
      ],
    },
    {
      id: 'road',
      question: 'Can a jam happen on a clear road?',
      aliases: [
        'why does traffic stop for no reason',
        'is the road blocked',
        'why is there a traffic jam',
      ],
    },
  ],
  relativity: [
    {
      id: 'speed',
      question: 'At 0.99c, how much time passes?',
      aliases: ['what happens at 0.99c', 'set speed to 0.99c'],
    },
    {
      id: 'clock',
      question: 'Why does the moving clock tick slower?',
      aliases: [
        'what is time dilation',
        'explain time dilation',
        'why does time slow down',
        'show the maths',
        'show the math',
      ],
    },
    {
      id: 'light',
      question: 'Can the ship reach the speed of light?',
      aliases: [
        'what happens at the speed of light',
        'can we go faster than light',
      ],
    },
    {
      id: 'frame',
      question: 'Which clock is really slower?',
      aliases: [
        'what if i switch reference frames',
        'what does reference frame mean',
        'is one clock broken',
      ],
    },
  ],
};
const normalize = (s: string) =>
  s
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9.]+/g, ' ')
    .trim()
    .replace(/[. ]+$/, '');
export function matchPreparedQuestion(topic: Topic, question: string) {
  const q = normalize(question);
  if (
    [
      'i dont understand',
      'explain simply',
      'explain it simply',
      'help me understand',
    ].includes(q)
  )
    return preparedQuestions[topic][1];
  return (
    preparedQuestions[topic].find((item) =>
      [item.question, ...item.aliases].some((s) => normalize(s) === q),
    ) ?? null
  );
}
const f = (v: unknown, digits = 2) => Number(v).toFixed(digits);
export interface PreparedAnswer {
  sim: Simulation;
  beat: TeachingBeat;
  questionId: string | null;
}

/** Authored explanations, with numbers and demonstrations from the preserved engines. No model call or learner assessment. */
export function preparedAnswer(
  question: string,
  source: Simulation,
): PreparedAnswer {
  const item = matchPreparedQuestion(source.id, question);
  let sim = { ...source, running: false },
    text: string,
    target: string | undefined;
  const before = observe(sim);
  if (!item) {
    text =
      'I don’t have a prepared answer for that question yet. Choose one of the prepared questions, or use the experiment controls to explore. Free-form answers will return when live AI is available.';
  } else if (sim.id === 'neural') {
    target = 'prediction';
    if (item.id === 'negative') {
      sim = setParams(sim, { x1: -Math.max(1, Math.abs(+sim.params.x1)) });
      const o = observe(sim);
      text =
        sim.params.model === 'linear'
          ? `I made the input negative. Prediction = input × weight = ${f(sim.params.x1)} × ${f(sim.params.weight)} = ${f(o.prediction)}. With a negative input, increasing the weight lowers the prediction. Whether that helps depends on the target, currently ${f(o.target)}. Loss is now ${f(o.loss)}.`
          : `I made input x₁ negative; the network now predicts ${f(o.prediction)} with loss ${f(o.loss)}. This is the full tanh network, so several weights and nonlinear activations determine the result. A negative input alone does not determine the output’s sign.`;
    } else if (item.id === 'train') {
      sim = step(sim, 1 / 60);
      const o = observe(sim);
      text = `One training step used the loss gradient to adjust ${sim.params.model === 'linear' ? 'the weight' : 'the network’s weights'}. Prediction changed from ${f(before.prediction)} to ${f(o.prediction)}; loss changed from ${f(before.loss)} to ${f(o.loss)}. The update subtracts learning rate × gradient. A step aims to reduce this example’s error; it does not prove the model will generalize.`;
    } else if (item.id === 'loss') {
      target = 'loss';
      text = `Loss measures the size of the mistake. Here it is ½ × (prediction − target)² = ½ × (${f(before.prediction)} − ${f(before.target)})² = ${f(before.loss)}. Zero means this prediction matches this target. Training uses the gradient to choose a direction for changing the weights.`;
    } else {
      target = sim.params.model === 'linear' ? 'weight' : 'loss';
      text = `The learning rate is the size of a training step: new weight = old weight − learning rate × gradient. Yours is ${f(sim.params.learningRate, 3)}. A larger value can learn faster, but can also overshoot or become unstable. A smaller value takes more, gentler steps. Compare the loss after a step rather than assuming a bigger rate is better.`;
    }
  } else if (sim.id === 'rocket') {
    target = 'rocket';
    if (item.id === 'mass') {
      if (2 * +before.mass - +before.fuel > 10000) {
        text =
          'Doubling the current total mass would exceed this model’s dry-mass limit of 10,000 kg. Reset the lesson or reduce the dry mass before trying again. For the same thrust, greater total mass means less upward acceleration.';
      } else {
        sim = execute(sim, 'sim_scale_mass', { factor: 2 }).state;
        const o = observe(sim);
        text = `I doubled total mass from ${f(before.mass, 0)} to ${f(o.mass, 0)} kg, keeping the remaining ${f(o.fuel, 0)} kg of fuel unchanged. At the same thrust, acceleration changes from ${f(before.acceleration)} to ${f(o.acceleration)} m/s². The rocket’s current velocity is still ${f(o.velocity)} m/s: changing mass does not instantly change its motion. Step or run the model to see the trajectory; this alone does not determine touchdown.`;
      }
    } else if (item.id === 'fall') {
      target = 'velocity';
      text = `Velocity tells us which way the rocket is moving; acceleration tells us how that velocity changes. Currently velocity is ${f(before.velocity)} m/s and acceleration is ${f(before.acceleration)} m/s². Thrust is ${f(before.thrust, 0)} N and gravity pulls with ${f(+before.mass * +sim.params.gravity, 0)} N. ${+before.velocity < 0 && +before.acceleration > 0 ? 'Right now the rocket is descending but slowing down.' : +before.velocity < 0 && +before.acceleration < 0 ? 'Right now it is falling faster because gravity exceeds thrust. Increase thrust in the controls to try braking the descent.' : 'Velocity can remain downward even while upward acceleration slows the descent.'} Acceleration = thrust / total mass − gravity.`;
    } else if (item.id === 'landing') {
      target = 'ground';
      text =
        'Maximum thrust is not an automatic safe landing. Too little braking causes a hard impact; too much too early can reverse the descent and waste fuel. A soft landing needs small downward velocity at the pad, with thrust timed to altitude, speed and changing mass. This simplified model counts touchdown at 2 m/s or less as a landing.';
    } else {
      target = 'fuel';
      text = `There are ${f(before.fuel, 1)} kg of fuel left. Burning fuel produces thrust and reduces total mass. Once fuel reaches zero, thrust becomes zero even if the throttle is on, and acceleration is −${f(sim.params.gravity)} m/s². This model omits air resistance, so only gravity then changes the rocket’s vertical velocity until impact.`;
    }
  } else if (sim.id === 'attention') {
    if (item.id === 'replace') {
      const tokens = String(sim.params.tokens).split(/\s+/);
      const index = tokens.findIndex((s) => s.toLowerCase() === 'cat');
      if (index < 0) {
        text =
          'There is no “cat” token in the current sentence, so I left it unchanged. Use the default sentence or edit the token sequence in Experiment controls, then try again. Replacing a word changes its toy embedding and recomputes attention.';
      } else {
        tokens[index] = 'dog';
        sim = setParams(sim, { tokens: tokens.join(' ') });
        const o = observe(sim);
        text = `I replaced only “cat” with “dog”. The selected query “${o.query}” now gives its largest share to “${o.strongestToken}”. The toy embedding changed, so the attention scores and mixed context were recomputed. Watch the beam weights; this deterministic toy uses Q = K = V and does not demonstrate real language understanding.`;
      }
      target = 'attention-matrix';
    } else if (item.id === 'mask') {
      sim = setParams(sim, { query: 0, causal: true });
      target = 'token-0';
      text = `I selected the first word, “${attentionOf(sim).tokens[0]}”, and enabled the causal mask. It can attend only to itself: its own weight is 1 and all later weights are 0. The mask blocks future tokens so a next-token model cannot peek ahead. Turn off Causal mask in Experiment controls to make later words eligible.`;
    } else if (item.id === 'weights') {
      target = 'attention-matrix';
      text = `Each beam is a share of information taken from another token. For the selected query “${before.query}”, the strongest share goes to “${before.strongestToken}”. Scores become nonnegative weights through softmax, and the row sums to ${f(before.rowSum)}. Thicker beams mean larger weights; the context is a weighted mixture of value vectors, not a guarantee of grammatical understanding.`;
    } else {
      target = 'context';
      text =
        'Q is a query: what this token looks for. K is a key: what another token can match. Their dot product, divided by √d, becomes a score. Softmax turns the allowed scores into weights. V is the value mixed using those weights. Here d = 4 and Q = K = V for a deliberately small deterministic example; real transformers learn separate projections.';
    }
  } else if (sim.id === 'traffic') {
    target = 'ring';
    if (item.id === 'brake' || item.id === 'gap') {
      const headway =
        item.id === 'gap'
          ? Math.max(0.5, +sim.params.headway - 0.3)
          : +sim.params.headway;
      sim = execute(sim, 'sim_experiment', {
        patch: { headway },
        brake: true,
        seconds: 2,
      }).state;
      const o = observe(sim);
      target = o.jamFrontExists ? 'jam-front' : 'ring';
      text = `${item.id === 'gap' ? `I set following time from ${f(before.headway, 1)} to ${f(headway, 1)} seconds and` : 'I'} braked one car, then advanced the engine for 2 seconds. Mean speed is ${f(o.meanSpeed)} m/s; the slowest car moves at ${f(o.minSpeed)} m/s. ${o.jamFrontExists ? `The highlighted jam front is the slow-to-fast boundary near ${o.jamFrontCar}, not necessarily the slowest car.` : 'There is no strong jam-front boundary in this state yet; run the model to follow what happens.'} Drivers react to the car ahead, passing the slowdown backward through the line.`;
    } else if (item.id === 'wave') {
      text =
        'The cars move forward, but the slowdown passes to successive cars behind them. Each driver brakes after the driver ahead slows; the next driver then does the same. Follow the slow patch on the speed ribbon rather than one car. The wave and the vehicles can travel in opposite directions. Its strength and persistence depend on spacing, density and the model’s parameters.';
    } else {
      text = `Yes. A brief brake can trigger a chain of reactions even with no obstacle. This road is a closed, one-lane ring with ${sim.params.count} cars and no junction or lane changes. Each car reacts to its gap and relative speed. A disturbance may fade or develop into a stop-and-go wave; a jam is not guaranteed at every density or following time.`;
    }
  } else {
    target = 'ship-clock';
    if (item.id === 'speed') {
      sim = setParams(sim, { beta: 0.99, frame: 'earth' });
      const o = observe(sim);
      text = `I set the speed to 0.99c in the Earth frame. γ = 1 / √(1 − 0.99²) = ${f(o.gamma, 3)}. Over the selected ${f(o.earthSeconds)} seconds on Earth, the ship accumulates ${f(o.shipSeconds)} seconds of proper time. Those are the selected interval totals, not extra elapsed animation ticks. The ship’s own clock runs normally for someone aboard.`;
    } else if (item.id === 'clock') {
      const o = observe(sim);
      text = `In the Earth frame, light in a moving light-clock takes a longer diagonal path between its mirrors. Light’s speed is still c, so more Earth time passes between ticks. At ${f(sim.params.beta, 3)}c, γ is ${f(o.gamma, 3)}: an Earth interval of ${f(o.earthSeconds)} seconds corresponds to ${f(o.shipSeconds)} seconds aboard. The ship observer does not feel their own time slowing.`;
    } else if (item.id === 'light') {
      target = 'light-cone';
      text =
        'A massive ship cannot reach or exceed c in special relativity. As its speed approaches c, γ = 1 / √(1 − v²/c²) grows without bound, and so does the energy needed to keep accelerating it. This model allows speeds below c only. Time dilation here is not travel into the past.';
    } else {
      target = 'worldline';
      text =
        'Neither clock is broken. For two inertial observers, each can describe the other’s moving clock as ticking more slowly; they compare different sets of simultaneous events. The selected journey interval is defined in the Earth frame. Switching the frame changes coordinates, not the ship’s accumulated proper time for those same events. Reuniting the clocks requires a turnaround, which this model does not include.';
    }
  }
  return {
    sim,
    beat: makeBeat(sim, 'EXPLORE', text, target),
    questionId: item?.id ?? null,
  };
}
