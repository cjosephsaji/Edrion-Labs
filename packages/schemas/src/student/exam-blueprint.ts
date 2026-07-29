import { z } from 'zod';
import { examDifficultyBandSchema, examQuestionTypeSchema } from './exam-questions';

export const EXAM_BLUEPRINT_SCHEMA_VERSION = 1 as const;

export const EXAM_TEMPLATES = ['quick_check', 'chapter_test', 'board_pattern', 'custom'] as const;
export const examTemplateSchema = z.enum(EXAM_TEMPLATES);
export type ExamTemplate = (typeof EXAM_TEMPLATES)[number];

export const EXAM_SOURCE_KINDS = ['studied', 'preset', 'library', 'manual'] as const;
export const examSourceKindSchema = z.enum(EXAM_SOURCE_KINDS);
export type ExamSourceKind = (typeof EXAM_SOURCE_KINDS)[number];

export const EXAM_SKINS = ['standard', 'nta', 'paper'] as const;
export const examSkinSchema = z.enum(EXAM_SKINS);
export type ExamSkin = (typeof EXAM_SKINS)[number];

export const EXAM_GRADING_STYLES = ['auto', 'ai_assisted', 'self_graded'] as const;
export const examGradingStyleSchema = z.enum(EXAM_GRADING_STYLES);
export type ExamGradingStyle = (typeof EXAM_GRADING_STYLES)[number];

export const NTA_QUESTION_TYPES = new Set<string>(['mcq_single', 'numerical']);

/** @deprecated Timer never pauses for any skin including Quick (PLAN-MOCK-EXAMS §2.2). */
export function examTemplateAllowsPause(_template: ExamTemplate): boolean {
  return false;
}

export const examNegativeMarkingSchema = z.object({
  mode: z.enum(['none', 'fraction', 'fixed']),
  value: z.number().min(0).max(100).default(0),
});
export type ExamNegativeMarking = z.infer<typeof examNegativeMarkingSchema>;

export const examOptionalitySchema = z.object({
  answerAny: z.number().int().min(1).max(200),
});
export type ExamOptionality = z.infer<typeof examOptionalitySchema>;

export const examBlueprintSectionSchema = z
  .object({
    id: z.string().trim().min(1).max(64),
    name: z.string().trim().min(1).max(120),
    questionCount: z.number().int().min(1).max(200),
    questionTypes: z.array(examQuestionTypeSchema).min(1).max(9),
    marksPerQuestion: z.number().int().min(1).max(100),
    negative: examNegativeMarkingSchema.default({ mode: 'none', value: 0 }),
    optionality: examOptionalitySchema.nullable().default(null),
    sectionTimeSec: z.number().int().min(30).max(86_400).nullable().default(null),
    shuffleQuestions: z.boolean().default(true),
  })
  .superRefine((sec, ctx) => {
    if (sec.optionality && sec.optionality.answerAny > sec.questionCount) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'optionality.answerAny must be ≤ questionCount',
        path: ['optionality', 'answerAny'],
      });
    }
  });
export type ExamBlueprintSection = z.infer<typeof examBlueprintSectionSchema>;

export const examTopicWeightSchema = z.object({
  topicLabel: z.string().trim().min(1).max(200),
  topicId: z.string().uuid().nullable().optional(),
  /** Relative weight 1–10; steppers in UI. */
  weight: z.number().int().min(1).max(10).default(5),
});
export type ExamTopicWeight = z.infer<typeof examTopicWeightSchema>;

