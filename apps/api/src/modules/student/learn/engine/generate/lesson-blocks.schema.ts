import { z } from 'zod';

const mistakeSchema = z.object({
  name: z.string().min(1).max(80),
  explainsMd: z.string().min(1).max(400),
});

const optionSchema = z.object({
  id: z.string().min(1).max(8),
  label: z.string().min(1).max(400),
  correct: z.boolean().optional(),
  mistake: mistakeSchema.optional(),
});

/** Structured lesson payload — words only; structure comes from LessonShape. */
export const generatedLessonSchema = z.object({
  blocks: z
    .array(
      z.discriminatedUnion('surface', [
        z.object({
          surface: z.literal('explanation'),
          heading: z.string().min(1).max(120).optional(),
          bodyMd: z.string().min(60).max(2200),
          deeperMd: z.string().min(20).max(2200).optional(),
          whyHere: z.string().min(8).max(280),
        }),
        z.object({
          surface: z.literal('worked_example'),
          problemMd: z.string().min(20).max(800),
          steps: z.array(z.string().min(4).max(400)).min(2).max(8),
          predictAtStep: z.number().int().min(0).max(7).optional(),
          whyHere: z.string().min(8).max(280),
        }),
        z.object({
          surface: z.literal('question_set'),
          promptMd: z.string().min(20).max(800),
          options: z.array(optionSchema).min(3).max(5),
          whyCorrectMd: z.string().min(10).max(600).optional(),
          whyHere: z.string().min(8).max(280),
          answerKey: z.object({ correctOptionId: z.string().min(1).max(8) }),
        }),
        z.object({
          surface: z.literal('probe'),
          questionMd: z.string().min(12).max(400),
          whyHere: z.string().min(8).max(280),
        }),
        z.object({
          surface: z.literal('checkpoint'),
          name: z.string().min(1).max(80),
        }),
        z.object({
          surface: z.literal('system_notice'),
          message: z.string().min(12).max(400),
          actionLabel: z.string().min(2).max(60).optional(),
        }),
        z.object({
          surface: z.literal('graph_plot'),
          caption: z.string().min(8).max(200),
          expression: z.string().min(1).max(80),
          param: z.object({
            name: z.string().min(1).max(8),
            min: z.number(),
            max: z.number(),
            value: z.number(),
          }),
          whyHere: z.string().min(8).max(280),
        }),
        z.object({
          surface: z.literal('code_trace'),
          codeMd: z.string().min(10).max(2000),
          promptMd: z.string().min(10).max(400),
          whyHere: z.string().min(8).max(280),
        }),
      ]),
    )
    .min(4)
    .max(18),
  summaryMd: z.string().min(40).max(800).optional(),
});

export type GeneratedLesson = z.infer<typeof generatedLessonSchema>;

export const TUTOR_GENERATION_PROMPT_VERSION = '2026-07-28.gen.1';
