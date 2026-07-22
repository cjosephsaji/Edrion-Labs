import { z } from 'zod';

export const knowledgeTypeSchema = z.enum(['conceptual', 'procedural', 'factual', 'skill']);
export const abstractionSchema = z.enum(['concrete', 'mixed', 'abstract']);
export const nativeRepresentationSchema = z.enum([
  'visual_spatial',
  'symbolic',
  'verbal',
  'temporal_sequence',
  'comparative_table',
]);
export const densitySchema = z.enum(['low', 'medium', 'high']);
export const loadSchema = z.enum(['none', 'light', 'heavy']);

export const topicProfilePrerequisiteSchema = z.object({
  atom_id: z.string().uuid().nullable(),
  label: z.string().min(1).max(200),
});

export const topicProfileV1Schema = z.object({
  knowledge_type: z.array(knowledgeTypeSchema).min(1).max(2),
  abstraction: abstractionSchema,
  native_representation: nativeRepresentationSchema,
  prerequisite_density: densitySchema,
  prerequisites: z.array(topicProfilePrerequisiteSchema).max(5),
  misconception_richness: densitySchema,
  known_misconceptions: z.array(z.string().max(200)).max(3),
  math_load: loadSchema,
  memorization_load: loadSchema,
  real_world_anchors: z.array(z.string().max(200)).max(3),
});

export type TopicProfileV1 = z.infer<typeof topicProfileV1Schema>;

export const DEFAULT_TOPIC_PROFILE_V1: TopicProfileV1 = {
  knowledge_type: ['conceptual'],
  abstraction: 'mixed',
  native_representation: 'verbal',
  prerequisite_density: 'low',
  prerequisites: [],
  misconception_richness: 'low',
  known_misconceptions: [],
  math_load: 'light',
  memorization_load: 'light',
  real_world_anchors: [],
};

export const topicProfileSourceSchema = z.enum(['generated', 'human_override']);

export const learnTopicProfileSchema = z.object({
  id: z.string().uuid(),
  learnTopicId: z.string().uuid().nullable(),
  topicKey: z.string().min(1),
  title: z.string().min(1),
  profile: topicProfileV1Schema,
  profileSchemaVersion: z.literal(1).default(1),
  source: topicProfileSourceSchema,
  model: z.string().nullable().optional(),
  promptVersion: z.string().nullable().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
  version: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type LearnTopicProfileDto = z.infer<typeof learnTopicProfileSchema>;
