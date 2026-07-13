import { z } from 'zod';
import { paginationQuerySchema, sortQuerySchema, versionSchema } from './common';
import { lenientPhoneSchema } from './geo/validators';

/**
 * Institution-Portal ADMISSIONS (Phase 5) request/response contracts. The same Zod schemas
 * validate the API body (authoritative) and drive the institution-web forms.
 *
 * Tenancy (institution_id) and the active campus scope (campus_id) are NEVER taken from the
 * request body — the API derives them from the authenticated principal + scope header.
 */

// --- shared ------------------------------------------------------------------

const personName = z.string().trim().min(1, 'Required').max(80);
const optionalMiddleName = z.string().trim().max(80).optional();
const optionalUuid = z.string().uuid().nullish();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD').nullish();
const email = z.string().trim().toLowerCase().email().nullish();
/** Normalizes to E.164 when parseable; tolerates legacy values for existing records. */
const phone = lenientPhoneSchema;
const shortText = (max = 120) => z.string().trim().max(max).nullish();

const ADMISSION_GENDERS = ['male', 'female', 'other'] as const;
export const admissionGenderSchema = z.enum(ADMISSION_GENDERS);

export const ADMISSION_STATUSES = [
  'submitted',
  'under_review',
  'info_requested',
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
  'info_requested',
  'accepted',
  'rejected',
  'waitlisted',
  'withdrawn',
] as const;
export const admissionEditableStatusSchema = z.enum(ADMISSION_EDITABLE_STATUSES);

/** How an application entered the system — the list can filter on this. */
export const ADMISSION_SUBMITTED_VIA = ['staff', 'portal'] as const;
export const admissionSubmittedViaSchema = z.enum(ADMISSION_SUBMITTED_VIA);
export type AdmissionSubmittedVia = (typeof ADMISSION_SUBMITTED_VIA)[number];

/**
 * Decision statuses reachable via the dedicated decide action. Enrolment (`enrolled`) is a separate
 * bridge; `under_review` / `submitted` are workflow states, not decisions.
 */
export const ADMISSION_DECISIONS = ['accepted', 'rejected', 'waitlisted', 'info_requested'] as const;
export const admissionDecisionSchema = z.enum(ADMISSION_DECISIONS);
export type AdmissionDecision = (typeof ADMISSION_DECISIONS)[number];

/** Common list query for the admissions directory: page + sort + free-text search + facets. */
export const admissionsListQuerySchema = paginationQuerySchema.merge(sortQuerySchema).extend({
  search: z.string().trim().max(160).optional(),
  status: admissionStatusSchema.optional(),
  submittedVia: admissionSubmittedViaSchema.optional(),
});
export type AdmissionsListQuery = z.infer<typeof admissionsListQuerySchema>;

const withVersion = { version: versionSchema };

// --- applications ------------------------------------------------------------

export const createAdmissionSchema = z.object({
  applicationNo: z.string().trim().min(1, 'Required').max(40),
  firstName: personName,
  middleName: optionalMiddleName,
  lastName: personName,
  gender: admissionGenderSchema.nullish(),
  dateOfBirth: isoDate,
  email,
  phone,
  gradeLevelId: optionalUuid,
  academicYearId: optionalUuid,
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
  middleName: optionalMiddleName.nullable(),
  lastName: personName.optional(),
  gender: admissionGenderSchema.nullish(),
  dateOfBirth: isoDate,
  email,
  phone,
  gradeLevelId: optionalUuid,
  academicYearId: optionalUuid,
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
 * Record a decision on an application (accept/reject/waitlist/request-info) with an optional note.
 * The service stamps `decision_date`, updates `status`/`decision_note`, and — unless `notify` is
 * false — fans out a notification to the guardian. Version-guarded like every other mutation.
 */
export const decideAdmissionSchema = z.object({
  decision: admissionDecisionSchema,
  note: shortText(500),
  notify: z.coerce.boolean().default(true),
  ...withVersion,
});
export type DecideAdmissionInput = z.infer<typeof decideAdmissionSchema>;

/**
 * Enrol an accepted applicant: creates a students row from the application and links it back.
 * The admission number defaults to the application number; a class may be assigned at enrolment.
 */
export const enrolAdmissionSchema = z.object({
  admissionNo: z.string().trim().min(1).max(40).optional(),
  classId: optionalUuid,
});
export type EnrolAdmissionInput = z.infer<typeof enrolAdmissionSchema>;
