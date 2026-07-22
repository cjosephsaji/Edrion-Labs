import { z } from 'zod';

export const moveTypeSchema = z.enum([
  'direct_explanation',
  'worked_example',
  'retrieval_check',
  'prereq_pulse',
  'visual_spawn',
  'synthesis',
  'artifact_commit',
  'socratic_probe',
]);

export type MoveType = z.infer<typeof moveTypeSchema>;

export const planV1Schema = z.object({
  v: z.literal(1),
  move: moveTypeSchema,
  params: z.record(z.unknown()).default({}),
  reasoning: z.string().max(400),
  checkpoint_advance: z.boolean().default(false),
  session_should_end: z.boolean().default(false),
});

export type PlanV1 = z.infer<typeof planV1Schema>;

export const directExplanationParamsSchema = z.object({
  depth: z.enum(['base', 'deeper']).default('base'),
  anchor: z.string().max(200).optional(),
});

export const workedExampleParamsSchema = z.object({
  problem_statement: z.string().max(500),
  step_count: z.number().int().min(3).max(6),
});

export const retrievalCheckParamsSchema = z.object({
  question_count: z.number().int().min(1).max(3).default(1),
});

export const prereqPulseParamsSchema = z.object({
  atom_ids: z.array(z.string().uuid()).max(2).optional(),
});

export const visualSpawnParamsSchema = z.object({
  caption: z.string().max(200).optional(),
});

export const synthesisParamsSchema = z.object({
  prompt_hint: z.string().max(200).optional(),
});

export const artifactCommitParamsSchema = z.object({
  max_cards: z.number().int().min(1).max(6).default(6),
  include_canvas: z.boolean().default(false),
});

export const socraticProbeParamsSchema = z.object({
  chain_id: z.string().uuid(),
  turn: z.union([z.literal(1), z.literal(2)]),
});