export const examBlueprintSchema = z
  .object({
    schemaVersion: z.literal(EXAM_BLUEPRINT_SCHEMA_VERSION).default(EXAM_BLUEPRINT_SCHEMA_VERSION),
    template: examTemplateSchema,
    title: z.string().trim().min(1).max(200),
    subjectLabel: z.string().trim().min(1).max(120),
    durationMin: z.number().int().min(5).max(240),
    difficultyCurve: examDifficultyBandSchema,
    sections: z.array(examBlueprintSectionSchema).min(1).max(12),
    topicWeights: z.array(examTopicWeightSchema).min(1).max(30),
    paperPatternId: z.string().uuid().nullable().optional(),
    sourceKind: examSourceKindSchema,
    /** Library knowledge item ids when sourceKind === 'library'. */
    libraryItemIds: z.array(z.string().uuid()).max(10).optional(),
    instructionsMd: z.string().max(20_000).optional(),
    skin: examSkinSchema.default('standard'),
    gradingStyle: examGradingStyleSchema.default('auto'),
    examProfileKey: z
      .string()
      .trim()
      .min(1)
      .max(64)
      .regex(/^[a-z0-9][a-z0-9_-]*$/i, 'Invalid exam_profile_key')
      .nullable()
      .optional(),
  })
  .superRefine((bp, ctx) => {
    const ids = bp.sections.map((s) => s.id);
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Section ids must be unique',
        path: ['sections'],
      });
    }

    const totalQuestions = bp.sections.reduce((s, sec) => s + sec.questionCount, 0);
    if (totalQuestions > 200) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Total questions across sections must be ≤ 200',
        path: ['sections'],
      });
    }

    const timed = bp.sections.filter((s) => s.sectionTimeSec != null);
    if (timed.length > 0 && timed.length !== bp.sections.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'TIMING_INCONSISTENT: all sections must set sectionTimeSec or none',
        path: ['sections'],
      });
    }
    if (timed.length === bp.sections.length && bp.sections.length > 0) {
      const sumSec = bp.sections.reduce((s, sec) => s + (sec.sectionTimeSec ?? 0), 0);
      if (sumSec !== bp.durationMin * 60) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'TIMING_INCONSISTENT: section times must sum to durationMin×60',
          path: ['durationMin'],
        });
      }
    }

    if (bp.skin === 'nta') {
      for (const [i, sec] of bp.sections.entries()) {
        for (const qt of sec.questionTypes) {
          if (!NTA_QUESTION_TYPES.has(qt as 'mcq_single' | 'numerical')) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: 'SKIN_UNSUPPORTED: NTA skin allows only mcq_single|numerical',
              path: ['sections', i, 'questionTypes'],
            });
          }
        }
      }
    }

    const hasLong = bp.sections.some((s) => s.questionTypes.includes('long_answer'));
    if (hasLong) {
      if (bp.skin !== 'paper') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'long_answer requires skin=paper',
          path: ['skin'],
        });
      }
      if (bp.gradingStyle === 'auto') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'long_answer requires grading_style ≠ auto',
          path: ['gradingStyle'],
        });
      }
    }

    if (bp.template === 'quick_check') {
      if (bp.durationMin > 30) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Quick mock duration must be ≤ 30 minutes',
          path: ['durationMin'],
        });
      }
      if (totalQuestions > 20) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Quick mock must have ≤ 20 questions',
          path: ['sections'],
        });
      }
    }
  });
export type ExamBlueprint = z.infer<typeof examBlueprintSchema>;

/** Parse legacy blueprint JSON that may lack section negative/optionality/timing defaults. */
export function parseExamBlueprint(raw: unknown): ExamBlueprint {
  return examBlueprintSchema.parse(raw);
}

export function examBlueprintTotalMarks(bp: ExamBlueprint): number {
  return bp.sections.reduce((sum, s) => {
    const count = s.optionality?.answerAny ?? s.questionCount;
    return sum + count * s.marksPerQuestion;
  }, 0);
}

export function examBlueprintTotalQuestions(bp: ExamBlueprint): number {
  return bp.sections.reduce((sum, s) => s + s.questionCount, 0);
}

/** Derive origin from dual-owner columns — no redundant origin column. */
export function deriveBlueprintOrigin(row: {
  institutionId?: string | null;
  studentId?: string | null;
  independentUserId?: string | null;
}): 'system' | 'institution' | 'student' {
  if (row.institutionId && !row.studentId && !row.independentUserId) return 'institution';
  if (row.studentId || row.independentUserId) return 'student';
  return 'system';
}

