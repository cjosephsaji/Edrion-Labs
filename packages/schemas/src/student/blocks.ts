import { z } from 'zod';

/** Declarative SVG element spec — whitelisted types only (no raw SVG strings). */
export const svgElementSchema: z.ZodType<SvgElement> = z.lazy(() =>
  z.object({
    type: z.enum(['rect', 'circle', 'line', 'path', 'text', 'group']),
    x: z.number().optional(),
    y: z.number().optional(),
    width: z.number().optional(),
    height: z.number().optional(),
    cx: z.number().optional(),
    cy: z.number().optional(),
    r: z.number().optional(),
    x1: z.number().optional(),
    y1: z.number().optional(),
    x2: z.number().optional(),
    y2: z.number().optional(),
    d: z.string().optional(),
    fill: z.string().optional(),
    stroke: z.string().optional(),
    strokeWidth: z.number().optional(),
    fontSize: z.number().optional(),
    text: z.string().optional(),
    transform: z.string().optional(),
    children: z.array(svgElementSchema).optional(),
  }),
);

export type SvgElement = {
  type: 'rect' | 'circle' | 'line' | 'path' | 'text' | 'group';
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  cx?: number;
  cy?: number;
  r?: number;
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
  d?: string;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  fontSize?: number;
  text?: string;
  transform?: string;
  children?: SvgElement[];
};

export const svgSpecSchema = z.object({
  viewBox: z.string(),
  elements: z.array(svgElementSchema),
});

export const conceptCardBlockSchema = z.object({
  title: z.string(),
  summary: z.string(),
  keyPoints: z.array(z.string()),
  goDeeper: z.array(z.object({ heading: z.string(), body: z.string() })).optional(),
  suggestedQuestions: z.array(z.string()).default([]),
});

export const visualExplainerBlockSchema = z.object({
  views: z.array(
    z.object({
      title: z.string(),
      svgSpec: svgSpecSchema,
    }),
  ),
  suggestedQuestions: z.array(z.string()).default([]),
});

export const workedExampleBlockSchema = z.object({
  equation: z.string().optional(),
  problem: z.string(),
  steps: z.array(
    z.object({
      label: z.string(),
      math: z.string().optional(),
      explanation: z.string(),
      why: z.string().optional(),
    }),
  ),
  suggestedQuestions: z.array(z.string()).default([]),
});

export const checkpointBlockSchema = z.object({
  question: z.string(),
  math: z.string().optional(),
  options: z
    .array(
      z.object({
        key: z.string(),
        label: z.string(),
        correct: z.boolean(),
        feedbackWrong: z.string().optional(),
      }),
    )
    .min(2)
    .max(4),
  explainPrompt: z.string(),
  suggestedQuestions: z.array(z.string()).default([]),
});

export const practiceItemBlockSchema = z.object({
  statement: z.string(),
  math: z.string().optional(),
  expectedForm: z.string().optional(),
  hints: z.tuple([z.string(), z.string(), z.string()]),
  questionIndex: z.number().int().optional(),
  questionTotal: z.number().int().optional(),
  suggestedQuestions: z.array(z.string()).default([]),
});

export const reflectionSummaryBlockSchema = z.object({
  takeaways: z.array(z.string()).min(1),
  suggestedQuestions: z.array(z.string()).default([]),
});

export const noteCardBlockSchema = z.object({
  question: z.string(),
  answer: z.string(),
});

export const blockTypeSchema = z.enum([
  'concept_card',
  'visual_explainer',
  'worked_example',
  'checkpoint',
  'practice_item',
  'reflection_summary',
  'note_card',
]);

export const spineStepSchema = z.enum([
  'understand',
  'see_it_visually',
  'worked_example',
  'check_understanding',
  'solve_yourself',
  'wrap_up',
]);

export const blockContentSchemas = {
  concept_card: conceptCardBlockSchema,
  visual_explainer: visualExplainerBlockSchema,
  worked_example: workedExampleBlockSchema,
  checkpoint: checkpointBlockSchema,
  practice_item: practiceItemBlockSchema,
  reflection_summary: reflectionSummaryBlockSchema,
  note_card: noteCardBlockSchema,
} as const;

export type BlockType = z.infer<typeof blockTypeSchema>;
export type SpineStep = z.infer<typeof spineStepSchema>;
export type ConceptCardBlock = z.infer<typeof conceptCardBlockSchema>;
export type VisualExplainerBlock = z.infer<typeof visualExplainerBlockSchema>;
export type WorkedExampleBlock = z.infer<typeof workedExampleBlockSchema>;
export type CheckpointBlock = z.infer<typeof checkpointBlockSchema>;
export type PracticeItemBlock = z.infer<typeof practiceItemBlockSchema>;
export type ReflectionSummaryBlock = z.infer<typeof reflectionSummaryBlockSchema>;
export type NoteCardBlock = z.infer<typeof noteCardBlockSchema>;

export function parseBlockContent<T extends BlockType>(
  blockType: T,
  content: unknown,
): z.infer<(typeof blockContentSchemas)[T]> {
  return blockContentSchemas[blockType].parse(content);
}
