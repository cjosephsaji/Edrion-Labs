import { z } from 'zod';
import { petrosAssessmentConditionsSchema } from './petros-assessment';
import { petrosReviewerAuthoritySnapshotSchema } from './petros-concept-pack-review';
import { petrosDocumentLocatorSchema, petrosResolvedDocumentLocatorSchema } from './petros-document-source';

/** Isolated contract only. No receipt is created, authenticated, persisted or admitted here. */
export const PETROS_QUALITATIVE_REVIEW_VERSION = 'petros.qualitative-review.v1' as const;
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const token = z.string().trim().min(1).max(180);
const text = (max: number) => z.string().trim().min(1).max(max);
const ref = z.object({ id: z.string().uuid(), version: z.number().int().positive().max(100_000) }).strict();
const rubricRef = z.object({ id: token, version: token }).strict();
const scope = z.object({
  institutionId: z.string().uuid(),
  courseId: z.string().uuid(),
  studentId: z.string().uuid(),
}).strict();

/** Content hashes and UTF-16 lengths must be calculated by the artifact/submission owner. */
export const petrosQualitativeWorkRevisionSchema = z.object({
  workId: z.string().uuid(),
  revisionId: z.string().uuid(),
  revision: z.number().int().positive().max(100_000),
  contentHash: hash,
  textLength: z.number().int().min(1).max(20_000),
}).strict();
const workSpan = z.object({
  workId: z.string().uuid(),
  revisionId: z.string().uuid(),
  contentHash: hash,
  start: z.number().int().nonnegative().max(19_999),
  end: z.number().int().positive().max(20_000),
  offsetEncoding: z.literal('utf16'),
}).strict().refine((span) => span.end > span.start, 'PETROS_QUALITATIVE_INVALID_SPAN');
const revisionWork = z.object({
    stage: z.literal('revision'),
    current: petrosQualitativeWorkRevisionSchema,
    previous: petrosQualitativeWorkRevisionSchema,
  }).strict();

export const petrosQualitativeRevisionCandidateSchema = z.object({
  schemaVersion: z.literal(PETROS_QUALITATIVE_REVIEW_VERSION),
  exercise: z.literal('source_grounded_explanation_revision'),
  exerciseId: z.string().uuid(),
  scope,
  objective: ref,
  pack: ref,
  sourceVersion: hash,
  sourceAnchors: z.array(petrosDocumentLocatorSchema).min(1).max(12),
  policyVersion: token,
  work: revisionWork,
  rubric: z.object({
    id: token,
    version: token,
    criteria: z.array(z.object({
      id: token,
      descriptor: text(800),
      evidenceRequired: text(800),
    }).strict()).min(1).max(12),
  }).strict(),
  feedbackId: z.string().uuid(),
  productFeedback: z.array(z.object({
    criterionId: token,
    observation: z.discriminatedUnion('status', [
      z.object({ status: z.literal('not_observed'), spans: z.array(workSpan).max(0) }).strict(),
      z.object({ status: z.literal('observed'), spans: z.array(workSpan).min(1).max(8) }).strict(),
    ]),
    feedback: text(1_000),
    uncertainty: z.enum(['low', 'medium', 'high', 'unknown']),
  }).strict()).min(1).max(12),
  // Process observations describe recorded acts; they do not establish work quality or independence.
  processObservations: z.array(z.object({
    id: z.string().uuid(),
    kind: z.enum(['revision_submitted', 'feedback_requested', 'assistance_declared']),
    basis: z.enum(['self_reported', 'system_observed', 'educator_observed']),
    actorId: z.string().uuid(),
    recordedAt: z.string().datetime(),
    revisionId: z.string().uuid(),
    description: text(600),
  }).strict()).max(24),
  conditions: petrosAssessmentConditionsSchema,
  reviewId: z.string().uuid().nullable(),
  draftFeedback: z.object({id:z.string().uuid(),hash}).strict().nullable().default(null),
}).strict().superRefine((candidate, ctx) => {
  const fail = (message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, message });
  if (candidate.conditions.policyVersion !== candidate.policyVersion)
    fail('PETROS_QUALITATIVE_POLICY_MISMATCH');
  if (candidate.sourceAnchors.some((anchor) => anchor.sourceVersion !== candidate.sourceVersion))
    fail('PETROS_QUALITATIVE_MIXED_SOURCE');
  const { current, previous } = candidate.work;
  if (previous.workId !== current.workId ||
    previous.revisionId === current.revisionId || current.revision !== previous.revision + 1)
    fail('PETROS_QUALITATIVE_INVALID_REVISION_LINEAGE');
  const criterionIds = new Set(candidate.rubric.criteria.map((criterion) => criterion.id));
  const feedbackIds = new Set(candidate.productFeedback.map((feedback) => feedback.criterionId));
  if (criterionIds.size !== candidate.rubric.criteria.length ||
    feedbackIds.size !== candidate.productFeedback.length || feedbackIds.size !== criterionIds.size ||
    [...feedbackIds].some((id) => !criterionIds.has(id)))
    fail('PETROS_QUALITATIVE_INVALID_CRITERION_REFERENCES');
  for (const feedback of candidate.productFeedback)
    for (const span of feedback.observation.spans)
      if (span.workId !== current.workId || span.revisionId !== current.revisionId ||
        span.contentHash !== current.contentHash || span.end > current.textLength)
        fail('PETROS_QUALITATIVE_STALE_FEEDBACK_SPAN');
  if (new Set(candidate.processObservations.map((item) => item.id)).size !== candidate.processObservations.length)
    fail('PETROS_QUALITATIVE_DUPLICATE_PROCESS_OBSERVATION');
  if (candidate.processObservations.some((item) => item.revisionId !== current.revisionId))
    fail('PETROS_QUALITATIVE_STALE_PROCESS_OBSERVATION');
});
export type PetrosQualitativeRevisionCandidate = z.infer<typeof petrosQualitativeRevisionCandidateSchema>;

