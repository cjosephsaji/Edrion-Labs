import { z } from 'zod';

const id = z.string().uuid();
const version = z.number().int().min(0).max(999999);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
export const petrosMemoryCategorySchema = z.enum(['explicit_preference', 'session_continuity', 'learning_evidence', 'episodic', 'hypothesis', 'sensitive']);
export const petrosReturnPointSchema = z.object({
  sessionId: id, threadId: id.nullable().default(null), blockId: id.nullable().default(null),
  acknowledgedEventCursor: version.default(0), artifactId: id.nullable().default(null),
  unresolvedRequest: z.string().max(2000).default(''), detourReason: z.string().max(500).nullable().default(null),
  returnTarget: z.enum(['lesson', 'companion', 'notebook', 'review']).default('lesson'),
  connectivity: z.enum(['online', 'low_bandwidth', 'intermittent']).default('online'),
  workspace: z.object({ blockId: id, checkpointId: id, programRevision: version, experimentVersion: version,
    draftVersion: version, branchId: z.string().min(1).max(128) }).strict().nullable().default(null),
}).strict();
export const petrosJourneyCommandSchema = z.object({ commandId: id, journeyId: id.optional(),
  expectedVersion: version, returnPoint: petrosReturnPointSchema }).strict();
export const petrosMemoryCommandSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('remember'), commandId: id, expectedMemoryRevision: version,
    recordId: id, category: z.enum(['episodic', 'hypothesis']), sessionId: id,
    content: z.string().trim().min(1).max(1000), supportingEvidenceIds: z.array(id).max(8).default([]),
    confidence: z.number().min(0).max(1).nullable().default(null) }).strict(),
  z.object({ action: z.literal('correct'), commandId: id, expectedMemoryRevision: version,
    recordId: id, expectedRevision: version, content: z.string().trim().min(1).max(1000) }).strict(),
  z.object({ action: z.literal('forget'), commandId: id, expectedMemoryRevision: version,
    recordId: id, expectedRevision: version }).strict(),
  z.object({ action: z.literal('reset_topic'), commandId: id, expectedMemoryRevision: version,
    sessionId: id }).strict(),
  z.object({ action: z.literal('preferences'), commandId: id, expectedMemoryRevision: version,
    optionalMemoryEnabled: z.boolean(), responseDepth: z.enum(['brief', 'balanced', 'thorough']),
    language: z.string().min(2).max(20), quietMode: z.boolean() }).strict(),
]);
export const petrosQueuedNoteSchema = z.object({ schemaVersion: z.literal('petros.queued-note.v1'),
  owner: z.object({ institutionId: id, studentId: id }).strict(), deviceId: id, commandId: id,
  sequence: z.number().int().min(1).max(999999), journeyId: id, baseVersion: version,
  sourceVersion: z.string().min(1).max(128), policyVersion: z.string().min(1).max(128),
  programRevision: version.nullable(), expectedExperimentVersion: version, expectedDraftVersion: version, rubricVersion: version.nullable(),
  payload: z.object({ sessionId: id, blockId: id, text: z.string().max(4000) }).strict(),
  payloadHash: hash, dependencies: z.array(id).max(16), localOccurredAt: z.string().datetime(),
}).strict();
export type PetrosReturnPoint = z.infer<typeof petrosReturnPointSchema>;
export type PetrosJourneyCommand = z.infer<typeof petrosJourneyCommandSchema>;
export type PetrosMemoryCommand = z.infer<typeof petrosMemoryCommandSchema>;
export type PetrosQueuedNote = z.infer<typeof petrosQueuedNoteSchema>;
