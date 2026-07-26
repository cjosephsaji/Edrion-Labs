import { z } from 'zod';

export const learnCurriculumBoundsSchema = z.enum([
  'open',
  'institution_curriculum',
  'assigned_material_only',
]);

export const learnAnswerDirectnessSchema = z.enum(['default', 'guided', 'never_direct_on_assignment']);

export const learnSessionVisibilitySchema = z.enum(['none', 'aggregate', 'transcript']);

export const learnPolicyV1Schema = z.object({
  v: z.literal(1),
  curriculum_bounds: learnCurriculumBoundsSchema,
  answer_directness: learnAnswerDirectnessSchema,
  session_visibility: learnSessionVisibilitySchema,
  allowed_curriculum_keys: z.array(z.string()).optional(),
  wishlist_topic_keys: z.array(z.string()).optional(),
});

export type LearnPolicyV1 = z.infer<typeof learnPolicyV1Schema>;

export const learnPolicySnapshotSchema = learnPolicyV1Schema.extend({
  effective_kill: z.boolean().default(false),
  resolved_layers: z.array(z.string()).default([]),
  policy_version: z.string().optional(),
});

export type LearnPolicySnapshot = z.infer<typeof learnPolicySnapshotSchema>;
