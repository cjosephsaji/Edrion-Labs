import { z } from 'zod';
import {
  assessmentAdmission,
  petrosAssessmentSchema,
  type PetrosAssessment,
} from './petros-assessment';

/** Isolated Phase 2 evidence candidate. Existing S8 admission remains authoritative. */
export const PETROS_OBJECTIVE_EVIDENCE_VERSION = 'petros.objective-evidence.v1' as const;
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const ref = z.object({ id: z.string().uuid(), version: z.number().int().positive().max(100_000) }).strict();
const token = z.string().trim().min(1).max(180);

/** Server-stored on an authored question; null on every legacy/unbound question. */
export const petrosLearningTaskBindingSchema = z.object({
  schemaVersion: z.literal('petros.learning-task-binding.v1'),
  pack: ref,
  task: z.object({ id: token, variant: token }).strict(),
  objective: ref,
  sourceVersion: hash,
  rubric: z.object({ id: token, version: token }).strict(),
}).strict();
export type PetrosLearningTaskBinding = z.infer<typeof petrosLearningTaskBindingSchema>;

export const petrosObjectiveEvidenceSchema = z.object({
  schemaVersion: z.literal(PETROS_OBJECTIVE_EVIDENCE_VERSION),
  eventId: z.string().uuid(),
  occurredAt: z.string().datetime(),
  owner: z.object({ institutionId: z.string().uuid(), studentId: z.string().uuid() }).strict(),
  sessionId: z.string().uuid(),
  commandId: z.string().uuid(),
  objective: ref,
  subjectKey: token,
  conceptIds: z.array(token).min(1).max(32),
  task: z.object({ id: token, variant: token, unseenContext: z.boolean() }).strict(),
  rubric: z.object({ id: token, version: token }).strict(),
  pack: ref,
  sourceVersion: hash,
  policyVersion: token,
  assignment: z.union([
    z.object({ id: z.string().uuid(), releaseVersion: z.number().int().positive() }).strict(),
    z.object({ id: z.string().uuid(), assignmentVersion: z.number().int().nonnegative(), releaseId: z.string().uuid() }).strict(),
  ]).nullable(),
  assignmentRestrictions: z.array(z.object({ id:z.string().uuid(), version:z.number().int().nonnegative() }).strict()).max(100).default([]),
  response: z.object({
    modality: z.enum(['written', 'oral', 'interactive']),
    /** Owner-computed identity of the immutable observation/evaluation pair. */
    identityHash: hash,
    contentHash: hash,
    workId: token.nullable(),
    revisionId: token.nullable(),
  }).strict().superRefine((response, ctx) => {
    if ((response.workId === null) !== (response.revisionId === null))
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'PETROS_EVIDENCE_INCOMPLETE_WORK_LINEAGE' });
  }),
  assessment: petrosAssessmentSchema,
}).strict().superRefine((evidence, ctx) => {
  const fail = (message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, message });
  if (evidence.assessment.conditions.policyVersion !== evidence.policyVersion)
    fail('PETROS_EVIDENCE_POLICY_VERSION_MISMATCH');
  const criteria = evidence.assessment.result.kind === 'criterion_profile'
    ? evidence.assessment.result
    : evidence.assessment.result.kind === 'mixed'
      ? evidence.assessment.result.criteria
      : null;
  if (criteria && (criteria.rubric.id !== evidence.rubric.id ||
    criteria.rubric.version !== evidence.rubric.version))
    fail('PETROS_EVIDENCE_RUBRIC_VERSION_MISMATCH');
  if (criteria) {
    const spans = criteria.criteria.flatMap((criterion) =>
      criterion.observation.status === 'observed' ? criterion.observation.workSpans : []);
    if (spans.some((span) => evidence.response.workId === null ||
      span.workId !== evidence.response.workId ||
      span.revisionId !== evidence.response.revisionId ||
      span.contentHash !== evidence.response.contentHash))
      fail('PETROS_EVIDENCE_WORK_LINEAGE_MISMATCH');
  }
});
export type PetrosObjectiveEvidence = z.infer<typeof petrosObjectiveEvidenceSchema>;

