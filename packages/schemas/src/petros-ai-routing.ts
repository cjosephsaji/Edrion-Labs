import { z } from 'zod';
import { PETROS_MOVE_TYPES } from './petros-topic-profiles';

export const PETROS_INPUT_TYPES = ['text', 'image', 'audio', 'document'] as const;
export const PETROS_RESPONSE_FORMATS = [
  'text',
  'json',
  'image',
  'svg',
  'audio',
  'structured_teaching_block',
] as const;
export const PETROS_MODEL_CAPABILITIES = [
  'text',
  'vision',
  'audio_input',
  'audio_output',
  'speech_to_text',
  'text_to_speech',
  'audio_streaming',
  'ocr',
  'handwriting',
  'structured_output',
  'tools',
  'streaming',
  'image_generation',
  'code_generation',
  'reasoning',
  'embeddings',
] as const;
export const PETROS_ADAPTER_TYPES = [
  'openai',
  'anthropic',
  'gemini',
  'openai_compatible',
  'self_hosted',
] as const;

export const petrosInputTypeSchema = z.enum(PETROS_INPUT_TYPES);
export const petrosResponseFormatSchema = z.enum(PETROS_RESPONSE_FORMATS);
export const petrosModelCapabilitySchema = z.enum(PETROS_MODEL_CAPABILITIES);
export const petrosAdapterTypeSchema = z.enum(PETROS_ADAPTER_TYPES);

export const petrosFunctionSettingsSchema = z.object({
  maxInputTokens: z.number().int().min(1).max(10_000_000).default(32_000),
  maxOutputTokens: z.number().int().min(1).max(1_000_000).default(4_096),
  temperature: z.number().min(0).max(2).default(0.3),
  reasoningLevel: z.enum(['none', 'low', 'medium', 'high']).optional(),
  timeoutMs: z.number().int().min(500).max(600_000).default(45_000),
  maxRetries: z.number().int().min(0).max(10).default(2),
  streaming: z.boolean().default(true),
  caching: z.boolean().default(true),
  dailyRequestLimit: z.number().int().positive().optional(),
  monthlyRequestLimit: z.number().int().positive().optional(),
  maxCostPerRequestMicros: z.number().int().nonnegative().optional(),
  maxCostPerStudentMicros: z.number().int().nonnegative().optional(),
  maxInstitutionUsage: z.number().int().positive().optional(),
});
export type PetrosFunctionSettingsInput = z.infer<typeof petrosFunctionSettingsSchema>;

export const DEFAULT_PETROS_FUNCTION_SETTINGS: PetrosFunctionSettingsInput = {
  maxInputTokens: 32_000,
  maxOutputTokens: 4_096,
  temperature: 0.3,
  timeoutMs: 45_000,
  maxRetries: 2,
  streaming: true,
  caching: true,
};

export interface PetrosFunctionDefinition {
  key: string;
  displayName: string;
  description: string;
  category: string;
  allowedInputTypes: (typeof PETROS_INPUT_TYPES)[number][];
  responseFormat: (typeof PETROS_RESPONSE_FORMATS)[number];
  requiredCapabilities: (typeof PETROS_MODEL_CAPABILITIES)[number][];
  essential?: boolean;
  /**
   * Key of an existing function whose routes a newly registered function inherits.
   * Without this a new capability lands with zero routes and fails every call until an
   * administrator configures it by hand. Inheritance applies once, on first insert only.
   */
  routeTemplateKey?: string;
}

const fn = (
  key: string,
  displayName: string,
  category: string,
  description: string,
  options: Partial<Pick<PetrosFunctionDefinition, 'allowedInputTypes' | 'responseFormat' | 'requiredCapabilities' | 'essential' | 'routeTemplateKey'>> = {},
): PetrosFunctionDefinition => ({
  key,
  displayName,
  category,
  description,
  allowedInputTypes: options.allowedInputTypes ?? ['text'],
  responseFormat: options.responseFormat ?? 'structured_teaching_block',
  requiredCapabilities: options.requiredCapabilities ?? ['text', 'structured_output'],
  essential: options.essential,
  routeTemplateKey: options.routeTemplateKey,
});

