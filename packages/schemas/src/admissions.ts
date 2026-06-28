import { z } from 'zod';
import { paginationQuerySchema, sortQuerySchema, versionSchema } from './common';

/**
 * Institution-Portal ADMISSIONS (Phase 5) request/response contracts. The same Zod schemas
 * validate the API body (authoritative) and drive the institution-web forms.
 *
 * Tenancy (institution_id) and the active campus scope (campus_id) are NEVER taken from the
 * request body — the API derives them from the authenticated principal + scope header.
 */

// --- shared ------------------------------------------------------------------

const personName = z.string().trim().min(1, 'Required').max(80);
const optionalUuid = z.string().uuid().nullish();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD').nullish();
const email = z.string().trim().toLowerCase().email().nullish();
const phone = z.string().trim().max(40).nullish();
const shortText = (max = 120) => z.string().trim().max(max).nullish();

const ADMISSION_GENDERS = ['male', 'female', 'other'] as const;
export const admissionGenderSchema = z.enum(ADMISSION_GENDERS);

export const ADMISSION_STATUSES = [
  'submitted',
  'under_review',
  'accepted',
  'rejected',
  'waitlisted',
  'enrolled',
  'withdrawn',
] as const;
export const admissionStatusSchema = z.enum(ADMISSION_STATUSES);
export type AdmissionStatus = (typeof ADMISSION_STATUSES)[number];

/** Statuses an admin can set directly via update (enrolled is reached only via the enrol action). */
export const ADMISSION_EDITABLE_STATUSES = [
  'submitted',
  'under_review',
  'accepted',
  'rejected',
  'waitlisted',
  'withdrawn',
] as const;
export const admissionEditableStatusSchema = z.enum(ADMISSION_EDITABLE_STATUSES);

/** Common list query for the admissions directory: page + sort + free-text search. */
export const admissionsListQuerySchema = paginationQuerySchema.merge(sortQuerySchema).extend({
  search: z.string().trim().max(160).optional(),
  status: admissionStatusSchema.optional(),
});
export type AdmissionsListQuery = z.infer<typeof admissionsListQuerySchema>;

const withVersion = { version: versionSchema };

// --- applications ------------------------------------------------------------

export const createAdmissionSchema = z.object({
  applicationNo: z.string().trim().min(1, 'Required').max(40),
  firstName: personName,
  lastName: personName,
  gender: admissionGenderSchema.nullish(),
  dateOfBirth: isoDate,
  email,
  phone,
  gradeLevelId: optionalUuid,
  previousSchool: shortText(160),
  guardianName: shortText(120),
  guardianPhone: phone,
  guardianEmail: email,
  status: admissionEditableStatusSchema.default('submitted'),
  appliedDate: isoDate,
  decisionNote: shortText(500),
});
export type CreateAdmissionInput = z.infer<typeof createAdmissionSchema>;

export const updateAdmissionSchema = z.object({
  applicationNo: z.string().trim().min(1).max(40).optional(),
  firstName: personName.optional(),
  lastName: personName.optional(),
  gender: admissionGenderSchema.nullish(),
  dateOfBirth: isoDate,
  email,
  phone,
  gradeLevelId: optionalUuid,
  previousSchool: shortText(160),
  guardianName: shortText(120),
  guardianPhone: phone,
  guardianEmail: email,
  status: admissionEditableStatusSchema.optional(),
  appliedDate: isoDate,
  decisionNote: shortText(500),
  ...withVersion,
});
export type UpdateAdmissionInput = z.infer<typeof updateAdmissionSchema>;

/**
 * Enrol an accepted applicant: creates a students row from the application and links it back.
 * The admission number defaults to the application number; a class may be assigned at enrolment.
 */
export const enrolAdmissionSchema = z.object({
  admissionNo: z.string().trim().min(1).max(40).optional(),
  classId: optionalUuid,
});
export type EnrolAdmissionInput = z.infer<typeof enrolAdmissionSchema>;
