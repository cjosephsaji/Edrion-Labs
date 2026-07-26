import { z } from 'zod';

export const learnTopicProfileV1Schema = z.object({
  v: z.literal(1),
  knowledge_type: z.string(),
  native_representation: z.string(),
  prerequisite_atom_ids: z.array(z.string().uuid()).default([]),
  misconception_richness: z.enum(['low', 'medium', 'high']).default('medium'),
  math_load: z.enum(['low', 'medium', 'high']).default('low'),
  pedagogy_weights: z.record(z.number()).default({}),
});

export type LearnTopicProfileV1 = z.infer<typeof learnTopicProfileV1Schema>;
