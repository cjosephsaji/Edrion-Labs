import { z } from 'zod';

export const orchestratorBlockKindSchema = z.enum([
  'explanation',
  'worked_example',
  'question_set',
  'visual_canvas',
  'synthesis',
  'artifact_commit',
  'socratic_probe',
  'system_notice',
]);

export const orchestratorBlockV1Schema = z.object({
  v: z.literal(1),
  kind: orchestratorBlockKindSchema,
  title: z.string().optional(),
  body_markdown: z.string().max(8000),
  canvas_id: z.string().uuid().optional(),
  questions: z
    .array(
      z.object({
        question_id: z.string().min(1),
        prompt_markdown: z.string(),
        choices: z.array(z.string()).optional(),
      }),
    )
    .max(3)
    .optional(),
  degraded: z.boolean().default(false),
});

export type OrchestratorBlockV1 = z.infer<typeof orchestratorBlockV1Schema>;
