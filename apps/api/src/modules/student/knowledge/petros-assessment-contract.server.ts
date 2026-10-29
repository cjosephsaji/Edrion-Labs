import { z } from 'zod';
import { publicStudentTaskSchema, teachingReferenceSchema } from '@edrion/schemas';
/** Deliberately outside @edrion/schemas and all browser/package export barrels. */
export const privateAssessmentContractSchema = z.object({ schemaVersion: z.literal('petros.v2.private-assessment.v1'),
  id: z.string().uuid(), task: publicStudentTaskSchema, reviewId: z.string().uuid(),
  answer: z.string().min(1).max(16000), referenceAnswers: z.array(z.string().max(16000)).max(16),
  rubric: z.array(z.object({ criterionId: z.string().max(120), privateRule: z.string().max(4000) }).strict()).max(32),
  discriminators: z.array(z.string().max(4000)).max(16), privateEvaluationPrompt: z.string().max(16000),
}).strict().refine(c => c.id === c.task.assessmentRef, 'Private instrument must match the issued opaque task reference');
export function publicTaskFromPrivate(input: unknown) {
  return publicStudentTaskSchema.parse(privateAssessmentContractSchema.parse(input).task);
}

/** M3 preparation only: no issued task, session, evaluator invocation or grade. API-only. */
export const M3_PRIVATE_CANDIDATE_VERSION = 'petros.v2.private-verification-candidate.v1';
const privateFields = privateAssessmentContractSchema.innerType().shape;
export const m3PrivateDraftCommandSchema = z.object({
  commandId:z.string().uuid(), expectedVersion:z.number().int().positive(),
  expectedFamilyVersion:z.number().int().min(0),
  questionText:z.string().trim().min(1).max(2000).optional(),
  referenceText:privateFields.answer.optional(),
  alternativeTexts:privateFields.referenceAnswers.optional(),
  criteriaTexts:z.array(z.string().trim().min(1).max(4000)).min(1).max(16).optional(),
  evaluationInstruction:privateFields.privateEvaluationPrompt.optional(),
}).strict();
export const m3PrivateVerificationCandidateSchema = z.object({
  schemaVersion:z.literal(M3_PRIVATE_CANDIDATE_VERSION), id:z.string().uuid(),version:z.number().int().positive(),
  institutionId:z.string().uuid(),courseId:z.string().uuid(),subjectId:z.string().uuid(),
  proposalId:z.string().uuid(),proposalVersion:z.number().int().positive(),proposalHash:z.string().regex(/^[a-f0-9]{64}$/),
  objectiveId:z.string().uuid(),objectiveVersion:z.number().int().positive(),criterionId:z.string().uuid(),
  kind:z.enum(['discriminator','transfer','held_out_verification']),assistance:z.literal('unassisted'),
  sourceRevisionId:z.string().uuid(),sourceHash:z.string().regex(/^[a-f0-9]{64}$/),
  support:z.array(z.object({reference:teachingReferenceSchema,quote:z.string().min(1).max(2000)}).strict()).min(1).max(4),
  question:z.string().min(1).max(2000),answer:privateFields.answer,referenceAnswers:privateFields.referenceAnswers,
  rubric:privateFields.rubric.min(1),discriminators:privateFields.discriminators,
  privateEvaluationPrompt:privateFields.privateEvaluationPrompt,
  origin:z.enum(['engineering_private_outline','qualified_teacher_edit','controlled_private_fixture']),
  status:z.literal('qualified_review_required'),
  exposure:z.object({sourceWasPublished:z.literal(true),questionWasPublished:z.literal(false),
    privateCriteriaWerePublished:z.literal(false),nonEquivalence:z.literal('independent_review_required')}).strict(),
  correction:z.object({previousVersion:z.number().int().positive().nullable(),editorId:z.string().uuid(),
    commandId:z.string().uuid(),requestHash:z.string().regex(/^[a-f0-9]{64}$/),at:z.string().datetime()}).strict(),
  createdBy:z.string().uuid(),createdAt:z.string().datetime(),
}).strict();
export type M3PrivateVerificationCandidate = z.infer<typeof m3PrivateVerificationCandidateSchema>;