/** Student command: references only. Exact work, source, rubric and policy are owner-loaded. */
export const petrosQualitativeSubmissionCommandSchema = z.object({
  schemaVersion: z.literal(PETROS_QUALITATIVE_REVIEW_VERSION),
  commandId: z.string().uuid(),
  artifactId: z.string().uuid(),
  expectedRevision: z.number().int().positive().max(100_000),
  sessionId: z.string().uuid(),
  courseId: z.string().uuid(),
  objective: ref,
  pack: ref,
  task: z.object({ id: token, variant: token }).strict(),
  draftFeedbackId:z.string().uuid().optional(),
  shareLearningProvenance:z.boolean().default(false),
}).strict();
export type PetrosQualitativeSubmissionCommand = z.infer<typeof petrosQualitativeSubmissionCommandSchema>;

export const petrosQualitativeSubmissionReceiptSchema = z.object({
  schemaVersion: z.literal(PETROS_QUALITATIVE_REVIEW_VERSION),
  submissionId: z.string().uuid(),
  commandId: z.string().uuid(),
  requestHash: hash,
  scope,
  sessionId: z.string().uuid(),
  objective: ref,
  pack: ref,
  task: z.object({ id: token, variant: token }).strict(),
  sourceVersion: hash,
  sourceAnchors: z.array(petrosDocumentLocatorSchema).min(1).max(12),
  policyVersion: token,
  work: revisionWork,
  rubric: z.object({
    id: token,
    version: token,
    criteria: z.array(z.object({
      id: token,
      descriptor: text(800),
      evidenceRequired: text(800),
    }).strict()).min(1).max(12),
  }).strict(),
  submittedAt: z.string().datetime(),
  replayed: z.boolean(),
  draftFeedback:z.object({id:z.string().uuid(),hash}).strict().nullable().default(null),
  shareLearningProvenance:z.boolean().default(false),
}).strict();
export type PetrosQualitativeSubmissionReceipt = z.infer<typeof petrosQualitativeSubmissionReceiptSchema>;

