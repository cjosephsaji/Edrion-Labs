import { z } from 'zod';

const digest = z.string().regex(/^[a-f0-9]{64}$/);
export const PETROS_PRODUCTION_QUALITY_GATES = ['sources', 'teaching', 'evidence', 'memory', 'recommendations', 'institutional', 'recovery', 'visuals'] as const;
export const petrosReleaseIdentitiesSchema = z.object({
  application: digest, migrations: digest, sourcePack: digest, promptSchema: digest,
  policy: digest, modelRouting: digest, fixtures: digest, evaluator: digest,
}).strict();
export type PetrosReleaseIdentities = z.infer<typeof petrosReleaseIdentitiesSchema>;

/** Content-free evidence index. Human judgment is deliberately outside this contract. */
export const petrosProductionQualityReportSchema = z.object({
  schemaVersion: z.literal('petros.production-quality.v1'), id: z.string().uuid(),
  environment: z.literal('disposable_synthetic'), runtime: z.literal('production_owners'),
  identities: petrosReleaseIdentitiesSchema,
  fixtureVersion: z.string().min(1).max(120), evaluatorVersion: z.string().min(1).max(120),
  createdAt: z.string().datetime(), expiresAt: z.string().datetime(),
  checks: z.array(z.object({ gate: z.enum(PETROS_PRODUCTION_QUALITY_GATES),
    layer: z.enum(['deterministic', 'controlled_model']), status: z.enum(['pass', 'fail']),
    samples: z.number().int().positive().max(1_000_000), evidenceSha256: digest,
  }).strict()).min(8).max(32),
  accounting: z.object({ attempts: z.number().int().nonnegative(), failed: z.number().int().nonnegative(),
    cancelled: z.number().int().nonnegative(), costMicros: z.number().int().nonnegative(),
    maxCostMicros: z.number().int().nonnegative(), openReservations: z.literal(0),
    reconciled: z.literal(true), evidenceSha256: digest,
  }).strict(),
  educatorAcceptance: z.literal('pending'), pilotAcceptance: z.literal('pending'),
}).strict().superRefine((r, ctx) => {
  if (Date.parse(r.expiresAt) <= Date.parse(r.createdAt) || Date.parse(r.expiresAt) - Date.parse(r.createdAt) > 30 * 86400_000)
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Report validity must be positive and at most 30 days.' });
  for (const gate of PETROS_PRODUCTION_QUALITY_GATES) {
    if (r.checks.filter(c => c.gate === gate && c.layer === 'deterministic').length !== 1)
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Exactly one deterministic check required for ${gate}.` });
  }
  if (new Set(r.checks.map(c => `${c.gate}:${c.layer}`)).size !== r.checks.length)
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Duplicate quality check.' });
  if (r.accounting.failed + r.accounting.cancelled > r.accounting.attempts)
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Attempt outcomes cannot exceed attempt count.' });
});
export type PetrosProductionQualityReport = z.infer<typeof petrosProductionQualityReportSchema>;

export const petrosReleaseBundleSchema = z.object({
  schemaVersion: z.literal('petros.release-bundle.v1'), id: z.string().uuid(),
  identities: petrosReleaseIdentitiesSchema, evaluationId: z.string().uuid(),
  createdAt: z.string().datetime(), expiresAt: z.string().datetime(),
  functions: z.array(z.object({ functionId: z.string().uuid(), versionId: z.string().uuid(),
    rollbackVersionId: z.string().uuid(), candidateSha256: digest, rollbackSha256: digest,
    configurationSha256: digest,
  }).strict()).min(1).max(100),
  admissions: z.literal('disabled'), externalAcceptance: z.literal('pending'),
}).strict().superRefine((r, ctx) => {
  if (new Set(r.functions.map(f => f.functionId)).size !== r.functions.length)
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Duplicate function identity.' });
  if (r.functions.some(f => f.versionId === f.rollbackVersionId))
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Rollback must preserve a different version.' });
  if (Date.parse(r.expiresAt) <= Date.parse(r.createdAt) || Date.parse(r.expiresAt) - Date.parse(r.createdAt) > 30 * 86400_000)
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Bundle validity must be positive and at most 30 days.' });
});
export type PetrosReleaseBundle = z.infer<typeof petrosReleaseBundleSchema>;
export const petrosReleaseReportImportSchema = z.object({ report: petrosProductionQualityReportSchema, reason: z.string().trim().min(8).max(500) }).strict();
export const petrosReleaseRegisterSchema = z.object({ bundle: petrosReleaseBundleSchema, reason: z.string().trim().min(8).max(500) }).strict();
export const petrosReleaseDisableSchema = z.object({ commandId: z.string().uuid(), reason: z.string().trim().min(8).max(500) }).strict();

export const petrosPilotEventSchema = z.object({
  schemaVersion: z.literal('petros.pilot-event.v1'), eventId: z.string().uuid(), journeyId: z.string().uuid(),
  experiment: z.string().regex(/^[a-z0-9][a-z0-9._-]{2,79}$/),
  event: z.enum(['lesson_ready', 'resume_succeeded', 'recovery_shown', 'independent_check', 'review_due', 'accessibility_alternative']),
  outcome: z.enum(['succeeded', 'unavailable', 'declined']),
  durationBucket: z.enum(['under_1s', '1_to_5s', '5_to_30s', 'over_30s']).nullable(),
  connectivity: z.enum(['online', 'low_bandwidth', 'intermittent']),
}).strict();
export type PetrosPilotEvent = z.infer<typeof petrosPilotEventSchema>;
