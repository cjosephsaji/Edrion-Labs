import { z } from 'zod';
import { paginationQuerySchema, sortQuerySchema, versionSchema, academicScopeQuerySchema } from './common';
import { lenientPhoneSchema, optionalE164PhoneSchema } from './geo/validators';

/**
 * Institution-Portal PEOPLE (Phase 4) request/response contracts: students, staff (teaching +
 * non-teaching), parents/guardians, and the student↔guardian link. The same Zod schemas validate
 * the API body (authoritative) and drive the institution-web forms.
 *
 * As with academics, tenancy (institution_id) and the active campus scope (campus_id) are NEVER
 * taken from the request body — the API derives them from the authenticated principal + scope
 * header. These schemas describe only the domain fields a user edits.
 */

// --- shared ------------------------------------------------------------------

const personName = z.string().trim().min(1, 'Required').max(80);
/** Optional middle name — omitted from display when blank. */
const optionalMiddleName = z.string().trim().max(80).nullish();

/** Format first + optional middle + last for display labels. */
export function formatPersonName(parts: {
  firstName: string;
  middleName?: string | null;
  lastName: string;
}): string {
  return [parts.firstName, parts.middleName?.trim(), parts.lastName].filter((p) => p && p.length > 0).join(' ').trim();
}
const optionalUuid = z.string().uuid().nullish();
/** A calendar date as YYYY-MM-DD (matches the Postgres `date` column). */
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD').nullish();
const email = z.string().trim().toLowerCase().email().nullish();
/** Normalizes to E.164 when parseable; tolerates legacy values for existing records (UPDATE). */
const phone = lenientPhoneSchema;
/**
 * Strict phone for NEW records: rejects anything libphonenumber can't validate for its country
 * (wrong digit count, bad prefix …). Empty/omitted/null are allowed — phone stays optional. The
 * InternationalPhoneInput emits E.164 for valid numbers and the raw text otherwise, so an
 * out-of-range number surfaces as a field error here instead of being stored as-is.
 */
const phoneStrict = optionalE164PhoneSchema.nullable();
const shortText = (max = 120) => z.string().trim().max(max).nullish();
const roleKeys = z.array(z.string().trim().min(1).max(64)).max(40);
const campusIds = z.array(z.string().uuid()).max(200);

export const GENDERS = ['male', 'female', 'other'] as const;
export const genderSchema = z.enum(GENDERS);
export type Gender = (typeof GENDERS)[number];

export const STUDENT_STATUSES = ['enrolled', 'inactive', 'graduated', 'transferred', 'alumni'] as const;
export const studentStatusSchema = z.enum(STUDENT_STATUSES);
export type StudentStatus = (typeof STUDENT_STATUSES)[number];

export const EMPLOYMENT_TYPES = ['full_time', 'part_time', 'contract', 'visiting'] as const;
export const employmentTypeSchema = z.enum(EMPLOYMENT_TYPES);
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];

export const STAFF_STATUSES = ['active', 'inactive', 'on_leave'] as const;
export const staffStatusSchema = z.enum(STAFF_STATUSES);
export type StaffStatus = (typeof STAFF_STATUSES)[number];

export const GUARDIAN_RELATIONSHIPS = ['father', 'mother', 'guardian', 'other'] as const;
export const guardianRelationshipSchema = z.enum(GUARDIAN_RELATIONSHIPS);
export type GuardianRelationship = (typeof GUARDIAN_RELATIONSHIPS)[number];

/** Which people resource a generic list/route targets. */
export const PEOPLE_RESOURCES = ['students', 'staff', 'parents'] as const;
export type PeopleResource = (typeof PEOPLE_RESOURCES)[number];

/** Common list query for every people directory: page + sort + free-text search + facet filters. */
export const peopleListQuerySchema = paginationQuerySchema
  .merge(sortQuerySchema)
  .merge(academicScopeQuerySchema)
  .extend({
  search: z.string().trim().max(160).optional(),
  /** Staff employment status, student enrolment status, etc. — validated per list endpoint. */
  status: z.string().trim().max(32).optional(),
  employmentType: employmentTypeSchema.optional(),
  departmentId: z.string().uuid().optional(),
  roleKey: z.string().trim().max(64).optional(),
  /** When set, restrict staff to those with (true) or without (false) academics.teach. */
  teaching: z.enum(['true', 'false']).optional(),
  /** Student list facets */
  gradeLevelId: z.string().uuid().optional(),
  classId: z.string().uuid().optional(),
  gender: genderSchema.optional(),
  /** Parent list facets */
  hasChildren: z.enum(['true', 'false']).optional(),
  hasLogin: z.enum(['true', 'false']).optional(),
});
export type PeopleListQuery = z.infer<typeof peopleListQuerySchema>;

/** Sent on every mutating update/delete for optimistic concurrency. */
const withVersion = { version: versionSchema };

// --- students ----------------------------------------------------------------

