import { z } from 'zod';
import { petrosKnowledgePolicySchema } from './petros-knowledge-policy';
import {
  PETROS_REVIEW_SCHEDULER_VERSION,
  petrosSavedArtifactSchema,
} from './petros-artifacts';
import { petrosAssignmentLearningLegacyPolicySnapshotSchema } from './petros-assignment-learning-release';
import {
  petrosConceptPackTrustedContextSchema,
  validatePetrosConceptPackCandidate,
} from './petros-concept-pack';
import { petrosDocumentLocatorSchema, type PetrosDocumentLocator } from './petros-document-source';
import {
  classifyPetrosObjectiveEvidence,
  petrosObjectiveEvidenceSchema,
} from './petros-objective-evidence';

/** Optional development metadata; no existing artifact or scheduler reader consumes it. */
export const PETROS_LEARNING_ARTIFACT_BINDING_VERSION = 'petros.learning-artifact-binding.v1' as const;
const token = z.string().trim().min(1).max(180);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const version = z.number().int().positive().max(100_000);
const ref = z.object({ id: z.string().uuid(), version }).strict();
const artifactRef = z.object({ id: z.string().uuid(), revision: version }).strict();
const rubricRef = z.object({ id: token, version: token }).strict();
const scope = z.object({ institutionId: z.string().uuid(), studentId: z.string().uuid() }).strict();

// An identity reference only. This neither turns the existing draft-only assignment
// candidate into a published release nor defines publication/approval authority.
const assignmentRef = z.object({
  id: z.string().uuid(),
  releaseId: z.string().uuid(),
  releaseVersion: version,
  policySnapshot: petrosAssignmentLearningLegacyPolicySnapshotSchema,
}).strict();
const taskRef = z.object({ id: token, variant: token }).strict();

export const petrosLearningArtifactBindingSchema = z.object({
  schemaVersion: z.literal(PETROS_LEARNING_ARTIFACT_BINDING_VERSION),
  scope,
  artifact: artifactRef,
  sessionId: z.string().uuid(),
  pack: ref,
  objective: ref,
  curriculumRevision: version,
  source: petrosDocumentLocatorSchema,
  rubric: rubricRef,
  policyVersion: token,
  assignment: assignmentRef.nullable(),
  originatingTask: taskRef.nullable(),
  originatingEvidence: z.object({ eventId: z.string().uuid(), responseContentHash: hash }).strict().nullable(),
  selection: z.literal('explicit_student_selection'),
  state: z.literal('candidate'),
}).strict().superRefine((binding, ctx) => {
  if (binding.originatingEvidence && !binding.originatingTask)
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'PETROS_ARTIFACT_EVIDENCE_REQUIRES_TASK' });
  if (binding.assignment && binding.assignment.policySnapshot.policyVersion !== binding.policyVersion)
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'PETROS_ARTIFACT_ASSIGNMENT_POLICY_MISMATCH' });
});
export type PetrosLearningArtifactBinding = z.infer<typeof petrosLearningArtifactBindingSchema>;

/** Absence preserves the original artifact contract; it implies no objective evidence. */
export const petrosOptionalLearningArtifactBindingSchema = petrosLearningArtifactBindingSchema.optional();

/** Every field must be loaded through current scoped owners, never accepted from clients. */
export const petrosLearningArtifactAuthoritySchema = z.object({
  scope,
  currentArtifact: petrosSavedArtifactSchema,
  currentArtifactOrigin: z.object({
    sessionId: z.string().uuid(),
    source: petrosDocumentLocatorSchema,
    explicitSelectionObserved: z.boolean(),
  }).strict(),
  currentPack: ref,
  packContext: petrosConceptPackTrustedContextSchema,
  currentPolicyVersion: token,
  currentAssignment: assignmentRef.nullable(),
  assignmentStatus: z.enum(['none', 'published', 'closed', 'archived', 'revoked']),
  currentEvidence: petrosObjectiveEvidenceSchema.nullable(),
  evidenceStatus: z.enum(['none', 'current', 'superseded', 'revoked']),
  access: z.object({
    artifact: z.boolean(), source: z.boolean(), objective: z.boolean(),
    evidence: z.boolean(), assignment: z.boolean(), s9Permitted: z.boolean(),
  }).strict(),
}).strict();

function sameRef(a: z.infer<typeof ref>, b: z.infer<typeof ref>) {
  return a.id === b.id && a.version === b.version;
}
function locatorKey(locator: PetrosDocumentLocator) {
  return JSON.stringify([
    locator.schemaVersion, locator.kind, locator.sourceVersion, locator.objectId,
    locator.unitId, locator.page, locator.textSha256, locator.start, locator.end,
    locator.offsetEncoding,
  ]);
}
function sameAssignment(a: z.infer<typeof assignmentRef> | null, b: z.infer<typeof assignmentRef> | null) {
  if (!a || !b) return a === b;
  return a.id === b.id && a.releaseId === b.releaseId && a.releaseVersion === b.releaseVersion &&
    a.policySnapshot.policyVersion === b.policySnapshot.policyVersion &&
    a.policySnapshot.assistance === b.policySnapshot.assistance &&
    a.policySnapshot.finalAnswerAllowed === b.policySnapshot.finalAnswerAllowed &&
    a.policySnapshot.resourceMode === b.policySnapshot.resourceMode &&
    a.policySnapshot.evidenceRequirement === b.policySnapshot.evidenceRequirement &&
    a.policySnapshot.disclosure === b.policySnapshot.disclosure;
}

