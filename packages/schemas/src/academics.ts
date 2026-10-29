import { z } from 'zod';
import { paginationQuerySchema, sortQuerySchema, versionSchema, academicScopeQuerySchema } from './common';

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
/** Optional short code — the API derives one from the name when omitted. */
const optionalCode = z.string().trim().max(32).optional();
/** A calendar date as YYYY-MM-DD (matches the Postgres `date` column). */
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
const optionalUuid = z.string().uuid().nullish();

export const ACADEMIC_YEAR_STATUSES = ['planning', 'active', 'archived'] as const;
export const academicYearStatusSchema = z.enum(ACADEMIC_YEAR_STATUSES);
export type AcademicYearStatus = (typeof ACADEMIC_YEAR_STATUSES)[number];

export const SUBJECT_KINDS = ['core', 'elective', 'honor', 'minor'] as const;
export const subjectKindSchema = z.enum(SUBJECT_KINDS);
export type SubjectKind = (typeof SUBJECT_KINDS)[number];

export const SUBJECT_KIND_LABELS: Record<SubjectKind, string> = {
  core: 'Core',
  elective: 'Elective',
  honor: 'Honor',
  minor: 'Minor',
};

export const SUBJECT_KIND_OPTIONS = SUBJECT_KINDS.map((value) => ({
  value,
  label: SUBJECT_KIND_LABELS[value],
}));

export function subjectKindLabel(kind: SubjectKind | string | null | undefined): string {
  if (kind && (SUBJECT_KINDS as readonly string[]).includes(kind)) {
    return SUBJECT_KIND_LABELS[kind as SubjectKind];
  }
  return SUBJECT_KIND_LABELS.core;
}

/** Which academic resource a generic list/route targets. */
export const ACADEMIC_RESOURCES = [
  'academic-years',
  'departments',
  'grade-levels',
  'department-grade-levels',
  'subjects',
  'programme-subjects',
  'classes',
  'academic-terms',
] as const;
export type AcademicResource = (typeof ACADEMIC_RESOURCES)[number];

export const TERM_SYSTEMS = [
  'annual',
  'semester',
  'trimester',
  'quarter',
  'modular',
  'custom',
  'term',
] as const;
export const termSystemSchema = z.enum(TERM_SYSTEMS);
export type TermSystem = (typeof TERM_SYSTEMS)[number];

/** Common list query for every academic directory: page + sort + free-text search. */
export const academicsListQuerySchema = paginationQuerySchema
  .merge(sortQuerySchema)
  .merge(academicScopeQuerySchema)
  .extend({
  search: z.string().trim().max(160).optional(),
  status: academicYearStatusSchema.optional(),
  isCurrent: z.enum(['true', 'false']).optional(),
  departmentId: z.string().uuid().optional(),
  programmeLevelId: z.string().uuid().optional(),
  /** Curriculum slot (1 = first semester of the programme year). */
  semesterSequence: z.coerce.number().int().min(1).max(20).optional(),
  /**
   * Year number (grade_levels.level), not a row id. Every department has its own "Year 2" row, but
   * they all share this number — so it is the only way to say "year 2, whichever department".
   */
  gradeLevelNumber: z.coerce.number().int().min(0).max(20).optional(),
  subjectId: z.string().uuid().optional(),
  kind: subjectKindSchema.optional(),
  unitKind: z.enum(['department', 'programme']).optional(),
  hasHead: z.enum(['true', 'false']).optional(),
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
  unitKind: z.enum(['department', 'programme']).optional(),
  code: optionalCode,
  headUserId: optionalUuid,
  description: z.string().trim().max(500).nullish(),
  termSystem: termSystemSchema.optional(),
  durationMonths: z.coerce.number().int().min(1).max(240).nullish(),
  termsPerYear: z.coerce.number().int().min(0).max(12).optional(),
});
export type CreateDepartmentInput = z.infer<typeof createDepartmentSchema>;

