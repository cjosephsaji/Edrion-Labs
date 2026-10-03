import { z } from 'zod';
import {
  petrosConceptPackCandidateSchema,
  petrosConceptPackTrustedContextSchema,
  validatePetrosConceptPackCandidate,
} from './petros-concept-pack';

/** Isolated review-owner contract. Parsing never creates an educator decision. */
export const PETROS_CONCEPT_PACK_REVIEW_VERSION = 'petros.concept-pack-review.v1' as const;
const version = z.number().int().positive().max(100_000);
const token = z.string().trim().min(1).max(180);
const ref = z.object({ id: z.string().uuid(), version }).strict();
const qualification = z.object({
  id: z.string().uuid(),
  version,
  subject: token,
}).strict();
const hash = z.string().regex(/^[a-f0-9]{64}$/);

export const PETROS_REVIEWER_AUTHORITY_VERSION = 'petros.reviewer-authority.v1' as const;
/**
 * Server-loaded qualification evidence. A portal role or permission is never sufficient to
 * construct this snapshot, and clients cannot supply it to a review receipt.
 */
export const petrosReviewerAuthoritySnapshotSchema = z.object({
  schemaVersion: z.literal(PETROS_REVIEWER_AUTHORITY_VERSION),
  qualificationId: z.string().uuid(),
  qualificationVersion: version,
  institutionId: z.string().uuid(),
  reviewerUserId: z.string().uuid(),
  reviewerStaffId: z.string().uuid(),
  subjectKey: token,
  status: z.literal('active'),
  validFrom: z.string().datetime(),
  validUntil: z.string().datetime(),
  evidenceKind: z.enum(['credential', 'institution_record', 'external_verification']),
  evidenceHash: hash,
  observedAt: z.string().datetime(),
}).strict();
export type PetrosReviewerAuthoritySnapshot = z.infer<typeof petrosReviewerAuthoritySnapshotSchema>;

export const PETROS_TEACHING_PACK_COMPILE_VERSION = 'petros.teaching-pack-compile.v1' as const;
export const petrosTeachingPackCompileCommandSchema = z.object({
  schemaVersion: z.literal(PETROS_TEACHING_PACK_COMPILE_VERSION),
  commandId: z.string().uuid(),
  courseId: z.string().uuid(),
  sourceItemId: z.string().uuid(),
  candidate: petrosConceptPackCandidateSchema,
}).strict();
export type PetrosTeachingPackCompileCommand = z.infer<typeof petrosTeachingPackCompileCommandSchema>;

export const PETROS_TEACHING_PACK_REVIEW_COMMAND_VERSION = 'petros.teaching-pack-review-command.v1' as const;
export const petrosTeachingPackReviewCommandSchema = z.object({
  schemaVersion: z.literal(PETROS_TEACHING_PACK_REVIEW_COMMAND_VERSION),
  commandId: z.string().uuid(),
  expectedPayloadHash: hash,
  decision: z.enum(['approved', 'rejected']),
  qualificationId: z.string().uuid(),
  expectedQualificationVersion: version,
  coverage: z.object({
    sourceFidelity: z.literal('reviewed'),
    scientificCorrectness: z.literal('reviewed'),
    prerequisitesAndMisconceptions: z.literal('reviewed'),
    examplesAndExplanations: z.literal('reviewed'),
    rubricAndUnseenTransfer: z.literal('reviewed'),
  }).strict(),
  rationale: z.string().trim().min(1).max(4_000),
}).strict();
export type PetrosTeachingPackReviewCommand = z.infer<typeof petrosTeachingPackReviewCommandSchema>;

export const petrosTeachingPackReviewRevocationSchema = z.object({
  schemaVersion: z.literal('petros.teaching-pack-review-revocation.v1'),
  commandId: z.string().uuid(),
  expectedReviewVersion: version,
  reason: z.string().trim().min(1).max(2_000),
}).strict();
export type PetrosTeachingPackReviewRevocation = z.infer<typeof petrosTeachingPackReviewRevocationSchema>;