/** No write/evidence permission is granted by a successful structural freshness check. */
export function validatePetrosLearningArtifactBinding(raw: unknown, packRaw: unknown, authorityRaw: unknown) {
  const binding = petrosLearningArtifactBindingSchema.parse(raw);
  const authority = petrosLearningArtifactAuthoritySchema.parse(authorityRaw);
  if (binding.scope.institutionId !== authority.scope.institutionId ||
    binding.scope.studentId !== authority.scope.studentId || !authority.access.artifact ||
    !authority.access.source || !authority.access.objective || !authority.access.s9Permitted)
    throw new Error('PETROS_ARTIFACT_LEARNING_ACCESS_DENIED');
  const artifact = authority.currentArtifact;
  if (artifact.lifecycle !== 'saved') throw new Error('PETROS_ARTIFACT_LEARNING_UNAVAILABLE');
  if (binding.artifact.id !== artifact.id || binding.artifact.revision !== artifact.revision)
    throw new Error('PETROS_ARTIFACT_LEARNING_STALE_REVISION');
  if (!authority.currentArtifactOrigin.explicitSelectionObserved ||
    authority.currentArtifactOrigin.sessionId !== binding.sessionId ||
    locatorKey(authority.currentArtifactOrigin.source) !== locatorKey(binding.source))
    throw new Error('PETROS_ARTIFACT_LEARNING_ORIGIN_MISMATCH');
  const pack = validatePetrosConceptPackCandidate(packRaw, authority.packContext);
  if (!sameRef(binding.pack, pack.pack) || !sameRef(binding.pack, authority.currentPack))
    throw new Error('PETROS_ARTIFACT_LEARNING_STALE_PACK');
  if (!sameRef(binding.objective, pack.objective) || binding.curriculumRevision !== pack.curriculumRevision)
    throw new Error('PETROS_ARTIFACT_LEARNING_STALE_OBJECTIVE');
  if (binding.source.sourceVersion !== pack.sourceVersion ||
    !authority.packContext.resolvedAnchors.some((anchor) => locatorKey(anchor.locator) === locatorKey(binding.source)))
    throw new Error('PETROS_ARTIFACT_LEARNING_STALE_SOURCE');
  const packAnchors = [
    ...pack.concepts.flatMap((item) => item.anchors),
    ...pack.prerequisites.flatMap((item) => item.anchors),
    ...pack.examples.flatMap((item) => item.anchors),
    ...pack.misconceptions.flatMap((item) => item.anchors),
    ...pack.assessments.flatMap((item) => item.anchors),
  ];
  if (!packAnchors.some((anchor) => locatorKey(anchor.locator) === locatorKey(binding.source)))
    throw new Error('PETROS_ARTIFACT_LEARNING_UNBOUND_SOURCE');
  if (binding.rubric.id !== pack.rubric.id || binding.rubric.version !== pack.rubric.version)
    throw new Error('PETROS_ARTIFACT_LEARNING_STALE_RUBRIC');
  if (binding.policyVersion !== authority.currentPolicyVersion)
    throw new Error('PETROS_ARTIFACT_LEARNING_STALE_POLICY');
  if (!sameAssignment(binding.assignment, authority.currentAssignment) ||
    (binding.assignment ? authority.assignmentStatus !== 'published' || !authority.access.assignment : authority.assignmentStatus !== 'none'))
    throw new Error('PETROS_ARTIFACT_LEARNING_STALE_ASSIGNMENT');
  if (binding.assignment?.policySnapshot.assistance === 'guided_homework' && binding.assignment.policySnapshot.finalAnswerAllowed)
    throw new Error('PETROS_ARTIFACT_LEARNING_ASSIGNMENT_POLICY_DENIED');
  const task = binding.originatingTask && pack.assessments.find((item) =>
    item.id === binding.originatingTask!.id && item.variant === binding.originatingTask!.variant);
  if (binding.originatingTask && !task) throw new Error('PETROS_ARTIFACT_LEARNING_STALE_TASK');
  const evidence = authority.currentEvidence;
  if (binding.originatingEvidence) {
    if (!authority.access.evidence || authority.evidenceStatus !== 'current' || !evidence)
      throw new Error('PETROS_ARTIFACT_LEARNING_EVIDENCE_UNAVAILABLE');
    if (evidence.eventId !== binding.originatingEvidence.eventId ||
      evidence.response.contentHash !== binding.originatingEvidence.responseContentHash ||
      evidence.sessionId !== binding.sessionId || !sameRef(evidence.objective, binding.objective) ||
      !sameRef(evidence.pack, binding.pack) || evidence.sourceVersion !== binding.source.sourceVersion ||
      evidence.policyVersion !== binding.policyVersion || evidence.rubric.id !== binding.rubric.id ||
      evidence.rubric.version !== binding.rubric.version || evidence.task.id !== task!.id ||
      evidence.task.variant !== task!.variant || evidence.task.unseenContext !== task!.unseenContext ||
      (binding.assignment ? !evidence.assignment || evidence.assignment.id !== binding.assignment.id ||
        !('releaseVersion' in evidence.assignment) || evidence.assignment.releaseVersion !== binding.assignment.releaseVersion : evidence.assignment !== null))
      throw new Error('PETROS_ARTIFACT_LEARNING_EVIDENCE_MISMATCH');
  } else if (evidence !== null || authority.evidenceStatus !== 'none') {
    throw new Error('PETROS_ARTIFACT_LEARNING_UNEXPECTED_EVIDENCE');
  }
  return binding;
}

