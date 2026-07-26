import { z } from 'zod';

export const learnMoveTypeSchema = z.enum([
  'direct_explanation',
  'worked_example',
  'retrieval_check',
  'prereq_pulse',
  'visual_spawn',
  'synthesis',
  'artifact_commit',
  'socratic_probe',
]);

export type LearnMoveType = z.infer<typeof learnMoveTypeSchema>;

export const planV1Schema = z.object({
  v: z.literal(1),
  move: learnMoveTypeSchema,
  reasoning: z.string().max(2000).optional(),
  atom_ids: z.array(z.string().uuid()).max(8).optional(),
  time_budget_hint_minutes: z.number().int().positive().optional(),
});

export type PlanV1 = z.infer<typeof planV1Schema>;
