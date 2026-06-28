import { z } from 'zod';
import { paginationQuerySchema, sortQuerySchema, versionSchema } from './common';

/**
 * Institution-Portal ACADEMICS (Phase 2) request/response contracts. The same Zod schemas
 * validate the API body (authoritative) and drive the institution-web forms, so client and
 * server agree on shape before a write is attempted.
 *
 * Tenancy (institution_id) and the active campus scope (campus_id) are NEVER taken from the
 * request body — the API derives them from the authenticated principal + scope header. These
 * schemas therefore describe only the domain fields a user actually edits.
 */

// --- shared ------------------------------------------------------------------

const name = z.string().trim().min(1, 'Required').max(160);
const code = z.string().trim().min(1, 'Required').max(32);
/** A calendar date as YYYY-MM-DD (matches the Postgres `date` column). */
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
const optionalUuid = z.string().uuid().nullish();

export const ACADEMIC_YEAR_STATUSES = ['planning', 'active', 'archived'] as const;
export const academicYearStatusSchema = z.enum(ACADEMIC_YEAR_STATUSES);
export type AcademicYearStatus = (typeof ACADEMIC_YEAR_STATUSES)[number];

export const SUBJECT_KINDS = ['core', 'elective'] as const;
export const subjectKindSchema = z.enum(SUBJECT_KINDS);
export type SubjectKind = (typeof SUBJECT_KINDS)[number];

/** Which academic resource a generic list/route targets. */
export const ACADEMIC_RESOURCES = [
  'academic-years',
  'departments',
  'grade-levels',
  'subjects',
  'classes',
] as const;
export type AcademicResource = (typeof ACADEMIC_RESOURCES)[number];

/** Common list query for every academic directory: page + sort + free-text search. */
export const academicsListQuerySchema = paginationQuerySchema.merge(sortQuerySchema).extend({
  search: z.string().trim().max(160).optional(),
});
export type AcademicsListQuery = z.infer<typeof academicsListQuerySchema>;

/** Sent on every mutating update/delete for optimistic concurrency. */
const withVersion = { version: versionSchema };

// --- academic years ----------------------------------------------------------

export const createAcademicYearSchema = z
  .object({
    name,
    startDate: isoDate,
    endDate: isoDate,
    status: academicYearStatusSchema.default('planning'),
    isCurrent: z.boolean().default(false),
  })
  .refine((v) => v.endDate > v.startDate, {
    message: 'End date must be after the start date',
    path: ['endDate'],
  });
export type CreateAcademicYearInput = z.infer<typeof createAcademicYearSchema>;

export const updateAcademicYearSchema = z
  .object({
    name: name.optional(),
    startDate: isoDate.optional(),
    endDate: isoDate.optional(),
    status: academicYearStatusSchema.optional(),
    isCurrent: z.boolean().optional(),
    ...withVersion,
  })
  .refine((v) => !v.startDate || !v.endDate || v.endDate > v.startDate, {
    message: 'End date must be after the start date',
    path: ['endDate'],
  });
export type UpdateAcademicYearInput = z.infer<typeof updateAcademicYearSchema>;

// --- departments -------------------------------------------------------------

export const createDepartmentSchema = z.object({
  name,
  code,
  headUserId: optionalUuid,
  description: z.string().trim().max(500).nullish(),
});
export type CreateDepartmentInput = z.infer<typeof createDepartmentSchema>;

export const updateDepartmentSchema = z.object({
  name: name.optional(),
  code: code.optional(),
  headUserId: optionalUuid,
  description: z.string().trim().max(500).nullish(),
  ...withVersion,
});
export type UpdateDepartmentInput = z.infer<typeof updateDepartmentSchema>;

// --- grade levels ------------------------------------------------------------

export const createGradeLevelSchema = z.object({
  name,
  level: z.coerce.number().int().min(0).max(100).default(0),
  departmentId: optionalUuid,
});
export type CreateGradeLevelInput = z.infer<typeof createGradeLevelSchema>;

export const updateGradeLevelSchema = z.object({
  name: name.optional(),
  level: z.coerce.number().int().min(0).max(100).optional(),
  departmentId: optionalUuid,
  ...withVersion,
});
export type UpdateGradeLevelInput = z.infer<typeof updateGradeLevelSchema>;

// --- subjects ----------------------------------------------------------------

export const createSubjectSchema = z.object({
  name,
  code,
  kind: subjectKindSchema.default('core'),
  departmentId: optionalUuid,
});
export type CreateSubjectInput = z.infer<typeof createSubjectSchema>;

export const updateSubjectSchema = z.object({
  name: name.optional(),
  code: code.optional(),
  kind: subjectKindSchema.optional(),
  departmentId: optionalUuid,
  ...withVersion,
});
export type UpdateSubjectInput = z.infer<typeof updateSubjectSchema>;

// --- classes / sections ------------------------------------------------------

export const createClassSchema = z.object({
  academicYearId: z.string().uuid(),
  gradeLevelId: z.string().uuid(),
  name,
  section: z.string().trim().max(32).nullish(),
  classTeacherId: optionalUuid,
  room: z.string().trim().max(64).nullish(),
  capacity: z.coerce.number().int().min(0).max(10000).nullish(),
});
export type CreateClassInput = z.infer<typeof createClassSchema>;

export const updateClassSchema = z.object({
  academicYearId: z.string().uuid().optional(),
  gradeLevelId: z.string().uuid().optional(),
  name: name.optional(),
  section: z.string().trim().max(32).nullish(),
  classTeacherId: optionalUuid,
  room: z.string().trim().max(64).nullish(),
  capacity: z.coerce.number().int().min(0).max(10000).nullish(),
  ...withVersion,
});
export type UpdateClassInput = z.infer<typeof updateClassSchema>;

/** Assign (or re-assign the teacher of) a subject within a class. */
export const assignClassSubjectSchema = z.object({
  subjectId: z.string().uuid(),
  teacherId: optionalUuid,
});
export type AssignClassSubjectInput = z.infer<typeof assignClassSubjectSchema>;

/** Delete (and other version-guarded mutations sent with just a version). */
export const versionedDeleteSchema = z.object({ ...withVersion });
export type VersionedDeleteInput = z.infer<typeof versionedDeleteSchema>;