/**
 * Code-level registry of capabilities, not provider assignments. The API reconciles these rows
 * into the database, so a newly registered function appears in Super Admin without UI changes.
 */
export const PETROS_FUNCTION_CATALOG: PetrosFunctionDefinition[] = [
  fn('teaching.plan.generate', 'Teaching-plan generation', 'Orchestration', 'Plan checkpoints for an adaptive teaching session.', { essential: true }),
  fn('teaching.next_action.select', 'PLAN — next teaching action', 'Orchestration', 'Choose one strictly structured teaching move from explicit learner and session state.', { essential: true }),
  fn('teaching.block.render', 'RENDER — teaching block', 'Orchestration', 'Render one validated PLAN decision as a typed learning block.', { essential: true }),
  fn('assistant.context.answer', 'Contextual assistant answer', 'Orchestration', 'Answer one small portal-screen question or produce an explicit structured session offer.', { responseFormat: 'json', essential: true }),
  fn('document.concepts.extract', 'Document concept map', 'Orchestration', 'Organize authorized document text into concepts, prerequisites, and source references.', { responseFormat: 'json', routeTemplateKey: 'assistant.context.answer' }),
  fn('document.teaching.plan', 'Document teaching plan', 'Orchestration', 'Generate a validated, source-grounded teaching experience for one authorized document topic.', { responseFormat: 'json', routeTemplateKey: 'assistant.context.answer' }),
  fn('companion.turn', 'Companion turn', 'Companion', 'Answer one grounded companion turn as typed blocks, optionally proposing one registered action.', { responseFormat: 'json', essential: true, routeTemplateKey: 'assistant.context.answer' }),
  fn('companion.thread.summarize', 'Companion thread summary', 'Companion', 'Compact older companion turns into a short factual thread summary.', { responseFormat: 'json', routeTemplateKey: 'assistant.context.answer' }),
  fn('companion.briefing.phrase', 'Companion briefing phrasing', 'Companion', 'Phrase an already selected deterministic briefing without adding facts or changing priority.', { responseFormat: 'json', routeTemplateKey: 'assistant.context.answer' }),
  ...PETROS_MOVE_TYPES.map((move) =>
    fn(
      `teaching.move.${move}.render`,
      `${move.replace(/_/g, ' ')} renderer`,
      'Teaching moves',
      `Render the validated ${move.replace(/_/g, ' ')} move as its typed Stage 4 block.`,
      { essential: move === 'prerequisite_check' || move === 'synthesis' },
    ),
  ),
  fn('explanation.general', 'General explanation', 'Teaching', 'Generate a clear, grounded explanation.'),
  fn('explanation.simple', 'Simplified explanation', 'Teaching', 'Re-explain with simpler language and smaller prerequisite steps.'),
  fn('explanation.deep', 'Deep explanation', 'Teaching', 'Generate a detailed, high-reasoning explanation.', { requiredCapabilities: ['text', 'structured_output', 'reasoning'] }),
  fn('doubt.analyse', 'Doubt analysis', 'Teaching', 'Locate the exact point of confusion before teaching.', { essential: true }),
  fn('teach_back.explanation.analyse', 'Teach-it-back explanation analysis', 'Teach-it-back', 'Extract coverage, claims, examples, uncertainty, and one high-value grounded gap from a student explanation.', { responseFormat: 'json', essential: true }),
  fn('teach_back.follow_up.generate', 'Teach-it-back junior follow-up', 'Teach-it-back', 'Ask one respectful confused-junior question grounded in the student explanation and the selected gap.', { responseFormat: 'json', essential: true }),
  fn('teach_back.verdict.generate', 'Teach-it-back verdict', 'Teach-it-back', 'Create an evidence-linked, nonnumeric explanation verdict and editable recap proposal.', { responseFormat: 'json', essential: true }),
  fn('reflection.session_recap.generate', 'How-you-learn session recap', 'Reflection', 'Create a concise versioned recap that separates observed learning-process facts from tentative inference.', { responseFormat: 'json' }),
  fn('reflection.gap_explanation.generate', 'Prerequisite gap explanation', 'Reflection', 'Explain a deterministic prerequisite-gap candidate as an uncertainty-labelled, evidence-linked repair hypothesis.', { responseFormat: 'json' }),
  fn('institution.teacher_escalation_summary.generate', 'Teacher escalation summary', 'Institutional loop', 'Create a student-visible, editable, evidence-linked teacher handoff summary with private and provider details excluded.', { responseFormat: 'json', essential: true }),
  fn('institution.parent_digest.generate', 'Parent learning digest', 'Institutional loop', 'Create a bounded guardian digest from policy-permitted evidence without raw session content or ability labels.', { responseFormat: 'json' }),
  fn('interaction.spoken', 'Spoken interaction', 'Voice', 'Render one structured session move for an interruptible hands-free turn.', { allowedInputTypes: ['text', 'audio'], responseFormat: 'audio', requiredCapabilities: ['audio_input', 'audio_output', 'audio_streaming'] }),
  fn('speech.transcribe', 'Speech to text', 'Voice', 'Transcribe student speech with language, confidence, and uncertainty.', { allowedInputTypes: ['audio'], responseFormat: 'json', requiredCapabilities: ['audio_input', 'speech_to_text'] }),
  fn('speech.synthesise', 'Text to speech', 'Voice', 'Render Petros teaching as speech.', { responseFormat: 'audio', requiredCapabilities: ['audio_output', 'text_to_speech'] }),
  fn('visual.diagram.generate', 'Diagram generation', 'Visuals', 'Generate an editable educational diagram.', { responseFormat: 'svg', requiredCapabilities: ['text', 'structured_output'] }),
  fn('visual.animation.generate', 'Animated visual generation', 'Visuals', 'Generate an animated teaching visual.', { responseFormat: 'json', requiredCapabilities: ['text', 'code_generation', 'structured_output'] }),
  fn('visual.simulation.generate', 'Interactive simulation generation', 'Visuals', 'Generate a safe interactive learning simulation.', { responseFormat: 'json', requiredCapabilities: ['text', 'code_generation', 'structured_output'] }),
  fn('vision.image.understand', 'Image understanding', 'Vision', 'Understand a student-provided learning image.', { allowedInputTypes: ['image'], responseFormat: 'json', requiredCapabilities: ['vision', 'structured_output'] }),
  fn('vision.handwriting.analyse', 'Handwriting analysis', 'Vision', 'Read and analyse handwritten working step by step.', { allowedInputTypes: ['image'], responseFormat: 'json', requiredCapabilities: ['vision', 'handwriting', 'structured_output'] }),
  fn('vision.question.extract', 'Question extraction from photos', 'Vision', 'Extract question structure from a photograph.', { allowedInputTypes: ['image'], responseFormat: 'json', requiredCapabilities: ['vision', 'ocr', 'structured_output'] }),
  fn('answer.evaluate', 'Answer evaluation', 'Assessment', 'Evaluate correctness against the task and evidence.', { essential: true }),
  fn('working.evaluate_steps', 'Step-by-step work evaluation', 'Assessment', 'Find the precise step where working diverged.', { allowedInputTypes: ['text', 'image'], responseFormat: 'json', requiredCapabilities: ['text', 'vision', 'structured_output'], essential: true }),
  fn('mistake.classify', 'Mistake classification', 'Assessment', 'Classify conceptual, procedural, careless, timing, or reading errors.'),
  fn('misconception.detect', 'Misconception detection', 'Learner intelligence', 'Detect stable wrong intuitions from learning evidence.'),
  fn('prerequisite_gap.detect', 'Prerequisite-gap detection', 'Learner intelligence', 'Identify earlier knowledge blocking the current topic.', { essential: true }),
  fn('quiz.generate', 'Quiz generation', 'Practice', 'Generate a short adaptive quiz.'),
  fn('practice.generate', 'Practice-question generation', 'Practice', 'Generate calibrated practice questions.'),
  fn('hint.generate', 'Hint generation', 'Practice', 'Give the next struggle-ladder hint without revealing too much.', { essential: true }),
  fn('solution.worked.generate', 'Worked-solution generation', 'Practice', 'Generate a stepwise worked solution after productive struggle.'),
  fn('artifact.flashcards.generate', 'Flashcard generation', 'Artifacts', 'Propose editable flashcards from a session.', { responseFormat: 'json' }),
  fn('artifact.notes.generate', 'Notes and summary generation', 'Artifacts', 'Propose editable notes and summaries.', { responseFormat: 'json' }),
  fn('artifact.diagram.generate', 'Editable diagram generation', 'Artifacts', 'Propose a safe structured diagram that the learner can edit before saving.', { responseFormat: 'json' }),
  fn('plan.study.generate', 'Study-plan generation', 'Planning', 'Build a personal study plan from deadlines and mastery.'),
  fn('plan.exam_revision.generate', 'Exam revision planning', 'Planning', 'Create a revision plan grounded in syllabus, time, and weak areas.'),
  fn('engagement.analyse', 'Student engagement analysis', 'Engagement', 'Interpret behavioural learning signals without diagnosing emotion.'),
  fn('engagement.fatigue_intervention', 'Mood or fatigue intervention', 'Engagement', 'Select a respectful break, pace, or method change.'),
  fn('engagement.motivate', 'Humour or motivational intervention', 'Engagement', 'Generate appropriate light motivation grounded in effort.'),
  fn('language.translate', 'Translation', 'Language', 'Translate educational material while preserving meaning.'),
  fn('language.mixed_teaching', 'Mixed-language teaching', 'Language', 'Teach naturally in an approved mixed-language register.'),
  fn('document.understand', 'Document understanding', 'Grounding', 'Understand student or institution documents.', { allowedInputTypes: ['document', 'text'], responseFormat: 'json', requiredCapabilities: ['text', 'structured_output'] }),
  fn('syllabus.retrieve_ground', 'Syllabus retrieval and grounding', 'Grounding', 'Retrieve and ground teaching inside the active syllabus.', { essential: true }),
  fn('assignment.assist', 'Assignment assistance', 'Governance', 'Provide policy-aware assignment help that shifts toward questioning.', { essential: true }),
  fn('learner_model.update', 'Learner-model update', 'Learner intelligence', 'Update structured mastery, calibration, pace, and move outcomes.', { responseFormat: 'json', essential: true }),
  fn('session.recap.generate', 'Session recap generation', 'Artifacts', 'Generate a recap about how the student learned, not only the topic.'),
  fn('topic.profile.generate', 'Topic profile generation', 'Orchestration', 'Profile knowledge type, representation, prerequisites, misconceptions, move weights, and cache inputs.', { responseFormat: 'json' }),
  fn('evaluation.teaching_quality.judge', 'Teaching quality evaluator', 'Evaluation', 'Score synthetic Petros transcripts against versioned evidence-linked teaching rubrics. Evaluation traffic is independently routed, budgeted, and metered.', { responseFormat: 'json', requiredCapabilities: ['text', 'structured_output', 'reasoning'] }),
  fn('artifact.diagram.refine', 'Diagram refinement', 'Visuals', 'Refine a student-curated diagram without replacing ownership.', { allowedInputTypes: ['text', 'image'], responseFormat: 'json', requiredCapabilities: ['text', 'vision', 'structured_output'] }),
  fn('session.close.synthesise', 'Session close synthesis', 'Orchestration', 'Close with synthesis, proposed artifacts, and a forward link.', { essential: true }),
];