/** Default blueprints for each template (used by UI + API). */
export function defaultBlueprintForTemplate(
  template: ExamTemplate,
  opts: {
    subjectLabel: string;
    topicWeights: ExamTopicWeight[];
    paperPatternId?: string | null;
    sourceKind?: ExamSourceKind;
  },
): ExamBlueprint {
  const sourceKind = opts.sourceKind ?? 'studied';
  const topics = opts.topicWeights.length
    ? opts.topicWeights
    : [{ topicLabel: 'General', weight: 5 as const }];

  switch (template) {
    case 'quick_check':
      return examBlueprintSchema.parse({
        template: 'quick_check',
        title: `Quick mock — ${opts.subjectLabel}`,
        subjectLabel: opts.subjectLabel,
        durationMin: 30,
        difficultyCurve: 'balanced',
        sections: [
          {
            id: 'sec-obj',
            name: 'Objective',
            questionCount: 20,
            questionTypes: ['mcq_single'],
            marksPerQuestion: 1,
          },
        ],
        topicWeights: topics,
        sourceKind,
        skin: 'standard',
        gradingStyle: 'auto',
      });
    case 'chapter_test':
      return examBlueprintSchema.parse({
        template: 'chapter_test',
        title: `Chapter test — ${opts.subjectLabel}`,
        subjectLabel: opts.subjectLabel,
        durationMin: 30,
        difficultyCurve: 'balanced',
        sections: [
          {
            id: 'sec-a',
            name: 'Section A — Objective',
            questionCount: 8,
            questionTypes: ['mcq_single', 'mcq_multi', 'assertion_reason', 'fill_blank'],
            marksPerQuestion: 1,
          },
          {
            id: 'sec-b',
            name: 'Section B — Short',
            questionCount: 4,
            questionTypes: ['short_answer', 'numerical'],
            marksPerQuestion: 3,
          },
        ],
        topicWeights: topics,
        sourceKind,
      });
    case 'board_pattern':
      return examBlueprintSchema.parse({
        template: 'board_pattern',
        title: `Board pattern — ${opts.subjectLabel}`,
        subjectLabel: opts.subjectLabel,
        durationMin: 90,
        difficultyCurve: 'exam_level',
        sections: [
          {
            id: 'sec-a',
            name: 'Section A — MCQ',
            questionCount: 10,
            questionTypes: ['mcq_single', 'assertion_reason'],
            marksPerQuestion: 1,
          },
          {
            id: 'sec-b',
            name: 'Section B — Short answers',
            questionCount: 6,
            questionTypes: ['short_answer', 'numerical', 'match_following'],
            marksPerQuestion: 3,
          },
          {
            id: 'sec-c',
            name: 'Section C — Long / Case',
            questionCount: 3,
            questionTypes: ['long_answer', 'case_based'],
            marksPerQuestion: 5,
          },
        ],
        topicWeights: topics,
        paperPatternId: opts.paperPatternId ?? null,
        sourceKind: opts.sourceKind ?? 'preset',
        skin: 'paper',
        gradingStyle: 'ai_assisted',
      });
    case 'custom':
    default:
      return examBlueprintSchema.parse({
        template: 'custom',
        title: `Custom exam — ${opts.subjectLabel}`,
        subjectLabel: opts.subjectLabel,
        durationMin: 45,
        difficultyCurve: 'balanced',
        sections: [
          {
            id: 'sec-1',
            name: 'Section 1',
            questionCount: 10,
            questionTypes: ['mcq_single', 'short_answer'],
            marksPerQuestion: 2,
          },
        ],
        topicWeights: topics,
        sourceKind,
      });
  }
}

export const createExamBlueprintInputSchema = z.object({
  blueprint: examBlueprintSchema,
  skin: examSkinSchema.optional(),
  gradingStyle: examGradingStyleSchema.optional(),
  examProfileKey: z.string().trim().min(1).max(64).nullable().optional(),
  isPublished: z.boolean().optional(),
});
export type CreateExamBlueprintInput = z.infer<typeof createExamBlueprintInputSchema>;

export const updateExamBlueprintInputSchema = z.object({
  blueprint: examBlueprintSchema,
  version: z.number().int().nonnegative(),
  skin: examSkinSchema.optional(),
  gradingStyle: examGradingStyleSchema.optional(),
  examProfileKey: z.string().trim().min(1).max(64).nullable().optional(),
  isPublished: z.boolean().optional(),
});
export type UpdateExamBlueprintInput = z.infer<typeof updateExamBlueprintInputSchema>;

export const examBlueprintDtoSchema = z.object({
  id: z.string().uuid(),
  blueprint: examBlueprintSchema,
  version: z.number().int(),
  skin: examSkinSchema,
  gradingStyle: examGradingStyleSchema,
  examProfileKey: z.string().nullable().optional(),
  isPublished: z.boolean(),
  archivedAt: z.string().nullable().optional(),
  origin: z.enum(['system', 'institution', 'student']),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ExamBlueprintDto = z.infer<typeof examBlueprintDtoSchema>;

export const examPaperPatternDtoSchema = z.object({
  id: z.string().uuid(),
  key: z.string(),
  name: z.string(),
  board: z.string(),
  levelLabel: z.string(),
  durationMin: z.number().int(),
  totalMarks: z.number().int(),
  sections: z.array(examBlueprintSectionSchema),
  description: z.string().optional(),
  skin: examSkinSchema.optional(),
  gradingStyle: examGradingStyleSchema.optional(),
  examProfileKey: z.string().nullable().optional(),
});
export type ExamPaperPatternDto = z.infer<typeof examPaperPatternDtoSchema>;
