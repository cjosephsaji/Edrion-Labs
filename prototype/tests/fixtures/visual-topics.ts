import { topicOutlineFixture } from './topic-outline';
import {
  forceVisual,
  logicVisual,
  marketVisual,
  quadraticVisual,
} from '../../teaching/visual-examples';
import type { TopicCheck, TopicOutline } from '../../teaching/topic-content';
import type { VisualSpec, ModelState } from '../../teaching/visual-spec';
const c = (
  task: string,
  options: string[],
  correctIndex: number,
  explanation: string,
  model: ModelState,
): TopicCheck => ({
  task,
  options,
  correctIndex,
  explanation,
  model: structuredClone(model),
  feedback: options.map((_, i) =>
    i === correctIndex ? explanation : `Trace the visible model. ${explanation}`,
  ),
});
export const subjectCases = [
  {
    name: 'Quadratic functions',
    spec: quadraticVisual(),
    tasks: (spec: VisualSpec) => [
      c(
        'For the shown y=x², which way does the parabola open?',
        ['Upward', 'Downward', 'It is a straight line'],
        0,
        'A positive quadratic coefficient gives upward opening.',
        spec.initial,
      ),
      c(
        'For y=−x²+2x+1, which way does this new curve open?',
        ['Upward', 'Downward', 'No curve exists'],
        1,
        'The negative quadratic coefficient makes the parabola open downward.',
        spec.transfer,
      ),
      c(
        'For a=−1, b=2, c=1, what is y when x=0?',
        ['1', '2', '−1'],
        0,
        'At x=0 only c=1 remains.',
        spec.transfer,
      ),
      c(
        'What is y for x=1 in y=x²?',
        ['1', '0', '2'],
        0,
        'Substitute x=1: 1 squared is 1.',
        spec.initial,
      ),
    ],
  },
  {
    name: 'Applied forces',
    spec: forceVisual(),
    tasks: (spec: VisualSpec) => [
      c(
        'Which way does the horizontal force point when Fx=4 N?',
        ['Right', 'Left', 'Down'],
        0,
        'Positive x points right.',
        spec.initial,
      ),
      c(
        'In the new example Fx=−3 N. Which way does its arrow point?',
        ['Right', 'Left', 'Up'],
        1,
        'A negative horizontal force points left.',
        spec.transfer,
      ),
      c(
        'For Fx=−3 N and Fy=4 N, what is the resultant magnitude?',
        ['5 N', '7 N', '1 N'],
        0,
        'The perpendicular components combine as √(9+16)=5 N.',
        spec.transfer,
      ),
      c(
        'Combine Fx=4 N and Fy=3 N. What is the resultant magnitude?',
        ['5 N', '7 N', '12 N'],
        0,
        'The perpendicular components combine as √(16+9)=5 N.',
        spec.initial,
      ),
    ],
  },
  {
    name: 'Supply and demand',
    spec: marketVisual(),
    tasks: (spec: VisualSpec) => [
      c(
        'For P=8−0.6Q and P=2+0.6Q, what quantity clears the market?',
        ['5', '8', '2'],
        0,
        'Equate prices: 6=1.2Q, so Q=5.',
        spec.initial,
      ),
      c(
        'Demand shifts to P=10−0.6Q, with supply unchanged. How does equilibrium quantity change?',
        ['It rises', 'It falls', 'It stays fixed'],
        0,
        'The intersection moves to Q=8/1.2, above 5.',
        spec.transfer,
      ),
      c(
        'In the shifted market, what is the equilibrium price?',
        ['6', '2', '10'],
        0,
        'Q=8/1.2 gives P=2+0.6Q=6.',
        spec.transfer,
      ),
      c(
        'At the original intersection Q=5, what is market price?',
        ['5', '8', '2'],
        0,
        'Both curves give P=5 at Q=5.',
        spec.initial,
      ),
    ],
  },
  {
    name: 'Facts and logical rules',
    spec: logicVisual(),
    tasks: (spec: VisualSpec) => [
      c(
        'Given Bird(Rio) and Bird(x) → HasWings(x), what is supported?',
        ['HasWings(Rio)', 'CanFly(Rio)', 'Bird(everything)'],
        0,
        'The supplied fact matches the rule premise, supporting HasWings(Rio).',
        spec.initial,
      ),
      c(
        'Does the same supplied rule justify CanFly(Rio)?',
        [
          'No, no flight rule is supplied',
          'Yes, wings prove flight',
          'No, Rio is definitely flightless',
        ],
        0,
        'Missing support for flight is not proof of flightlessness.',
        spec.transfer,
      ),
      c(
        'Which conclusion follows by using the rule in its stated direction?',
        ['HasWings(Rio)', 'Every winged thing is a bird', 'CanFly(Rio)'],
        0,
        'Bird(Rio) satisfies the premise and yields HasWings(Rio).',
        spec.transfer,
      ),
      c(
        'Would HasWings(Sam) alone establish Bird(Sam) using this one-way rule?',
        ['No', 'Yes', 'Only at night'],
        0,
        'A one-way implication cannot simply be reversed.',
        spec.initial,
      ),
    ],
  },
];
/** Provider fixtures pass through the same normalization and validation as live output. */
export function subjectOutline(entry: (typeof subjectCases)[number]): TopicOutline {
  const outline = structuredClone(topicOutlineFixture);
  outline.title = entry.name;
  outline.subject = entry.name;
  outline.subtitle = 'Observe the model, predict a change and test a fresh case.';
  outline.introduction = entry.spec.objective;
  outline.prerequisites = ['Read model labels, directions, and any supplied axes or rules.'];
  outline.learningGoals = [entry.spec.objective, 'Apply the model to a fresh example.'];
  const tasks = entry.tasks(entry.spec);
  outline.steps = outline.steps.map((step, i) => ({
    ...step,
    concept: [
      'Explore the model',
      'Trace the relationship',
      'Predict a change',
      'Apply independently',
    ][i]!,
    visual: structuredClone(entry.spec),
    introduction: entry.spec.objective,
    demonstration: tasks[0]!.explanation,
    simpler: tasks[1]!.explanation,
    example: tasks[3]!.explanation,
    diagramLabels: ['Supplied model', 'Visible relationships', 'Your prediction'],
    diagramCaption: entry.spec.objective,
    check: tasks[0]!,
    followup: tasks[1]!,
    independent: tasks[2]!,
    final: tasks[3]!,
  }));
  outline.diagnostic = tasks
    .slice(0, 2)
    .map((t, i) => ({ ...t, task: `Starting case ${i + 1}: ${t.task}` }));
  return outline;
}