/**
 * Public append command. It contains references only: the evidence owner reloads the answer,
 * assessment, source, policy, pack and rubric. Scores, assistance claims and hashes are never
 * accepted from the browser.
 */
export const petrosObjectiveEvidenceAppendCommandSchema = z.object({
  schemaVersion: z.literal(PETROS_OBJECTIVE_EVIDENCE_VERSION),
  commandId: z.string().uuid(),
  evaluationId: z.string().uuid(),
  pack: ref,
  task: z.object({ id: token, variant: token }).strict(),
  correction: z.object({
    correctsEventId: z.string().uuid(),
    reason: z.string().trim().min(8).max(600),
    declaration: z.literal('external_assistance_received'),
  }).strict().nullable().default(null),
}).strict();
export type PetrosObjectiveEvidenceAppendCommand = z.infer<typeof petrosObjectiveEvidenceAppendCommandSchema>;

export const petrosObjectiveEvidenceReceiptSchema = z.object({
  schemaVersion: z.literal(PETROS_OBJECTIVE_EVIDENCE_VERSION),
  commandId: z.string().uuid(),
  requestHash: hash,
  event: petrosObjectiveEvidenceSchema,
  classification: z.lazy(() => petrosObjectiveEvidenceClassificationSchema),
  correction: z.object({ correctsEventId: z.string().uuid(), reason: z.string().min(1).max(600),
    declaration:z.literal('external_assistance_received') })
    .strict().nullable(),
  replayed: z.boolean(),
}).strict();
export type PetrosObjectiveEvidenceReceipt = z.infer<typeof petrosObjectiveEvidenceReceiptSchema>;

/** A deliberately narrow, rebuildable view. It cannot replace the existing S8 model. */
export const petrosObjectiveEvidenceProjectionSchema = z.object({
  schemaVersion: z.literal(PETROS_OBJECTIVE_EVIDENCE_VERSION),
  algorithmVersion: z.literal('petros.objective-evidence-projection.v1'),
  institutionId: z.string().uuid(),
  studentId: z.string().uuid(),
  objective: ref,
  activeEventCount: z.number().int().nonnegative(),
  eligibleEventCount: z.number().int().nonnegative(),
  latestEventId: z.string().uuid().nullable(),
  eventSetHash: hash,
}).strict();
export type PetrosObjectiveEvidenceProjection = z.infer<typeof petrosObjectiveEvidenceProjectionSchema>;

export const petrosObjectiveEvidenceClassificationSchema = z.object({
  schemaVersion: z.literal(PETROS_OBJECTIVE_EVIDENCE_VERSION),
  eventId: z.string().uuid(),
  observation: z.enum([
    'petros_unassisted', 'assisted', 'uncertain', 'repeated', 'no_evidence', 'qualitative_review_required',
  ]),
  appendable: z.boolean(),
  appendDenial: z.string().max(120).nullable(),
  projectionEligible: z.boolean(),
  projectionDenial: z.string().max(120).nullable(),
  externalAssistance: z.enum(['declared', 'not_declared', 'unknown']),
  petrosAssistance: z.enum(['none_observed', 'hinted', 'solution_exposed', 'unknown']),
  review: z.enum(['not_required', 'required']),
}).strict();
export type PetrosObjectiveEvidenceClassification = z.infer<typeof petrosObjectiveEvidenceClassificationSchema>;

function observed<T>(claims: Array<{ basis: string; value: T }>) {
  return claims.filter((claim) => claim.basis !== 'required');
}
function independentlyObserved<T>(claims: Array<{ basis: string; value: T }>) {
  return claims.filter((claim) =>
    claim.basis === 'system_observed' || claim.basis === 'independently_verified');
}

/**
 * Classifies observation semantics without writing evidence or bypassing S8.
 * "Petros unassisted" means trusted conditions observed no Petros assistance on a
 * first attempt. It never proves absence of external help or student identity.
 */
