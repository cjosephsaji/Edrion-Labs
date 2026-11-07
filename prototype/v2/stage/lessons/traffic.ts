import { defineStageLesson, type StageDemo, type V3 } from '../lesson';
import { initial } from '../../simulations/runtime';
import {
  roadPosition,
  trafficHeadwayComparison,
  trafficWaveFrames,
  trafficGapPoints,
  trafficGapCenter,
  paddedTrafficPoints,
  type TrafficStageState,
} from '../traffic-logic';
import { format as f } from '../logic';
const hero = (s: TrafficStageState): V3 => roadPosition(s.hero.position);
const front = (s: TrafficStageState): V3 =>
  roadPosition(s.front.car.position, 2.98, 0.55);
const dial: V3 = [-1.25, 0.34, 0.65],
  gauge: V3 = [0, 1, 0];
const specimenFramePoints: V3[] = [
  ...Array.from(
    { length: 20 },
    (_, i): V3 => [
      Math.sin((i / 20) * Math.PI * 2) * 3.8,
      -0.35,
      Math.cos((i / 20) * Math.PI * 2) * 3.8,
    ],
  ),
  [-0.7, 2.6, 0],
  [0.7, 2.6, 0],
];
export function createTrafficLesson(count: number) {
  const waveDemo = (s: TrafficStageState): StageDemo<TrafficStageState>[] => {
    const frames = trafficWaveFrames(s.sim),
      start = frames[0].time,
      end = frames.at(-1)!.time;
    return frames.map((frame, i) => ({
      delay: ((frame.time - start) / (end - start)) * 12000,
      action: () => ({ tool: 'sim_restore', args: { snapshot: frame } }),
      ...(i === 0
        ? {
            focus: null,
            closeCard: true,
            message: () =>
              'Prepared wave · 2.5× playback · after 15 s settling',
          }
        : {}),
    }));
  };
  return defineStageLesson<TrafficStageState>({
    id: 'traffic',
    shortTitle: 'Traffic waves',
    title: 'A jam from one tap',
    eyebrow: 'Lesson 04 · Traffic waves',
    nextLessons: ['Time dilation'],
    subtitle:
      'One driver brakes. The cars keep going forward. The slow patch can travel the other way.',
    abstractSubtitle:
      'One closed ring. Follow speeds, following gaps and the measured wave boundary.',
    canvasDescription:
      'Traffic waves Stage. A single-lane ring road with luminous cars. Gold identifies car 01 throughout the run. Amber means slower and mint means faster, with numerical speeds available. Blue marks the model’s slow-to-fast boundary when it exists. A glass gauge measures mean speed, and a copper dial sets following time. Drag the dial or use the headway slider. Brake and watch runs the model at twice real time; drag the studio to orbit.',
    story: {
      description: '350 m · one lane · no obstacle',
      fallback: 'IDM toy model · no lane changes',
      enabled: () => true,
      units: {},
    },
    bounds: { min: [-3.4, -0.35, -3.4], max: [3.4, 2.8, 3.4] },
    framePoints: specimenFramePoints,
    relativeFog: true,
    bloomHeight: 512,
    canvasRegion: 'hero',
    labelAvoidPoints: Array.from(
      { length: 32 },
      (_, i): V3 => [
        Math.sin((i / 16) * Math.PI * 2) * 3.4,
        i < 16 ? 0.35 : -0.35,
        Math.cos((i / 16) * Math.PI * 2) * 3.4,
      ],
    ),
    parts: [
      ...Array.from({ length: count }, (_, i) => ({
        id: `car_${i}`,
        name: `Car ${String(i + 1).padStart(2, '0')}${i === 0 ? ' · our gold witness' : ''}`,
        chip: 't-cars',
        anchor: (s: TrafficStageState) => roadPosition(s.cars[i].position),
        radius: 0.16,
      })),
      {
        id: 'ring',
        name: 'One continuous ring road',
        chip: 't-density',
        anchor: () => [0, 0.35, 0],
        radius: 0.8,
        boundsPoints: () => specimenFramePoints,
      },
      {
        id: 'jam-front',
        name: 'The wave boundary',
        chip: 't-wave',
        anchor: front,
        radius: 0.22,
      },
      {
        id: 'ribbon',
        name: 'The speed ribbon',
        chip: 't-ribbon',
        anchor: (s) =>
          roadPosition(
            s.front.exists ? s.front.car.position : s.hero.position,
            2.92,
            0.32,
          ),
        radius: 0.25,
      },
      {
        id: 'gauge',
        name: 'Mean speed in metres per second',
        chip: 't-speed',
        anchor: () => gauge,
        radius: 1,
      },
      {
        id: 'headway',
        name: 'Following time',
        chip: 't-headway',
        anchor: () => dial,
        radius: 0.4,
      },
      {
        id: 'gap',
        name: 'The actual gap in front of car 01',
        chip: 't-gap',
        anchor: trafficGapCenter,
        radius: 0.32,
        boundsPoints: (s) => paddedTrafficPoints(trafficGapPoints(s), 0.09),
      },
      {
        id: 'density',
        name: 'How crowded the ring is',
        chip: 't-density',
        anchor: () => [0, 0.35, 0],
        radius: 0.7,
        boundsPoints: () => specimenFramePoints,
      },
      {
        id: 'brake',
        name: 'One brief brake',
        chip: 't-brake',
        anchor: hero,
        radius: 0.2,
      },
      {
        id: 'traces',
        name: 'A pattern passing between cars',
        chip: 't-identity',
        anchor: front,
        radius: 0.3,
      },
      {
        id: 'whole',
        name: 'One brake, a chain of reactions',
        chip: 't-brake',
        anchor: () => [0, 0.65, 0],
        radius: 0.8,
      },
    ],
    labels: [
      {
        id: 'car_0',
        title: 'Car 01',
        value: (s) => s.hero.speed,
        digits: 1,
        unit: 'm/s',
        placement: 'radial',
        radialFrom: () => [0, 0.48, 0],
        radialEdge: (s) => roadPosition(s.hero.position, 3.4, -0.35),
      },
      {
        id: 'jam-front',
        title: 'Wave edge',
        value: (s) => s.front.gradient,
        text: (s) =>
          `near car ${String(+s.front.car.id.slice(4) + 1).padStart(2, '0')}`,
        placement: 'radial',
        radialFrom: () => [0, 0.55, 0],
        radialEdge: (s) => roadPosition(s.front.car.position, 3.4, -0.35),
        visible: (s) => s.front.exists,
      },
      {
        id: 'gauge',
        title: 'Mean',
        sideOnFocus: true,
        value: (s) => s.mean,
        digits: 1,
        unit: 'm/s',
        placement: 'above',
        offset: 85,
      },
    ],
    metric: {
      id: 'gauge',
      name: 'Mean speed',
      value: (s) => s.mean,
      digits: 1,
      unit: 'm/s',
      status: (s) =>
        s.front.exists
          ? 'wave marked'
          : s.spread < 0.3
            ? 'uniform flow'
            : 'no marked front',
      formula: (s) => `Slowest ${f(s.min, 1)} · fastest ${f(s.max, 1)} m/s`,
      history: (s) => s.history,
    },
    parameter: {
      id: 'headway',
      key: 'headway',
      label: 'Following time',
      range: [0.5, 3],
      step: 0.1,
      value: (s) => s.headway,
      display: (s) => `${f(s.headway, 1)} s`,
      keepRunning: true,
    },
    extraParameters: [
      {
        key: 'count',
        label: 'Cars on ring · resets road',
        range: [5, 45],
        step: 1,
        value: (s) => s.count,
        unit: 'cars',
      },
      {
        key: 'desiredSpeed',
        label: 'Desired speed',
        range: [5, 35],
        step: 1,
        value: (s) => s.desiredSpeed,
        unit: 'm/s',
      },
    ],
    readouts: [
      { label: 'Cars', value: (s) => String(s.count), part: 'density' },
      { label: 'Car 01 gap', value: (s) => `${f(s.gap, 1)} m`, part: 'gap' },
      { label: 'Model time', value: (s) => `${f(s.time, 1)} s`, part: 'ring' },
    ],
    train: {
      id: 'brake',
      label: 'Brake & watch',
      autoLabel: 'Run road',
      stopLabel: 'Pause road',
      action: { tool: 'sim_brake' },
      autoAction: { tool: 'sim_step', args: { seconds: 0.2 } },
      intervalMs: 100,
      resetFocus: true,
      runAfterAction: true,
      rateLabel: (s) => (s.sim.running ? '1×' : '2×'),
    },
    solved: () => false,
    equation: ['gap', '+', 'relative speed', '→', 'brake', '→', 'wave'],
    chips: [
      {
        id: 't-cars',
        text: 'What is each light?',
        part: 'car_0',
        answer: () =>
          'Each capsule is one car. Its position and speed are calculated by this traffic model. Gold always identifies car 01, even after other cars slow down. Cars follow the forward arrows; the braking pattern can pass through different cars.',
        analogy:
          'Like people walking through a patch of rain: the people and the patch are different things.',
        demo: 'identity',
        tryLabel: 'Follow the same gold car through a prepared wave',
      },
      {
        id: 't-brake',
        text: 'How does one brake start it?',
        part: 'brake',
        answer: () =>
          'Car 01 briefly slows to at most 1 metre per second. Its follower sees less room and brakes. The next follower reacts in turn. That chain can create a moving slow patch without an obstacle. Its size and persistence depend on spacing and density.',
        analogy:
          'Like a queue of people each stopping when the person ahead stops.',
        demo: 'wave',
        tryLabel: 'Replay one simulated braking wave · 2.5× playback',
      },
      {
        id: 't-wave',
        text: 'Why can the wave go backward?',
        part: 'jam-front',
        also: ['car_0', 'ribbon'],
        answer: (s) =>
          s.front.exists
            ? 'The cars keep travelling forward. The slowdown is passed to successive cars behind them. The blue marker follows the model’s slow-to-fast boundary, not a single vehicle. Its identity can change, and the pattern can travel backward even while cars move forward.'
            : 'There is no marked wave boundary in this snapshot. Brake a car to start a disturbance. A slow patch can pass backward between cars as they keep travelling forward; whether it grows or fades depends on the model’s settings.',
        analogy:
          'Like a stadium wave travelling between people who stay in their seats.',
        demo: 'wave',
        tryLabel: 'Watch the gold car and blue boundary diverge',
      },
      {
        id: 't-ribbon',
        text: 'What do the colors mean?',
        part: 'ribbon',
        answer: () =>
          'Amber shows slower cars; mint shows faster cars in this snapshot. The ribbon interpolates their measured speeds around the road. Its scale follows the current speed range, so read the numbers too. A growing amber patch reveals the slow region.',
        analogy: 'Like a weather map showing where a cold patch is spreading.',
        demo: 'wave',
        tryLabel: 'Watch actual speed changes paint the ring',
      },
      {
        id: 't-speed',
        text: 'What does m/s mean?',
        part: 'gauge',
        answer: (s) =>
          `M/s means metres per second. At 10 m/s, a car covers 10 metres each second. This gauge shows the ${s.count} cars’ average: ${f(s.mean, 1)} m/s. The faint ring marks their desired speed, ${f(s.desiredSpeed, 1)} m/s. An average can hide very different speeds.`,
        analogy:
          'Like a class average hiding differences between individual test scores.',
        demo: 'speed',
        tryLabel:
          'Advance one model second and compare mean, minimum and maximum',
      },
      {
        id: 't-gap',
        text: 'What is the gap?',
        part: 'gap',
        answer: (s) =>
          `The gap is the empty road from car 01’s front bumper to the next car’s rear bumper: ${f(s.gap, 1)} metres now. The copper bracket marks it. Drivers react to this space and their speed compared with the car ahead. It is a distance, not a time.`,
        analogy:
          'Like leaving room in a queue so you can stop without bumping someone.',
        demo: 'gap',
        tryLabel: 'Highlight the measured bumper-to-bumper space',
      },
      {
        id: 't-headway',
        text: 'Does more room help?',
        part: 'headway',
        answer: (s) =>
          `Following time sets a moving time buffer, currently ${f(s.headway, 1)} seconds. More buffer can help absorb braking, but outcomes depend on density and the observation time. The model also includes a minimum gap and closing speed. It does not mean every car instantly has that much empty road.`,
        analogy: 'Like leaving more room to react when walking behind someone.',
        demo: 'compare',
        tryLabel: 'Compare the same eight seconds at current headway and 2.4 s',
      },
      {
        id: 't-density',
        text: 'What if there are more cars?',
        part: 'density',
        answer: (s) =>
          `There are ${s.count} cars sharing 350 metres of road: ${f(s.density, 1)} cars per kilometre. More cars means less average room on this fixed ring. That changes how drivers react. The settings let you change the count; doing so resets the road. This model has one lane.`,
        analogy:
          'Like adding people to a circular walking track without making it longer.',
        demo: 'density',
        tryLabel: 'Compare 20 and 35 cars on the same ring',
      },
      {
        id: 't-identity',
        text: 'Is the wave one slow car?',
        part: 'traces',
        also: ['car_0', 'jam-front'],
        answer: () =>
          'No. A car can enter the slow patch, brake, then accelerate out of it. Another car takes its place. Gold follows one fixed car; blue follows the measured boundary. Their trails show where each has been. The boundary marker disappears when the model no longer detects it.',
        analogy:
          'Like a relay: the message moves on while each runner keeps their own identity.',
        demo: 'identity',
        tryLabel: 'Track car 01 and changing boundary-car IDs',
      },
    ],
    glossary: {
      car: 't-cars',
      cars: 't-cars',
      brake: 't-brake',
      braking: 't-brake',
      wave: 't-wave',
      front: 't-wave',
      boundary: 't-wave',
      ribbon: 't-ribbon',
      speed: 't-speed',
      mean: 't-speed',
      gap: 't-gap',
      headway: 't-headway',
      density: 't-density',
      ring: 't-density',
    },
    demos: {
      wave: waveDemo,
      identity: waveDemo,
      speed: [
        {
          delay: 0,
          action: () => ({ tool: 'sim_step', args: { seconds: 1 } }),
        },
      ],
      gap: [
        {
          delay: 0,
          focus: 'gap',
          message: (s) => `Actual gap ${f(s.gap, 1)} m · car 01 to its leader`,
        },
      ],
      compare: (s) => {
        const c = trafficHeadwayComparison(s.sim),
          left = c.short,
          right = c.longer;
        return [
          {
            delay: 0,
            focus: null,
            closeCard: true,
            action: () => ({ tool: 'sim_restore', args: { snapshot: left } }),
            message: () =>
              `${f(+left.params.headway, 1)} s buffer · same 8 s test · spread ${f(Math.max(...left.data.traffic!.cars.map((c) => c.speed)) - Math.min(...left.data.traffic!.cars.map((c) => c.speed)), 1)} m/s`,
          },
          {
            delay: 2800,
            action: () => ({ tool: 'sim_restore', args: { snapshot: right } }),
            message: () =>
              `2.4 s buffer · same 8 s test · spread ${f(Math.max(...right.data.traffic!.cars.map((c) => c.speed)) - Math.min(...right.data.traffic!.cars.map((c) => c.speed)), 1)} m/s`,
          },
        ];
      },
      density: [
        {
          delay: 0,
          action: () => ({
            tool: 'sim_restore',
            args: { snapshot: initial('traffic', { count: 20 }) },
          }),
          message: () => '20 cars · same 350 m ring',
        },
        {
          delay: 1800,
          action: () => ({
            tool: 'sim_restore',
            args: { snapshot: initial('traffic', { count: 35 }) },
          }),
          message: () => '35 cars · less room per car · road reset',
        },
      ],
    },
    shots: [
      {
        part: 'whole',
        target: () => [0, 0.65, 0],
        distance: 18,
        azimuth: 0.12,
        polar: 0.88,
      },
      ...Array.from({ length: count }, (_, i) => ({
        part: `car_${i}`,
        target: (s: TrafficStageState): V3 => roadPosition(s.cars[i].position),
        distance: 7,
        azimuth: 0.12,
        polar: 0.88,
        phoneDistance: 15,
      })),
      {
        part: 'ring',
        target: () => [0, 0.45, 0],
        distance: 14,
        azimuth: 0.1,
        polar: 0.82,
        fitBounds: true,
      },
      {
        part: 'jam-front',
        target: front,
        distance: 9,
        azimuth: 0.12,
        polar: 0.85,
        phoneDistance: 17,
      },
      {
        part: 'ribbon',
        target: (s: TrafficStageState) =>
          roadPosition(
            s.front.exists ? s.front.car.position : s.hero.position,
            2.92,
            0.32,
          ),
        distance: 9,
        azimuth: 0.12,
        polar: 0.85,
        phoneDistance: 17,
      },
      {
        part: 'gauge',
        target: () => gauge,
        distance: 8,
        azimuth: 0.12,
        polar: 1.08,
        phoneDistance: 34,
      },
      {
        part: 'headway',
        target: () => dial,
        distance: 7,
        azimuth: 0.15,
        polar: 0.85,
        phoneDistance: 16,
      },
      {
        part: 'gap',
        target: trafficGapCenter,
        framePoints: (s) => paddedTrafficPoints(trafficGapPoints(s), 0.3),
        distance: 8,
        azimuth: 0.12,
        polar: 0.78,
      },
      {
        part: 'density',
        target: () => [0, 0.5, 0],
        distance: 14,
        azimuth: 0.1,
        polar: 0.7,
        fitBounds: true,
      },
      {
        part: 'brake',
        target: hero,
        distance: 8,
        azimuth: 0.12,
        polar: 0.9,
        phoneDistance: 16,
      },
      {
        part: 'traces',
        target: front,
        distance: 10,
        azimuth: 0.12,
        polar: 0.88,
        phoneDistance: 19,
      },
    ],
  });
}