/**
 * Immutable receipt shape loaded from a future authorized review owner. Store the full
 * validated candidate, including compiler/version, source/curriculum/objective and all
 * lesson/rubric/task content. Version IDs alone cannot hide a same-version content edit.
 * The candidate's own validation remains candidate-only with no fabricated approval ID.
 */
export const petrosConceptPackReviewReceiptSchema = z.object({
  schemaVersion: z.literal(PETROS_CONCEPT_PACK_REVIEW_VERSION),
  receiptId: z.string().uuid(),
  reviewVersion: version,
  institutionId: z.string().uuid(),
  courseId: z.string().uuid(),
  candidateId: z.string().uuid(),
  payloadHash: hash,
  reviewedAt: z.string().datetime(),
  decision: z.enum(['approved', 'rejected']),
  reviewer: z.object({
    educatorId: z.string().uuid(),
    authorityVersion: version,
    qualification,
    authoritySnapshot: petrosReviewerAuthoritySnapshotSchema,
  }).strict(),
  reviewedCandidate: petrosConceptPackCandidateSchema,
  coverage: z.object({
    sourceFidelity: z.literal('reviewed'),
    scientificCorrectness: z.literal('reviewed'),
    prerequisitesAndMisconceptions: z.literal('reviewed'),
    examplesAndExplanations: z.literal('reviewed'),
    rubricAndUnseenTransfer: z.literal('reviewed'),
  }).strict(),
  rationale: z.string().trim().min(1).max(4_000),
}).strict().superRefine((receipt, ctx) => {
  if (receipt.decision === 'approved' && receipt.reviewedCandidate.validation.unresolvedIssues.length > 0)
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'PETROS_PACK_REVIEW_UNRESOLVED_ISSUES' });
  const snapshot = receipt.reviewer.authoritySnapshot;
  if (snapshot.institutionId !== receipt.institutionId ||
    snapshot.reviewerUserId !== receipt.reviewer.educatorId ||
    snapshot.qualificationId !== receipt.reviewer.qualification.id ||
    snapshot.qualificationVersion !== receipt.reviewer.qualification.version ||
    snapshot.subjectKey !== receipt.reviewer.qualification.subject ||
    snapshot.qualificationVersion !== receipt.reviewer.authorityVersion)
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'PETROS_PACK_REVIEW_AUTHORITY_SNAPSHOT_MISMATCH' });
});
export type PetrosConceptPackReviewReceipt = z.infer<typeof petrosConceptPackReviewReceiptSchema>;

/**
 * Trusted owner reads only. Client/model input is not an authority snapshot. The latest
 * receipt pointer and mutable revocation state live outside immutable receipt content.
 * Missing or pending review must be represented explicitly rather than synthesized.
 */
export const petrosConceptPackReviewAuthoritySchema = z.object({
  institutionId: z.string().uuid(),
  observedAt: z.string().datetime(),
  currentPack: ref,
  currentCompilerVersion: token,
  packContext: petrosConceptPackTrustedContextSchema,
  access: z.object({ source: z.boolean(), curriculum: z.boolean(), pack: z.boolean(), review: z.boolean() }).strict(),
  currentReview: z.object({
    status: z.enum(['missing', 'pending', 'approved', 'rejected', 'revoked']),
    latestReceipt: z.object({ id: z.string().uuid(), version }).strict().nullable(),
    receipt: petrosConceptPackReviewReceiptSchema.nullable(),
    revokedAt: z.string().datetime().nullable(),
  }).strict(),
  currentReviewer: z.object({
    snapshot: petrosReviewerAuthoritySnapshotSchema,
    membership: z.enum(['active', 'inactive', 'revoked']),
    mayReviewPack: z.boolean(),
  }).strict().nullable(),
}).strict();

/** Canonical comparison of parsed typed payloads; arrays preserve their exact order. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function freezeDeep<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const nested of Object.values(value)) freezeDeep(nested);
    Object.freeze(value);
  }
  return value;
}

/**
 * Resolves only an existing, current, explicit qualified-educator approval. Pure function:
 * no approval creation, persistence, I/O, numeric evidence admission or deployment grant.
 * A successful result is valid only for the owner snapshot's observation time. Every
 * consequential use needs a fresh read and the same checks inside its owner transaction.
 */