/** Consumes an existing owner schedule; it cannot create or change that schedule. */
export const petrosLearningDelayedReviewRequestSchema = z.object({
  schemaVersion: z.literal('petros.learning-delayed-review.v1'),
  requestId: z.string().uuid(),
  binding: petrosLearningArtifactBindingSchema,
  purpose: z.literal('artifact_self_review'),
  schedule: z.object({
    dueAt: z.string().datetime(),
    schedulerVersion: z.literal(PETROS_REVIEW_SCHEDULER_VERSION),
  }).strict(),
}).strict();

/**
 * A resume preview is recomputed from fresh owner reads on every call. Retrying identical
 * input is deterministic and produces no duplicate writes. Cancellation discards the
 * preview; failed validation yields no partial result. Persistence still requires the
 * artifact/review owner's atomic command, canonical receipt and commit-time rechecks.
 */
export function previewPetrosLearningReviewResume(
  requestRaw: unknown,
  packRaw: unknown,
  authorityRaw: unknown,
  nowRaw: unknown,
) {
  const request = petrosLearningDelayedReviewRequestSchema.parse(requestRaw);
  const authority = petrosLearningArtifactAuthoritySchema.parse(authorityRaw);
  const binding = validatePetrosLearningArtifactBinding(request.binding, packRaw, authority);
  const now = z.string().datetime().parse(nowRaw);
  if (authority.currentArtifact.dueAt !== request.schedule.dueAt ||
    authority.currentArtifact.schedulerVersion !== request.schedule.schedulerVersion)
    throw new Error('PETROS_ARTIFACT_LEARNING_STALE_SCHEDULE');
  const previousEvidence = authority.currentEvidence
    ? classifyPetrosObjectiveEvidence(authority.currentEvidence) : null;
  return {
    schemaVersion: 'petros.learning-review-resume.v1' as const,
    requestId: request.requestId,
    binding,
    artifact: authority.currentArtifact,
    schedule: request.schedule,
    observedAt: now,
    due: Date.parse(request.schedule.dueAt) <= Date.parse(now),
    previousEvidence,
    reviewMeaning: 'self_reported_artifact_recall' as const,
    createsObjectiveEvidence: false as const,
    independentUnseenApplicationDemonstrated: false as const,
    masteryProjectionEligible: false as const,
    independentEvidenceRequirement: 'separate_unseen_task_response_and_existing_evidence_admission' as const,
    educatorApproval: 'not_established' as const,
    productionAdmission: false as const,
  };
}

export type PetrosLearningReviewResumePreview = ReturnType<typeof previewPetrosLearningReviewResume>;

/** Server-owned receipt created with the existing selected-save transaction. */
export const petrosLearningArtifactReceiptSchema = z.object({
  schemaVersion: z.literal('petros.learning-artifact-receipt.v1'),
  scope,
  artifact: artifactRef,
  contentHash: hash,
  sessionId: z.string().uuid(),
  objective: ref,
  pack: ref,
  candidateHash: hash,
  packReviewId: z.string().uuid(),
  curriculumRevision: version,
  source: petrosDocumentLocatorSchema,
  conceptIds: z.array(token).min(1).max(32),
  rubric: z.object({ id: token, version: token, criteria: z.array(z.object({
    id: token, descriptor: z.string().min(1).max(800), evidenceRequired: z.string().min(1).max(800),
  }).strict()).min(1).max(12) }).strict(),
  policy: petrosKnowledgePolicySchema,
  selectedSave: z.object({ commandId: z.string().uuid(), eventId: z.string().uuid(),
    proposalId: z.string().uuid().nullable(), meaning: z.literal('explicit_student_selection') }).strict(),
  evidenceLineage: z.array(z.string().uuid()).max(1000),
  schedule: z.object({ dueAt: z.string().datetime().nullable(), schedulerVersion: token.nullable() }).strict(),
  createsObjectiveEvidence: z.literal(false),
}).strict();
export type PetrosLearningArtifactReceipt = z.infer<typeof petrosLearningArtifactReceiptSchema>;
