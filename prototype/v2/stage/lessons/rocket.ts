import { defineStageLesson, type StageDemo, type V3 } from '../lesson';
import { initial } from '../../simulations/runtime';
import {
  rocketPose,
  rocketRuler,
  preparedRocketLanding,
  type RocketStageState,
} from '../rocket-logic';
import { format as f } from '../logic';
const craft = (s: RocketStageState): V3 => [0, rocketPose(s).y + 0.9, 0];
const pct = (s: RocketStageState) => `${Math.round(s.throttle * 100)}%`;
const flight = (s: RocketStageState) => s.status === 'flying';
function fallAnswer(s: RocketStageState) {
  if (s.status !== 'flying')
    return `This flight has ended. The recorded contact speed was ${f(Math.abs(s.velocity), 1)} m/s. Reset for another flight. During flight, velocity tells us which way the craft moves; acceleration tells us how that velocity changes.`;
  const movement =
      Math.abs(s.velocity) < 0.05
        ? 'nearly still'
        : s.velocity < 0
          ? 'descending'
          : 'rising',
    change =
      s.velocity * s.acceleration < 0
        ? 'slowing down'
        : s.acceleration === 0
          ? 'keeping the same speed'
          : 'speeding up';
  return `Engine on does not mean moving up. Velocity is ${f(s.velocity, 1)} m/s; acceleration is ${f(s.acceleration, 2)} m/s². The craft is ${movement} and ${change}. Thrust changes its speed over time, not its direction instantly.`;
}
export const rocketLesson = defineStageLesson<RocketStageState>({
  id: 'rocket',
  shortTitle: 'Rocket landing',
  title: 'The last 120 metres',
  nextLessons: ['Attention', 'Traffic waves', 'Time dilation'],
  eyebrow: 'Lesson 02 · Rocket landing',
  subtitle:
    'Bring a descending lander home gently. Fuel buys thrust. Timing makes the landing soft.',
  abstractSubtitle:
    'One vertical flight. Compare height, speed and the forces that change them.',
  canvasDescription:
    'Rocket landing Stage. A lander descends towards a lit pad. A metre ruler marks the height of its feet. Upward thrust and downward gravity arrows show forces. Drag the throttle lever, or use the throttle slider; drag the studio to orbit.',
  story: {
    description: 'A lander returning to its pad',
    fallback: 'Vertical flight · upward is positive',
    enabled: () => true,
    units: {},
  },
  bounds: { min: [-3.4, -0.35, -3.4], max: [3.4, 5.9, 3.4] },
  framePoints: [
    ...Array.from(
      { length: 16 },
      (_, i): V3 => [
        Math.sin((i / 16) * Math.PI * 2) * 3.4,
        -0.35,
        Math.cos((i / 16) * Math.PI * 2) * 3.4,
      ],
    ),
    [-1.1, 5.7, -0.6],
    [1.2, 5.7, 0.6],
    [2.5, 4, 0],
  ],
  labelAvoidPoints: Array.from(
    { length: 32 },
    (_, i): V3 => [
      Math.sin((i / 16) * Math.PI * 2) * 3.4,
      i < 16 ? 0 : -0.35,
      Math.cos((i / 16) * Math.PI * 2) * 3.4,
    ],
  ),
  parts: [
    {
      id: 'rocket',
      name: 'Lander',
      chip: 'r-landing',
      anchor: craft,
      radius: 0.9,
    },
    {
      id: 'ground',
      name: 'Landing pad',
      chip: 'r-landing',
      anchor: () => [0, 0.14, 0],
      radius: 0.8,
    },
    {
      id: 'altitude',
      name: 'Height above the pad',
      chip: 'r-altitude',
      anchor: (s) => [2.45, rocketPose(s).y, 0],
      radius: 0.2,
    },
    {
      id: 'altitude-line',
      name: 'Height ruler',
      chip: 'r-altitude',
      anchor: () => [2.45, 2, 0],
      radius: 0.25,
    },
    {
      id: 'thrust',
      name: 'Thrust · the engine’s push',
      chip: 'r-thrust',
      anchor: (s) => rocketPose(s).thrustAnchor,
      radius: 0.32,
    },
    {
      id: 'gravity',
      name: 'Gravity · the downward pull',
      chip: 'r-gravity',
      anchor: (s) => rocketPose(s).gravityAnchor,
      radius: 0.32,
    },
    {
      id: 'velocity',
      name: 'Vertical speed',
      chip: 'r-velocity',
      anchor: (s) => [-2.2, rocketPose(s).y + 0.8, 0],
      radius: 0.4,
    },
    {
      id: 'fuel',
      name: 'Fuel remaining',
      chip: 'r-fuel',
      anchor: (s) => [-0.48, rocketPose(s).y + 1, 0.5],
      radius: 0.24,
    },
    {
      id: 'mass',
      name: 'Total mass',
      chip: 'r-mass',
      anchor: craft,
      radius: 0.7,
    },
    {
      id: 'throttle',
      name: 'Throttle control',
      chip: 'r-thrust',
      anchor: () => [-2.3, 0.7, 1],
      radius: 0.45,
    },
    {
      id: 'flight-step',
      name: 'A half-second of flight',
      chip: 'r-falling',
      anchor: craft,
      radius: 0.8,
    },
    {
      id: 'whole',
      name: 'One vertical flight',
      chip: 'r-landing',
      anchor: () => [0, 2.2, 0],
      radius: 3.4,
    },
  ],
  labels: [
    {
      id: 'thrust',
      title: 'Thrust ↑',
      value: (s) => s.thrust / 1000,
      digits: 1,
      unit: 'kN',
      placement: 'left',
      screenOffset: [0, -90],
      visible: flight,
    },
    {
      id: 'gravity',
      title: 'Gravity ↓',
      value: (s) => s.gravityForce / 1000,
      digits: 1,
      unit: 'kN',
      placement: 'right',
      screenOffset: [0, -42],
      visible: flight,
    },
    {
      id: 'altitude',
      title: 'Height',
      value: (s) => s.altitude,
      digits: 1,
      unit: 'm',
      placement: 'right',
      screenOffset: [0, 34],
      anchorOffset: [0.13, 0, 0],
    },
  ],
  ruler: {
    align: 'end',
    ticks: (s) => rocketRuler(s).ticks,
    anchor: (v, s) => [2.15, 0.14 + (v / rocketRuler(s).max) * 3.65, 0],
    visibleFor: ['altitude', 'altitude-line', 'rocket', 'ground'],
  },
  metric: {
    id: 'velocity',
    name: 'Vertical speed',
    displayName: (s) =>
      s.status === 'flying' ? 'Vertical speed' : 'Contact velocity',
    value: (s) => s.velocity,
    digits: 1,
    unit: 'm/s',
    good: (s) => s.status === 'landed',
    status: (s) =>
      s.status === 'landed'
        ? 'soft landing'
        : s.status === 'crashed'
          ? 'hard impact'
          : s.velocity < -0.05
            ? 'descending'
            : s.velocity > 0.05
              ? 'rising'
              : 'nearly still',
    formula: (s) =>
      s.status === 'flying'
        ? `Acceleration ${f(s.acceleration, 2)} m/s² · up is +`
        : `At contact · safe limit ${s.safeSpeed} m/s`,
    history: (s) => s.history,
  },
  parameter: {
    id: 'throttle',
    key: 'throttle',
    label: 'Throttle',
    range: [0, 1],
    step: 0.01,
    value: (s) => s.throttle,
    display: pct,
    keepRunning: true,
  },
  readouts: [
    { label: 'Fuel', value: (s) => `${f(s.fuel, 1)} kg`, part: 'fuel' },
    { label: 'Total mass', value: (s) => `${f(s.mass, 0)} kg`, part: 'mass' },
    {
      label: 'Flight',
      value: (s) =>
        s.status === 'flying'
          ? `${f(s.time, 1)} s`
          : s.status === 'landed'
            ? 'Landed'
            : 'Impact',
      part: 'rocket',
    },
  ],
  train: {
    id: 'flight-step',
    label: 'Step ½ s',
    autoLabel: 'Run flight',
    stopLabel: 'Pause flight',
    action: { tool: 'sim_step', args: { seconds: 0.5 } },
    autoAction: { tool: 'sim_step', args: { seconds: 0.1 } },
    intervalMs: 100,
    enabled: flight,
  },
  solved: (s) => s.status !== 'flying',
  equation: ['thrust', '−', 'gravity', '=', 'net force'],
  chips: [
    {
      id: 'r-thrust',
      text: 'What does thrust do?',
      part: 'thrust',
      also: ['throttle'],
      answer: (s) =>
        `Thrust is the engine’s upward push. Yours is ${f(s.thrust / 1000, 1)} kN: each kN is 1,000 newtons of force. The throttle asks for a bigger or smaller push. Changing it changes acceleration; it does not instantly change velocity.`,
      analogy:
        'Like pushing a trolley: a harder push changes its speed faster.',
      demo: 'thrust',
      tryLabel: 'Compare 0% and 100% without advancing time',
    },
    {
      id: 'r-gravity',
      text: 'Why does it fall?',
      part: 'gravity',
      answer: (s) =>
        `Gravity keeps pulling down, even with the engine on. Here it pulls with ${f(s.gravityForce / 1000, 1)} kN. Compare that arrow with thrust. Their difference changes the craft’s velocity. This model leaves out air resistance.`,
      analogy: 'Like a ball that keeps being pulled down after you throw it.',
      demo: 'gravity',
      tryLabel: 'Watch one second with no engine push',
    },
    {
      id: 'r-altitude',
      text: 'What does the height mean?',
      part: 'altitude',
      also: ['altitude-line'],
      answer: (s) =>
        `Height is the distance from the lander’s feet to the pad: ${f(s.altitude, 1)} metres right now. The ruler shows that number. Zero means the feet touch the pad. The lander’s body stays above zero because the legs have length.`,
      analogy:
        'Like a lift display measuring how far you are above the ground.',
      demo: 'height',
      tryLabel: 'Compare two starting heights: 120 m and 60 m',
    },
    {
      id: 'r-velocity',
      text: 'Why is the speed negative?',
      part: 'velocity',
      answer: (s) =>
        `We chose up as positive. A negative velocity means moving down; positive means moving up. Yours is ${f(s.velocity, 1)} m/s${s.status !== 'flying' ? ' at contact' : ''}. The sign gives the direction, not a judgement. Height can be positive while velocity is negative.`,
      analogy:
        'Like a lift travelling down while still above the ground floor.',
      demo: 'velocity',
      tryLabel: 'Follow the downward arrow as the craft falls',
    },
    {
      id: 'r-falling',
      text: 'Falling with the engine on?',
      part: 'rocket',
      also: ['velocity', 'thrust', 'gravity'],
      answer: fallAnswer,
      analogy: 'Like braking a bicycle: you keep moving while you slow down.',
      demo: 'braking',
      tryLabel: 'Try 80% thrust and advance half a second',
    },
    {
      id: 'r-fuel',
      text: 'What if fuel runs out?',
      part: 'fuel',
      answer: (s) =>
        `There are ${f(s.fuel, 1)} kg of fuel left. Burning fuel creates thrust and makes the craft lighter. At zero fuel the engine cannot push, even at 100% throttle. Only gravity then changes the fall in this model.`,
      analogy:
        'An empty fuel tank cannot power an engine, however hard you press the pedal.',
      demo: 'fuel',
      tryLabel: 'Try an empty tank at 100% throttle',
    },
    {
      id: 'r-mass',
      text: 'Why does mass matter?',
      part: 'mass',
      answer: (s) =>
        `Total mass is the craft plus its remaining fuel: ${f(s.mass, 0)} kg. The same engine push gives a heavier craft less upward acceleration. As fuel burns, total mass falls. Dry mass means the craft without fuel.`,
      analogy:
        'A full shopping trolley is harder to accelerate than an empty one.',
      demo: 'mass',
      tryLabel: 'Double total mass with the existing lesson tool',
    },
    {
      id: 'r-landing',
      text: 'How do I land gently?',
      part: 'ground',
      also: ['rocket'],
      answer: (s) =>
        `Reach the pad with a speed of ${s.safeSpeed} m/s or less. Full power is not automatically safer: too early can send you upward; too late means a hard impact. Timing matters. The prepared burn shows one successful flight, not a general-purpose autopilot.`,
      analogy: 'Like parking: slow down before you reach the space.',
      demo: 'landing',
      tryLabel:
        'Watch the lesson’s prepared safe landing · accelerated playback',
    },
  ],
  glossary: {
    thrust: 'r-thrust',
    throttle: 'r-thrust',
    gravity: 'r-gravity',
    altitude: 'r-altitude',
    height: 'r-altitude',
    velocity: 'r-velocity',
    speed: 'r-velocity',
    acceleration: 'r-falling',
    fuel: 'r-fuel',
    mass: 'r-mass',
    landing: 'r-landing',
  },
  demos: {
    thrust: [
      {
        delay: 0,
        action: () => ({
          tool: 'sim_set_params',
          args: { patch: { throttle: 0 } },
        }),
        message: () => 'Throttle changes the force. No time has advanced.',
      },
      {
        delay: 1400,
        action: () => ({
          tool: 'sim_set_params',
          args: { patch: { throttle: 1 } },
        }),
      },
    ],
    gravity: [
      {
        delay: 0,
        action: () => ({
          tool: 'sim_restore',
          args: { snapshot: initial('rocket', { throttle: 0 }) },
        }),
      },
      {
        delay: 800,
        action: () => ({ tool: 'sim_step', args: { seconds: 1 } }),
      },
    ],
    height: [
      {
        delay: 0,
        action: () => ({
          tool: 'sim_restore',
          args: { snapshot: initial('rocket') },
        }),
        message: () => 'Two starting heights · no time advanced',
      },
      {
        delay: 1400,
        action: () => ({
          tool: 'sim_restore',
          args: { snapshot: initial('rocket', { altitude: 60 }) },
        }),
      },
    ],
    velocity: [
      {
        delay: 0,
        action: () => ({
          tool: 'sim_restore',
          args: { snapshot: initial('rocket', { throttle: 0 }) },
        }),
      },
      {
        delay: 700,
        action: () => ({ tool: 'sim_step', args: { seconds: 0.5 } }),
      },
    ],
    braking: [
      {
        delay: 0,
        action: () => ({
          tool: 'sim_restore',
          args: { snapshot: initial('rocket', { throttle: 0.8 }) },
        }),
      },
      {
        delay: 700,
        action: () => ({ tool: 'sim_step', args: { seconds: 0.5 } }),
        message: () => '80% thrust · descending while braking',
      },
    ],
    fuel: [
      {
        delay: 0,
        action: () => ({
          tool: 'sim_restore',
          args: { snapshot: initial('rocket', { fuel: 0, throttle: 1 }) },
        }),
        message: () => 'Empty tank · 100% throttle, zero thrust',
      },
      {
        delay: 900,
        action: () => ({ tool: 'sim_step', args: { seconds: 1 } }),
      },
    ],
    mass: [
      {
        delay: 0,
        action: () => ({ tool: 'sim_scale_mass', args: { factor: 2 } }),
      },
    ],
    landing: () => {
      const frames = preparedRocketLanding(),
        duration = 8000,
        end = frames.at(-1)!;
      const phases: StageDemo<RocketStageState>[] = frames.map((frame, i) => ({
        delay: (frame.time / end.time) * duration,
        action: () => ({ tool: 'sim_restore', args: { snapshot: frame } }),
        ...(i === 0
          ? {
              focus: null,
              closeCard: true,
              message: () => 'Prepared burn sequence · accelerated playback',
            }
          : {}),
      }));
      phases.push({
        delay: duration + 100,
        focus: 'rocket',
        message: () =>
          `Soft landing · contact speed ${f(Math.abs(end.data.rocket!.velocity), 2)} m/s`,
      });
      return phases;
    },
  },
  shots: [
    {
      part: 'whole',
      target: () => [0.1, 2.25, 0],
      distance: 20,
      azimuth: 0.18,
      polar: 1.24,
    },
    {
      part: 'rocket',
      target: craft,
      distance: 8,
      azimuth: 0.18,
      polar: 1.24,
      phoneDistance: 20,
    },
    {
      part: 'ground',
      target: () => [0, 0.55, 0],
      phoneTarget: () => [0, 0.35, 0],
      distance: 10,
      azimuth: 0.25,
      polar: 1.05,
      phoneDistance: 26,
    },
    {
      part: 'altitude',
      target: (s) => [2.1, rocketPose(s).y + 0.25, 0],
      distance: 10,
      azimuth: 0.12,
      polar: 1.3,
      phoneDistance: 16,
    },
    {
      part: 'altitude-line',
      target: () => [2.45, 2.1, 0],
      distance: 13,
      azimuth: 0.1,
      polar: 1.3,
      phoneDistance: 18,
    },
    {
      part: 'thrust',
      target: (s) => [-0.6, rocketPose(s).y + 0.9, 0],
      distance: 9,
      azimuth: 0.22,
      polar: 1.24,
      phoneDistance: 16,
    },
    {
      part: 'gravity',
      target: (s) => [0.65, rocketPose(s).y + 0.9, 0],
      distance: 9,
      azimuth: 0.12,
      polar: 1.24,
      phoneDistance: 16,
    },
    {
      part: 'velocity',
      target: (s) => [-1.2, rocketPose(s).y + 0.9, 0],
      distance: 10,
      azimuth: 0.18,
      polar: 1.24,
      phoneDistance: 17,
    },
    {
      part: 'fuel',
      target: (s) => [-0.4, rocketPose(s).y + 1, 0.5],
      distance: 7,
      azimuth: -0.25,
      polar: 1.22,
      phoneDistance: 15,
    },
    {
      part: 'mass',
      target: craft,
      distance: 9,
      azimuth: 0.22,
      polar: 1.2,
      phoneDistance: 18,
    },
    {
      part: 'throttle',
      target: () => [-2.3, 0.7, 1],
      distance: 8,
      azimuth: 0.18,
      polar: 1.05,
      phoneDistance: 16,
    },
    {
      part: 'flight-step',
      target: craft,
      distance: 9,
      azimuth: 0.18,
      polar: 1.22,
      phoneDistance: 20,
    },
  ],
});
