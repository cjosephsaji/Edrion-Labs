import { z } from 'zod';
import { paginationQuerySchema, sortQuerySchema, versionSchema } from './common';

/**
 * Institution-Portal EXAMS (Phase 6) request/response contracts: exam events + their scheduled
 * papers. Tenancy (institution_id) + the active campus scope (campus_id) are NEVER taken from the
 * body — the API derives them from the authenticated principal + scope header.
 */

const optionalUuid = z.string().uuid().nullish();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD').nullish();
const shortText = (max = 120) => z.string().trim().max(max).nullish();
/** "HH:MM" 24-hour. */
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM (24-hour)');

export const EXAM_TYPES = ['term', 'midterm', 'final', 'unit_test', 'quiz', 'practical', 'mock'] as const;
export const examTypeSchema = z.enum(EXAM_TYPES);
export type ExamType = (typeof EXAM_TYPES)[number];

export const EXAM_STATUSES = ['draft', 'scheduled', 'ongoing', 'completed', 'published', 'cancelled'] as const;
export const examStatusSchema = z.enum(EXAM_STATUSES);
export type ExamStatus = (typeof EXAM_STATUSES)[number];

const withVersion = { version: versionSchema };

// --- exams -------------------------------------------------------------------

export const examsListQuerySchema = paginationQuerySchema.merge(sortQuerySchema).extend({
  search: z.string().trim().max(160).optional(),
  status: examStatusSchema.optional(),
  examType: examTypeSchema.optional(),
  departmentId: z.string().uuid().optional(),
  programmeLevelId: z.string().uuid().optional(),
  termId: z.string().uuid().optional(),
  academicYearId: z.string().uuid().optional(),
});
export type ExamsListQuery = z.infer<typeof examsListQuerySchema>;

export const createExamSchema = z.object({
  name: z.string().trim().min(1, 'Required').max(120),
  examType: examTypeSchema.default('term'),
  academicYearId: optionalUuid,
  termId: optionalUuid,
  termLabel: shortText(60),
  startDate: isoDate,
  endDate: isoDate,
  status: examStatusSchema.default('draft'),
  description: shortText(500),
});
export type CreateExamInput = z.infer<typeof createExamSchema>;

export const updateExamSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  examType: examTypeSchema.optional(),
  academicYearId: optionalUuid,
  termId: optionalUuid,
  termLabel: shortText(60),
  startDate: isoDate,
  endDate: isoDate,
  status: examStatusSchema.optional(),
  description: shortText(500),
  ...withVersion,
});
export type UpdateExamInput = z.infer<typeof updateExamSchema>;

// --- exam schedules (papers within an exam) ----------------------------------

export const createExamScheduleSchema = z
  .object({
    classId: z.string().uuid(),
    subjectId: z.string().uuid(),
    examDate: isoDate,
    startTime: time.nullish(),
    endTime: time.nullish(),
    maxMarks: z.coerce.number().int().min(1).max(1000).default(100),
    passMarks: z.coerce.number().int().min(0).max(1000).nullish(),
    room: shortText(64),
  })
  .refine((v) => !v.startTime || !v.endTime || v.endTime > v.startTime, {
    message: 'End time must be after the start time',
    path: ['endTime'],
  });
export type CreateExamScheduleInput = z.infer<typeof createExamScheduleSchema>;

export const updateExamScheduleSchema = z
  .object({
    classId: z.string().uuid().optional(),
    subjectId: z.string().uuid().optional(),
    examDate: isoDate,
    startTime: time.nullish(),
    endTime: time.nullish(),
    maxMarks: z.coerce.number().int().min(1).max(1000).optional(),
    passMarks: z.coerce.number().int().min(0).max(1000).nullish(),
    room: shortText(64),
    ...withVersion,
  })
  .refine((v) => !v.startTime || !v.endTime || v.endTime > v.startTime, {
    message: 'End time must be after the start time',
    path: ['endTime'],
  });
export type UpdateExamScheduleInput = z.infer<typeof updateExamScheduleSchema>;
