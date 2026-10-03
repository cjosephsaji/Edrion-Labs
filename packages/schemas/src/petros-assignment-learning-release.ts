import { z } from 'zod';
import { petrosConceptPackCandidateSchema } from './petros-concept-pack';
import { petrosConceptPackReviewReceiptSchema } from './petros-concept-pack-review';
import { petrosDocumentLocatorSchema } from './petros-document-source';
import { petrosKnowledgePolicySchema } from './petros-knowledge-policy';

export const PETROS_ASSIGNMENT_LEARNING_RELEASE_VERSION =
  'petros.assignment-learning-release.v1' as const;

const hash = z.string().regex(/^[a-f0-9]{64}$/);
const version = z.number().int().positive().max(100_000);
const ref = z.object({ id: z.string().uuid(), version }).strict();
const source = z.object({
  sessionId: z.string().uuid(),
  sourceVersion: hash,
  locators: z.array(petrosDocumentLocatorSchema).min(1).max(32),
}).strict().superRefine((value, ctx) => {
  if (value.locators.some((locator) => locator.sourceVersion !== value.sourceVersion))
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'PETROS_ASSIGNMENT_MIXED_SOURCE_VERSION' });
  const keys = value.locators.map((locator) =>
    [locator.objectId, locator.unitId, locator.page, locator.start, locator.end].join(':'));
  if (new Set(keys).size !== keys.length)
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'PETROS_ASSIGNMENT_DUPLICATE_LOCATOR' });
});

const documentTarget = z.object({
  kind: z.literal('document'), courseId: z.string().uuid(), source, pack: ref,
}).strict();
const objectiveTarget = z.object({
  kind: z.literal('objective'), courseId: z.string().uuid(), source,
  objective: ref, curriculumRevision: version, pack: ref,
}).strict();
const journeyTarget = z.object({
  kind: z.literal('journey'), courseId: z.string().uuid(), source,
  objective: ref, curriculumRevision: version, pack: ref, journey: ref,
}).strict();

/** Document, objective and journey remain distinct target identities. */
export const petrosAssignmentLearningTargetSchema = z.discriminatedUnion('kind', [
  documentTarget, objectiveTarget, journeyTarget,
]);

export const petrosAssignmentLearningPolicySchema = z.object({
  assistance: z.enum(['hints_only', 'guided_learning']),
  resourceMode: z.enum(['source_bound', 'source_primary']),
  answerDisclosure: z.literal('never'),
  evidenceRequirement: z.enum(['participation', 'independent_application', 'unseen_transfer']),
}).strict();

/** Compatibility contract for the earlier isolated artifact binding; it grants no authority. */
export const petrosAssignmentLearningLegacyPolicySnapshotSchema = z.object({
  policyVersion: z.string().trim().min(1).max(180),
  assistance: z.enum(['ordinary_study', 'guided_homework']),
  finalAnswerAllowed: z.boolean(),
  resourceMode: z.enum(['source_bound', 'source_primary']),
  evidenceRequirement: z.enum(['participation', 'independent_application', 'unseen_transfer']),
  disclosure: z.enum([
    'assistance_visible_to_student',
    'assistance_visible_to_student_and_educator',
  ]),
}).strict();

export const petrosAssignmentLearningPreviewCommandSchema = z.object({
  schemaVersion: z.literal(PETROS_ASSIGNMENT_LEARNING_RELEASE_VERSION),
  expectedAssignmentVersion: z.number().int().nonnegative().max(100_000),
  target: petrosAssignmentLearningTargetSchema,
  policy: petrosAssignmentLearningPolicySchema,
  /** Must exactly equal the materialized audience. Current bounded rollout permits one owner. */
  recipientContexts: z.array(z.object({
    studentId: z.string().uuid(), sessionId: z.string().uuid(),
  }).strict()).min(1).max(500),
}).strict().superRefine((command, ctx) => {
  const ids = command.recipientContexts.map((recipient) => recipient.studentId);
  if (new Set(ids).size !== ids.length)
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'PETROS_ASSIGNMENT_DUPLICATE_RECIPIENT' });
  if (command.recipientContexts.some((recipient) => recipient.sessionId !== command.target.source.sessionId))
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'PETROS_ASSIGNMENT_SESSION_MISMATCH' });
});
export type PetrosAssignmentLearningPreviewCommand =
  z.infer<typeof petrosAssignmentLearningPreviewCommandSchema>;

const recipientSnapshot = z.object({
  studentId: z.string().uuid(), sessionId: z.string().uuid(),
  studentStatus: z.literal('enrolled'), courseEnrollmentId: z.string().uuid(),
}).strict();