export function resolvePetrosConceptPackReviewApproval(candidateRaw: unknown, authorityRaw: unknown) {
  const authority = petrosConceptPackReviewAuthoritySchema.parse(authorityRaw);
  if (!authority.access.source || !authority.access.curriculum || !authority.access.pack || !authority.access.review)
    throw new Error('PETROS_PACK_REVIEW_ACCESS_DENIED');
  const candidate = validatePetrosConceptPackCandidate(candidateRaw, authority.packContext);
  if (candidate.pack.id !== authority.currentPack.id || candidate.pack.version !== authority.currentPack.version)
    throw new Error('PETROS_PACK_REVIEW_STALE_PACK');
  if (candidate.compilerVersion !== authority.currentCompilerVersion)
    throw new Error('PETROS_PACK_REVIEW_STALE_COMPILER');
  const review = authority.currentReview;
  if (review.status === 'missing') throw new Error('PETROS_PACK_REVIEW_MISSING');
  if (review.status === 'pending') throw new Error('PETROS_PACK_REVIEW_PENDING');
  if (review.status === 'revoked' || review.revokedAt !== null) throw new Error('PETROS_PACK_REVIEW_REVOKED');
  if (review.status === 'rejected') throw new Error('PETROS_PACK_REVIEW_REJECTED');
  const receipt = review.receipt;
  if (!receipt || !review.latestReceipt) throw new Error('PETROS_PACK_REVIEW_MISSING_RECEIPT');
  if (receipt.receiptId !== review.latestReceipt.id || receipt.reviewVersion !== review.latestReceipt.version)
    throw new Error('PETROS_PACK_REVIEW_STALE_RECEIPT');
  if (receipt.decision !== 'approved') throw new Error('PETROS_PACK_REVIEW_REJECTED');
  if (receipt.institutionId !== authority.institutionId) throw new Error('PETROS_PACK_REVIEW_FOREIGN_RECEIPT');
  if (canonical(receipt.reviewedCandidate) !== canonical(candidate))
    throw new Error('PETROS_PACK_REVIEW_CHANGED_PAYLOAD');
  const reviewer = authority.currentReviewer;
  const snapshot = reviewer?.snapshot;
  if (!reviewer || !snapshot || snapshot.reviewerUserId !== receipt.reviewer.educatorId ||
    snapshot.institutionId !== authority.institutionId || reviewer.membership !== 'active' ||
    !reviewer.mayReviewPack || snapshot.qualificationVersion !== receipt.reviewer.authorityVersion)
    throw new Error('PETROS_PACK_REVIEW_REVIEWER_AUTHORITY_DENIED');
  if (snapshot.qualificationId !== receipt.reviewer.qualification.id ||
    snapshot.qualificationVersion !== receipt.reviewer.qualification.version ||
    snapshot.subjectKey !== candidate.subject ||
    snapshot.evidenceHash !== receipt.reviewer.authoritySnapshot.evidenceHash ||
    snapshot.evidenceKind !== receipt.reviewer.authoritySnapshot.evidenceKind ||
    snapshot.reviewerStaffId !== receipt.reviewer.authoritySnapshot.reviewerStaffId)
    throw new Error('PETROS_PACK_REVIEW_QUALIFICATION_DENIED');
  const now = Date.parse(authority.observedAt);
  const reviewedAt = Date.parse(receipt.reviewedAt);
  const qualificationStart = Date.parse(snapshot.validFrom);
  const qualificationEnd = Date.parse(snapshot.validUntil);
  if (reviewedAt > now || qualificationStart > reviewedAt || qualificationEnd <= now || qualificationEnd <= qualificationStart)
    throw new Error('PETROS_PACK_REVIEW_QUALIFICATION_TIME_INVALID');
  return freezeDeep({
    schemaVersion: 'petros.concept-pack-review-resolution.v1' as const,
    status: 'approved_at_owner_snapshot' as const,
    observedAt: authority.observedAt,
    candidate,
    receipt,
    productionAdmission: false as const,
  });
}

export type PetrosConceptPackReviewResolution = ReturnType<typeof resolvePetrosConceptPackReviewApproval>;
