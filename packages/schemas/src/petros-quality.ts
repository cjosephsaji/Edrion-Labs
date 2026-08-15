import { z } from 'zod';

export const PETROS_QUALITY_JUDGE_FUNCTION_KEY = 'evaluation.teaching_quality.judge';
export const PETROS_QUALITY_ENVIRONMENTS = ['evaluation'] as const;

export const petrosQualityRunQuerySchema = z.object({
  status: z.enum(['completed', 'failed', 'cancelled']).optional(),
  mode: z.enum(['fixture', 'live']).optional(),
  gate: z.enum(['pass', 'warn', 'fail']).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type PetrosQualityRunQuery = z.infer<typeof petrosQualityRunQuerySchema>;

export const petrosQualityImportSchema = z.object({
  report: z.record(z.unknown()),
  reason: z.string().trim().min(3).max(500),
});
export type PetrosQualityImportInput = z.infer<typeof petrosQualityImportSchema>;

export const petrosQualityPromotionSchema = z.object({
  reason: z.string().trim().min(8).max(500),
  confirmation: z.literal('PROMOTE BASELINE'),
});
export type PetrosQualityPromotionInput = z.infer<typeof petrosQualityPromotionSchema>;

export const petrosQualityJudgeSchema = z.object({
  functionKey: z.literal(PETROS_QUALITY_JUDGE_FUNCTION_KEY),
  source: z.literal('evaluation'),
  environment: z.literal('evaluation'),
  promptVersion: z.string().trim().min(3).max(120),
  schemaVersion: z.string().trim().min(3).max(120),
  transcript: z.record(z.unknown()),
});
export type PetrosQualityJudgeInput = z.infer<typeof petrosQualityJudgeSchema>;

export const petrosQualityRerunSchema = z.object({
  reason: z.string().trim().min(3).max(500),
  failedOnly: z.boolean().default(true),
});
export type PetrosQualityRerunInput = z.infer<typeof petrosQualityRerunSchema>;

export const petrosQualityLiveSessionSchema = z.object({
  source: z.literal('evaluation'),
  environment: z.literal('evaluation'),
  synthetic: z.literal(true),
  runId: z.string().trim().min(3).max(200),
  case: z.record(z.unknown()),
  personaId: z.string().trim().min(3).max(80),
  personaPolicy: z.object({
    id: z.string().trim().min(3).max(80),
    description: z.string().trim().min(1).max(500),
    accuracy: z.number().min(0).max(1),
    confidence: z.enum(['sure', 'think_so', 'guessing']),
    responseTimeMs: z.number().int().nonnegative().max(120_000),
    skips: z.boolean(),
    prerequisiteAccuracy: z.number().min(0).max(1),
    questionBehavior: z.enum(['none', 'relevant_detour']),
    recovery: z.enum(['normal', 'persistent_struggle']),
  }).strict(),
  seed: z.number().int(),
  limits: z.object({
    maxCostMicros: z.number().int().nonnegative(),
    maxTokens: z.number().int().nonnegative(),
    maxDurationMs: z.number().int().min(1_000).max(3_600_000),
  }),
}).superRefine((input, ctx) => {
  if (input.personaPolicy.id !== input.personaId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['personaPolicy', 'id'],
      message: 'Persona policy ID must match personaId.',
    });
  }
});
export type PetrosQualityLiveSessionInput = z.infer<typeof petrosQualityLiveSessionSchema>;