/** Immutable server-resolved candidate. It is safe to commit only after a fresh equal read. */
export const petrosAssignmentLearningReleaseCandidateSchema = z.object({
  schemaVersion: z.literal(PETROS_ASSIGNMENT_LEARNING_RELEASE_VERSION),
  assignment: z.object({
    id: z.string().uuid(), version: z.number().int().nonnegative().max(100_000),
    status: z.literal('published'), institutionId: z.string().uuid(),
    campusId: z.string().uuid().nullable(), classId: z.string().uuid(),
    courseId: z.string().uuid(), aiPolicy: z.enum(['hints_only', 'full']),
  }).strict(),
  target: petrosAssignmentLearningTargetSchema,
  audienceSnapshot: z.object({ recipients: z.array(recipientSnapshot).min(1).max(500), hash }).strict(),
  assistanceSnapshot: z.object({
    mode: z.enum(['hints_only', 'guided_learning']),
    assignmentAiPolicy: z.enum(['hints_only', 'full']), finalAnswerAllowed: z.literal(false),
    accommodationsResolved: z.literal(false),
  }).strict(),
  resourceSnapshot: z.object({
    mode: z.enum(['source_bound', 'source_primary']), sourceVersion: hash,
    locators: z.array(petrosDocumentLocatorSchema).min(1).max(32),
  }).strict(),
  evidenceSnapshot: z.object({
    requirement: z.enum(['participation', 'independent_application', 'unseen_transfer']),
    answerDisclosure: z.literal('never'), externalAssistance: z.literal('unknown'),
  }).strict(),
  sourceSnapshot: z.object({
    sessionId: z.string().uuid(), sourceVersion: hash,
    locators: z.array(petrosDocumentLocatorSchema).min(1).max(32),
  }).strict(),
  objectiveSnapshot: z.object({ objective: ref, statement: z.string().trim().min(1).max(800) }).strict(),
  packSnapshot: z.object({
    candidateId: z.string().uuid(), payloadHash: hash,
    candidate: petrosConceptPackCandidateSchema,
    reviewReceipt: petrosConceptPackReviewReceiptSchema,
  }).strict(),
  curriculumSnapshot: z.object({
    courseId: z.string().uuid(), courseVersion: version, subjectKey: z.string().trim().min(1).max(180), revision: version,
  }).strict(),
  rubricSnapshot: petrosConceptPackCandidateSchema.innerType().shape.rubric,
  institutionalPolicySnapshot: petrosKnowledgePolicySchema,
  rolloutGates: z.object({
    singleRecipientOnly: z.literal(true), cohortPolicyApproved: z.literal(false),
    accommodationsPolicyApproved: z.literal(false), journeyAuthorityAvailable: z.literal(false),
    productionPilotApproved: z.literal(false),
  }).strict(),
  authorityHash: hash,
}).strict().superRefine((candidate, ctx) => {
  if (candidate.assignment.courseId !== candidate.target.courseId ||
    candidate.curriculumSnapshot.courseId !== candidate.target.courseId)
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'PETROS_ASSIGNMENT_COURSE_MISMATCH' });
  if (candidate.target.pack.id !== candidate.packSnapshot.candidate.pack.id ||
    candidate.target.pack.version !== candidate.packSnapshot.candidate.pack.version)
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'PETROS_ASSIGNMENT_PACK_MISMATCH' });
  if (candidate.sourceSnapshot.sourceVersion !== candidate.packSnapshot.candidate.sourceVersion)
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'PETROS_ASSIGNMENT_SOURCE_MISMATCH' });
});
export type PetrosAssignmentLearningReleaseCandidate =
  z.infer<typeof petrosAssignmentLearningReleaseCandidateSchema>;

/** Student-visible authority binding, without held-out tasks or reviewer credentials. */
export const petrosAssignmentLearningStudentBindingSchema = z.object({
  schemaVersion: z.literal(PETROS_ASSIGNMENT_LEARNING_RELEASE_VERSION),
  assignmentId: z.string().uuid(), assignmentVersion: z.number().int().nonnegative(),
  courseId: z.string().uuid(), courseVersion: version,
  target: petrosAssignmentLearningTargetSchema,
  policy: petrosAssignmentLearningPolicySchema,
  institutionalPolicySnapshot: petrosKnowledgePolicySchema,
  authorityHash: hash,
}).strict();
export type PetrosAssignmentLearningStudentBinding = z.infer<typeof petrosAssignmentLearningStudentBindingSchema>;

export const petrosAssignmentLearningCommitCommandSchema = z.object({
  schemaVersion: z.literal(PETROS_ASSIGNMENT_LEARNING_RELEASE_VERSION),
  commandId: z.string().uuid(), candidate: petrosAssignmentLearningReleaseCandidateSchema,
}).strict();
export type PetrosAssignmentLearningCommitCommand =
  z.infer<typeof petrosAssignmentLearningCommitCommandSchema>;

export const petrosAssignmentLearningReceiptSchema = z.object({
  schemaVersion: z.literal(PETROS_ASSIGNMENT_LEARNING_RELEASE_VERSION),
  commandId: z.string().uuid(), releaseId: z.string().uuid(), targetId: z.string().uuid(),
  assignmentId: z.string().uuid(), assignmentVersion: z.number().int().nonnegative(),
  audienceHash: hash, authorityHash: hash, state: z.literal('released'),
  replayed: z.boolean(), committedAt: z.string().datetime(),
}).strict();
export type PetrosAssignmentLearningReceipt = z.infer<typeof petrosAssignmentLearningReceiptSchema>;
