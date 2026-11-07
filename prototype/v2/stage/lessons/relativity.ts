import { defineStageLesson, type V3 } from '../lesson';
import {
  betaLimits,
  boxPoints,
  clockBounds,
  relativityBounds,
  relativityFrames,
  constantSpeedExample,
  clockStep,
  clockRuler,
  clockX,
  intervalComplete,
  type RelativityStageState,
} from '../relativity-logic';
import { format as f } from '../logic';

const earth: V3 = [-1.65, 1.75, -0.35],
  ship: V3 = [1.65, 1.75, -0.35],
  dial: V3 = [0, 0.3, 0.8],
  chart: V3 = [0, 0.13, -0.45],
  gamma: V3 = [0, 0.13, -1.65];
const timelineBounds = boxPoints([-2.6, 0.08, 1.45], [2.6, 0.45, 2.66]),
  chartBounds = boxPoints([-1.28, 0.05, -1.48], [1.28, 0.35, 0.25]);
const overview = {
  part: 'whole',
  target: (): V3 => [0, 1.05, 0],
  distance: 20,
  azimuth: 0.12,
  polar: 1.17,
  fitBounds: true,
};
export const relativityLesson = defineStageLesson<RelativityStageState>({
  id: 'relativity',
  shortTitle: 'Time dilation',
  title: 'Two clocks, one journey',
  eyebrow: 'Lesson 05 · Time dilation',
  nextLessons: [],
  subtitle: 'Identical clocks. One stays on Earth; one rides a coasting ship.',
  abstractSubtitle:
    'Compare elapsed readings and selected intervals in inertial special relativity.',
  canvasDescription:
    'Time dilation Stage. Two copper and glass chronometers, Earth on the left and ship on the right, share a seconds scale with a visible zero. Their hands and markers show the engine’s elapsed readings. Faint markers show the selected interval totals. A central etched light cone and worldlines use the selected coordinates. Drag the speed dial or use the speed slider. Run clocks advances Earth time at real-time speed. Changing speed selects a different constant-speed example, not an acceleration history.',
  story: {
    description: 'Speed edits compare separate coasting examples',
    fallback: 'Constant velocity · no gravity or turnaround',
    enabled: () => true,
    units: {},
  },
  bounds: { min: [-3.5, -0.35, -3.5], max: [3.5, 2.7, 3.5] },
  framePoints: relativityBounds,
  relativeFog: true,
  bloomHeight: 512,
  canvasRegion: 'hero',
  parts: [
    {
      id: 'earth-clock',
      name: 'Earth clock',
      chip: 'td-clocks',
      anchor: () => earth,
      radius: 0.84,
      boundsPoints: () => clockBounds(-1.65),
    },
    {
      id: 'ship-clock',
      name: 'Ship clock · proper time',
      chip: 'td-ship',
      anchor: () => ship,
      radius: 0.84,
      boundsPoints: () => clockBounds(1.65),
    },
    {
      id: 'speed',
      name: 'Speed as a fraction of c',
      chip: 'td-speed',
      anchor: () => dial,
      radius: 0.56,
      boundsPoints: () => boxPoints([-0.6, 0.12, 0.2], [0.6, 0.5, 1.4]),
    },
    {
      id: 'gamma',
      name: 'Gamma · the time ratio',
      chip: 'td-gamma',
      anchor: () => gamma,
      radius: 0.7,
      boundsPoints: () => boxPoints([-0.8, 0.07, -1.9], [0.8, 0.25, -1.4]),
    },
    {
      id: 'light-cone',
      name: 'Light cone · the speed limit',
      chip: 'td-light',
      anchor: () => chart,
      radius: 0.8,
      boundsPoints: () => chartBounds,
    },
    {
      id: 'worldline',
      name: 'Worldlines · paths through spacetime',
      chip: 'td-frame',
      anchor: () => chart,
      radius: 0.8,
      boundsPoints: () => chartBounds,
    },
    {
      id: 'timeline',
      name: 'One shared seconds scale',
      chip: 'td-interval',
      anchor: () => [0, 0.2, 1.85],
      radius: 0.8,
      boundsPoints: () => timelineBounds,
    },
    {
      id: 'clock-step',
      name: 'Advance the clocks',
      chip: 'td-clocks',
      anchor: () => [0, 0.3, 1.85],
      radius: 0.3,
    },
    {
      id: 'whole',
      name: 'Two identical clocks',
      chip: 'td-return',
      anchor: () => [0, 1.05, 0],
      radius: 2.7,
      boundsPoints: () => relativityBounds,
    },
  ],
  shots: [
    overview,
    ...(['earth-clock', 'ship-clock'] as const).map((part, i) => ({
      part,
      target: (): V3 => [i === 0 ? -1.65 : 1.65, 1.4, -0.3],
      distance: 10,
      azimuth: i === 0 ? 0.12 : -0.12,
      polar: 1.29,
      framePoints: () => clockBounds(i === 0 ? -1.65 : 1.65),
    })),
    {
      part: 'speed',
      target: () => dial,
      distance: 7,
      azimuth: -0.12,
      polar: 0.75,
      phoneDistance: 14,
      framePoints: () => boxPoints([-0.6, 0.12, 0.2], [0.6, 0.5, 1.4]),
    },
    {
      part: 'gamma',
      target: () => gamma,
      distance: 7,
      azimuth: 0.1,
      polar: 0.45,
      phoneDistance: 14,
      framePoints: () => boxPoints([-0.8, 0.07, -1.9], [0.8, 0.25, -1.4]),
    },
    ...(['worldline', 'light-cone'] as const).map((part) => ({
      part,
      target: () => chart,
      distance: 10,
      azimuth: 0,
      polar: 0.32,
      framePoints: () => chartBounds,
    })),
    {
      part: 'timeline',
      target: (): V3 => [0, 0.23, 1.85],
      distance: 13,
      azimuth: 0,
      polar: 0.65,
      framePoints: () => timelineBounds,
    },
  ],
  labels: [
    {
      id: 'earth-clock',
      title: 'EARTH CLOCK',
      sideOnFocus: true,
      value: (s) => s.earthClock,
      unit: 's',
      placement: 'above',
      offset: 28,
    },
    {
      id: 'ship-clock',
      title: 'SHIP CLOCK',
      sideOnFocus: 'right',
      value: (s) => s.shipClock,
      unit: 's',
      placement: 'above',
      offset: 28,
    },
  ],
  ruler: {
    ticks: (s) => clockRuler(s).ticks,
    anchor: (v, s) => [clockX(v, s), 0.16, 2.12],
    visibleFor: ['timeline', 'whole'],
  },
  metric: {
    id: 'ship-clock',
    name: 'Ship clock',
    value: (s) => s.shipClock,
    unit: 's',
    digits: 2,
    status: (s) =>
      intervalComplete(s)
        ? 'interval complete'
        : s.earthClock > 0
          ? 'elapsed'
          : 'ready',
    formula: (s) =>
      `${f(s.earthClock)} Earth s ÷ γ ${f(s.gamma, 4)} = ${f(s.shipClock)} ship s`,
    history: (s) => s.history,
    spark: false,
  },
  parameter: {
    id: 'beta',
    label: 'Ship speed',
    key: 'beta',
    step: 0.001,
    range: betaLimits,
    value: (s) => s.beta,
    display: (s) => f(s.beta, 3) + 'c',
  },
  extraParameters: [
    {
      key: 'duration',
      label: 'Selected Earth interval',
      range: [1, 120],
      step: 1,
      value: (s) => s.duration,
      unit: 's',
    },
  ],
  selectControls: [
    {
      key: 'frame',
      label: 'Diagram coordinates',
      value: (s) => s.frame,
      choices: [
        { value: 'earth', label: 'Earth coordinates' },
        { value: 'ship', label: 'Ship coordinates' },
      ],
      help: 'Same events and clock readings; only diagram coordinates change.',
    },
  ],
  readouts: [
    {
      label: 'SELECTED SPAN',
      value: (s) => `${f(s.earthInterval, 1)} → ${f(s.shipInterval, 2)} s`,
      part: 'timeline',
    },
    { label: 'GAMMA', value: (s) => f(s.gamma, 4) + '×', part: 'gamma' },
    {
      label: 'COORDINATES',
      value: (s) => (s.frame === 'earth' ? 'Earth' : 'Ship'),
      part: 'worldline',
    },
  ],
  train: {
    id: 'clock-step',
    label: 'Step 1 s',
    autoLabel: 'Run clocks',
    stopLabel: 'Pause clocks',
    action: (s) => clockStep(s),
    autoAction: (s) => clockStep(s, 0.1),
    intervalMs: 100,
    enabled: (s) => !intervalComplete(s),
    rateLabel: '1× Earth',
  },
  solved: intervalComplete,
  equation: ['ship time', '=', 'Earth time', '÷', 'gamma'],
  chips: [
    {
      id: 'td-clocks',
      text: 'Why two clocks?',
      part: 'whole',
      also: ['earth-clock', 'ship-clock'],
      answer: (s) =>
        `They are identical clocks in different situations. Earth keeps one; the ship carries the other. In Earth's frame, ${f(s.earthInterval)} selected Earth seconds correspond to ${f(s.shipInterval)} ship seconds. Run clocks to watch the elapsed readings grow from their current values.`,
      analogy:
        'Like two identical stopwatches, started together and carried along different paths.',
      demo: 'play',
      tryLabel: 'Play the selected constant-speed interval',
    },
    {
      id: 'td-ship',
      text: 'Why does it tick slower?',
      part: 'ship-clock',
      answer: (s) =>
        `In Earth's frame, the moving clock accumulates less proper time: the time measured aboard. At ${f(s.beta, 3)}c, ${f(s.earthInterval)} Earth seconds correspond to ${f(s.shipInterval)} ship seconds. A person aboard feels their own clock running normally. The clock is not faulty.`,
      analogy: 'The same clock, following a different path through spacetime.',
      demo: 'play',
      tryLabel: 'Watch both real engine readings advance',
    },
    {
      id: 'td-speed',
      text: 'What does c mean?',
      part: 'speed',
      answer: (s) =>
        `The letter c means light's speed in a vacuum. ${f(s.beta, 3)}c means ${f(s.beta * 100, 1)}% of that speed, measured from Earth. Changing this dial selects a different constant-speed example. It does not simulate a ship accelerating through those speeds.`,
      analogy: 'Like a percentage scale, with light speed at 100%.',
      demo: 'compare',
      tryLabel: 'Compare three separate speeds over 10 Earth seconds',
    },
    {
      id: 'td-gamma',
      text: 'What is gamma?',
      part: 'gamma',
      answer: (s) =>
        `Gamma, written γ, is the conversion factor between these time intervals. Here γ = ${f(s.gamma, 4)}. Divide ${f(s.earthInterval)} Earth seconds by it to get ${f(s.shipInterval)} ship seconds. At zero speed, γ is 1 and the readings match.`,
      analogy: 'Like a conversion rate between two rulers for time.',
      demo: 'compare',
      tryLabel: 'Compare γ at 0c, 0.8c and 0.99c',
    },
    {
      id: 'td-light',
      text: 'Why does light matter?',
      part: 'light-cone',
      also: ['worldline'],
      answer: () =>
        `Imagine a clock that ticks when light bounces between two mirrors. In Earth's frame, a moving clock's light follows a longer diagonal path. Light still travels at c, so ticks take more Earth time. The blue edges mark light's paths; massive ships stay inside.`,
      analogy: 'A diagonal route is longer than a straight crossing.',
      demo: 'light',
      tryLabel: 'Trace the light-cone edges · illustration only',
    },
    {
      id: 'td-interval',
      text: 'Elapsed or selected time?',
      part: 'timeline',
      answer: (s) =>
        `Bright markers and clock hands show elapsed time: ${f(s.earthClock)} Earth seconds and ${f(s.shipClock)} ship seconds. Faint markers preview the selected interval: ${f(s.earthInterval)} and ${f(s.shipInterval)} seconds. Changing the selected interval does not advance either clock. Both rows use the same seconds scale.`,
      analogy: 'A stopwatch reading versus the duration you plan to measure.',
      demo: 'interval',
      tryLabel: 'Change the selected span without advancing elapsed time',
    },
    {
      id: 'td-frame',
      text: 'Which clock is really slow?',
      part: 'worldline',
      also: ['light-cone'],
      answer: () =>
        `Neither clock is absolutely slower. Each coasting observer can describe the other's moving clock as slow, using different simultaneous events. This comparison selects events in Earth's frame. Switching diagram coordinates keeps those events and their clock readings; it does not swap the numbers.`,
      analogy:
        'Changing the map does not change the journey already marked on it.',
      demo: 'frame',
      tryLabel: 'Switch diagram coordinates; keep the same readings',
    },
    {
      id: 'td-limit',
      text: 'Can we reach light speed?',
      part: 'speed',
      also: ['gamma'],
      answer: () =>
        `A massive ship cannot reach c. As its speed approaches c, gamma grows without bound, and more energy is needed to keep accelerating it. This model stops at 0.999c. A small ship-time reading is not time running backward.`,
      analogy: 'A limit you can approach, rather than a setting you can cross.',
      demo: 'limit',
      tryLabel: 'Inspect a separate 0.999c example',
    },
    {
      id: 'td-return',
      text: 'Do the clocks reunite?',
      part: 'whole',
      answer: () =>
        `This model shows constant-velocity motion only. It has no turnaround, acceleration or reunion. A real round trip needs more than this single coasting segment. These results also leave out gravity. We cannot use this scene alone to calculate what reunited clocks would read.`,
      analogy: 'One leg of a journey is not the whole return trip.',
      demo: 'limits',
      tryLabel: 'Show what this model includes',
    },
  ],
  glossary: {
    clock: 'td-clocks',
    clocks: 'td-clocks',
    Earth: 'td-clocks',
    ship: 'td-ship',
    proper: 'td-ship',
    'proper time': 'td-ship',
    speed: 'td-speed',
    gamma: 'td-gamma',
    γ: 'td-gamma',
    light: 'td-light',
    interval: 'td-interval',
    frame: 'td-frame',
    worldline: 'td-frame',
    turnaround: 'td-return',
  },
  demos: {
    play: (s) => {
      const frames = relativityFrames(s.sim),
        wall = Math.min(8000, s.duration * 1000);
      return frames.map((snapshot, i) => ({
        delay: (i / (frames.length - 1)) * wall,
        action: () => ({ tool: 'sim_restore', args: { snapshot } }),
        ...(i === 0
          ? {
              focus: null,
              closeCard: true,
              message: () =>
                `Prepared interval · ${f(s.duration / (wall / 1000), 2)}× playback · ${f(s.beta, 3)}c constant speed`,
            }
          : {}),
      }));
    },
    compare: [0, 0.8, 0.99].map((beta, i) => ({
      delay: i * 2200,
      focus: null,
      closeCard: true,
      action: () => ({
        tool: 'sim_restore',
        args: { snapshot: constantSpeedExample(beta) },
      }),
      message: () =>
        `Separate coasting example · ${f(beta, 3)}c · same 10 Earth seconds`,
    })),
    light: [
      {
        delay: 0,
        message: () => 'Light-path illustration · not elapsed journey time',
      },
    ],
    interval: [
      {
        delay: 0,
        action: (s) => ({
          tool: 'sim_set_params',
          args: { patch: { duration: s.duration === 10 ? 20 : 10 } },
        }),
        message: () =>
          'Selected span changed; elapsed readings did not advance.',
      },
    ],
    frame: [
      {
        delay: 0,
        action: () => ({
          tool: 'sim_set_params',
          args: { patch: { frame: 'ship' } },
        }),
        message: () => 'Ship coordinates · same events and clock readings',
      },
      {
        delay: 2400,
        action: () => ({
          tool: 'sim_set_params',
          args: { patch: { frame: 'earth' } },
        }),
        message: () => 'Earth coordinates · same events and clock readings',
      },
    ],
    limit: [
      {
        delay: 0,
        focus: null,
        closeCard: true,
        action: () => ({
          tool: 'sim_restore',
          args: { snapshot: constantSpeedExample(0.999) },
        }),
        message: () =>
          'Separate 0.999c example · 10 Earth seconds · below light speed',
      },
    ],
    limits: [
      {
        delay: 0,
        message: () =>
          'Coasting only · no acceleration, gravity, turnaround or reunion',
      },
    ],
  },
});
