import { z } from 'zod';

export const topicKindSchema = z.enum(['procedure', 'concept', 'body_of_material', 'skill']);
export const subjectFamilySchema = z.enum([
  'mathematics',
  'sciences',
  'history',
  'languages',
  'social_sciences',
  'computing',
  'literature',
  'geography',
  'business',
  'general',
]);

export const representationSchema = z.enum([
  'diagram_spatial',
  'symbolic_algebraic',
  'timeline_causal',
  'comparison_contrast',
  'worked_procedure',
  'audio_oral',
  'code_execution',
  'close_reading',
  'map_spatial',
  'ledger_numeric',
]);

export const topicShapeV1Schema = z.object({
  v: z.literal(1),
  kind: topicKindSchema,
  subject_family: subjectFamilySchema,
  wants_to_be: z.array(representationSchema).min(1).max(6),
  spine: z
    .array(
      z.object({
        label: z.string().min(1).max(120),
        gist: z.string().min(1).max(800),
        depends_on: z.array(z.number().int().nonnegative()).default([]),
      }),
    )
    .max(12)
    .default([]),
  prerequisites: z
    .array(
      z.object({
        label: z.string(),
        atom_id: z.string().uuid().nullable().optional(),
        hardness: z.enum(['soft', 'hard']).default('soft'),
      }),
    )
    .default([]),
  misconceptions: z
    .array(
      z.object({
        name: z.string(),
        student_belief: z.string(),
        why_tempting: z.string(),
        correction_hook: z.string(),
      }),
    )
    .default([]),
  math_load: z.enum(['none', 'light', 'heavy']).default('none'),
  memorization_load: z.enum(['none', 'light', 'heavy']).default('none'),
  procedure_steps: z.number().int().min(0).max(20).default(0),
  has_decision_point: z.boolean().default(false),
  contested: z.boolean().default(false),
  canonical_examples: z
    .array(z.object({ setup: z.string(), punchline: z.string().optional() }))
    .default([]),
  vocabulary: z.array(z.object({ term: z.string(), plain: z.string() })).default([]),
  real_world_hooks: z.array(z.string()).default([]),
  typical_assessment: z.string().optional(),
});

export type TopicShapeV1 = z.infer<typeof topicShapeV1Schema>;
export type TopicKind = z.infer<typeof topicKindSchema>;
export type SubjectFamily = z.infer<typeof subjectFamilySchema>;
export type Representation = z.infer<typeof representationSchema>;

export const checkpointRoleSchema = z.enum([
  'ground',
  'mechanism',
  'decision_point',
  'demonstrate',
  'chain',
  'contrast',
  'apply',
  'edge',
  'interpretation',
  'consolidate',
]);

export const lessonGoalSchema = z.enum([
  'learn',
  'practice',
  'revise',
  'quick',
  'from_notes',
  'continue',
]);

export const lessonShapeV1Schema = z.object({
  v: z.literal(1),
  arc_id: z.string(),
  checkpoints: z
    .array(
      z.object({
        id: z.string(),
        role: checkpointRoleSchema,
        label: z.string().min(1).max(80),
        spine_refs: z.array(z.number().int().nonnegative()).default([]),
        target_surfaces: z.array(z.string()).default([]),
      }),
    )
    .min(3)
    .max(8),
  opening: z.object({
    surface: z.string(),
    framing_md: z.string().optional(),
  }),
  adaptations_announced: z.array(z.string()).default([]),
});

export type LessonShapeV1 = z.infer<typeof lessonShapeV1Schema>;
export type CheckpointRole = z.infer<typeof checkpointRoleSchema>;
export type LessonGoal = z.infer<typeof lessonGoalSchema>;
