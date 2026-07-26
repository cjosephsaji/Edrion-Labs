import { z } from 'zod';
import { examDifficultyBandSchema, examQuestionTypeSchema } from './exam-questions';

export const EXAM_BLUEPRINT_SCHEMA_VERSION = 1 as const;

export const EXAM_TEMPLATES = ['quick_check', 'chapter_test', 'board_pattern', 'custom'] as const;
export const examTemplateSchema = z.enum(EXAM_TEMPLATES);
export type ExamTemplate = (typeof EXAM_TEMPLATES)[number];

export const EXAM_SOURCE_KINDS = ['studied', 'preset', 'library', 'manual'] as const;
export const examSourceKindSchema = z.enum(EXAM_SOURCE_KINDS);
export type ExamSourceKind = (typeof EXAM_SOURCE_KINDS)[number];

/** Pause mid-exam is allowed only for quick_check (plan lock). */
export function examTemplateAllowsPause(template: ExamTemplate): boolean {
  return template === 'quick_check';
}

export const examBlueprintSectionSchema = z.object({
  id: z.string().trim().min(1).max(64),
  name: z.string().trim().min(1).max(120),
  questionCount: z.number().int().min(1).max(40),
  questionTypes: z.array(examQuestionTypeSchema).min(1).max(9),
  marksPerQuestion: z.number().int().min(1).max(20),
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
  })
  .superRefine((bp, ctx) => {
    const totalQuestions = bp.sections.reduce((s, sec) => s + sec.questionCount, 0);
    if (totalQuestions > 80) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Total questions across sections must be ≤ 80',
        path: ['sections'],
      });
    }
    if (bp.template === 'quick_check') {
      if (bp.durationMin > 15) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Quick check duration must be ≤ 15 minutes',
          path: ['durationMin'],
        });
      }
      if (totalQuestions > 12) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Quick check must have ≤ 12 questions',
          path: ['sections'],
        });
      }
    }
  });
export type ExamBlueprint = z.infer<typeof examBlueprintSchema>;

export function examBlueprintTotalMarks(bp: ExamBlueprint): number {
  return bp.sections.reduce((sum, s) => sum + s.questionCount * s.marksPerQuestion, 0);
}

export function examBlueprintTotalQuestions(bp: ExamBlueprint): number {
  return bp.sections.reduce((sum, s) => sum + s.questionCount, 0);
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
        title: `Quick check — ${opts.subjectLabel}`,
        subjectLabel: opts.subjectLabel,
        durationMin: 10,
        difficultyCurve: 'gentle',
        sections: [
          {
            id: 'sec-obj',
            name: 'Objective',
            questionCount: 10,
            questionTypes: ['mcq_single', 'fill_blank', 'assertion_reason'],
            marksPerQuestion: 1,
          },
        ],
        topicWeights: topics,
        sourceKind,
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
});
export type CreateExamBlueprintInput = z.infer<typeof createExamBlueprintInputSchema>;

export const updateExamBlueprintInputSchema = z.object({
  blueprint: examBlueprintSchema,
  version: z.number().int().nonnegative(),
});
export type UpdateExamBlueprintInput = z.infer<typeof updateExamBlueprintInputSchema>;

export const examBlueprintDtoSchema = z.object({
  id: z.string().uuid(),
  blueprint: examBlueprintSchema,
  version: z.number().int(),
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
});
export type ExamPaperPatternDto = z.infer<typeof examPaperPatternDtoSchema>;