const qualitativeFeedbackCommand = z.object({
  criterionId: token,
  observation: z.discriminatedUnion('status', [
    z.object({ status: z.literal('not_observed') }).strict(),
    z.object({
      status: z.literal('observed'),
      spans: z.array(z.object({
        start: z.number().int().nonnegative().max(19_999),
        end: z.number().int().positive().max(20_000),
      }).strict().refine((item) => item.end > item.start, 'PETROS_QUALITATIVE_INVALID_SPAN')).min(1).max(8),
    }).strict(),
  ]),
  feedback: text(1_000),
  uncertainty: z.enum(['low', 'medium', 'high', 'unknown']),
}).strict();

/**
 * Educator decision command. Reviewer authority and all binding hashes remain server-owned.
 * Narrative criterion feedback is intentionally non-numeric and cannot grant S8 mastery.
 */
export const petrosQualitativeReviewCommandSchema = z.object({
  schemaVersion: z.literal(PETROS_QUALITATIVE_REVIEW_VERSION),
  commandId: z.string().uuid(),
  submissionId: z.string().uuid(),
  qualificationId: z.string().uuid(),
  expectedQualificationVersion: z.number().int().positive().max(100_000),
  decision: z.enum(['approved', 'rejected']),
  reason: text(1_200),
  productFeedback: z.array(qualitativeFeedbackCommand).min(1).max(12),
}).strict();
export type PetrosQualitativeReviewCommand = z.infer<typeof petrosQualitativeReviewCommandSchema>;

export const petrosQualitativeRevokeCommandSchema = z.object({commandId:z.string().uuid(),
  reviewId:z.string().uuid(),reason:text(1200),qualificationId:z.string().uuid(),
  expectedQualificationVersion:z.number().int().positive()}).strict();

export const petrosQualitativeDraftRequestSchema = petrosQualitativeSubmissionCommandSchema;
export const petrosQualitativeDraftFeedbackCommandSchema = petrosQualitativeReviewCommandSchema.omit({submissionId:true,decision:true})
  .extend({requestId:z.string().uuid()}).strict();
export const petrosQualitativeDraftRequestReceiptSchema = petrosQualitativeSubmissionReceiptSchema.omit({work:true})
  .extend({work:petrosQualitativeWorkRevisionSchema}).strict();
export const petrosQualitativeDraftFeedbackReceiptSchema = z.object({id:z.string().uuid(),requestId:z.string().uuid(),
  request:petrosQualitativeDraftRequestReceiptSchema,
  authority:petrosReviewerAuthoritySnapshotSchema,reviewedAt:z.string().datetime(),
  productFeedback:z.array(qualitativeFeedbackCommand).min(1).max(12),reason:text(1200)}).strict();

/** An immutable owner-loaded decision. Parsing this shape does not create educator approval. */
export const petrosQualitativeReviewReceiptSchema = z.object({
  schemaVersion: z.literal(PETROS_QUALITATIVE_REVIEW_VERSION),
  id: z.string().uuid(),
  commandId: z.string().uuid(),
  exerciseId: z.string().uuid(),
  scope,
  objective: ref,
  pack: ref,
  sourceVersion: hash,
  policyVersion: token,
  rubric: rubricRef,
  work: petrosQualitativeWorkRevisionSchema,
  previousWork: petrosQualitativeWorkRevisionSchema,
  feedbackId: z.string().uuid(),
  // Freeze the reviewed payload as well as its identifiers. A retained feedback ID
  // cannot silently approve edited feedback, criteria, process claims or conditions.
  reviewedCandidate: petrosQualitativeRevisionCandidateSchema,
  reviewer: z.object({
    institutionUserId: z.string().uuid(),
    role: z.literal('qualified_educator'),
    authoritySnapshot: petrosReviewerAuthoritySnapshotSchema,
  }).strict(),
  decision: z.enum(['approved', 'rejected']),
  reason: text(1_200),
  reviewedAt: z.string().datetime(),
}).strict();
export type PetrosQualitativeReviewReceipt = z.infer<typeof petrosQualitativeReviewReceiptSchema>;

/**
 * Must be assembled by existing authenticated owners from current records, including the
 * stored receipt. Never accept this context, reviewer authority, hashes or active flags from
 * a learner, model or request body. Revocation is current lifecycle state, separate from
 * the immutable receipt. This function cannot authenticate or query permissions itself.
 */