export const updateDepartmentSchema = z.object({
  name: name.optional(),
  code: code.optional(),
  headUserId: optionalUuid,
  description: z.string().trim().max(500).nullish(),
  termSystem: termSystemSchema.optional(),
  durationMonths: z.coerce.number().int().min(1).max(240).nullish(),
  termsPerYear: z.coerce.number().int().min(0).max(12).optional(),
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

// --- department grade levels (programme ↔ year links) ------------------------

export const DEPARTMENT_GRADE_LEVEL_STATUSES = ['active', 'inactive'] as const;
export const departmentGradeLevelStatusSchema = z.enum(DEPARTMENT_GRADE_LEVEL_STATUSES);

export const createDepartmentGradeLevelSchema = z.object({
  departmentId: z.string().uuid(),
  gradeLevelId: z.string().uuid(),
  sequence: z.coerce.number().int().min(0).max(100).default(0),
  durationLabel: z.string().trim().max(64).nullish(),
  status: departmentGradeLevelStatusSchema.default('active'),
});
export type CreateDepartmentGradeLevelInput = z.infer<typeof createDepartmentGradeLevelSchema>;

export const updateDepartmentGradeLevelSchema = z.object({
  departmentId: z.string().uuid().optional(),
  gradeLevelId: z.string().uuid().optional(),
  sequence: z.coerce.number().int().min(0).max(100).optional(),
  durationLabel: z.string().trim().max(64).nullish(),
  status: departmentGradeLevelStatusSchema.optional(),
  ...withVersion,
});
export type UpdateDepartmentGradeLevelInput = z.infer<typeof updateDepartmentGradeLevelSchema>;

// --- subjects ----------------------------------------------------------------

export const createSubjectSchema = z.object({
  name,
  code: optionalCode,
  kind: subjectKindSchema.default('core'),
  isLabSubject: z.boolean().default(false),
  departmentId: optionalUuid,
});
export type CreateSubjectInput = z.infer<typeof createSubjectSchema>;

export const updateSubjectSchema = z.object({
  name: name.optional(),
  code: code.optional(),
  kind: subjectKindSchema.optional(),
  isLabSubject: z.boolean().optional(),
  departmentId: optionalUuid,
  ...withVersion,
});
export type UpdateSubjectInput = z.infer<typeof updateSubjectSchema>;

// --- programme subjects (curriculum: subject × programme year × semester slot) ------------------

/**
 * A curriculum placement — "Discrete Mathematics is taught in semester 1 of Applied Psychology
 * year 1". Either send `programmeLevelId`, or send `departmentId` + `gradeLevelId` and the API
 * resolves the link for you.
 */
export const createProgrammeSubjectSchema = z
  .object({
    subjectId: z.string().uuid(),
    programmeLevelId: optionalUuid,
    departmentId: optionalUuid,
    gradeLevelId: optionalUuid,
    slotId: optionalUuid,
    semesterSequence: z.coerce.number().int().min(1).max(20).default(1),
    credits: z.coerce.number().int().min(0).max(100).nullish(),
    isElective: z.boolean().default(false),
    sequence: z.coerce.number().int().min(0).max(100).default(0),
  })
  .refine((v) => !!v.programmeLevelId || (!!v.departmentId && !!v.gradeLevelId), {
    message: 'Select a programme and a year',
    path: ['programmeLevelId'],
  });
export type CreateProgrammeSubjectInput = z.infer<typeof createProgrammeSubjectSchema>;

export const updateProgrammeSubjectSchema = z.object({
  subjectId: z.string().uuid().optional(),
  programmeLevelId: optionalUuid,
  departmentId: optionalUuid,
  gradeLevelId: optionalUuid,
  semesterSequence: z.coerce.number().int().min(1).max(20).optional(),
  credits: z.coerce.number().int().min(0).max(100).nullish(),
  isElective: z.boolean().optional(),
  sequence: z.coerce.number().int().min(0).max(100).optional(),
  ...withVersion,
});
export type UpdateProgrammeSubjectInput = z.infer<typeof updateProgrammeSubjectSchema>;

// --- classes / sections ------------------------------------------------------

export const createClassSchema = z.object({
  academicYearId: z.string().uuid(),
  gradeLevelId: z.string().uuid(),
  programmeLevelId: optionalUuid,
  termId: optionalUuid,
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
  programmeLevelId: optionalUuid,
  termId: optionalUuid,
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

/**
 * Seed a class's subjects from the curriculum defined for its programme year + semester slot.
 * Existing assignments (and their teachers) are left alone; only missing subjects are added.
 */
export const applyCurriculumSchema = z.object({
  /** Only add these curriculum rows; omit to add every missing subject in the slot. */
  programmeSubjectIds: z.array(z.string().uuid()).max(200).optional(),
});
export type ApplyCurriculumInput = z.infer<typeof applyCurriculumSchema>;

/** Bulk move students in/out of a class in one write. */
export const updateClassRosterSchema = z
  .object({
    add: z.array(z.string().uuid()).max(500).default([]),
    remove: z.array(z.string().uuid()).max(500).default([]),
  })
  .refine((v) => v.add.length > 0 || v.remove.length > 0, {
    message: 'Select at least one student',
    path: ['add'],
  });
export type UpdateClassRosterInput = z.infer<typeof updateClassRosterSchema>;

/** Students eligible to join a class — unassigned, or sitting in a different class. */
export const rosterCandidateQuerySchema = z
  .object({
    search: z.string().trim().max(160).optional(),
    /** false (default) = only students with no class; true = every active student. */
    includeAssigned: z.coerce.boolean().default(false),
    limit: z.coerce.number().int().min(1).max(200).default(50),
  })
  .merge(academicScopeQuerySchema);
export type RosterCandidateQuery = z.infer<typeof rosterCandidateQuerySchema>;

/** Delete (and other version-guarded mutations sent with just a version). */
export const versionedDeleteSchema = z.object({ ...withVersion });
export type VersionedDeleteInput = z.infer<typeof versionedDeleteSchema>;

// --- academic terms (periods within an academic year) ----------------------

export const ACADEMIC_TERM_KINDS = ['term', 'semester', 'trimester', 'quarter'] as const;
export const academicTermKindSchema = z.enum(ACADEMIC_TERM_KINDS);
export type AcademicTermKind = (typeof ACADEMIC_TERM_KINDS)[number];

export const ACADEMIC_TERM_STATUSES = ['planning', 'active', 'archived'] as const;
export const academicTermStatusSchema = z.enum(ACADEMIC_TERM_STATUSES);
export type AcademicTermStatus = (typeof ACADEMIC_TERM_STATUSES)[number];

export const createAcademicTermSchema = z
  .object({
    academicYearId: z.string().uuid(),
    programmeLevelId: optionalUuid,
    departmentId: optionalUuid,
    gradeLevelId: optionalUuid,
    name,
    kind: academicTermKindSchema.default('term'),
    sequence: z.coerce.number().int().min(1).max(20).default(1),
    startDate: isoDate,
    endDate: isoDate,
    status: academicTermStatusSchema.default('active'),
    isCurrent: z.boolean().default(false),
  })
  .refine((v) => v.endDate > v.startDate, {
    message: 'End date must be after the start date',
    path: ['endDate'],
  });
export type CreateAcademicTermInput = z.infer<typeof createAcademicTermSchema>;

export const updateAcademicTermSchema = z
  .object({
    academicYearId: z.string().uuid().optional(),
    programmeLevelId: optionalUuid,
    departmentId: optionalUuid,
    gradeLevelId: optionalUuid,
    name: name.optional(),
    kind: academicTermKindSchema.optional(),
    sequence: z.coerce.number().int().min(1).max(20).optional(),
    startDate: isoDate.optional(),
    endDate: isoDate.optional(),
    status: academicTermStatusSchema.optional(),
    isCurrent: z.boolean().optional(),
    ...withVersion,
  })
  .refine((v) => !v.startDate || !v.endDate || v.endDate > v.startDate, {
    message: 'End date must be after the start date',
    path: ['endDate'],
  });
export type UpdateAcademicTermInput = z.infer<typeof updateAcademicTermSchema>;

export const programmeStructureQuerySchema = z.object({
  departmentId: z.string().uuid().optional(),
});
export type ProgrammeStructureQuery = z.infer<typeof programmeStructureQuerySchema>;

// --- programme structure (template slots) ------------------------------------

export const slotOverrideSchema = z.object({
  levelSequence: z.coerce.number().int().min(1).max(30),
  sequenceInYear: z.coerce.number().int().min(1).max(20),
  name: z.string().trim().min(1).max(160).optional(),
  durationMonths: z.coerce.number().int().min(1).max(120).nullish(),
  isTerminal: z.boolean().optional(),
  remove: z.boolean().optional(),
});
export type SlotOverrideInput = z.infer<typeof slotOverrideSchema>;

export const previewStructureSchema = z.object({
  termSystem: termSystemSchema,
  durationMonths: z.coerce.number().int().min(1).max(240).nullish(),
  termsPerYear: z.coerce.number().int().min(0).max(12).optional(),
  gradeCount: z.coerce.number().int().min(1).max(20).optional(),
  preset: z.string().trim().max(32).optional(),
  overrides: z.array(slotOverrideSchema).max(200).optional(),
});
export type PreviewStructureInput = z.infer<typeof previewStructureSchema>;

export const plannedLevelSchema = z.object({
  id: z.string().uuid().optional(),
  sequence: z.coerce.number().int().min(1).max(30),
  name,
  durationMonths: z.coerce.number().int().min(1).max(120).nullish(),
});
export type PlannedLevelInput = z.infer<typeof plannedLevelSchema>;

export const plannedSlotSchema = z.object({
  id: z.string().uuid().optional(),
  levelSequence: z.coerce.number().int().min(1).max(30),
  sequenceInYear: z.coerce.number().int().min(1).max(20),
  absoluteSequence: z.coerce.number().int().min(1).max(200),
  name,
  kind: z.string().trim().min(1).max(32),
  durationMonths: z.coerce.number().int().min(1).max(120).nullish(),
  isTerminal: z.boolean().default(false),
});
export type PlannedSlotInput = z.infer<typeof plannedSlotSchema>;

const commitStructureBaseSchema = z.object({
  name: name.optional(),
  version: versionSchema.optional(),
  termSystem: termSystemSchema,
  durationMonths: z.coerce.number().int().min(1).max(240).nullish(),
  termsPerYear: z.coerce.number().int().min(0).max(12),
  levels: z.array(plannedLevelSchema).max(30),
  slots: z.array(plannedSlotSchema).max(200),
});
export const commitStructureSchema = commitStructureBaseSchema.superRefine((value, ctx) => {
  const unique = (items: (string | number | undefined)[], path: string) => {
    const present = items.filter((item) => item !== undefined);
    if (new Set(present).size !== present.length)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [path],
        message: 'Each row must have a unique identity and position.',
      });
  };
  unique(
    value.levels.map((level) => level.id),
    'levels',
  );
  unique(
    value.levels.map((level) => level.sequence),
    'levels',
  );
  unique(
    value.slots.map((slot) => slot.id),
    'slots',
  );
  unique(
    value.slots.map((slot) => slot.absoluteSequence),
    'slots',
  );
  unique(
    value.slots.map((slot) => `${slot.levelSequence}:${slot.sequenceInYear}`),
    'slots',
  );
  const sequences = new Set(value.levels.map((level) => level.sequence));
  if (value.slots.some((slot) => !sequences.has(slot.levelSequence)))
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['slots'],
      message: 'Each term must belong to a grade or year in this structure.',
    });
});
export type CommitStructureInput = z.infer<typeof commitStructureSchema>;

export const patchStructureSchema = commitStructureBaseSchema.partial().extend({ ...withVersion });
export type PatchStructureInput = z.infer<typeof patchStructureSchema>;

export const scheduleAcademicYearSchema = z.object({
  /** When true, replace existing scheduled terms for this year that match a slot. */
  replaceExisting: z.boolean().default(false),
});
export type ScheduleAcademicYearInput = z.infer<typeof scheduleAcademicYearSchema>;
