import { z } from 'zod';
import {
  petrosPlaybackCheckpointSchema,
  petrosTeachingPresentationSchema,
} from './petros-presentation';
import { PETROS_INFLATION_PILOT, petrosPilotStateSchema } from './petros-pilot';
import {
  PETROS_DOCUMENT_TEACHING_EXPERIENCE,
  petrosDocumentTeachingStateSchema,
} from './petros-document-teaching';
import {
  PETROS_MOVE_TYPES,
  petrosMoveTypeSchema,
  petrosResolvedTopicProfileSchema,
} from './petros-topic-profiles';
import { petrosLearnerSnapshotSchema } from './petros-learner-model';
import {
  petrosHomeworkDecisionSchema,
  petrosStudentDisclosureSchema,
  petrosSyllabusDecisionSchema,
} from './petros-institutional';

export { PETROS_MOVE_TYPES, petrosMoveTypeSchema } from './petros-topic-profiles';
export type { PetrosMoveType } from './petros-topic-profiles';

export const PETROS_SESSION_TYPES = ['learn', 'revise', 'repair', 'doubt', 'teach_it_back'] as const;
export const PETROS_PLAN_FUNCTION_KEY = 'teaching.next_action.select';
export const PETROS_RENDER_FUNCTION_KEY = 'teaching.block.render';
export const PETROS_ANSWER_EVALUATION_FUNCTION_KEY = 'answer.evaluate';
export const PETROS_HINT_FUNCTION_KEY = 'hint.generate';
export const PETROS_SESSION_STATE_VERSION = 'petros.session-state.v3';
export const PETROS_OBSERVATION_SCHEMA_VERSION = 'petros.observation.v1';
export const PETROS_EVALUATION_SCHEMA_VERSION = 'petros.answer-evaluation.v1';
export const PETROS_PLAN_SCHEMA_VERSION = 'petros.plan.v3';
export const PETROS_RENDER_SCHEMA_VERSION = 'petros.render.v2';
export const PETROS_PLAN_PROMPT_VERSION = 'stage4-plan-v1';
export const PETROS_RENDER_PROMPT_VERSION = 'stage4-render-v1';
export const PETROS_EVALUATION_PROMPT_VERSION = 'stage3-answer-evaluation-v1';
export const PETROS_HINT_PROMPT_VERSION = 'stage3-hint-v1';

export const PETROS_CONFIDENCE_VALUES = ['sure', 'think_so', 'guessing'] as const;
export const PETROS_OBSERVATION_TYPES = [
  'answer_submitted',
  'confidence_selected',
  'question_asked',
  'hint_requested',
  'layer_changed',
  'depth_changed',
  'block_completed',
  'block_skipped',
  'session_paused',
  'session_resumed',
  'session_abandoned',
  'response_time_recorded',
  'inactivity_recorded',
] as const;

export const petrosConfidenceSchema = z.enum(PETROS_CONFIDENCE_VALUES);
export const petrosObservationTypeSchema = z.enum(PETROS_OBSERVATION_TYPES);
export type PetrosConfidence = z.infer<typeof petrosConfidenceSchema>;
export type PetrosObservationType = z.infer<typeof petrosObservationTypeSchema>;

const shortText = z.string().trim().min(1).max(500);
const decisionCommon = {
  schemaVersion: z.literal(PETROS_PLAN_SCHEMA_VERSION),
  targetConcept: shortText,
  studentSafeReason: z.string().trim().min(8).max(500),
  decisionFactors: z.array(z.string().trim().min(3).max(240)).min(1).max(8),
  expectedEvidence: z.string().trim().min(3).max(500),
  progressEffect: z
    .object({
      checkpointId: z.string().trim().min(1).max(80),
      effect: z.enum(['hold', 'advance', 'complete']),
      progressDelta: z.number().int().min(0).max(1),
    })
    .strict(),
  canStream: z.boolean(),
  termination: z
    .object({
      recommendation: z.enum(['continue', 'goal_met', 'time_up', 'max_moves']),
      reason: z.string().trim().min(3).max(300),
    })
    .strict(),
  guessFirst: z
    .object({
      status: z.enum(['required', 'completed', 'skipped', 'not_applicable']),
      targetId: z.string().trim().min(1).max(160).nullable(),
      reason: z.string().trim().min(3).max(300),
    })
    .strict(),
  observationResponse: z
    .object({
      causalObservationIds: z.array(z.string().uuid()).max(12),
      action: z.enum(['continue', 'answer_now', 'clarify', 'park', 'change_subgoal', 'recheck']),
      acknowledgement: z.string().trim().min(3).max(500).nullable(),
      routeChange: z.string().trim().min(3).max(500).nullable(),
      returnPlan: z.string().trim().min(3).max(500).nullable(),
    })
    .strict(),
  selectionPolicy: z
    .object({
      normalizedCandidateWeights: z.record(petrosMoveTypeSchema, z.number().min(0).max(1)),
      exclusions: z
        .array(
          z
            .object({ move: petrosMoveTypeSchema, reason: z.string().trim().min(3).max(300) })
            .strict(),
        )
        .max(PETROS_MOVE_TYPES.length),
      selectedWeight: z.number().min(0).max(1),
      override: z
        .object({
          policy: z.string().trim().min(3).max(120),
          from: petrosMoveTypeSchema.nullable(),
          to: petrosMoveTypeSchema,
          reason: z.string().trim().min(3).max(300),
        })
        .strict()
        .nullable(),
      capabilityFallback: z.string().trim().min(3).max(300).nullable(),
    })
    .strict(),
};

