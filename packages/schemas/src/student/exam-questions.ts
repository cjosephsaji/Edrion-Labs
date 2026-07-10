import { z } from 'zod';

/** Exam-engine question types (Lab mock exams). Distinct from institutional `questions.ts`. */
export const EXAM_QUESTION_TYPES = [
  'mcq_single',
  'mcq_multi',
  'assertion_reason',
  'fill_blank',
  'match_following',
  'numerical',
  'short_answer',
  'long_answer',
  'case_based',
] as const;
export const examQuestionTypeSchema = z.enum(EXAM_QUESTION_TYPES);
export type ExamQuestionType = (typeof EXAM_QUESTION_TYPES)[number];

export const EXAM_DIFFICULTY_BANDS = ['gentle', 'balanced', 'exam_level'] as const;
export const examDifficultyBandSchema = z.enum(EXAM_DIFFICULTY_BANDS);
export type ExamDifficultyBand = (typeof EXAM_DIFFICULTY_BANDS)[number];

export const EXAM_QUESTION_SCHEMA_VERSION = 1 as const;

export const examSourceRefSchema = z.object({
  knowledgeItemId: z.string().uuid().optional(),
  chunkId: z.string().optional(),
  page: z.number().int().positive().optional(),
  quote: z.string().max(2000).optional(),
});
export type ExamSourceRef = z.infer<typeof examSourceRefSchema>;

const optionSchema = z.object({
  key: z.string().trim().min(1).max(8),
  label: z.string().trim().min(1).max(1000),
  /** Why this wrong option is tempting — used in review. */
  distractorRationale: z.string().trim().max(1000).optional(),
});

const baseQuestionFields = {
  id: z.string().uuid(),
  topicId: z.string().uuid().nullable().optional(),
  topicLabel: z.string().trim().min(1).max(200),
  difficulty: examDifficultyBandSchema,
  marks: z.number().int().min(1).max(100),
  sourceRef: examSourceRefSchema.nullable().optional(),
  blueprintSectionId: z.string().trim().min(1).max(64),
  explanation: z.string().trim().min(1).max(5000),
  schemaVersion: z.literal(EXAM_QUESTION_SCHEMA_VERSION).default(EXAM_QUESTION_SCHEMA_VERSION),
  prompt: z.string().trim().min(1).max(8000),
};

export const mcqSingleQuestionSchema = z.object({
  ...baseQuestionFields,
  type: z.literal('mcq_single'),
  options: z.array(optionSchema).min(4).max(5),
  correctKey: z.string().trim().min(1).max(8),
});

export const mcqMultiQuestionSchema = z.object({
  ...baseQuestionFields,
  type: z.literal('mcq_multi'),
  options: z.array(optionSchema).min(4).max(5),
  correctKeys: z.array(z.string().trim().min(1).max(8)).min(1),
});

/** Classic Indian-board Assertion–Reason with 4 standard options. */
export const ASSERTION_REASON_OPTIONS = [
  { key: 'a', label: 'Both Assertion and Reason are true, and Reason is the correct explanation of Assertion.' },
  { key: 'b', label: 'Both Assertion and Reason are true, but Reason is not the correct explanation of Assertion.' },
  { key: 'c', label: 'Assertion is true, but Reason is false.' },
  { key: 'd', label: 'Assertion is false, but Reason is true.' },
] as const;

export const assertionReasonQuestionSchema = z.object({
  ...baseQuestionFields,
  type: z.literal('assertion_reason'),
  assertion: z.string().trim().min(1).max(2000),
  reason: z.string().trim().min(1).max(2000),
  correctKey: z.enum(['a', 'b', 'c', 'd']),
});

export const fillBlankNormalizationSchema = z.object({
  caseInsensitive: z.boolean().default(true),
  collapseWhitespace: z.boolean().default(true),
  numericTolerance: z.number().min(0).max(1).optional(),
});

export const fillBlankQuestionSchema = z.object({
  ...baseQuestionFields,
  type: z.literal('fill_blank'),
  acceptedAnswers: z.array(z.string().trim().min(1).max(500)).min(1).max(20),
  normalization: fillBlankNormalizationSchema.default({
    caseInsensitive: true,
    collapseWhitespace: true,
  }),
});

export const matchFollowingQuestionSchema = z.object({
  ...baseQuestionFields,
  type: z.literal('match_following'),
  left: z.array(z.object({ key: z.string().min(1).max(8), label: z.string().min(1).max(500) })).min(3).max(8),
  right: z.array(z.object({ key: z.string().min(1).max(8), label: z.string().min(1).max(500) })).min(3).max(8),
  /** Map left key → right key. */
  correctPairs: z.record(z.string().min(1).max(8), z.string().min(1).max(8)),
});