const providerCredentialPrefix = /^(?:sk[-_]|gsk_|aiza|aq\.)/i;
const keySchema = z
  .string()
  .trim()
  .min(2)
  .max(120)
  .regex(/^[a-z0-9][a-z0-9._-]+$/)
  .refine((value) => !providerCredentialPrefix.test(value), {
    message: 'Use a public provider identifier such as "groq"; enter the secret in the API key field.',
  });
const nullableLimit = z.number().int().nonnegative().nullable().optional();

export const upsertPetrosProviderSchema = z.object({
  key: keySchema,
  displayName: z.string().trim().min(2).max(120),
  adapterType: petrosAdapterTypeSchema,
  baseUrl: z.string().url().nullable().optional(),
  apiKey: z.string().trim().min(8).max(4_096).optional(),
  enabled: z.boolean().default(true),
  paused: z.boolean().default(false),
  priority: z.number().int().min(0).max(10_000).default(100),
  dailyBudgetMicros: nullableLimit,
  monthlyBudgetMicros: nullableLimit,
  capabilities: z.array(petrosModelCapabilitySchema).default([]),
  metadata: z.record(z.unknown()).default({}),
  reason: z.string().trim().min(3).max(500),
  version: z.number().int().nonnegative().optional(),
});
export type UpsertPetrosProviderInput = z.infer<typeof upsertPetrosProviderSchema>;

