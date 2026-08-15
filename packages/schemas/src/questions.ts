import { z } from 'zod';
import { versionSchema } from './common';

/** Question types supported across exams and quiz-mode assignments. */
export const QUESTION_TYPES = [
  'mcq_single',
  'mcq_multi',
  'true_false',
  'short_answer',
  'long_answer',
  'fill_blank',
  'numeric',
  'matching',
  'file_upload',
  'code',
] as const;
export const questionTypeSchema = z.enum(QUESTION_TYPES);
export type QuestionType = (typeof QUESTION_TYPES)[number];

/** Auto-gradable question types (deterministic scoring). */
export const AUTO_GRADABLE_TYPES = new Set<string>([
  'mcq_single',
  'mcq_multi',
  'true_false',
  'numeric',
  'fill_blank',
  'matching',
]);

export const questionOptionSchema = z.object({
  key: z.string().trim().min(1).max(8),
  label: z.string().trim().min(1).max(500),
  imageObjectId: z.string().uuid().optional(),
});

/** Matching pairs authoring config. */
export const matchingConfigSchema = z.object({
  left: z
    .array(z.object({ key: z.string().trim().min(1).max(8), label: z.string().trim().min(1).max(500) }))
    .min(2)
    .max(20),
  right: z
    .array(z.object({ key: z.string().trim().min(1).max(8), label: z.string().trim().min(1).max(500) }))
    .min(2)
    .max(20),
  /** Map of leftKey → rightKey. */
  answerKey: z.record(z.string().trim().min(1).max(8), z.string().trim().min(1).max(8)).optional(),
});
export type MatchingConfig = z.infer<typeof matchingConfigSchema>;

/** Numeric tolerance (default 0.01 when omitted). */
export const numericConfigSchema = z.object({
  tolerance: z.coerce.number().min(0).max(1e6).optional(),
});
export type NumericConfig = z.infer<typeof numericConfigSchema>;

/** Multi-blank fill-in answers (pipe-separated correctKey still works for single). */
export const fillBlankConfigSchema = z.object({
  blanks: z.array(z.object({ key: z.string().trim().min(1).max(8), answers: z.array(z.string().trim().min(1).max(200)).min(1) })).max(20).optional(),
});
export type FillBlankConfig = z.infer<typeof fillBlankConfigSchema>;

/** File-upload answer constraints. */
export const fileUploadConfigSchema = z.object({
  acceptMime: z.array(z.string().trim().min(1).max(120)).max(40).optional(),
  maxBytes: z.coerce.number().int().min(1024).max(100 * 1024 * 1024).optional(),
  maxFiles: z.coerce.number().int().min(1).max(10).optional(),
});
export type FileUploadConfig = z.infer<typeof fileUploadConfigSchema>;

export const CODE_LANGUAGES = [
  'python',
  'javascript',
  'typescript',
  'java',
  'c',
  'cpp',
  'csharp',
  'go',
  'rust',
  'sql',
  'html',
  'css',
] as const;
export const codeLanguageSchema = z.enum(CODE_LANGUAGES);
export type CodeLanguage = (typeof CODE_LANGUAGES)[number];

/** Code question authoring config (runner/auto-grade is a later phase). */
export const codeConfigSchema = z.object({
  languages: z.array(codeLanguageSchema).min(1).max(12).default(['python']),
  starterCode: z.string().max(50000).optional(),
  referenceSolution: z.string().max(50000).optional(),
  testCases: z
    .array(
      z.object({
        stdin: z.string().max(10000).default(''),
        expectedStdout: z.string().max(10000),
      }),
    )
    .max(40)
    .optional(),
  allowRun: z.boolean().optional(),
  timeLimitMs: z.coerce.number().int().min(100).max(30000).optional(),
  memoryLimitMb: z.coerce.number().int().min(16).max(1024).optional(),
});
export type CodeConfig = z.infer<typeof codeConfigSchema>;

/** Loose config bag — refined per qtype at the service/builder layer. */
export const questionConfigSchema = z
  .object({
    matching: matchingConfigSchema.optional(),
    numeric: numericConfigSchema.optional(),
    fillBlank: fillBlankConfigSchema.optional(),
    fileUpload: fileUploadConfigSchema.optional(),
    code: codeConfigSchema.optional(),
  })
  .passthrough()
  .nullish();
export type QuestionConfig = z.infer<typeof questionConfigSchema>;

export const questionInputSchema = z.object({
  qtype: questionTypeSchema,
  prompt: z.string().trim().min(1).max(5000),
  promptImageObjectId: z.string().uuid().nullish(),
  options: z.array(questionOptionSchema).max(20).optional(),
  correctKey: z.string().trim().max(2000).nullish(),
  markingNote: z.string().trim().max(2000).nullish(),
  marks: z.coerce.number().int().min(0).max(1000).default(1),
  sequence: z.coerce.number().int().min(1).max(500),
  config: questionConfigSchema,
});
export type QuestionInput = z.infer<typeof questionInputSchema>;

export const createQuestionSchema = questionInputSchema;
export type CreateQuestionInput = z.infer<typeof createQuestionSchema>;

export const updateQuestionSchema = questionInputSchema.partial().extend({ version: versionSchema });
export type UpdateQuestionInput = z.infer<typeof updateQuestionSchema>;

/** Structured student answer payload (matching map, code source, multi-file, etc.). */
export const answerJsonSchema = z
  .object({
    matches: z.record(z.string(), z.string()).optional(),
    blanks: z.record(z.string(), z.string()).optional(),
    files: z.array(z.string().uuid()).max(10).optional(),
    code: z
      .object({
        language: codeLanguageSchema,
        source: z.string().max(100000),
      })
      .optional(),
  })
  .passthrough()
  .nullish();
export type AnswerJson = z.infer<typeof answerJsonSchema>;

/** Student answer update during an attempt. */
export const attemptAnswerUpdateSchema = z.object({
  choiceKey: z.string().trim().max(64).nullish(),
  answerText: z.string().trim().max(20000).nullish(),
  answerObjectId: z.string().uuid().nullish(),
  answerJson: answerJsonSchema,
});
export type AttemptAnswerUpdateInput = z.infer<typeof attemptAnswerUpdateSchema>;

/** Teacher grading override for a single answer. */
export const gradeAnswerSchema = z.object({
  teacherMarks: z.coerce.number().int().min(0).max(1000).nullish(),
  teacherFeedback: z.string().trim().max(2000).nullish(),
});
export type GradeAnswerInput = z.infer<typeof gradeAnswerSchema>;