export const numericalStepRubricSchema = z.object({
  stepId: z.string().min(1).max(32),
  description: z.string().min(1).max(500),
  marks: z.number().int().min(0).max(50),
});

export const numericalQuestionSchema = z.object({
  ...baseQuestionFields,
  type: z.literal('numerical'),
  expectedValue: z.number(),
  tolerance: z.number().min(0).default(0.01),
  unit: z.string().trim().max(32).nullable().optional(),
  stepRubric: z.array(numericalStepRubricSchema).max(10).optional(),
});

export const shortAnswerPointSchema = z.object({
  pointId: z.string().min(1).max(32),
  description: z.string().min(1).max(500),
  marks: z.number().int().min(0).max(20),
});

export const shortAnswerQuestionSchema = z.object({
  ...baseQuestionFields,
  type: z.literal('short_answer'),
  expectedPoints: z.array(shortAnswerPointSchema).min(1).max(10),
});

export const longAnswerCriterionSchema = z.object({
  criterionId: z.string().min(1).max(32),
  description: z.string().min(1).max(500),
  marks: z.number().int().min(0).max(50),
});

export const longAnswerQuestionSchema = z.object({
  ...baseQuestionFields,
  type: z.literal('long_answer'),
  rubric: z.array(longAnswerCriterionSchema).min(1).max(12),
});

/** Leaf types that may appear as case-based sub-questions (no nested case_based). */
export const caseSubQuestionSchema = z.discriminatedUnion('type', [
  mcqSingleQuestionSchema,
  mcqMultiQuestionSchema,
  assertionReasonQuestionSchema,
  fillBlankQuestionSchema,
  matchFollowingQuestionSchema,
  numericalQuestionSchema,
  shortAnswerQuestionSchema,
  longAnswerQuestionSchema,
]);

export const caseBasedQuestionSchema = z.object({
  ...baseQuestionFields,
  type: z.literal('case_based'),
  passage: z.string().trim().min(1).max(12000),
  subQuestions: z.array(caseSubQuestionSchema).min(3).max(5),
});

export const labExamQuestionSchema = z.discriminatedUnion('type', [
  mcqSingleQuestionSchema,
  mcqMultiQuestionSchema,
  assertionReasonQuestionSchema,
  fillBlankQuestionSchema,
  matchFollowingQuestionSchema,
  numericalQuestionSchema,
  shortAnswerQuestionSchema,
  longAnswerQuestionSchema,
  caseBasedQuestionSchema,
]);
export type LabExamQuestion = z.infer<typeof labExamQuestionSchema>;
/** Alias for Lab exam questions (do not collide with institutional examQuestionSchema). */
export type ExamQuestion = LabExamQuestion;
export type CaseSubQuestion = z.infer<typeof caseSubQuestionSchema>;

/** Objective types graded synchronously on the server. */
export const EXAM_OBJECTIVE_TYPES = new Set<ExamQuestionType>([
  'mcq_single',
  'mcq_multi',
  'assertion_reason',
  'fill_blank',
  'match_following',
  'numerical',
]);

export function isExamObjectiveType(type: string): boolean {
  return EXAM_OBJECTIVE_TYPES.has(type as ExamQuestionType);
}

/** Normalize fill-blank / free-text for comparison. */
export function normalizeFillBlankAnswer(
  raw: string,
  rules: { caseInsensitive?: boolean; collapseWhitespace?: boolean } = {},
): string {
  let s = raw.trim();
  if (rules.collapseWhitespace !== false) s = s.replace(/\s+/g, ' ');
  if (rules.caseInsensitive !== false) s = s.toLowerCase();
  return s;
}

/** Numeric match with absolute tolerance. */
export function numericalMatches(
  given: number,
  expected: number,
  tolerance: number,
): boolean {
  if (!Number.isFinite(given) || !Number.isFinite(expected)) return false;
  return Math.abs(given - expected) <= tolerance;
}

/** Tokenize for Jaccard dedup. */
export function normalizePromptForDedup(prompt: string): string[] {
  return prompt
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter((t) => t.length > 1);
}

/** Jaccard similarity on token sets. Threshold 0.85 = duplicate (plan lock). */
export function jaccardSimilarity(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 1;
  const setA = new Set(a);
  const setB = new Set(b);
  let intersection = 0;
  for (const t of setA) if (setB.has(t)) intersection += 1;
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

export const EXAM_DEDUP_THRESHOLD = 0.85;

export function isDuplicatePrompt(promptA: string, promptB: string, threshold = EXAM_DEDUP_THRESHOLD): boolean {
  return jaccardSimilarity(normalizePromptForDedup(promptA), normalizePromptForDedup(promptB)) >= threshold;
}
