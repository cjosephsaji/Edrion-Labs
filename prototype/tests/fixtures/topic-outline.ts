import type { TopicCheck, TopicOutline } from '../../teaching/topic-content';
import { modelState, visualBase } from '../../teaching/visual-examples';
const check = (
  task: string,
  options: string[],
  correctIndex: number,
  explanation: string,
): TopicCheck => ({
  task,
  options,
  correctIndex,
  explanation,
  feedback: options.map((_, i) =>
    i === correctIndex
      ? explanation
      : `Compare that choice with the described process. ${explanation}`,
  ),
});
/** Controlled provider fixture only. Never imported by the product. */
export const topicOutlineFixture: TopicOutline = {
  title: 'Photosynthesis (provider test fixture)',
  subtitle: 'Light, leaves and stored energy.',
  introduction:
    'Follow how a green plant uses light energy to make sugars from carbon dioxide and water.',
  learningGoals: [
    'Identify the inputs and products of photosynthesis.',
    "Explain why light is energy rather than the plant's carbon source.",
  ],
  prerequisites: [
    'Know that plants contain living cells and that matter and energy have different roles.',
  ],
  steps: [
    {
      concept: 'Inputs and products',
      introduction:
        'Photosynthesis uses light energy to make sugars from carbon dioxide and water. Oxygen is released.',
      demonstration:
        'A green leaf supplied with light, water and carbon dioxide can make sugars; light supplies energy rather than carbon atoms.',
      simpler: 'The plant uses water and carbon dioxide as materials, with light supplying energy.',
      example:
        'A growing plant needs a carbon source even when its leaves receive plenty of light.',
      diagramLabels: ['Water and carbon dioxide', 'Light-powered reactions', 'Sugars and oxygen'],
      diagramCaption: 'A simplified overview of photosynthesis, not a measured experiment.',
      check: check(
        'Which pair supplies materials used in photosynthesis?',
        ['Carbon dioxide and water', 'Light and sound', 'Oxygen and glass'],
        0,
        'Carbon dioxide and water supply materials; light supplies energy.',
      ),
      followup: check(
        'A leaf receives light but no carbon dioxide. What material needed for sugar production is missing?',
        ['A carbon source', 'More sound', 'An empty container'],
        0,
        'Carbon dioxide supplies carbon used to build sugars.',
      ),
    },
    {
      concept: 'Capturing light energy',
      introduction:
        'Chlorophyll and other pigments absorb light. Photosynthesis converts some of that energy into chemical forms.',
      demonstration:
        'When light reaches a green leaf, pigments absorb some wavelengths. That energy helps drive reactions; it is not itself a sugar molecule.',
      simpler: 'Pigments capture energy carried by light.',
      example: 'Turning on a lamp adds light energy; it does not add the carbon atoms in a sugar.',
      diagramLabels: ['Incoming light', 'Pigments absorb energy', 'Reactions use that energy'],
      diagramCaption: 'Light powers the process; it is distinct from the material inputs.',
      check: check(
        'What is a role of chlorophyll?',
        ['Absorbing light energy', 'Supplying all carbon atoms', 'Making sunlight from soil'],
        0,
        'Chlorophyll is a light-absorbing pigment.',
      ),
      followup: check(
        'A lamp shines on a leaf. What does the light primarily provide for photosynthesis?',
        ['Energy', 'Carbon atoms', 'Soil minerals'],
        0,
        'Light supplies energy, while carbon comes from carbon dioxide.',
      ),
    },
    {
      concept: 'Building sugars',
      introduction:
        'Photosynthesis incorporates carbon from carbon dioxide into sugars. Sugars can provide chemical energy and building material.',
      demonstration:
        'The carbon in a newly made plant sugar comes from carbon dioxide, not from the photons that powered the process.',
      simpler: 'Carbon dioxide supplies the carbon used to build sugar.',
      example:
        'Water is essential, but water alone cannot supply the carbon atoms in a carbohydrate.',
      diagramLabels: ['Carbon dioxide enters', 'Carbon is incorporated', 'Sugars are formed'],
      diagramCaption: 'Carbon source and energy source play different roles.',
      check: check(
        'Where does the carbon in sugars made during photosynthesis come from?',
        ['Carbon dioxide', 'Light alone', 'Water alone'],
        0,
        'Carbon dioxide is the carbon source for these sugars.',
      ),
      followup: check(
        'Why can water alone not supply all the material for making a sugar?',
        ['It does not contain carbon', 'It contains no atoms', 'It is always poisonous'],
        0,
        'Water contains hydrogen and oxygen but no carbon.',
      ),
    },
    {
      concept: 'Conditions and limits',
      introduction:
        'The rate of photosynthesis depends on conditions, including light, carbon dioxide, water and temperature. More of one factor does not remove every other limit.',
      demonstration:
        'If a plant lacks water, adding light does not replace that missing material. More light is not a guarantee of unlimited photosynthesis.',
      simpler: 'The process needs several things together. One cannot always replace another.',
      example: 'A leaf with enough light may still be limited by carbon dioxide availability.',
      diagramLabels: [
        'Check the conditions',
        'Identify a limiting factor',
        'Explain the observed limit',
      ],
      diagramCaption:
        "This is a qualitative teaching model; it does not predict a plant's measured growth.",
      check: check(
        'Does more light always guarantee unlimited photosynthesis?',
        [
          'No; other factors can limit it',
          'Yes; materials are unnecessary',
          'Yes; temperature never matters',
        ],
        0,
        'Other factors such as water or carbon dioxide can limit photosynthesis.',
      ),
      followup: check(
        'A plant has plenty of light but lacks water. Does more light replace the missing water?',
        ['No', 'Yes, light becomes water', 'Only if sound is added'],
        0,
        'Light energy does not replace water as a material input.',
      ),
    },
  ],
};
// This is a controlled provider contract fixture, including real process edges.
topicOutlineFixture.subject = 'Biology';
for (const [i, step] of topicOutlineFixture.steps.entries()) {
  step.visual = {
    ...visualBase(step.concept, modelState()),
    type: 'relationships',
    layout: 'process',
    nodes: step.diagramLabels.map((label, j) => ({
      id: `stage-${j}`,
      label,
      role: 'item' as const,
    })),
    edges: [
      { from: 'stage-0', to: 'stage-1', label: 'feeds' },
      { from: 'stage-1', to: 'stage-2', label: 'produces' },
    ],
    feedback: { correct: ['stage-2'], incorrect: ['stage-0', 'stage-1'] },
  };
  step.check.model = modelState();
  step.followup.model = modelState();
  step.independent = {
    ...structuredClone(step.followup),
    task: `Independent case ${i + 1}: ${step.followup.task}`,
  };
  step.final = {
    ...structuredClone(step.check),
    task: `Transfer case ${i + 1}: ${step.check.task}`,
  };
}
topicOutlineFixture.diagnostic = topicOutlineFixture.steps
  .slice(0, 2)
  .map((step, i) => ({
    ...structuredClone(step.check),
    task: `Starting question ${i + 1}: ${step.check.task}`,
  }));
