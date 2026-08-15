import { describe, expect, it } from 'vitest';
import {
  PETROS_PLAN_SCHEMA_VERSION,
  PETROS_RENDER_SCHEMA_VERSION,
  petrosPlanDecisionSchema,
  petrosTeachingBlockContentSchema,
  type PetrosPlanDecision,
  type PetrosTeachingBlockContent,
} from './petros-learning';

const common = {
  schemaVersion: PETROS_PLAN_SCHEMA_VERSION as typeof PETROS_PLAN_SCHEMA_VERSION,
  targetConcept: 'integration by parts',
  studentSafeReason: 'A worked step is useful because the goal asks for a reliable method choice.',
  decisionFactors: ['The session is at the first checkpoint.'],
  expectedEvidence: 'The learner can explain the first useful step.',
  progressEffect: {
    checkpointId: 'checkpoint-1',
    effect: 'advance' as const,
    progressDelta: 1 as const,
  },
  canStream: false,
  termination: { recommendation: 'continue' as const, reason: 'More checkpoints remain.' },
  guessFirst: {
    status: 'required' as const,
    targetId: 'integration-by-parts:first-step',
    reason: 'A cheap commitment comes before explanation.',
  },
  observationResponse: {
    causalObservationIds: [],
    action: 'continue' as const,
    acknowledgement: null,
    routeChange: null,
    returnPlan: null,
  },
  selectionPolicy: {
    normalizedCandidateWeights: { layered_explanation: 1 },
    exclusions: [],
    selectedWeight: 1,
    override: null,
    capabilityFallback: null,
  },
};

const decisions: PetrosPlanDecision[] = [
  {
    ...common,
    selectedMoveType: 'layered_explanation',
    moveParameters: {
      layerCount: 2,
      emphasis: 'the key relationship',
      sourceGroundingRequired: false,
    },
  },
  {
    ...common,
    selectedMoveType: 'worked_example',
    moveParameters: { stepCount: 3, predictionPoints: 1, problemStyle: 'procedural' },
  },
  {
    ...common,
    selectedMoveType: 'recall_check',
    moveParameters: { questionCount: 2, answerMode: 'short_answer', coverage: 'method choice' },
  },
  {
    ...common,
    selectedMoveType: 'synthesis',
    moveParameters: {
      promptStyle: 'one_sentence',
      includeForwardLink: true,
      focus: 'method choice',
    },
  },
];

const blocks: PetrosTeachingBlockContent[] = [
  {
    schemaVersion: PETROS_RENDER_SCHEMA_VERSION,
    type: 'layered_explanation',
    title: 'Build the core idea',
    firstLayer:
      'Start with the relationship between the two changing quantities and keep the goal visible.',
    deeperLayers: [
      {
        id: 'deeper',
        label: 'Go deeper',
        content:
          'The deeper layer connects that relationship to the method selected for the next step.',
      },
    ],
    keyIdea: 'Every detail should support the active goal.',
    sourceGrounding: [],
  },
  {
    schemaVersion: PETROS_RENDER_SCHEMA_VERSION,
    type: 'worked_example',
    title: 'Choose the first step',
    problemStatement: 'Choose the first useful step for this representative integration problem.',
    steps: [
      {
        id: 'one',
        title: 'Read the demand',
        explanation: 'Identify the form the question uses.',
        predictionPrompt: 'Which clue matters first?',
      },
      {
        id: 'two',
        title: 'Choose the rule',
        explanation: 'Select the rule that directly fits that form.',
      },
    ],
    finalCheck: 'Explain why this method fits better than substitution.',
    sourceGrounding: [],
  },
  {
    schemaVersion: PETROS_RENDER_SCHEMA_VERSION,
    type: 'recall_check',
    title: 'Recall without looking',
    instructions: 'Answer both prompts before looking back.',
    questions: [
      { id: 'q1', prompt: 'What clue tells you to use this method?', responseType: 'short_answer' },
    ],
    answerContract: {
      completion: 'all_questions_answered',
      responseHandling: 'record_only_stage_2',
    },
    feedback: {
      submittedMessage: 'Response recorded.',
      stageBoundary: 'Evaluation and struggle support arrive in Stage 3.',
    },
  },
  {
    schemaVersion: PETROS_RENDER_SCHEMA_VERSION,
    type: 'synthesis',
    title: 'Make it yours',
    prompt: 'State the most useful idea in one specific sentence.',
    tighteningGuidance: 'Name the decision, not only the topic.',
    forwardLink: 'This idea supports the next contrast case.',
  },
];

describe('Petros Stage 2 PLAN contract', () => {
  it.each(decisions.map((decision) => [decision.selectedMoveType, decision]))(
    'accepts %s',
    (_name, decision) => {
      expect(petrosPlanDecisionSchema.safeParse(decision).success).toBe(true);
    },
  );

  it('rejects unknown moves, missing factors, mismatched parameters, and extra fields', () => {
    expect(
      petrosPlanDecisionSchema.safeParse({ ...decisions[0], selectedMoveType: 'video' }).success,
    ).toBe(false);
    expect(
      petrosPlanDecisionSchema.safeParse({ ...decisions[0], decisionFactors: [] }).success,
    ).toBe(false);
    expect(
      petrosPlanDecisionSchema.safeParse({ ...decisions[1], moveParameters: { layerCount: 2 } })
        .success,
    ).toBe(false);
    expect(
      petrosPlanDecisionSchema.safeParse({ ...decisions[2], hiddenReasoning: 'private chain' })
        .success,
    ).toBe(false);
  });
});

describe('Petros Stage 2 RENDER contract', () => {
  it.each(blocks.map((block) => [block.type, block]))('accepts %s', (_name, block) => {
    expect(petrosTeachingBlockContentSchema.safeParse(block).success).toBe(true);
  });

  it('rejects invalid structures rather than guessing missing fields', () => {
    expect(
      petrosTeachingBlockContentSchema.safeParse({ ...blocks[0], type: 'video' }).success,
    ).toBe(false);
    expect(petrosTeachingBlockContentSchema.safeParse({ ...blocks[1], steps: [] }).success).toBe(
      false,
    );
    expect(
      petrosTeachingBlockContentSchema.safeParse({
        ...blocks[2],
        questions: [{ id: 'q', prompt: 'Choose now', responseType: 'single_choice' }],
      }).success,
    ).toBe(false);
    expect(
      petrosTeachingBlockContentSchema.safeParse({ ...blocks[3], provider: 'secret' }).success,
    ).toBe(false);
  });
});
