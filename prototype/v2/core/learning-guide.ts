import type { Investigation, Progress } from './investigation';
import { frameInsight, frameMeasurements } from './investigation-playback';
import { observe, type Topic } from '../simulations/runtime';

export type ModelFocus = 'change' | 'measure' | 'compare';
export type Doubt = {
  id: string;
  question: string;
  keywords: string;
  answer: string;
};
type Primer = {
  idea: string;
  goal: string;
  read: [string, string, string];
  terms: [string, string][];
  analogy: string;
  boundary: string;
};
export const primers: Record<Topic, Primer> = {
  neural: {
    idea: 'A model makes a prediction by multiplying an input by a weight. The target tells us how far off it is.',
    goal: 'Choose a weight change that reduces the prediction’s error.',
    read: [
      'The weight is the multiplier we change.',
      'The prediction is input × weight. The target is where we want it to be.',
      'Compare the distance to the same target before and after the change.',
    ],
    terms: [
      [
        'Weight',
        'A number that multiplies an input. It controls the size and direction of its contribution.',
      ],
      [
        'Prediction',
        'The output the model calculates from its current input and weight.',
      ],
      [
        'Loss',
        'Here, half the squared error. A smaller loss means this one prediction is closer to the target.',
      ],
    ],
    analogy:
      'Think of adjusting a recipe: changing the multiplier changes the amount you get. You still need to compare that amount with what you wanted.',
    boundary:
      'This is one manually adjusted connection. It does not show a network learning to handle unseen examples.',
  },
  rocket: {
    idea: 'Motion and a change in motion are different things. A falling rocket can slow down before it starts going up.',
    goal: 'Explain why an upward push may not immediately reverse a fall.',
    read: [
      'The engine’s thrust is the one setting we change.',
      'Velocity tells us where the rocket is moving. Acceleration tells us how that velocity changes.',
      'Compare both rockets after the same amount of time. Up is positive; down is negative.',
    ],
    terms: [
      [
        'Velocity',
        'Speed with a direction. In this model, a negative value means moving down.',
      ],
      [
        'Acceleration',
        'How quickly velocity changes. Positive acceleration can make a negative velocity less negative.',
      ],
      [
        'Thrust',
        'The force from the engine. Gravity also acts, so thrust alone does not determine the acceleration.',
      ],
    ],
    analogy:
      'On a bicycle, squeezing the brake does not make you stop instantly. The force changes your motion over time. A rocket’s engine also needs time to change its motion.',
    boundary:
      'A vertical-motion model with fuel use. It leaves out air resistance, rotation and landing guidance.',
  },
  attention: {
    idea: 'A word’s position chooses where we look from. The mask decides which other positions it is allowed to use.',
    goal: 'Separate whether a word is allowed to contribute from how strongly it contributes.',
    read: [
      'We turn a causal mask on or off. The words and their vectors stay fixed.',
      'The highlighted query is the word we are looking from. Each column is a share of its attention.',
      'Compare the same query in both runs. A blocked position has zero share; eligible shares sum to 100%.',
    ],
    terms: [
      [
        'Query',
        'The position whose attention we are inspecting. Think: “Which words can this position use?”',
      ],
      [
        'Causal mask',
        'A rule that blocks positions after the query, so the model cannot look ahead.',
      ],
      [
        'Attention share',
        'A relative weight among eligible positions. It is not a probability that a word is true or important in every context.',
      ],
    ],
    analogy:
      'Imagine reading a sentence with a card covering the words you have not reached. The card controls what you can see; it does not decide how useful each visible word is.',
    boundary:
      'The vectors here are illustrative and fixed. This shows masking, not the full behaviour or understanding of a trained language model.',
  },
  traffic: {
    idea: 'Each driver reacts to the car ahead. A small brake tap can change the gap for the next driver.',
    goal: 'Trace who reacts to whom after one driver brakes.',
    read: [
      'The copper car briefly brakes. Everything else starts the same.',
      'Follow the marked green car in both roads. It is the same driver in each comparison.',
      'The cars move around the road; the disturbance passes through following relationships. Those directions need not match.',
    ],
    terms: [
      [
        'Reference',
        'The road without the brake tap. It tells us what would happen without our change.',
      ],
      [
        'Following gap',
        'The distance from a car to the car directly ahead. Drivers respond to that gap and relative speed.',
      ],
      [
        'Traffic wave',
        'A pattern of slowing that passes between cars. The pattern is different from any one car’s motion.',
      ],
    ],
    analogy:
      'Think of a queue: one person stops, and the people behind adjust. The interruption travels through reactions even though each person is moving forward.',
    boundary:
      'One lane on a circular road with a simplified following rule. There are no lane changes or real-driver decisions.',
  },
  relativity: {
    idea: 'We compare travelling clocks over one fixed interval measured on Earth. Different speeds can give different elapsed times on the ships.',
    goal: 'Compare the time recorded by a moving clock over a fixed Earth interval.',
    read: [
      'Only the ship’s speed changes between the journeys.',
      'Each clock records time along its own journey. Both clocks behave normally beside their passengers.',
      'Hold the Earth interval fixed. Compare the ship readings, not two unrelated intervals.',
    ],
    terms: [
      [
        'Proper time',
        'Elapsed time measured by a clock travelling along a particular journey.',
      ],
      ['c', 'The speed of light. A speed of 0.6c means 60% of that speed.'],
      [
        'Gamma (γ)',
        'The factor 1 / √(1 − v²/c²). Here, ship time equals Earth time divided by gamma.',
      ],
    ],
    analogy:
      'Two routes can have different distances between the same endpoints. In relativity, different journeys through spacetime can also accumulate different times. This is only an analogy, not a derivation.',
    boundary:
      'Constant-speed special relativity in Earth’s frame. This does not model gravity, turning around, or the full twin-paradox journey.',
  },
};

