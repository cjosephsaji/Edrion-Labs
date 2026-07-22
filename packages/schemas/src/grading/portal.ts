import { z } from 'zod';

export const markReleaseScopeSchema = z.object({
  exam_id: z.string().uuid().optional(),
  assessment_name: z.string().trim().min(1).optional(),
  class_ids: z.array(z.string().uuid()).min(1),
}).refine((v) => Boolean(v.exam_id) !== Boolean(v.assessment_name), {
  message: 'Provide exactly one of exam_id or assessment_name',
});

export const markReleaseUpsertSchema = z.object({
  term_id: z.string().uuid(),
  subject_id: z.string().uuid(),
  campus_id: z.string().uuid(),
  scope: markReleaseScopeSchema,
});

export const markReleaseActionSchema = z.object({
  version: z.number().int().min(0),
  confirm_missing: z.boolean().optional(),
});

export const markReleaseRetractSchema = z.object({
  version: z.number().int().min(0),
  note: z.string().trim().min(1),
});

export const markReleaseSendBackSchema = z.object({
  version: z.number().int().min(0),
  note: z.string().trim().min(10),
});

export const markReleaseListQuerySchema = z.object({
  term_id: z.string().uuid().optional(),
  subject_id: z.string().uuid().optional(),
});

export const resultsSettingsSchema = z.object({
  showClassAverage: z.boolean(),
  missingEntryPolicy: z.enum(['block', 'confirm']),
  hodReleaseGate: z.boolean(),
  revaluationRefundOnReject: z.boolean(),
  version: z.number().int().min(0).optional(),
});

export const weightMapComponentSchema = z.object({
  key: z.string().trim().min(1).max(40),
  label: z.string().trim().min(1).max(80),
  weight_pct: z.number().min(0).max(100),
  assessments: z.array(
    z.union([
      z.object({ exam_id: z.string().uuid() }),
      z.object({ assessment_name: z.string().trim().min(1) }),
    ]),
  ),
  aggregation: z.enum(['sum', 'average', 'best_n']),
  n: z.number().int().min(1).optional(),
});

export const subjectWeightMapUpsertSchema = z.object({
  subject_id: z.string().uuid(),
  term_id: z.string().uuid(),
  class_id: z.string().uuid().nullable().optional(),
  credits_override: z.number().nullable().optional(),
  components: z.array(weightMapComponentSchema),
  version: z.number().int().min(0).optional(),
});

export const gradingSchemeUpsertSchema = z.object({
  name: z.string().trim().min(1).max(120),
  kind: z.enum(['points_10', 'cbse', 'us_4', 'percentage']),
  bands: z.array(
    z.object({
      grade: z.string(),
      min_pct: z.number(),
      grade_points: z.number().nullable(),
      is_pass: z.boolean(),
    }),
  ),
  gpa_formula: z.enum(['credit_weighted', 'simple_average', 'none']),
  is_default: z.boolean().optional(),
  version: z.number().int().min(0).optional(),
});

export type MarkReleaseUpsertInput = z.infer<typeof markReleaseUpsertSchema>;
export type ResultsSettingsInput = z.infer<typeof resultsSettingsSchema>;
export type SubjectWeightMapUpsertInput = z.infer<typeof subjectWeightMapUpsertSchema>;
export const termRecomputeProposeSchema = z.object({
  term_id: z.string().uuid(),
  scheme_id: z.string().uuid(),
  scheme_version: z.number().int().min(1),
  reason: z.string().trim().min(10).max(500),
});

export const termRecomputeDecisionSchema = z.object({
  version: z.number().int().min(0),
  note: z.string().trim().max(500).optional(),
});

export type TermRecomputeProposeInput = z.infer<typeof termRecomputeProposeSchema>;
export type TermRecomputeDecisionInput = z.infer<typeof termRecomputeDecisionSchema>;
