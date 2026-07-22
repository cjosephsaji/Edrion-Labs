import { z } from 'zod';

export const curriculumBoundsSchema = z.enum([
  'open',
  'institution_curriculum',
  'assigned_material_only',
]);

export const answerDirectnessSchema = z.enum([
  'default',
  'guided',
  'never_direct_on_assignment',
]);

export const sessionVisibilitySchema = z.enum(['none', 'aggregate', 'transcript']);

export const learnPolicyV1Schema = z.object({
  v: z.literal(1),
  curriculum_bounds: curriculumBoundsSchema,
  answer_directness: answerDirectnessSchema,
  session_visibility: sessionVisibilitySchema,
  effective_mode: z.enum(['enabled', 'disabled']).default('enabled'),
  resolved_layers: z.array(z.string()).default([]),
  version: z.string().optional(),
});

export type LearnPolicyV1 = z.infer<typeof learnPolicyV1Schema>;

export const DEFAULT_LEARN_POLICY_V1: LearnPolicyV1 = {
  v: 1,
  curriculum_bounds: 'open',
  answer_directness: 'default',
  session_visibility: 'none',
  effective_mode: 'enabled',
  resolved_layers: ['global'],
};