export function classifyPetrosObjectiveEvidence(raw: unknown): PetrosObjectiveEvidenceClassification {
  const evidence = petrosObjectiveEvidenceSchema.parse(raw);
  const assessment: PetrosAssessment = evidence.assessment;
  const result = assessment.result;
  const conditions = assessment.conditions;
  const externalClaims = observed(conditions.externalAssistance);
  const externalAssistance = externalClaims.some((claim) => claim.value === 'declared')
    ? 'declared' as const
    : externalClaims.some((claim) => claim.value === 'not_declared')
      ? 'not_declared' as const
      : 'unknown' as const;
  const assistance = observed(conditions.petrosAssistance).some(
    (claim) => claim.value.hintCount > 0 || claim.value.suppliedAnswer,
  ) || observed(conditions.answerExposure).some((claim) => claim.value === 'exposed') ||
    externalAssistance === 'declared';
  const solutionExposed = observed(conditions.petrosAssistance).some((claim) => claim.value.suppliedAnswer) ||
    observed(conditions.answerExposure).some((claim) => claim.value === 'exposed');
  const hinted = observed(conditions.petrosAssistance).some((claim) => claim.value.hintCount > 0);
  const noPetrosAssistance = independentlyObserved(conditions.petrosAssistance).some(
    (claim) => claim.value.hintCount === 0 && !claim.value.suppliedAnswer,
  );
  const petrosAssistance = solutionExposed ? 'solution_exposed' as const
    : hinted ? 'hinted' as const : noPetrosAssistance ? 'none_observed' as const : 'unknown' as const;
  const repeated = observed(conditions.attempt).some((claim) => claim.value === 'repeat_equivalent');
  const firstObserved = independentlyObserved(conditions.attempt)
    .some((claim) => claim.value === 'first_observed');
  const petrosUnassistedObserved = independentlyObserved(conditions.petrosAssistance).some(
    (claim) => claim.value.hintCount === 0 && !claim.value.suppliedAnswer,
  );
  const provenances = result.kind === 'objective'
    ? [result.provenance]
    : result.kind === 'criterion_profile'
      ? [result.provenance]
      : [result.objective.provenance, result.criteria.provenance];
  // Any qualitative/mixed candidate still needs the separate explicit educator receipt.
  const review = result.kind !== 'objective' || provenances.some((item) => item.review === 'required')
    ? 'required' as const : 'not_required' as const;
  const noEvidence = result.kind === 'objective' && result.judgment.status === 'not_evaluated';
  const qualitative = result.kind !== 'objective';
  const uncertain = provenances.some((item) =>
    item.uncertainty === 'high' || item.uncertainty === 'unknown');
  const admission = assessmentAdmission(assessment);
  const projectionEligible = admission === null && !qualitative && !uncertain &&
    firstObserved && petrosUnassistedObserved;
  const observation = qualitative
    ? 'qualitative_review_required' as const
    : noEvidence
      ? 'no_evidence' as const
      : repeated
        ? 'repeated' as const
        : assistance
          ? 'assisted' as const
          : uncertain || !firstObserved || !petrosUnassistedObserved
            ? 'uncertain' as const
            : 'petros_unassisted' as const;
  const appendable = result.kind === 'objective' && review === 'not_required';
  return petrosObjectiveEvidenceClassificationSchema.parse({
    schemaVersion: PETROS_OBJECTIVE_EVIDENCE_VERSION,
    eventId: evidence.eventId,
    observation,
    // Appendability is still only a candidate classification; an authorized owner must
    // commit it atomically. Qualitative/review-required work stays closed until review.
    appendable,
    appendDenial: appendable ? null : result.kind !== 'objective'
      ? 'qualitative_review_required' : 'assessment_review_required',
    projectionEligible,
    projectionDenial: projectionEligible ? null : admission ??
      (uncertain ? 'evaluator_uncertain' : !firstObserved || !petrosUnassistedObserved
        ? 'independence_not_observed' : qualitative ? 'qualitative_review_required' : 'not_projection_eligible'),
    externalAssistance,
    petrosAssistance,
    review,
  });
}
