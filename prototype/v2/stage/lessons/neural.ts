import { defineStageLesson, type StageState } from '../lesson';
import {
  format as f,
  numberLineRange,
  numberY,
  weightLimits,
  clamp,
} from '../logic';
const y = (s: StageState, v: number) => numberY(v, numberLineRange(s));
export const neuralLesson = defineStageLesson<StageState>({
  id: 'neural',
  shortTitle: 'Neural learning',
  nextLessons: [
    'Rocket landing',
    'Attention',
    'Traffic waves',
    'Time dilation',
  ],
  title: 'How a network learns',
  eyebrow: 'Lesson 01 · Neural learning',
  subtitle:
    'Guess an exam score from hours studied. Turn one weight. Watch the mistake shrink.',
  canvasDescription:
    'Neural learning Stage. Drag the weight dial to change it; drag the studio or use arrow keys to orbit. Use the question buttons to inspect each part.',
  abstractSubtitle:
    'One input × one weight. A guess, a target, and a way to learn from the gap.',
  story: {
    fallback: 'Signed example · abstract numbers',
    description: 'Hours studied → exam score',
    units: {
      'input-0': 'h',
      weight: 'pts/h',
      prediction: 'pts',
      target: 'pts',
    },
    enabled: (s: StageState) => s.input >= 0 && s.target >= 0,
  },
  bounds: { min: [-3.4, -0.35, -3.4], max: [3.55, 5, 3.4] },
  framePoints: [
    ...Array.from({ length: 16 }, (_, i): [number, number, number] => [
      Math.sin((i / 16) * Math.PI * 2) * 3.4,
      -0.35,
      Math.cos((i / 16) * Math.PI * 2) * 3.4,
    ]),
    [2.9, 5, 0],
    [-2.9, 1.9, 0],
  ],
  labelAvoidPoints: Array.from(
    { length: 32 },
    (_, i): [number, number, number] => [
      Math.sin((i / 16) * Math.PI * 2) * 3.4,
      i < 16 ? 0 : -0.35,
      Math.cos((i / 16) * Math.PI * 2) * 3.4,
    ],
  ),
  labels: [
    {
      id: 'input-0',
      anchorOffset: [0, 0.5, 0],
      title: 'Input',
      value: (s) => s.input,
      placement: 'above',
      offset: 105,
      sideOnFocus: true,
    },
    {
      id: 'weight',
      anchorOffset: [0, 0.15, 0],
      title: 'Weight',
      value: (s) => s.weight,
      placement: 'above',
      offset: 70,
    },
    {
      id: 'target',
      anchorOffset: [0.64, 0, 0],
      title: 'Target',
      value: (s) => s.target,
      placement: 'upper',
      opposite: 'prediction',
    },
    {
      id: 'prediction',
      anchorOffset: [0.44, 0, 0],
      title: 'Prediction',
      value: (s) => s.prediction,
      placement: 'lower',
      opposite: 'target',
    },
  ],
  ruler: {
    ticks: (s) => {
      const r = numberLineRange(s);
      return r.ticks.filter((v) => v === 0 || v % (r.step * 2) === 0);
    },
    anchor: (v, s) => [1.72, numberY(v, numberLineRange(s)), 0],
    visibleFor: ['number-line', 'prediction', 'target', 'loss'],
  },
  metric: {
    id: 'loss',
    name: 'Loss',
    value: (s) => s.loss,
    formula: (s) => `½ × (${f(s.prediction)} − ${f(s.target)})²`,
    history: (s) => s.history,
    status: (s) =>
      Math.abs(s.prediction - s.target) < 0.05
        ? 'on target'
        : Math.abs(s.prediction - s.target) < 1
          ? 'close'
          : 'far',
  },
  parameter: {
    id: 'weight',
    label: 'Weight',
    key: 'weight',
    step: 0.01,
    range: weightLimits,
    value: (s) => s.weight,
  },
  train: {
    id: 'train-step',
    label: 'Train one step',
    autoLabel: 'Auto-train',
    stopLabel: 'Stop training',
    action: { tool: 'sim_step', args: { seconds: 1 / 60 } },
  },
  solved: (s) => Math.abs(s.prediction - s.target) < 0.012,
  equation: ['prediction', '=', 'input', '×', 'weight'],
  demos: {
    weight: [
      {
        delay: 0,
        action: () => ({
          tool: 'sim_set_params',
          args: { patch: { weight: 0 } },
        }),
      },
      {
        delay: 1600,
        action: (s) => ({
          tool: 'sim_set_params',
          args: {
            patch: {
              weight: s.input === 0 ? 0 : clamp(s.target / s.input, -10, 10),
            },
          },
        }),
      },
    ],
    step: [
      {
        delay: 0,
        action: () => ({ tool: 'sim_step', args: { seconds: 1 / 60 } }),
      },
    ],
    decimals: [
      {
        delay: 0,
        message: (s) =>
          Number.isInteger(s.input)
            ? `${s.input} = ${s.input.toFixed(1)} = ${f(s.input)}`
            : `${s.input} = ${f(s.input)}`,
      },
    ],
    locked: [
      { delay: 0, message: () => '⌑ Input locked · it is a given fact' },
    ],
    loss: [
      {
        delay: 0,
        message: () =>
          'Move the weight slider. The gap and loss change together.',
        control: true,
      },
    ],
    equation: [
      { delay: 0, highlight: 'input' },
      { delay: 850, highlight: 'weight' },
      { delay: 1700, highlight: 'prediction' },
    ],
    tokens: [
      {
        delay: 0,
        message: (s, story) =>
          `${f(s.input)} ${story ? 'hours' : 'input units'} → input`,
      },
    ],
    target: [],
    many: [],
  },
  parts: [
    {
      id: 'input-0',
      name: 'Input',
      chip: 'q-input-number',
      anchor: () => [-2.6, 0.66, 0],
      radius: 0.58,
    },
    {
      id: 'weight',
      name: 'Weight dial',
      chip: 'q-weight',
      anchor: () => [0, 0.45, 0.2],
      radius: 0.72,
    },
    {
      id: 'prediction',
      name: 'Prediction',
      chip: 'q-prediction',
      anchor: (s: StageState) => [2.6, y(s, s.prediction), 0],
      radius: 0.48,
    },
    {
      id: 'target',
      name: 'Target',
      chip: 'q-target',
      anchor: (s: StageState) => [2.6, y(s, s.target), 0],
      radius: 0.7,
    },
    {
      id: 'number-line',
      name: 'Number line',
      chip: 'q-prediction',
      anchor: () => [2.6, 2.5, 0],
      radius: 0.35,
    },
    {
      id: 'error-beam',
      name: 'Error gap',
      chip: 'q-loss',
      anchor: (s: StageState) => [
        2.6,
        y(s, (s.target + s.prediction) / 2),
        0.08,
      ],
      radius: 0.3,
    },
    {
      id: 'loss',
      name: 'Loss',
      chip: 'q-loss',
      anchor: (s: StageState) => [2.6, y(s, (s.target + s.prediction) / 2), 0],
      radius: 0.5,
    },
    {
      id: 'train-step',
      name: 'Training step',
      chip: 'q-step',
      anchor: () => [0, 0.6, 0.2],
      radius: 0.7,
    },
    {
      id: 'whole',
      name: 'One tiny network',
      chip: 'q-chatgpt',
      anchor: () => [0, 1.8, 0],
      radius: 3.4,
    },
  ],
  chips: [
    {
      id: 'q-weight',
      text: 'What is a weight?',
      part: 'weight',
      answer: (s: StageState) =>
        `A weight is a dial the network can turn. It says how much the input matters. A weight of ${f(s.weight)} means “every ${s.input < 0 ? 'input unit' : 'hour studied'} is worth ${f(s.weight)} ${s.input < 0 ? 'output units' : 'points'}.” Training only ever turns this dial.`,
      analogy: 'Like a volume knob: same song, louder or quieter.',
      demo: 'weight',
      tryLabel: 'Try 0, then the matching weight',
    },
    {
      id: 'q-input-number',
      text: 'Why is the input a number?',
      part: 'input-0',
      answer: (s: StageState) =>
        `A network can only do arithmetic, so everything it sees must become a number first: hours studied, a pixel’s brightness, a word. Here the number is ${f(s.input)}${s.input < 0 ? ', an abstract signed example, not negative study hours' : `, for ${f(s.input)} hours of studying`}.`,
      analogy: 'Like a thermometer turning “hot” into 31 degrees.',
      demo: 'tokens',
      tryLabel: 'Watch the input arrive',
    },
    {
      id: 'q-why-2.0',
      text: 'Why is it 2.0 and not 2?',
      part: 'input-0',
      answer: (s: StageState) =>
        `Trailing zeros do not change a number. We show two decimals everywhere because weights are usually fractions, and ${f(s.input)} keeps every number lined up. ${Number.isInteger(s.input) ? `Here ${s.input} and ${f(s.input)} mean exactly the same amount.` : `Here the input is exactly ${f(s.input)}.`}`,
      analogy: 'Like writing a price as 2.00 instead of 2.',
      demo: 'decimals',
      tryLabel: 'Compare the ways to write it',
    },
    {
      id: 'q-prediction',
      text: 'What is the prediction?',
      part: 'prediction',
      also: ['number-line'],
      answer: (s: StageState) =>
        `The prediction is the network’s guess: input × weight. Here ${f(s.input)} × ${f(s.weight)} = ${f(s.prediction)}. Its height on the number line is the guess, so higher means a bigger number.`,
      analogy: 'Like a dart: where it lands is the guess.',
      demo: 'equation',
      tryLabel: 'Follow the equation',
    },
    {
      id: 'q-target',
      text: 'What’s the target?',
      part: 'target',
      answer: (s: StageState) =>
        `The target is the right answer the network is trying to hit: ${s.input < 0 ? 'the given answer' : 'the real exam score'}, ${f(s.target)}. Training data tells us it. ${Math.abs(s.prediction - s.target) < 0.012 ? 'The guess now matches the ring.' : `The guess is ${s.prediction < s.target ? 'below' : 'above'} the ring.`}`,
      analogy: 'Like the bullseye.',
      demo: 'target',
      tryLabel: 'See the ring and the gap',
    },
    {
      id: 'q-loss',
      text: 'What does “loss” mean?',
      part: 'loss',
      also: ['error-beam', 'prediction', 'target'],
      answer: () =>
        'Loss measures how wrong the guess is. We use ½ × (prediction − target)². Zero means perfect. A bigger gap means a bigger loss. The glowing line is that gap.',
      analogy: 'Like a golf score: lower is better.',
      demo: 'loss',
      tryLabel: 'Move the weight and watch',
    },
    {
      id: 'q-step',
      text: 'What does “Train one step” do?',
      part: 'train-step',
      also: ['weight'],
      answer: (s: StageState) =>
        `It checks which way turning the dial would shrink the loss, then turns it a little. This lesson uses a learning rate of ${f(s.learningRate)}: new weight = old weight − rate × error × input. Repeat it to move the prediction toward the target.`,
      analogy: 'Like adjusting a shower tap by feel.',
      demo: 'step',
      tryLabel: 'Run one real training step',
    },
    {
      id: 'q-why-weight',
      text: 'Why change the weight, not the input?',
      part: 'weight',
      answer: (s: StageState) =>
        `The input is a fact we were given: ${f(s.input)} ${s.input < 0 ? 'input units' : 'hours studied'}. The weight is the network’s opinion about how much that fact matters. We can only fix the opinion, not the fact.`,
      analogy:
        'You cannot change the hours you studied, only how you predict from them.',
      demo: 'locked',
      tryLabel: 'Try moving the locked input',
    },
    {
      id: 'q-chatgpt',
      text: 'Is this how ChatGPT works?',
      part: 'whole',
      answer: () =>
        'Yes, in miniature. ChatGPT has billions of weights instead of one, and its inputs are words turned into numbers, but it learns the same way: guess, measure the error, nudge the weights.',
      analogy: 'One dial vs. a mixing desk with billions of dials.',
      demo: 'many',
      tryLabel: 'Imagine many weights',
    },
  ],
  shots: [
    {
      part: 'whole',
      target: () => [0, 1.7, 0],
      distance: 18,
      azimuth: 0.12,
      polar: 1.26,
    },
    {
      part: 'input-0',
      phoneTarget: () => [-2.6, 1.05, 0],
      phoneDistance: 18,
      target: () => [-2.6, 0.85, 0],
      distance: 10,
      azimuth: 0.3,
      polar: 1.2,
    },
    {
      part: 'weight',
      phoneDistance: 16,
      target: () => [0, 0.5, 0.2],
      distance: 10,
      azimuth: 0.15,
      polar: 1.05,
    },
    {
      part: 'prediction',
      target: (s: StageState) => [2.6, y(s, s.prediction), 0],
      distance: 8,
      azimuth: 0.1,
      polar: 1.26,
    },
    {
      part: 'target',
      target: (s: StageState) => [2.6, y(s, s.target), 0],
      distance: 8,
      azimuth: 0.12,
      polar: 1.15,
    },
    {
      part: 'number-line',
      target: () => [2.6, 2.6, 0],
      distance: 12,
      azimuth: 0.12,
      polar: 1.3,
    },
    {
      part: 'error-beam',
      target: (s: StageState) => [2.6, y(s, (s.target + s.prediction) / 2), 0],
      distance: 10,
      azimuth: 0.18,
      polar: 1.3,
    },
    {
      part: 'loss',
      target: (s: StageState) => [2.6, y(s, (s.target + s.prediction) / 2), 0],
      distance: 11,
      azimuth: 0.18,
      polar: 1.3,
    },
    {
      part: 'train-step',
      target: () => [0, 0.5, 0.2],
      distance: 8,
      azimuth: 0.15,
      polar: 1.05,
    },
  ],
  glossary: {
    weight: 'q-weight',
    input: 'q-input-number',
    prediction: 'q-prediction',
    target: 'q-target',
    loss: 'q-loss',
  },
});
