import { z } from 'zod';
import {
  boundedCompatibility, compatibilityHashSchema, compatibilityIntervalSchema,
  compatibilityProvenanceSchema, compatibilityText, compatibilityIdentifier,
} from './petros-compatibility';

export const PROVIDER_MAPPING_VERSION = 'petros.provider-mapping.v1' as const;
export const providerEntityKindSchema = z.enum([
  'institution', 'campus', 'institution_user', 'student', 'staff', 'course', 'class', 'academic_term', 'assignment',
]);
const mappingFields = {
  namespace: compatibilityIdentifier(200), // Exact, case-sensitive publisher namespace, not an email domain.
  entityKind: providerEntityKindSchema,
  externalId: compatibilityIdentifier(300),
};
export const providerMappingKeySchema = z.object(mappingFields).strict();
export const providerConnectionSnapshotSchema = z.object({
  schemaVersion: z.literal('petros.provider-connection.v1'),
  connectionId: z.string().uuid(),
  owner: z.literal('institution_identity_providers'),
  configurationHash: compatibilityHashSchema,
  enabled: z.boolean(),
  authentication: z.literal('disabled'),
}).strict();
export const providerMappingInputSchema = boundedCompatibility(z.object({
  schemaVersion: z.literal(PROVIDER_MAPPING_VERSION),
  ...mappingFields,
  commandId: z.string().uuid(),
  expectedVersion: z.number().int().min(0).max(99_999),
  internalId: z.string().uuid().nullable(),
  purpose: z.enum(['roster', 'resource', 'sso_subject']),
  status: z.enum(['proposed', 'approved', 'rejected', 'tombstoned']),
  effective: compatibilityIntervalSchema,
  upstreamRevision: compatibilityText(200).nullable(),
  upstreamHash: compatibilityHashSchema,
  fieldAuthority: z.array(z.object({
    field: z.enum(['identity', 'enrollment', 'term', 'placement', 'descriptor']),
    owner: z.enum(['canonical', 'provider', 'educator_override']),
  }).strict()).min(1).max(5),
  provenance: compatibilityProvenanceSchema,
  reason: compatibilityText(1000),
}).strict().superRefine((v, ctx) => {
  if (v.status === 'approved' && !v.internalId) ctx.addIssue({ code: 'custom', message: 'Approval requires a canonical reference.' });
  if (v.purpose === 'sso_subject' && v.entityKind !== 'institution_user') ctx.addIssue({ code: 'custom', message: 'SSO subjects can reference only canonical institutional accounts.' });
  if (new Set(v.fieldAuthority.map((f) => f.field)).size !== v.fieldAuthority.length) ctx.addIssue({ code: 'custom', message: 'Duplicate field authority.' });
}), 24_000);
export const providerMappingRecordSchema = z.object({
  schemaVersion: z.literal(PROVIDER_MAPPING_VERSION),
  input: providerMappingInputSchema,
  connection: providerConnectionSnapshotSchema,
  version: z.number().int().positive().max(100_000),
  actorId: z.string().uuid(),
  recordedAt: z.string().datetime({ offset: true }),
  canonicalReferenceHash: compatibilityHashSchema.nullable(),
}).strict();
export const rosterMappingContextSchema = z.object({
  schemaVersion: z.literal(PROVIDER_MAPPING_VERSION),
  connectionId: z.string().uuid(),
  namespace: compatibilityIdentifier(200),
  upstreamRevision: compatibilityText(200),
}).strict();
export type ProviderMappingInput = z.infer<typeof providerMappingInputSchema>;
export type ProviderMappingRecord = z.infer<typeof providerMappingRecordSchema>;
export type ProviderEntityKind = z.infer<typeof providerEntityKindSchema>;
export type RosterMappingContext = z.infer<typeof rosterMappingContextSchema>;
const resolutionFields = {
  status: z.enum(['mapped', 'missing', 'unreviewed', 'tombstoned', 'stale', 'not_effective', 'missing_reference', 'unsupported_version', 'incompatible']),
  mappingId: z.string().uuid().optional(),
  version: z.number().int().positive().max(100_000).optional(),
  /** Present only for a currently approved, matching reference; never a permission grant. */
  canonicalId: z.string().uuid().optional(),
};
const validResolution = (value: z.infer<z.ZodObject<typeof resolutionFields>>) => value.status === 'mapped'
  ? !!value.canonicalId && !!value.mappingId && !!value.version : value.canonicalId === undefined;
export const providerMappingResolutionSchema = z.object(resolutionFields).strict().refine(validResolution, 'Invalid mapping resolution.');
export type ProviderMappingResolution = z.infer<typeof providerMappingResolutionSchema>;
export const rosterMappingPreviewSchema = boundedCompatibility(z.object({
  schemaVersion: z.literal('petros.roster-preview.v1'),
  mode: z.literal('preview'), applied: z.literal(0), context: rosterMappingContextSchema,
  rows: z.array(z.object({ ...resolutionFields, externalId: compatibilityIdentifier(300), upstreamHash: compatibilityHashSchema })
    .strict().refine(validResolution, 'Invalid preview resolution.')).max(200),
  mapped: z.number().int().min(0).max(200), unresolved: z.number().int().min(0).max(200),
}).strict().refine((value) => value.mapped === value.rows.filter((row) => row.status === 'mapped').length &&
  value.mapped + value.unresolved === value.rows.length && new Set(value.rows.map((row) => row.externalId)).size === value.rows.length,
'Invalid preview counts or duplicate identity.'), 192_000);
