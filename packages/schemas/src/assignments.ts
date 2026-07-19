import { z } from 'zod';
import { paginationQuerySchema, sortQuerySchema, versionSchema, academicScopeQuerySchema } from './common';
import { createQuestionSchema, updateQuestionSchema } from './questions';
import { previewRecipientsSchema, targetsSchema } from './recipients';

/**
 * Institution-Portal ASSIGNMENTS (Phase 6) request/response contracts: assignments + the per-student
 * submissions within them. Tenancy + the active campus scope are derived by the API, never the body.
 */

const optionalUuid = z.string().uuid().nullish();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD').nullish();
const shortText = (max = 120) => z.string().trim().max(max).nullish();

export const ASSIGNMENT_STATUSES = ['draft', 'published', 'closed'] as const;
export const assignmentStatusSchema = z.enum(ASSIGNMENT_STATUSES);
export type AssignmentStatus = (typeof ASSIGNMENT_STATUSES)[number];

export const DELIVERY_MODES = ['file', 'quiz'] as const;
export const deliveryModeSchema = z.enum(DELIVERY_MODES);
export type DeliveryMode = (typeof DELIVERY_MODES)[number];

export const SUBMISSION_STATUSES = ['assigned', 'submitted', 'late', 'graded', 'missing'] as const;
export const submissionStatusSchema = z.enum(SUBMISSION_STATUSES);
export type SubmissionStatus = (typeof SUBMISSION_STATUSES)[number];

const withVersion = { version: versionSchema };

// --- assignments -------------------------------------------------------------

export const assignmentsListQuerySchema = paginationQuerySchema
  .merge(sortQuerySchema)
  .merge(academicScopeQuerySchema)
  .extend({
  search: z.string().trim().max(160).optional(),
  classId: z.string().uuid().optional(),
  status: assignmentStatusSchema.optional(),
});
export type AssignmentsListQuery = z.infer<typeof assignmentsListQuerySchema>;

/** Nested question on create/reconcile — optional client id for draft ↔ server mapping. */
const nestedAssignmentQuestionSchema = createQuestionSchema.extend({
  id: z.string().uuid().optional(),
  clientKey: z.string().trim().max(64).optional(),
  version: versionSchema.optional(),
});

export const createAssignmentSchema = z.object({
  title: z.string().trim().min(1, 'Required').max(160),
  classId: z.string().uuid(),
  subjectId: optionalUuid,
  teacherId: optionalUuid,
  instructions: shortText(2000),
  dueDate: isoDate,
  maxPoints: z.coerce.number().int().min(1).max(1000).default(100),
  status: assignmentStatusSchema.default('draft'),
  audience: targetsSchema.default([]),
  durationMin: z.coerce.number().int().min(1).max(480).nullish(),
  deliveryMode: deliveryModeSchema.default('file'),
  /** Optional nested questions for atomic create (quiz delivery). */
  questions: z.array(nestedAssignmentQuestionSchema).max(200).optional(),
});
export type CreateAssignmentInput = z.infer<typeof createAssignmentSchema>;

export const updateAssignmentSchema = z.object({
  title: z.string().trim().min(1).max(160).optional(),
  classId: z.string().uuid().optional(),
  subjectId: optionalUuid,
  teacherId: optionalUuid,
  instructions: shortText(2000),
  dueDate: isoDate,
  maxPoints: z.coerce.number().int().min(1).max(1000).optional(),
  status: assignmentStatusSchema.optional(),
  audience: targetsSchema.optional(),
  durationMin: z.coerce.number().int().min(1).max(480).nullish(),
  deliveryMode: deliveryModeSchema.optional(),
  ...withVersion,
});
export type UpdateAssignmentInput = z.infer<typeof updateAssignmentSchema>;

// --- submissions (per student) -----------------------------------------------

/** One student's submission within an assignment. */
export const submissionGradeSchema = z.object({
  studentId: z.string().uuid(),
  status: submissionStatusSchema.default('submitted'),
  submittedDate: isoDate,
  pointsAwarded: z.coerce.number().int().min(0).max(1000).nullish(),
  feedback: shortText(1000),
});
export type SubmissionGradeInput = z.infer<typeof submissionGradeSchema>;

/** Bulk upsert submissions for an assignment (upserts on (assignment, student)). */
export const gradeSubmissionsSchema = z.object({
  submissions: z.array(submissionGradeSchema).min(1, 'Add at least one student').max(500),
});
export type GradeSubmissionsInput = z.infer<typeof gradeSubmissionsSchema>;

// --- assignment questions ----------------------------------------------------

export const assignmentQuestionSchema = createQuestionSchema;
export type AssignmentQuestionInput = z.infer<typeof assignmentQuestionSchema>;
export const updateAssignmentQuestionSchema = updateQuestionSchema;
export type UpdateAssignmentQuestionInput = z.infer<typeof updateAssignmentQuestionSchema>;

export const assignmentAudiencePreviewSchema = previewRecipientsSchema;
export type AssignmentAudiencePreviewInput = z.infer<typeof assignmentAudiencePreviewSchema>;

/** Atomic reconcile payload for the single-page builder (PUT /portal/assignments/:id/full). */
export const reconcileAssignmentSchema = z.object({
  version: versionSchema,
  title: z.string().trim().min(1).max(160).optional(),
  classId: z.string().uuid().optional(),
  subjectId: optionalUuid,
  teacherId: optionalUuid,
  instructions: shortText(2000),
  dueDate: isoDate,
  maxPoints: z.coerce.number().int().min(1).max(1000).optional(),
  status: assignmentStatusSchema.optional(),
  audience: targetsSchema.optional(),
  durationMin: z.coerce.number().int().min(1).max(480).nullish(),
  deliveryMode: deliveryModeSchema.optional(),
  questions: z.array(nestedAssignmentQuestionSchema).max(200).default([]),
});
export type ReconcileAssignmentInput = z.infer<typeof reconcileAssignmentSchema>;