export const petrosQualitativeReviewAuthoritySchema = z.object({
  scope,
  exerciseId: z.string().uuid(),
  currentWork: petrosQualitativeWorkRevisionSchema,
  currentPreviousWork: petrosQualitativeWorkRevisionSchema.nullable(),
  currentObjective: ref,
  currentPack: ref,
  currentSourceVersion: hash,
  resolvedSourceAnchors: z.array(petrosResolvedDocumentLocatorSchema).min(1).max(12),
  currentRubric: rubricRef,
  currentPolicyVersion: token,
  currentFeedbackId: z.string().uuid(),
  sourceAvailable: z.boolean(),
  currentEnrollmentActive: z.boolean(),
  s9Permitted: z.boolean(),
  resolvedReview: z.object({
    receipt: petrosQualitativeReviewReceiptSchema,
    active: z.boolean(),
    currentReviewer: z.object({
      snapshot: petrosReviewerAuthoritySnapshotSchema,
      active: z.boolean(),
      canReviewThisCourseStudentObjective: z.boolean(),
    }).strict(),
  }).strict().nullable(),
}).strict();
export type PetrosQualitativeReviewAuthority = z.infer<typeof petrosQualitativeReviewAuthoritySchema>;

const unavailableReasons = z.enum([
  'scope_denied', 'source_unavailable', 'source_anchor_unresolved', 'policy_denied',
  'stale_work', 'stale_objective', 'stale_pack', 'stale_source', 'stale_rubric',
  'stale_policy', 'stale_feedback', 'draft_not_reviewable', 'review_pending',
  'review_missing', 'review_revoked', 'reviewer_authority_denied', 'review_binding_mismatch',
]);
export const petrosQualitativeReviewResolutionSchema = z.object({
  schemaVersion: z.literal(PETROS_QUALITATIVE_REVIEW_VERSION),
  result: z.discriminatedUnion('status', [
    z.object({ status: z.literal('unavailable'), reason: unavailableReasons }).strict(),
    z.object({
      status: z.literal('valid_approval'), reviewId: z.string().uuid(),
    }).strict(),
    z.object({ status: z.literal('rejected'), reviewId: z.string().uuid() }).strict(),
  ]),
  // The existing S8 qualitative admission gate remains authoritative and closed.
  evidenceAdmission: z.literal('not_granted'),
  numericProjection: z.literal(false),
}).strict();
export type PetrosQualitativeReviewResolution = z.infer<typeof petrosQualitativeReviewResolutionSchema>;

