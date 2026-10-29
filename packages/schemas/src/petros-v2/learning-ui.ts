import { z } from 'zod';

export const learningUIFamilySchema = z.enum([
  'reading',
  'equation',
  'relationships',
  'comparison',
  'graph',
  'process',
  'experiment',
  'practice',
]);
export const learningUIBlockSchema = z
  .object({
    id: z.string().min(1).max(100),
    kind: z.enum([
      'passage',
      'equation',
      'relationships',
      'comparison',
      'graph',
      'process',
      'experiment',
    ]),
    elementIds: z.array(z.string().min(1).max(80)).max(64),
    emphasis: z.enum(['primary', 'supporting']),
  })
  .strict();
/** A closed component plan, never executable markup, an answer key or authority. */
export const learningUIPlanSchema = z
  .object({
    version: z.literal('edrion.learning-ui.v1'),
    origin: z.literal('structured_content_composer'),
    binding: z
      .object({
        sessionId: z.string().min(1).max(80),
        revision: z.number().int().nonnegative(),
        epoch: z.number().int().nonnegative(),
        canvasRevision: z.number().int().nonnegative().nullable(),
      })
      .strict(),
    family: learningUIFamilySchema,
    layout: z.enum(['focus', 'compare', 'sequence', 'explore']),
    title: z.string().min(1).max(200),
    caption: z.string().min(1).max(500),
    instruction: z.string().min(1).max(2000),
    reason: z.string().min(1).max(1000),
    blocks: z.array(learningUIBlockSchema).max(65),
  })
  .strict()
  .superRefine((plan, ctx) => {
    const ids = plan.blocks.flatMap((block) => block.elementIds);
    if (
      new Set(plan.blocks.map((block) => block.id)).size !== plan.blocks.length ||
      new Set(ids).size !== ids.length
    )
      ctx.addIssue({ code: 'custom', message: 'Duplicate learning UI block or element' });
  });
export type LearningUIPlan = z.infer<typeof learningUIPlanSchema>;
export type LearningUIFamily = z.infer<typeof learningUIFamilySchema>;
export type LearningUIBlock = z.infer<typeof learningUIBlockSchema>;