export function nextMove(stage: Progress['stage'], task: Investigation) {
  const goal = primers[task.topic].goal;
  switch (stage) {
    case 'predict':
      return {
        title: 'Start with a hunch.',
        text: 'Read the change, then choose what you expect. Unsure? Open “Help me make sense of this.”',
        goal,
      };
    case 'observe':
      return {
        title: 'Look for the difference.',
        text: `Follow ${task.focus.toLowerCase()}. Pause at a checkpoint, compare the two runs, then explain the result.`,
        goal,
      };
    case 'explain':
      return {
        title: 'Tell the story behind the result.',
        text: 'Which explanation connects the change to what you observed? You can go back to the evidence at any time.',
        goal,
      };
    case 'reflect':
      return {
        title: 'Make the idea your own.',
        text: 'Read your feedback, put the idea in your own words, and decide whether to practise or try a new case.',
        goal,
      };
  }
}

export function doubtsFor(
  task: Investigation,
  frameIndex: number,
  revealed: boolean,
): Doubt[] {
  const primer = primers[task.topic];
  const at = Math.max(
    0,
    Math.min(task.frames.length - 1, Math.round(frameIndex)),
  );
  const pair = task.frames[at];
  const state = revealed ? pair.changed : pair.reference;
  const values = frameMeasurements(task, at);
  const numbers = values
    .map(
      (m) =>
        `${m.label}: ${Number(m.reference.toFixed(2))}${m.unit ? ` ${m.unit}` : ''}${revealed ? ` → ${Number(m.changed.toFixed(2))}${m.unit ? ` ${m.unit}` : ''}` : ''}`,
    )
    .join('. ');
  const o = observe(state);
  const worked =
    task.topic === 'neural'
      ? `For this snapshot, ${state.params.x1} × ${Number((+state.params.weight).toFixed(2))} = ${Number((+o.prediction).toFixed(2))}. Compare that prediction with the target, ${state.params.target}. The distance is the absolute difference.`
      : task.topic === 'relativity'
        ? `At this snapshot, Earth time is ${Number((+o.earthClock).toFixed(2))} s and γ is ${Number((+o.gamma).toFixed(3))}. Divide Earth time by γ to get ${Number((+o.shipClock).toFixed(2))} s on the ship. The rounded numbers may not divide exactly.`
        : `${primer.read[1]} ${numbers}`;
  return [
    {
      id: 'start',
      question: 'I don’t know where to start.',
      keywords: 'start lost confused begin stuck understand',
      answer: `${primer.idea} First, identify this one change: ${task.change}. Both runs share these conditions: ${task.held}. ${primer.read[1]}`,
    },
    ...primer.terms.map(([term, definition], i) => ({
      id: `term-${i}`,
      question: `What does “${term.toLowerCase()}” mean?`,
      keywords: term.toLowerCase(),
      answer: definition,
    })),
    {
      id: 'example',
      question: 'Can you make it more familiar?',
      keywords: 'example analogy familiar simple everyday explain simpler',
      answer: primer.analogy,
    },
    {
      id: 'numbers',
      question: 'Walk me through these numbers.',
      keywords:
        'numbers maths math calculate calculation formula equation units value',
      answer: worked,
    },
    {
      id: 'why',
      question: 'Why does the change matter?',
      keywords: 'why cause caused happen change result',
      answer: revealed
        ? `At the end of this experiment: ${task.takeaway} ${task.mechanism.join(' ')}`
        : task.hint,
    },
    {
      id: 'limits',
      question: 'Does this always work?',
      keywords: 'always real life limits assumptions exception general world',
      answer: `${primer.boundary} ${task.limitation}`,
    },
  ];
}

export function matchDoubts(doubts: Doubt[], query: string) {
  const stop = new Set(
    'a an the i me my you can could what is does do it this that how to of in and please'.split(
      ' ',
    ),
  );
  const words = (query.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter(
    (word) => !stop.has(word),
  );
  if (!query.trim()) return doubts;
  if (!words.length) return [];
  return doubts
    .map((doubt, index) => {
      const terms =
        `${doubt.question} ${doubt.keywords}`
          .toLowerCase()
          .match(/[a-z0-9]+/g) ?? [];
      return {
        doubt,
        index,
        score: words.filter((word) =>
          terms.some(
            (term) =>
              term === word || (word.length > 3 && term.startsWith(word)),
          ),
        ).length,
      };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((item) => item.doubt);
}

export function focusText(task: Investigation, focus: ModelFocus) {
  return primers[task.topic].read[
    focus === 'change' ? 0 : focus === 'measure' ? 1 : 2
  ];
}

/** The explanation and the displayed model always refer to the same snapshot. */
export function causalStops(task: Investigation) {
  const last = task.frames.length - 1;
  const middle = Math.floor(last / 2);
  return [
    {
      label: 'Start',
      frame: 0,
      text: `${primers[task.topic].read[0]} Both runs share these conditions: ${task.held}. ${frameInsight(task, 0).text}`,
    },
    ...(middle > 0
      ? [
          {
            label: 'Change',
            frame: middle,
            text: frameInsight(task, middle).text,
          },
        ]
      : []),
    {
      label: 'Result',
      frame: last,
      text: `${frameInsight(task, last).text} ${task.takeaway}`,
    },
  ];
}
