import { z } from 'zod';

export const blockTypeV1Schema = z.enum([
  'explanation',
  'worked_example',
  'question_set',
  'canvas_embed',
  'synthesis',
  'artifact_commit',
  'probe',
  'system_notice',
]);

export type BlockTypeV1 = z.infer<typeof blockTypeV1Schema>;

const blockEnvelopeSchema = z.object({
  block_type: blockTypeV1Schema,
  title: z.string().max(120).optional(),
  body_md: z.string().max(4000).optional(),
});

export const explanationBlockSchema = blockEnvelopeSchema.extend({
  block_type: z.literal('explanation'),
  body_md: z.string().max(2000),
  deeper_md: z.string().max(3000).optional(),
  anchor: z.string().max(200).optional(),
});

export const workedExampleStepSchema = z.object({
  step_md: z.string().max(1000),
  predict_prompt: z.string().max(200).optional(),
});

export const workedExampleBlockSchema = blockEnvelopeSchema.extend({
  block_type: z.literal('worked_example'),
  problem_md: z.string().max(2000),
  steps: z.array(workedExampleStepSchema).min(3).max(6),
});

const learnQuestionOptionSchema = z.object({
  id: z.string().min(1).max(40),
  label_md: z.string().max(500),
});

const learnQuestionSchema = z.object({
  id: z.string().min(1).max(40),
  type: z.enum(['mcq_single', 'short_text', 'numeric']),
  prompt_md: z.string().max(2000),
  options: z.array(learnQuestionOptionSchema).min(2).max(5).optional(),
  correct_option_id: z.string().optional(),
  atom_id: z.string().uuid(),
  difficulty: z.enum(['easy', 'medium', 'hard']),
  why_md: z.string().max(1000).optional(),
});

export const questionSetBlockSchema = blockEnvelopeSchema.extend({
  block_type: z.literal('question_set'),
  purpose: z.enum(['retrieval', 'prereq']),
  questions: z.array(learnQuestionSchema).min(1).max(3),
});

export const canvasEmbedBlockSchema = blockEnvelopeSchema.extend({
  block_type: z.literal('canvas_embed'),
  graph_json_ref: z.string().min(1),
  canvas_id: z.string().uuid(),
  caption: z.string().max(300).optional(),
});

export const synthesisBlockSchema = blockEnvelopeSchema.extend({
  block_type: z.literal('synthesis'),
  prompt_md: z.string().max(500),
});

export const artifactCardSchema = z.object({
  front_md: z.string().max(500),
  back_md: z.string().max(1000),
  source_block_id: z.string().uuid(),
});

export const artifactCommitBlockSchema = blockEnvelopeSchema.extend({
  block_type: z.literal('artifact_commit'),
  cards: z.array(artifactCardSchema).max(6),
  include_canvas: z.boolean().default(false),
});

export const probeBlockSchema = blockEnvelopeSchema.extend({
  block_type: z.literal('probe'),
  question_md: z.string().max(1000),
  chain_id: z.string().uuid(),
  turn: z.union([z.literal(1), z.literal(2)]),
});

export const systemNoticeActionSchema = z.object({
  key: z.string().min(1).max(40),
  label: z.string().min(1).max(80),
});

export const systemNoticeBlockSchema = blockEnvelopeSchema.extend({
  block_type: z.literal('system_notice'),
  kind: z.enum(['break', 'budget', 'degraded', 'policy']),
  body_md: z.string().max(1000),
  actions: z.array(systemNoticeActionSchema).max(4).default([]),
});

export const blockV1Schema = z.discriminatedUnion('block_type', [
  explanationBlockSchema,
  workedExampleBlockSchema,
  questionSetBlockSchema,
  canvasEmbedBlockSchema,
  synthesisBlockSchema,
  artifactCommitBlockSchema,
  probeBlockSchema,
  systemNoticeBlockSchema,
]);

export type BlockV1 = z.infer<typeof blockV1Schema>;

export const sessionBlockV1Schema = z.object({
  id: z.string().uuid(),
  sessionId: z.string().uuid(),
  sequence: z.number().int().nonnegative(),
  streamSeq: z.number().int().nonnegative().nullable().optional(),
  moveType: z.string().nullable().optional(),
  block: blockV1Schema,
  blockSchemaVersion: z.literal(1).default(1),
  reasoning: z.string().nullable().optional(),
  degraded: z.boolean().default(false),
  interactionState: z.record(z.unknown()).default({}),
  renderStatus: z.string().nullable().optional(),
  version: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type SessionBlockV1Dto = z.infer<typeof sessionBlockV1Schema>;

export function parseBlockV1(content: unknown): BlockV1 {
  return blockV1Schema.parse(content);
}