export const createStudentSchema = z.object({
  admissionNo: z.string().trim().min(1, 'Required').max(40),
  firstName: personName,
  middleName: optionalMiddleName,
  lastName: personName,
  gender: genderSchema.nullish(),
  dateOfBirth: isoDate,
  email,
  phone: phoneStrict,
  gradeLevelId: optionalUuid,
  classId: optionalUuid,
  rollNo: shortText(20),
  address: shortText(300),
  status: studentStatusSchema.default('enrolled'),
  enrollmentDate: isoDate,
  /** Create an active student login with admissionNo as its temporary password. */
  createPortalAccount: z.boolean().default(true),
});
export type CreateStudentInput = z.infer<typeof createStudentSchema>;

export const updateStudentSchema = z.object({
  admissionNo: z.string().trim().min(1).max(40).optional(),
  firstName: personName.optional(),
  middleName: optionalMiddleName.nullable(),
  lastName: personName.optional(),
  gender: genderSchema.nullish(),
  dateOfBirth: isoDate,
  email,
  phone,
  gradeLevelId: optionalUuid,
  classId: optionalUuid,
  rollNo: shortText(20),
  address: shortText(300),
  status: studentStatusSchema.optional(),
  enrollmentDate: isoDate,
  ...withVersion,
});
export type UpdateStudentInput = z.infer<typeof updateStudentSchema>;

// --- staff (teaching + non-teaching) -----------------------------------------

export const createStaffSchema = z.object({
  employeeNo: shortText(40),
  firstName: personName,
  middleName: optionalMiddleName,
  lastName: personName,
  email,
  phone: phoneStrict,
  departmentId: optionalUuid,
  designation: shortText(80),
  employmentType: employmentTypeSchema.default('full_time'),
  status: staffStatusSchema.default('active'),
  joinDate: isoDate,
  institutionUserId: optionalUuid,
  /** When true and no institutionUserId, invite a portal login using email + roleKeys. */
  createLogin: z.boolean().default(false),
  /** Roles to assign on invite or when linking an existing institution user. */
  roleKeys: roleKeys.default([]),
  /** Campus access for the portal login (when createLogin is true). */
  campusIds: campusIds.default([]),
}).superRefine((data, ctx) => {
  if (!data.createLogin) return;
  if (!data.email) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Email is required to create a portal login.',
      path: ['email'],
    });
  }
  if (data.roleKeys.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Select at least one portal role.',
      path: ['roleKeys'],
    });
  }
});
export type CreateStaffInput = z.infer<typeof createStaffSchema>;

export const updateStaffSchema = z
  .object({
    employeeNo: shortText(40),
    firstName: personName.optional(),
    middleName: optionalMiddleName.nullable(),
    lastName: personName.optional(),
    email,
    phone,
    departmentId: optionalUuid,
    designation: shortText(80),
    employmentType: employmentTypeSchema.optional(),
    status: staffStatusSchema.optional(),
    joinDate: isoDate,
    institutionUserId: optionalUuid,
    createLogin: z.boolean().optional(),
    roleKeys: roleKeys.default([]).optional(),
    campusIds: campusIds.default([]).optional(),
    ...withVersion,
  })
  .superRefine((data, ctx) => {
    if (!data.createLogin) return;
    if (!data.email) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Email is required to create a portal login.',
        path: ['email'],
      });
    }
    if ((data.roleKeys ?? []).length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Select at least one portal role.',
        path: ['roleKeys'],
      });
    }
  });
export type UpdateStaffInput = z.infer<typeof updateStaffSchema>;

// --- parents / guardians -----------------------------------------------------

export const createParentSchema = z
  .object({
    firstName: personName,
    middleName: optionalMiddleName,
    lastName: personName,
    email,
    phone: phoneStrict,
    occupation: shortText(120),
    address: shortText(300),
    institutionUserId: optionalUuid,
    /** When true, invite a portal login with the parent role using the email above. */
    createLogin: z.boolean().default(false),
  })
  .superRefine((data, ctx) => {
    if (!data.createLogin) return;
    if (!data.email) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Email is required to create a portal login.',
        path: ['email'],
      });
    }
  });
export type CreateParentInput = z.infer<typeof createParentSchema>;

export const updateParentSchema = z.object({
  firstName: personName.optional(),
  middleName: optionalMiddleName.nullable(),
  lastName: personName.optional(),
  email,
  phone,
  occupation: shortText(120),
  address: shortText(300),
  institutionUserId: optionalUuid,
  createLogin: z.boolean().optional(),
  ...withVersion,
});
export type UpdateParentInput = z.infer<typeof updateParentSchema>;

// --- student ↔ guardian link -------------------------------------------------

/** Link (or re-configure) a parent as a guardian of a student. Upserts on (student, parent). */
export const assignGuardianSchema = z.object({
  parentId: z.string().uuid(),
  relationship: guardianRelationshipSchema.default('guardian'),
  isPrimary: z.boolean().default(false),
  isEmergencyContact: z.boolean().default(false),
});
export type AssignGuardianInput = z.infer<typeof assignGuardianSchema>;