export const upsertPetrosModelSchema = z.object({
  providerId: z.string().uuid(),
  modelKey: z.string().trim().min(1).max(160),
  displayName: z.string().trim().min(1).max(160),
  enabled: z.boolean().default(true),
  custom: z.boolean().default(false),
  capabilities: z.array(petrosModelCapabilitySchema).default([]),
  contextWindow: z.number().int().positive().nullable().optional(),
  maxOutputTokens: z.number().int().positive().nullable().optional(),
  pricing: z.object({
    inputPerMillionMicros: z.number().int().nonnegative().optional(),
    outputPerMillionMicros: z.number().int().nonnegative().optional(),
    cachedInputPerMillionMicros: z.number().int().nonnegative().optional(),
  }).default({}),
  providerOptions: z.record(z.unknown()).default({}),
  reason: z.string().trim().min(3).max(500),
  version: z.number().int().nonnegative().optional(),
});
export type UpsertPetrosModelInput = z.infer<typeof upsertPetrosModelSchema>;

export const petrosFunctionRouteInputSchema = z.object({
  providerId: z.string().uuid(),
  modelId: z.string().uuid(),
  tier: z.number().int().min(0).max(2),
  trafficPercent: z.number().int().min(0).max(100).default(100),
  enabled: z.boolean().default(true),
  overrides: z.record(z.unknown()).default({}),
});