/** Pure current-state check. Missing/pending/stale/revoked review never yields valid_approval. */
export function resolvePetrosQualitativeReview(
  raw: unknown,
  trustedRaw: unknown,
): PetrosQualitativeReviewResolution {
  const candidate = petrosQualitativeRevisionCandidateSchema.parse(raw);
  const authority = petrosQualitativeReviewAuthoritySchema.parse(trustedRaw);
  const result = (value: PetrosQualitativeReviewResolution['result']) =>
    petrosQualitativeReviewResolutionSchema.parse({
      schemaVersion: PETROS_QUALITATIVE_REVIEW_VERSION,
      result: value, evidenceAdmission: 'not_granted', numericProjection: false,
    });
  const unavailable = (reason: z.infer<typeof unavailableReasons>) => result({ status: 'unavailable', reason });
  const sameRef = (a: { id: string; version: string | number }, b: { id: string; version: string | number }) =>
    a.id === b.id && a.version === b.version;
  const sameScope = (a: z.infer<typeof scope>, b: z.infer<typeof scope>) =>
    a.institutionId === b.institutionId && a.courseId === b.courseId && a.studentId === b.studentId;
  const sameWork = (a: z.infer<typeof petrosQualitativeWorkRevisionSchema>, b: z.infer<typeof petrosQualitativeWorkRevisionSchema>) =>
    a.workId === b.workId && a.revisionId === b.revisionId && a.revision === b.revision &&
    a.contentHash === b.contentHash && a.textLength === b.textLength;
  const locatorKey = (locator: z.infer<typeof petrosDocumentLocatorSchema>) =>
    [locator.sourceVersion, locator.objectId, locator.unitId, locator.page, locator.textSha256,
      locator.start, locator.end, locator.offsetEncoding].join(':');
  if (!sameScope(candidate.scope, authority.scope) || candidate.exerciseId !== authority.exerciseId ||
    !authority.currentEnrollmentActive) return unavailable('scope_denied');
  if (!authority.sourceAvailable) return unavailable('source_unavailable');
  if (!authority.s9Permitted) return unavailable('policy_denied');
  if (!sameWork(candidate.work.current, authority.currentWork)) return unavailable('stale_work');
  if (candidate.work.previous === null ? authority.currentPreviousWork !== null :
    authority.currentPreviousWork === null || !sameWork(candidate.work.previous, authority.currentPreviousWork))
    return unavailable('stale_work');
  if (!sameRef(candidate.objective, authority.currentObjective)) return unavailable('stale_objective');
  if (!sameRef(candidate.pack, authority.currentPack)) return unavailable('stale_pack');
  if (candidate.sourceVersion !== authority.currentSourceVersion) return unavailable('stale_source');
  if (!sameRef(candidate.rubric, authority.currentRubric)) return unavailable('stale_rubric');
  if (candidate.policyVersion !== authority.currentPolicyVersion) return unavailable('stale_policy');
  if (candidate.feedbackId !== authority.currentFeedbackId) return unavailable('stale_feedback');
  const resolved = new Set(authority.resolvedSourceAnchors.map((item) => locatorKey(item.locator)));
  if (candidate.sourceAnchors.some((locator) => !resolved.has(locatorKey(locator))))
    return unavailable('source_anchor_unresolved');
  if (candidate.work.stage !== 'revision') return unavailable('draft_not_reviewable');
  if (candidate.reviewId === null) return unavailable('review_pending');
  if (!authority.resolvedReview || authority.resolvedReview.receipt.id !== candidate.reviewId)
    return unavailable('review_missing');
  const { receipt, currentReviewer, active } = authority.resolvedReview;
  if (!active) return unavailable('review_revoked');
  const currentSnapshot = currentReviewer.snapshot;
  const receiptSnapshot = receipt.reviewer.authoritySnapshot;
  if (!currentReviewer.active || !currentReviewer.canReviewThisCourseStudentObjective ||
    currentSnapshot.institutionId !== candidate.scope.institutionId ||
    currentSnapshot.reviewerUserId !== receipt.reviewer.institutionUserId ||
    currentSnapshot.qualificationId !== receiptSnapshot.qualificationId ||
    currentSnapshot.qualificationVersion !== receiptSnapshot.qualificationVersion ||
    currentSnapshot.evidenceHash !== receiptSnapshot.evidenceHash ||
    currentSnapshot.subjectKey !== receiptSnapshot.subjectKey)
    return unavailable('reviewer_authority_denied');
  if (receipt.exerciseId !== candidate.exerciseId || !sameScope(receipt.scope, candidate.scope) ||
    !sameWork(receipt.work, candidate.work.current) || !sameRef(receipt.objective, candidate.objective) ||
    !sameWork(receipt.previousWork, candidate.work.previous) ||
    !sameRef(receipt.pack, candidate.pack) || !sameRef(receipt.rubric, candidate.rubric) ||
    receipt.sourceVersion !== candidate.sourceVersion || receipt.policyVersion !== candidate.policyVersion ||
    receipt.feedbackId !== candidate.feedbackId)
    return unavailable('review_binding_mismatch');
  const { reviewId: _requestedReview, ...candidateContent } = candidate;
  const { reviewId: _recordedReview, ...reviewedContent } = receipt.reviewedCandidate;
  // Both inputs have passed the same strict schema, which normalizes property order.
  // The review pointer is assigned after the educator decision; all content is immutable.
  if (JSON.stringify(candidateContent) !== JSON.stringify(reviewedContent))
    return unavailable('review_binding_mismatch');
  return result({ status: receipt.decision === 'approved' ? 'valid_approval' : 'rejected', reviewId: receipt.id });
}
