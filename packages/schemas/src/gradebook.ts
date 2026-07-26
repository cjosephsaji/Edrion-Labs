import { z } from 'zod';
import { paginationQuerySchema, sortQuerySchema, versionSchema, academicScopeQuerySchema } from './common';

/**
 * Institution-Portal GRADEBOOK (Phase 6) request/response contracts: a flat list of marks. Tenancy
 * + the active campus scope are derived by the API, never the body. Marks are whole numbers.
 */

const optionalUuid = z.string().uuid().nullish();
const shortText = (max = 120) => z.string().trim().max(max).nullish();
const marks = z.coerce.number().int().min(0).max(1000);

const withVersion = { version: versionSchema };

export const gradebookListQuerySchema = paginationQuerySchema
  .merge(sortQuerySchema)
  .merge(academicScopeQuerySchema)
  .extend({
  search: z.string().trim().max(160).optional(),
  studentId: z.string().uuid().optional(),
  subjectId: z.string().uuid().optional(),
  examId: z.string().uuid().optional(),
  classId: z.string().uuid().optional(),
});
export type GradebookListQuery = z.infer<typeof gradebookListQuerySchema>;

export const createGradeEntrySchema = z.object({
  studentId: z.string().uuid(),
  subjectId: z.string().uuid(),
  examId: optionalUuid,
  classId: optionalUuid,
  assessmentName: z.string().trim().min(1, 'Required').max(120),
  marksObtained: marks.default(0),
  maxMarks: z.coerce.number().int().min(1).max(1000).default(100),
  letterGrade: z.string().trim().max(8).nullish(),
  remarks: shortText(300),
});
export type CreateGradeEntryInput = z.infer<typeof createGradeEntrySchema>;

export const updateGradeEntrySchema = z.object({
  studentId: z.string().uuid().optional(),
  subjectId: z.string().uuid().optional(),
  examId: optionalUuid,
  classId: optionalUuid,
  assessmentName: z.string().trim().min(1).max(120).optional(),
  marksObtained: marks.optional(),
  maxMarks: z.coerce.number().int().min(1).max(1000).optional(),
  letterGrade: z.string().trim().max(8).nullish(),
  remarks: shortText(300),
  ...withVersion,
});
export type UpdateGradeEntryInput = z.infer<typeof updateGradeEntrySchema>;