export const configurePetrosFunctionSchema = z.object({
  enabled: z.boolean(),
  allowedInputTypes: z.array(petrosInputTypeSchema).min(1),
  responseFormat: petrosResponseFormatSchema,
  requiredCapabilities: z.array(petrosModelCapabilitySchema),
  settings: petrosFunctionSettingsSchema,
  routes: z.array(petrosFunctionRouteInputSchema).max(12),
  reason: z.string().trim().min(3).max(500),
  version: z.number().int().nonnegative().optional(),
}).superRefine((value, ctx) => {
  for (const tier of [0, 1, 2]) {
    const routes = value.routes.filter((route) => route.enabled && route.tier === tier);
    const total = routes.reduce((sum, route) => sum + route.trafficPercent, 0);
    if (routes.length && total !== 100) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['routes'], message: `Enabled tier ${tier} traffic must total 100%.` });
    }
  }
});
export type ConfigurePetrosFunctionInput = z.infer<typeof configurePetrosFunctionSchema>;

export const petrosRuleFieldSchema = z.enum([
  'subject', 'topic', 'grade', 'academicLevel', 'sessionType', 'difficultyLevel',
  'inputModality', 'language', 'institutionId', 'estimatedTokens', 'providerAvailable',
  'currentCostMicros', 'previousFailures', 'requiredResponseMs', 'requiredReasoningQuality',
]);
export const petrosRuleConditionSchema = z.object({
  field: petrosRuleFieldSchema,
  operator: z.enum(['eq', 'neq', 'in', 'not_in', 'gt', 'gte', 'lt', 'lte']),
  value: z.union([z.string(), z.number(), z.boolean(), z.array(z.union([z.string(), z.number()]))]),
});
export const petrosRuleConditionsSchema = z.object({
  all: z.array(petrosRuleConditionSchema).max(20).optional(),
  any: z.array(petrosRuleConditionSchema).max(20).optional(),
}).refine((v) => (v.all?.length ?? 0) + (v.any?.length ?? 0) > 0, 'At least one condition is required.');
export const petrosRuleActionSchema = z.object({
  kind: z.enum(['route', 'prefer_cost', 'prefer_quality', 'prefer_latency', 'cache', 'block']),
  providerId: z.string().uuid().optional(),
  modelId: z.string().uuid().optional(),
  maxTier: z.number().int().min(0).max(2).optional(),
  reason: z.string().trim().min(2).max(240).optional(),
});
export const upsertPetrosRoutingRuleSchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500).nullable().optional(),
  functionId: z.string().uuid().nullable().optional(),
  priority: z.number().int().min(0).max(10_000).default(100),
  enabled: z.boolean().default(true),
  conditions: petrosRuleConditionsSchema,
  action: petrosRuleActionSchema,
  reason: z.string().trim().min(3).max(500),
  version: z.number().int().nonnegative().optional(),
});
export type UpsertPetrosRoutingRuleInput = z.infer<typeof upsertPetrosRoutingRuleSchema>;