export const petrosPlanDecisionSchema = z.discriminatedUnion('selectedMoveType', [
  z
    .object({
      ...decisionCommon,
      selectedMoveType: z.literal('hook'),
      moveParameters: z
        .object({ anchorStyle: z.enum(['question', 'surprising_fact', 'real_world']), revealAfterCommit: z.boolean() })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...decisionCommon,
      selectedMoveType: z.literal('prerequisite_check'),
      moveParameters: z
        .object({ conceptKeys: z.array(z.string().min(1).max(160)).min(1).max(4), mandatory: z.boolean(), questionCount: z.number().int().min(1).max(3) })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...decisionCommon,
      selectedMoveType: z.literal('goal_frame'),
      moveParameters: z
        .object({ timeboxMinutes: z.number().int().min(1).max(60), outcomeVerb: shortText })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...decisionCommon,
      selectedMoveType: z.literal('layered_explanation'),
      moveParameters: z
        .object({
          layerCount: z.number().int().min(1).max(3),
          emphasis: shortText,
          sourceGroundingRequired: z.boolean(),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...decisionCommon,
      selectedMoveType: z.literal('worked_example'),
      moveParameters: z
        .object({
          stepCount: z.number().int().min(2).max(6),
          predictionPoints: z.number().int().min(0).max(3),
          problemStyle: z.enum(['procedural', 'conceptual', 'exam_shaped']),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...decisionCommon,
      selectedMoveType: z.literal('analogy'),
      moveParameters: z
        .object({ familiarDomain: shortText, mappingCount: z.number().int().min(2).max(5), nameLimits: z.boolean() })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...decisionCommon,
      selectedMoveType: z.literal('story'),
      moveParameters: z
        .object({ eventCount: z.number().int().min(2).max(8), perspective: shortText, chronologyRequired: z.boolean() })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...decisionCommon,
      selectedMoveType: z.literal('derivation'),
      moveParameters: z
        .object({ stepCount: z.number().int().min(2).max(8), startingAssumption: shortText, depthSignal: shortText })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...decisionCommon,
      selectedMoveType: z.literal('diagram'),
      moveParameters: z
        .object({ diagramType: z.enum(['concept_map', 'flowchart', 'timeline', 'comparison']), editable: z.literal(true), fallback: z.enum(['structured_text', 'svg_safe']) })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...decisionCommon,
      selectedMoveType: z.literal('predict_then_reveal'),
      moveParameters: z
        .object({ predictionMode: z.enum(['short_answer', 'single_choice']), revealKind: z.enum(['outcome', 'next_step', 'relationship']) })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...decisionCommon,
      selectedMoveType: z.literal('contrast_case'),
      moveParameters: z
        .object({ distinction: shortText, examShaped: z.boolean() })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...decisionCommon,
      selectedMoveType: z.literal('misconception_demolition'),
      moveParameters: z
        .object({ misconceptionKey: shortText, commitmentRequired: z.boolean() })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...decisionCommon,
      selectedMoveType: z.literal('socratic_probe'),
      moveParameters: z
        .object({ probeNumber: z.number().int().min(1).max(2), insightTarget: shortText, explainAfterThis: z.boolean() })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...decisionCommon,
      selectedMoveType: z.literal('recall_check'),
      moveParameters: z
        .object({
          questionCount: z.number().int().min(1).max(3),
          answerMode: z.enum(['short_answer', 'single_choice', 'mixed']),
          coverage: shortText,
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...decisionCommon,
      selectedMoveType: z.literal('apply_to_your_world'),
      moveParameters: z
        .object({ contextKind: z.enum(['syllabus', 'exam', 'daily_life', 'student_interest']), examShaped: z.boolean() })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...decisionCommon,
      selectedMoveType: z.literal('synthesis'),
      moveParameters: z
        .object({
          promptStyle: z.enum(['one_sentence', 'teach_back', 'compare']),
          includeForwardLink: z.boolean(),
          focus: shortText,
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...decisionCommon,
      selectedMoveType: z.literal('artifact_commit'),
      moveParameters: z
        .object({ artifactKinds: z.array(z.enum(['flashcard', 'diagram', 'note', 'rule_card'])).min(1).max(4), requireExplicitConsent: z.literal(true) })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...decisionCommon,
      selectedMoveType: z.literal('forward_link'),
      moveParameters: z
        .object({ nextConcept: shortText, unfinishedThread: z.boolean() })
        .strict(),
    })
    .strict(),
]);
export type PetrosPlanDecision = z.infer<typeof petrosPlanDecisionSchema>;

const sourceGroundingSchema = z
  .array(
    z
      .object({
        label: z.string().trim().min(1).max(160),
        reference: z.string().trim().min(1).max(500).optional(),
      })
      .strict(),
  )
  .max(8);

const renderCommon = {
  schemaVersion: z.literal(PETROS_RENDER_SCHEMA_VERSION),
  title: z.string().trim().min(3).max(180),
  presentation: petrosTeachingPresentationSchema.optional(),
};

export const petrosTeachingBlockContentSchema = z.discriminatedUnion('type', [
  z
    .object({
      ...renderCommon,
      type: z.literal('hook'),
      prompt: z.string().trim().min(8).max(700),
      reveal: z.string().trim().min(8).max(1_200),
      anchor: z.string().trim().min(3).max(500),
    })
    .strict(),
  z
    .object({
      ...renderCommon,
      type: z.literal('prerequisite_check'),
      instructions: z.string().trim().min(3).max(500),
      prerequisites: z
        .array(
          z
            .object({ key: z.string().min(1).max(160), label: z.string().min(1).max(240) })
            .strict(),
        )
        .min(1)
        .max(4),
      detourMessage: z.string().trim().min(8).max(700),
    })
    .strict(),
  z
    .object({
      ...renderCommon,
      type: z.literal('goal_frame'),
      goal: z.string().trim().min(8).max(700),
      timeEstimateMinutes: z.number().int().min(1).max(60),
      checkpoints: z.array(z.string().trim().min(2).max(240)).min(1).max(6),
    })
    .strict(),
  z
    .object({
      ...renderCommon,
      type: z.literal('layered_explanation'),
      firstLayer: z.string().trim().min(20).max(2_000),
      deeperLayers: z
        .array(
          z
            .object({
              id: z.string().trim().min(1).max(80),
              label: z.string().trim().min(1).max(120),
              content: z.string().trim().min(20).max(2_000),
            })
            .strict(),
        )
        .max(2),
      keyIdea: z.string().trim().min(5).max(500),
      sourceGrounding: sourceGroundingSchema,
    })
    .strict(),
  z
    .object({
      ...renderCommon,
      type: z.literal('worked_example'),
      problemStatement: z.string().trim().min(10).max(1_000),
      steps: z
        .array(
          z
            .object({
              id: z.string().trim().min(1).max(80),
              title: z.string().trim().min(2).max(160),
              explanation: z.string().trim().min(5).max(1_000),
              predictionPrompt: z.string().trim().min(3).max(500).optional(),
            })
            .strict(),
        )
        .min(2)
        .max(6),
      finalCheck: z.string().trim().min(5).max(700),
      sourceGrounding: sourceGroundingSchema,
    })
    .strict(),
  z
    .object({
      ...renderCommon,
      type: z.literal('analogy'),
      familiarDomain: z.string().trim().min(3).max(300),
      targetIdea: z.string().trim().min(3).max(500),
      mappings: z
        .array(
          z
            .object({ familiar: z.string().min(1).max(300), target: z.string().min(1).max(300) })
            .strict(),
        )
        .min(2)
        .max(5),
      limit: z.string().trim().min(3).max(600),
    })
    .strict(),
  z
    .object({
      ...renderCommon,
      type: z.literal('story'),
      setup: z.string().trim().min(8).max(800),
      events: z
        .array(
          z
            .object({ id: z.string().min(1).max(80), label: z.string().min(1).max(200), detail: z.string().min(5).max(800) })
            .strict(),
        )
        .min(2)
        .max(8),
      takeaway: z.string().trim().min(5).max(700),
    })
    .strict(),
  z
    .object({
      ...renderCommon,
      type: z.literal('derivation'),
      startingAssumptions: z.array(z.string().min(2).max(500)).min(1).max(6),
      steps: z
        .array(
          z
            .object({ id: z.string().min(1).max(80), expression: z.string().min(1).max(500), explanation: z.string().min(3).max(800) })
            .strict(),
        )
        .min(2)
        .max(8),
      conclusion: z.string().trim().min(3).max(700),
    })
    .strict(),
  z
    .object({
      ...renderCommon,
      type: z.literal('diagram'),
      diagramType: z.enum(['concept_map', 'flowchart', 'timeline', 'comparison']),
      nodes: z
        .array(
          z
            .object({ id: z.string().min(1).max(80), label: z.string().min(1).max(240), description: z.string().max(600) })
            .strict(),
        )
        .min(2)
        .max(20),
      edges: z
        .array(
          z
            .object({ from: z.string().min(1).max(80), to: z.string().min(1).max(80), label: z.string().max(160) })
            .strict(),
        )
        .max(30),
      altText: z.string().trim().min(12).max(1_200),
      editable: z.literal(true),
      fallbackText: z.string().trim().min(12).max(1_500),
    })
    .strict(),
  z
    .object({
      ...renderCommon,
      type: z.literal('predict_then_reveal'),
      prompt: z.string().trim().min(5).max(700),
      reveal: z.string().trim().min(3).max(1_000),
      explanation: z.string().trim().min(8).max(1_200),
    })
    .strict(),
  z
    .object({
      ...renderCommon,
      type: z.literal('contrast_case'),
      left: z
        .object({ label: z.string().min(1).max(160), prompt: z.string().min(5).max(700), method: z.string().min(3).max(700) })
        .strict(),
      right: z
        .object({ label: z.string().min(1).max(160), prompt: z.string().min(5).max(700), method: z.string().min(3).max(700) })
        .strict(),
      keyDistinction: z.string().trim().min(5).max(800),
    })
    .strict(),
  z
    .object({
      ...renderCommon,
      type: z.literal('misconception_demolition'),
      misconception: z.string().trim().min(5).max(700),
      commitmentPrompt: z.string().trim().min(5).max(700),
      correction: z.string().trim().min(8).max(1_200),
      evidence: z.array(z.string().min(3).max(600)).min(1).max(5),
    })
    .strict(),
  z
    .object({
      ...renderCommon,
      type: z.literal('socratic_probe'),
      probeNumber: z.number().int().min(1).max(2),
      prompt: z.string().trim().min(5).max(700),
      insightTarget: z.string().trim().min(3).max(600),
      explanationAfterCap: z.string().trim().min(8).max(1_200),
    })
    .strict(),
  z
    .object({
      ...renderCommon,
      type: z.literal('recall_check'),
      instructions: z.string().trim().min(3).max(500),
      questions: z
        .array(
          z
            .object({
              id: z.string().trim().min(1).max(80),
              prompt: z.string().trim().min(5).max(700),
              responseType: z.enum(['short_answer', 'single_choice']),
              choices: z
                .array(
                  z
                    .object({
                      id: z.string().trim().min(1).max(80),
                      label: z.string().trim().min(1).max(300),
                    })
                    .strict(),
                )
                .min(2)
                .max(5)
                .optional(),
            })
            .strict()
            .superRefine((question, ctx) => {
              if (question.responseType === 'single_choice' && !question.choices) {
                ctx.addIssue({
                  code: z.ZodIssueCode.custom,
                  path: ['choices'],
                  message: 'Choices are required for a single-choice question.',
                });
              }
              if (question.responseType === 'short_answer' && question.choices) {
                ctx.addIssue({
                  code: z.ZodIssueCode.custom,
                  path: ['choices'],
                  message: 'Short-answer questions cannot include choices.',
                });
              }
            }),
        )
        .min(1)
        .max(3),
      answerContract: z
        .object({
          completion: z.enum(['all_questions_answered']),
          responseHandling: z.enum(['record_only_stage_2', 'evaluate_stage_3']),
        })
        .strict(),
      feedback: z
        .object({
          submittedMessage: z.string().trim().min(3).max(300),
          stageBoundary: z.string().trim().min(3).max(300),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...renderCommon,
      type: z.literal('apply_to_your_world'),
      prompt: z.string().trim().min(5).max(700),
      examples: z.array(z.string().trim().min(3).max(600)).min(1).max(5),
      examShape: z.string().trim().min(3).max(800).nullable(),
    })
    .strict(),
  z
    .object({
      ...renderCommon,
      type: z.literal('synthesis'),
      prompt: z.string().trim().min(8).max(700),
      tighteningGuidance: z.string().trim().min(5).max(700).optional(),
      forwardLink: z.string().trim().min(5).max(700).optional(),
    })
    .strict(),
  z
    .object({
      ...renderCommon,
      type: z.literal('artifact_commit'),
      prompt: z.string().trim().min(5).max(600),
      proposals: z
        .array(
          z
            .object({ id: z.string().min(1).max(80), kind: z.enum(['flashcard', 'diagram', 'note', 'rule_card']), label: z.string().min(1).max(240), preview: z.string().min(3).max(800) })
            .strict(),
        )
        .min(1)
        .max(8),
      consentRequired: z.literal(true),
    })
    .strict(),
  z
    .object({
      ...renderCommon,
      type: z.literal('forward_link'),
      nextConcept: z.string().trim().min(1).max(240),
      connection: z.string().trim().min(5).max(800),
      openQuestion: z.string().trim().min(5).max(700),
    })
    .strict(),
]);
export type PetrosTeachingBlockContent = z.infer<typeof petrosTeachingBlockContentSchema>;

export const petrosCheckpointSchema = z
  .object({
    id: z.string().trim().min(1).max(80),
    label: z.string().trim().min(1).max(120),
    status: z.enum(['pending', 'current', 'complete']),
  })
  .strict();

export const petrosPriorMoveSchema = z
  .object({
    decisionId: z.string().uuid(),
    sequence: z.number().int().positive(),
    decision: petrosPlanDecisionSchema,
    renderedBlockReference: z
      .object({ id: z.string().uuid(), type: petrosMoveTypeSchema })
      .strict()
      .nullable(),
    status: z.enum(['planned', 'rendered', 'completed', 'failed', 'overridden']),
    observedOutcome: z.record(z.unknown()).nullable(),
  })
  .strict();

export const petrosRecentObservationSchema = z
  .object({
    id: z.string().uuid(),
    type: petrosObservationTypeSchema,
    blockId: z.string().uuid().nullable(),
    decisionId: z.string().uuid().nullable(),
    targetId: z.string().max(160).nullable(),
    summary: z.string().trim().min(1).max(500),
    occurredAt: z.string().datetime(),
  })
  .strict();

export const petrosObservationOutcomeSummarySchema = z
  .object({
    answered: z.number().int().nonnegative(),
    correct: z.number().int().nonnegative(),
    incorrect: z.number().int().nonnegative(),
    partial: z.number().int().nonnegative(),
    highValueMisconceptions: z.number().int().nonnegative(),
    fragileSuccesses: z.number().int().nonnegative(),
    openDetours: z.number().int().nonnegative(),
    activeStruggleLevel: z.number().int().min(0).max(4),
    activeWrongAttemptCount: z.number().int().nonnegative().default(0),
  })
  .strict();

export const petrosAnswerEvaluationSchema = z
  .object({
    schemaVersion: z.literal(PETROS_EVALUATION_SCHEMA_VERSION),
    correctness: z.enum(['correct', 'incorrect', 'partial', 'invalid']),
    credit: z.number().min(0).max(1),
    evidence: z.array(z.string().trim().min(1).max(300)).max(6),
    errorClass: z.enum([
      'none',
      'concept_gap',
      'procedure_gap',
      'calculation_slip',
      'misread',
      'incomplete',
      'invalid_input',
      'unknown',
    ]),
    misconception: z.string().trim().min(1).max(500).nullable(),
    feedback: z.string().trim().min(3).max(700),
    safeNextHint: z.string().trim().min(3).max(500).nullable(),
  })
  .strict();
export type PetrosAnswerEvaluation = z.infer<typeof petrosAnswerEvaluationSchema>;

export const petrosQuestionChoiceSchema = z
  .object({
    id: z.string().trim().min(1).max(80),
    label: z.string().trim().min(1).max(300),
  })
  .strict();

export const petrosStudentAnswerAttemptSchema = z
  .object({
    observationId: z.string().uuid(),
    questionId: z.string().uuid(),
    rawAnswer: z.string().max(4_000),
    confidence: petrosConfidenceSchema,
    correctness: z.enum(['correct', 'incorrect', 'partial', 'invalid']),
    credit: z.number().min(0).max(1),
    feedback: z.string(),
    why: z.array(z.string()),
    errorClass: z.string(),
    submittedAt: z.string().datetime(),
    ladderLevel: z.number().int().min(0).max(4),
    supportKind: z.enum(['none', 'hint', 'missing_step', 'worked_solution', 'stuck_path']),
    supportText: z.string().nullable(),
    highValueMisconception: z.boolean(),
    fragileSuccess: z.boolean(),
    recovery: z.boolean(),
  })
  .strict();

export const petrosStudentQuestionStateSchema = z
  .object({
    id: z.string().uuid(),
    rootQuestionId: z.string().uuid(),
    parentQuestionId: z.string().uuid().nullable(),
    targetId: z.string().trim().min(1).max(160),
    equivalenceKey: z.string().trim().min(1).max(160),
    prompt: z.string().trim().min(3).max(1_200),
    responseType: z.enum(['short_answer', 'single_choice']),
    choices: z.array(petrosQuestionChoiceSchema).min(2).max(6).nullable(),
    purpose: z.enum(['guess_first', 'recall', 'equivalent_retry', 'reworded_success']),
    active: z.boolean(),
    locked: z.boolean(),
    hints: z
      .array(
        z
          .object({
            observationId: z.string().uuid(),
            text: z.string(),
            createdAt: z.string().datetime(),
          })
          .strict(),
      )
      .max(12),
    attempts: z.array(petrosStudentAnswerAttemptSchema).max(8),
  })
  .strict();
export type PetrosStudentQuestionState = z.infer<typeof petrosStudentQuestionStateSchema>;

export const petrosDetourSchema = z
  .object({
    id: z.string().uuid(),
    observationId: z.string().uuid(),
    question: z.string().max(2_000),
    status: z.enum(['pending', 'active', 'parked', 'clarifying', 'rejoined']),
    action: z.enum(['pending', 'answer_now', 'clarify', 'park', 'change_subgoal']),
    acknowledgement: z.string().nullable(),
    routeChange: z.string().nullable(),
    returnPlan: z.string().nullable(),
    changedDecisionId: z.string().uuid().nullable(),
    createdAt: z.string().datetime(),
    rejoinedAt: z.string().datetime().nullable(),
  })
  .strict();
export type PetrosDetour = z.infer<typeof petrosDetourSchema>;

/** Complete, explicit input contract sent to PLAN. It contains no AI transcript. */
export const petrosSessionStateSchema = z
  .object({
    stateVersion: z.literal(PETROS_SESSION_STATE_VERSION),
    sessionId: z.string().uuid(),
    studentId: z.string().uuid(),
    institutionId: z.string().uuid(),
    sessionType: z.enum(PETROS_SESSION_TYPES),
    topic: z.string().trim().min(1).max(240),
    currentGoal: z.string().trim().min(3).max(600),
    time: z
      .object({
        budgetSeconds: z.number().int().positive(),
        elapsedSeconds: z.number().int().nonnegative(),
        remainingSeconds: z.number().int().nonnegative(),
      })
      .strict(),
    moves: z
      .object({
        maximum: z.number().int().min(1).max(20),
        used: z.number().int().nonnegative(),
        remaining: z.number().int().nonnegative(),
      })
      .strict(),
    checkpointPlan: z.array(petrosCheckpointSchema).min(1).max(12),
    currentCheckpointId: z.string().trim().min(1).max(80),
    priorMoves: z.array(petrosPriorMoveSchema).max(20),
    learnerContext: z.record(z.unknown()),
    learnerSnapshot: petrosLearnerSnapshotSchema.nullable().optional(),
    topicContext: z.record(z.unknown()),
    resolvedTopicProfile: petrosResolvedTopicProfileSchema,
    sourceContext: z.record(z.unknown()).nullable(),
    observations: z
      .object({
        recent: z.array(petrosRecentObservationSchema).max(24),
        summarizedOutcomes: petrosObservationOutcomeSummarySchema,
      })
      .strict(),
    promptVersion: z.literal(PETROS_PLAN_PROMPT_VERSION),
    outputSchemaVersion: z.literal(PETROS_PLAN_SCHEMA_VERSION),
  })
  .strict();
export type PetrosSessionState = z.infer<typeof petrosSessionStateSchema>;

export const petrosCreateLearningSessionSchema = z
  .object({
    experience: z.enum([PETROS_INFLATION_PILOT, PETROS_DOCUMENT_TEACHING_EXPERIENCE]).optional(),
    clientRequestId: z.string().uuid(),
    sessionType: z.enum(PETROS_SESSION_TYPES).default('repair'),
    topic: z.string().trim().min(1).max(240),
    goal: z.string().trim().min(3).max(600).optional(),
    timeBudgetSeconds: z.number().int().min(300).max(2_400).default(480),
    maxMoves: z.number().int().min(2).max(8).default(4),
    learnerContext: z.record(z.unknown()).default({}),
    topicContext: z.record(z.unknown()).default({}),
    sourceContext: z
      .object({
        door: z.enum([
          'result_repair',
          'upcoming_exam',
          'uploaded_document',
          'learning_path',
          'assistant_handoff',
          'snap_question',
          'handwriting',
          'voice',
          'five_minute',
          'teach_it_back',
          'reflection_action',
          'active_homework',
          'student_portal',
        ]),
        intentId: z.string().uuid().optional(),
        referenceId: z.string().trim().min(1).max(200).optional(),
        scorePercent: z.number().min(0).max(100).optional(),
        label: z.string().trim().min(1).max(240).optional(),
        emotionalRegister: z.string().trim().min(1).max(80).optional(),
        registerFactors: z.array(z.string().trim().min(1).max(600)).max(8).optional(),
        citations: z.array(z.record(z.unknown())).max(24).optional(),
        conceptSource: z.object({
          pages: z.array(z.object({ page: z.number().int().positive(), text: z.string() })),
          complete: z.boolean(),
        }).optional(),
        policyDisclosures: z.array(z.string().trim().min(1).max(600)).max(12).optional(),
        returnHref: z.string().trim().startsWith('/').max(500).optional(),
        returnLabel: z.string().trim().min(1).max(120).optional(),
        resumeToken: z.string().uuid().optional(),
        examDate: z.string().datetime().optional(),
        pageIndex: z.number().int().nonnegative().optional(),
        pathItemId: z.string().uuid().optional(),
        sourceFingerprint: z.string().regex(/^[a-f0-9]{64}$/).optional(),
        assignmentContext: z
          .object({
            assignmentId: z.string().uuid(),
            classId: z.string().uuid(),
            subjectId: z.string().uuid().nullable(),
            status: z.enum(['assigned', 'submitted', 'late', 'extended', 'graded', 'missing']),
            opensAt: z.string().datetime(),
            dueAt: z.string().datetime(),
            deadlineDate: z.string().date().nullable(),
            extendedUntil: z.string().datetime().nullable(),
            teacherOverride: z.enum(['inherit', 'allow_solution', 'force_guidance']),
            relationBasisPoints: z.number().int().min(0).max(10_000),
          })
          .strict()
          .optional(),
        institutionalDecision: z
          .object({
            syllabus: petrosSyllabusDecisionSchema,
            homework: petrosHomeworkDecisionSchema.nullable(),
          })
          .strict()
          .optional(),
      })
      .strict()
      .nullable()
      .default(null),
    profileContext: z
      .object({
        topicKey: z.string().trim().min(1).max(160).optional(),
        subjectKey: z.string().trim().min(1).max(160).optional(),
        subjectLabel: z.string().trim().min(1).max(240).optional(),
        gradeBand: z.string().trim().min(1).max(120).optional(),
        curriculumKey: z.string().trim().min(1).max(160).optional(),
        curriculumLabel: z.string().trim().min(1).max(240).optional(),
        curriculumVersion: z.string().trim().min(1).max(120).optional(),
        syllabusVersion: z.string().trim().min(1).max(120).optional(),
      })
      .strict()
      .default({}),
  })
  .strict();
export type PetrosCreateLearningSessionInput = z.input<typeof petrosCreateLearningSessionSchema>;

export const petrosContinueSessionSchema = z
  .object({
    idempotencyKey: z.string().uuid(),
  })
  .strict();
export type PetrosContinueSessionInput = z.infer<typeof petrosContinueSessionSchema>;
export const petrosCompleteBlockSchema = z
  .object({
    idempotencyKey: z.string().uuid(),
    blockType: petrosMoveTypeSchema,
    expectedBlockVersion: z.number().int().nonnegative(),
    interactionState: z.record(z.unknown()).default({}),
    observedOutcome: z.record(z.unknown()).default({ completed: true }),
  })
  .strict();
export type PetrosCompleteBlockInput = z.infer<typeof petrosCompleteBlockSchema>;
export const petrosCloseSessionSchema = z
  .object({
    idempotencyKey: z.string().uuid(),
    reason: z.enum(['student_stopped', 'goal_met']),
  })
  .strict();
export type PetrosCloseSessionInput = z.infer<typeof petrosCloseSessionSchema>;
export const petrosUpdateBlockInteractionSchema = z
  .object({
    interactionState: z.record(z.unknown()),
  })
  .strict();
export type PetrosUpdateBlockInteractionInput = z.infer<typeof petrosUpdateBlockInteractionSchema>;

export const petrosReexplainBlockSchema = z
  .object({
    idempotencyKey: z.string().uuid(),
    level: z.enum(['simpler', 'deeper']),
    expectedBlockVersion: z.number().int().nonnegative(),
    interactionState: z.record(z.unknown()).default({}),
  })
  .strict();
export type PetrosReexplainBlockInput = z.infer<typeof petrosReexplainBlockSchema>;

export const petrosSubmitAnswerSchema = z
  .object({
    idempotencyKey: z.string().uuid(),
    questionId: z.string().uuid(),
    answer: z.string().trim().min(1).max(4_000),
    confidence: petrosConfidenceSchema,
    expectedBlockVersion: z.number().int().nonnegative(),
    responseTimeMs: z.number().int().min(0).max(3_600_000).optional(),
  })
  .strict();
export type PetrosSubmitAnswerInput = z.infer<typeof petrosSubmitAnswerSchema>;

export const petrosRequestHintSchema = z
  .object({
    idempotencyKey: z.string().uuid(),
    questionId: z.string().uuid(),
    expectedBlockVersion: z.number().int().nonnegative(),
  })
  .strict();
export type PetrosRequestHintInput = z.infer<typeof petrosRequestHintSchema>;

export const petrosComposerQuestionSchema = z
  .object({
    idempotencyKey: z.string().uuid(),
    question: z.string().trim().min(2).max(2_000),
    expectedSessionVersion: z.number().int().nonnegative(),
    pausePoint: z
      .object({
        blockId: z.string().uuid(),
        segmentId: z.string().trim().min(1).max(240),
        targetKey: z.string().trim().min(1).max(300),
        label: z.string().trim().min(1).max(180),
        spokenText: z.string().trim().min(1).max(2_000),
        wordIndex: z.number().int().nonnegative().max(10_000),
      })
      .strict()
      .optional(),
  })
  .strict();
export type PetrosComposerQuestionInput = z.infer<typeof petrosComposerQuestionSchema>;

export const petrosSessionBlockSchema = z
  .object({
    id: z.string().uuid(),
    sessionId: z.string().uuid(),
    decisionId: z.string().uuid(),
    sequence: z.number().int().positive(),
    status: z.enum(['current', 'completed']),
    version: z.number().int().nonnegative(),
    content: petrosTeachingBlockContentSchema,
    interactionState: z.record(z.unknown()),
    observedOutcome: z.record(z.unknown()).nullable(),
    questions: z.array(petrosStudentQuestionStateSchema),
    whyThis: z.string(),
    correlationId: z.string().uuid(),
    delivery: z.enum(['ai', 'deterministic_fallback']),
    createdAt: z.string().datetime(),
    completedAt: z.string().datetime().nullable(),
  })
  .strict();
export type PetrosSessionBlock = z.infer<typeof petrosSessionBlockSchema>;

export const petrosLearningSessionDocumentSchema = z
  .object({
    presentationCheckpoint: petrosPlaybackCheckpointSchema.nullable().optional(),
    experience: z.enum([PETROS_INFLATION_PILOT, PETROS_DOCUMENT_TEACHING_EXPERIENCE]).optional(),
    pilot: petrosPilotStateSchema.optional(),
    documentTeaching: petrosDocumentTeachingStateSchema.optional(),
    stateVersion: z.literal(PETROS_SESSION_STATE_VERSION),
    id: z.string().uuid(),
    version: z.number().int().nonnegative(),
    status: z.enum(['active', 'paused', 'closed']),
    sessionType: z.enum(PETROS_SESSION_TYPES),
    topic: z.string(),
    currentGoal: z.string(),
    timeBudgetSeconds: z.number().int(),
    elapsedSeconds: z.number().int(),
    maxMoves: z.number().int(),
    checkpoints: z.array(petrosCheckpointSchema),
    currentCheckpointId: z.string(),
    closeReason: z.string().nullable(),
    sourceContext: z.record(z.unknown()).nullable(),
    topicProfile: z
      .object({
        profileId: z.string().uuid(),
        canonicalVersionId: z.string().uuid(),
        canonicalVersion: z.number().int().positive(),
        resolution: z.enum(['canonical', 'institution_override']),
        overrideVersion: z.number().int().positive().nullable(),
        knowledgeTypes: z.array(z.string()),
        representations: z.array(z.string()),
        cacheKey: z.string(),
      })
      .strict(),
    blocks: z.array(petrosSessionBlockSchema),
    detours: z.array(petrosDetourSchema),
    observationSummary: petrosObservationOutcomeSummarySchema,
    expectedMoveType: petrosMoveTypeSchema.nullable(),
    fallbackNotice: z.string().nullable(),
    personalization: z
      .object({
        status: z.enum(['neutral', 'history_informed', 'stale_fallback']),
        reasons: z.array(z.string()).max(8),
        sessionOverride: z
          .object({
            pace: z.enum(['deliberate', 'balanced', 'fast']).nullable(),
            depth: z.enum(['concise', 'balanced', 'deep']).nullable(),
            source: z.literal('student_current_session'),
            updatedAt: z.string().datetime(),
          })
          .strict()
          .nullable(),
      })
      .strict()
      .optional(),
    institutionalPolicy: z
      .object({
        snapshotId: z.string().uuid(),
        disclosure: petrosStudentDisclosureSchema,
        stableForSession: z.literal(true),
        midSessionPolicyChangesDeferred: z.literal(true),
        voiceRequired: z.literal(false),
        handoffEnabled: z.boolean(),
        handoffOfferAfterFailedRepairCount: z.number().int().min(1).max(10),
      })
      .strict()
      .optional(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();
export type PetrosLearningSessionDocument = z.infer<typeof petrosLearningSessionDocumentSchema>;

export const petrosDecisionDiagnosticQuerySchema = z.object({
  sessionId: z.string().uuid().optional(),
  institutionId: z.string().uuid().optional(),
  sessionType: z.enum(PETROS_SESSION_TYPES).optional(),
  moveType: petrosMoveTypeSchema.optional(),
  functionKey: z.string().trim().min(1).max(160).optional(),
  observationType: petrosObservationTypeSchema.optional(),
  source: z.enum(['ai', 'deterministic_fallback']).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type PetrosDecisionDiagnosticQuery = z.infer<typeof petrosDecisionDiagnosticQuerySchema>;