export const createPetrosFunctionVersionSchema = z.object({
  promptVersion: z.string().trim().min(1).max(80),
  schemaVersion: z.string().trim().min(1).max(80),
  promptTemplate: z.string().min(1).max(200_000),
  responseSchema: z.record(z.unknown()).default({}),
  status: z.enum(['draft', 'active', 'archived']).default('draft'),
  notes: z.string().trim().max(2_000).nullable().optional(),
  reason: z.string().trim().min(3).max(500),
});
export type CreatePetrosFunctionVersionInput = z.infer<typeof createPetrosFunctionVersionSchema>;

export const updatePetrosBudgetPolicySchema = z.object({
  monthlyBudgetMicros: nullableLimit,
  dailyBudgetMicros: nullableLimit,
  thresholds: z.array(z.object({
    percent: z.number().min(1).max(100),
    action: z.enum(['warn', 'restrict_expensive', 'route_to_lower_cost', 'stop_non_essential']),
  })).min(1).max(10),
  preserveEssentialFunctions: z.boolean().default(true),
  enabled: z.boolean().default(true),
  reason: z.string().trim().min(3).max(500),
  version: z.number().int().nonnegative().optional(),
});
export type UpdatePetrosBudgetPolicyInput = z.infer<typeof updatePetrosBudgetPolicySchema>;

export const petrosUsageQuerySchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  institutionId: z.string().uuid().optional(),
  studentId: z.string().uuid().optional(),
  functionId: z.string().uuid().optional(),
  providerId: z.string().uuid().optional(),
  modelId: z.string().uuid().optional(),
  door: z.enum([
    'student_portal',
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
  ]).optional(),
  sessionType: z.enum(['learn', 'repair', 'revise', 'doubt', 'teach_it_back']).optional(),
  groupBy: z.enum(['day', 'function', 'provider', 'model', 'institution', 'student']).default('day'),
});
export type PetrosUsageQuery = z.infer<typeof petrosUsageQuerySchema>;

export const petrosRouteContextSchema = z.object({
  functionKey: keySchema,
  subject: z.string().max(120).optional(),
  topic: z.string().max(240).optional(),
  grade: z.string().max(80).optional(),
  academicLevel: z.string().max(80).optional(),
  sessionType: z.string().max(80).optional(),
  difficultyLevel: z.number().min(0).max(1).optional(),
  inputModality: petrosInputTypeSchema.default('text'),
  language: z.string().max(40).optional(),
  institutionId: z.string().uuid().optional(),
  studentId: z.string().uuid().optional(),
  estimatedTokens: z.number().int().nonnegative().default(0),
  currentCostMicros: z.number().int().nonnegative().default(0),
  previousFailures: z.number().int().nonnegative().default(0),
  requiredResponseMs: z.number().int().positive().optional(),
  requiredReasoningQuality: z.number().min(0).max(1).optional(),
  requestId: z.string().uuid().optional(),
});
export type PetrosRouteContext = z.infer<typeof petrosRouteContextSchema>;

export const petrosMutationReasonSchema = z.object({
  reason: z.string().trim().min(3).max(500),
});
