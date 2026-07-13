import { date, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { actorColumns, primaryId, timestamps } from './_helpers';
import { institutions } from './institutions';
import { campuses } from './campuses';
import { academicYears, gradeLevels } from './academics';
import { students } from './people';

/**
 * INSTITUTION-PORTAL admissions (Phase 5): prospective-student applications and their decision
 * lifecycle. Same tenant convention as academics/people:
 *   id, institution_id (ALWAYS), campus_id (nullable — null = institution-owned/shared),
 *   …domain columns…, actorColumns, timestamps, version
 * with indexes on (institution_id) and (institution_id, campus_id). Reads/writes are confined to
 * one institution + the request's active campus scope at the service layer (and later RLS).
 *
 * Unlike people, an applicant is NOT yet a student. `grade_level_id` is the grade applied for; on
 * acceptance the portal can enrol the applicant — creating a `students` row and stamping
 * `enrolled_student_id` here, the admissions→students bridge (mirrors how academics points at
 * teachers). Both FKs reference forward-only tables (academics/people never reference admissions),
 * so there is no Drizzle type cycle and plain `.references()` is safe.
 */
export const admissionApplications = pgTable(
  'admission_applications',
  {
    id: primaryId(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    campusId: uuid('campus_id').references(() => campuses.id, { onDelete: 'cascade' }),
    /** Application reference (unique within the institution). */
    applicationNo: text('application_no').notNull(),
    firstName: text('first_name').notNull(),
    middleName: text('middle_name'),
    lastName: text('last_name').notNull(),
    /** male | female | other (free-text; validated in zod). */
    gender: text('gender'),
    dateOfBirth: date('date_of_birth'),
    email: text('email'),
    phone: text('phone'),
    /** The grade the applicant is applying for. */
    gradeLevelId: uuid('grade_level_id').references(() => gradeLevels.id, { onDelete: 'set null' }),
    /** The academic year applied for (nullable — legacy staff rows may omit it). */
    academicYearId: uuid('academic_year_id').references(() => academicYears.id, { onDelete: 'set null' }),
    /** How the application entered the system: `staff` (created in the portal) or `portal` (parent funnel). */
    submittedVia: text('submitted_via').notNull().default('staff'),
    previousSchool: text('previous_school'),
    guardianName: text('guardian_name'),
    guardianPhone: text('guardian_phone'),
    guardianEmail: text('guardian_email'),
    /** Health + additional info collected on the application (medical/allergies/blood group/etc). */
    additionalInfo: jsonb('additional_info').$type<AdmissionAdditionalInfo>(),
    /** submitted | under_review | accepted | rejected | waitlisted | enrolled | withdrawn. */
    status: text('status').notNull().default('submitted'),
    appliedDate: date('applied_date'),
    decisionDate: date('decision_date'),
    decisionNote: text('decision_note'),
    /** Set once the applicant is enrolled — the student created from this application. */
    enrolledStudentId: uuid('enrolled_student_id').references(() => students.id, {
      onDelete: 'set null',
    }),
    version: integer('version').notNull().default(0),
    ...actorColumns,
    ...timestamps,
  },
  (t) => ({
    instIdx: index('admission_applications_institution_idx').on(t.institutionId),
    scopeIdx: index('admission_applications_institution_campus_idx').on(t.institutionId, t.campusId),
    statusIdx: index('admission_applications_status_idx').on(t.status),
    applicationUniq: uniqueIndex('admission_application_no_uniq').on(t.institutionId, t.applicationNo),
  }),
);

export type AdmissionApplication = typeof admissionApplications.$inferSelect;
export type NewAdmissionApplication = typeof admissionApplications.$inferInsert;

/**
 * The autosaved shape of a parent's in-progress application. Stored as JSON on the draft so the
 * public funnel can save/resume section-by-section before a final submit re-validates everything.
 */
export interface AdmissionDraftPayload {
  target?: { campusId?: string; academicYearId?: string; gradeLevelId?: string; programme?: string };
  student?: {
    firstName?: string;
    middleName?: string;
    lastName?: string;
    gender?: string;
    dateOfBirth?: string;
    previousSchool?: string;
  };
  guardian?: { name?: string; email?: string; phone?: string; relationship?: string };
  contact?: { email?: string; phone?: string };
  address?: { line1?: string; line2?: string; city?: string; region?: string; postalCode?: string; country?: string };
  additional?: AdmissionAdditionalInfo;
}

/** Health + additional info an institution collects on the application (all optional). */
export interface AdmissionAdditionalInfo {
  medicalConditions?: string;
  allergies?: string;
  medications?: string;
  bloodGroup?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  specialNeeds?: string;
  notes?: string;
}

/**
 * PUBLIC parent admission-application funnel drafts. Unauthenticated + cross-tenant at creation
 * (the parent chooses the institution), so — like the institution-registration funnel — this table
 * is NOT under portal tenant-RLS. It is protected by a signed resume token (only its hash is
 * stored), an OTP-verified contact email, per-IP rate limiting, and full server re-validation on
 * submit. On submit the service creates the tenant-owned `admission_applications` row and links it.
 */
export const admissionApplicationDrafts = pgTable(
  'admission_application_drafts',
  {
    id: primaryId(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    campusId: uuid('campus_id').references(() => campuses.id, { onDelete: 'set null' }),
    /** SHA-256 of the resume token handed to the client once at start (never stored in plaintext). */
    resumeTokenHash: text('resume_token_hash').notNull(),
    contactEmail: text('contact_email').notNull(),
    emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
    payload: jsonb('payload').$type<AdmissionDraftPayload>().notNull().default({}),
    /** draft | submitted */
    status: text('status').notNull().default('draft'),
    submittedApplicationId: uuid('submitted_application_id').references(() => admissionApplications.id, {
      onDelete: 'set null',
    }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    version: integer('version').notNull().default(0),
    ...timestamps,
  },
  (t) => ({
    instIdx: index('admission_drafts_institution_idx').on(t.institutionId),
    tokenIdx: index('admission_drafts_token_idx').on(t.resumeTokenHash),
    emailIdx: index('admission_drafts_email_idx').on(t.contactEmail),
  }),
);

export type AdmissionApplicationDraft = typeof admissionApplicationDrafts.$inferSelect;
export type NewAdmissionApplicationDraft = typeof admissionApplicationDrafts.$inferInsert;

/**
 * Email-verification OTP codes for the PUBLIC parent admission funnel. Mirrors
 * `institution_registration_otps` column-for-column but is keyed to a draft (FK
 * `admission_application_drafts`) so the shared {@link OtpService} lifecycle can drive it. Only the
 * salted SHA-256 of each code is stored; codes are single-use, time-boxed and throttled. NOT under
 * tenant-RLS (public funnel). The `requestId` property maps to the `draft_id` column so the generic
 * OTP service — which references `requestId` — works unchanged against either table.
 */
export const admissionApplicationOtps = pgTable(
  'admission_application_otps',
  {
    id: primaryId(),
    requestId: uuid('draft_id')
      .notNull()
      .references(() => admissionApplicationDrafts.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    purpose: text('purpose').notNull().default('email_verification'),
    codeHash: text('code_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    attempts: integer('attempts').notNull().default(0),
    maxAttempts: integer('max_attempts').notNull().default(5),
    sendCount: integer('send_count').notNull().default(1),
    ip: text('ip'),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    draftIdx: index('admission_otps_draft_idx').on(t.requestId, t.purpose),
    emailIdx: index('admission_otps_email_idx').on(t.email),
  }),
);

export type AdmissionApplicationOtp = typeof admissionApplicationOtps.$inferSelect;
export type NewAdmissionApplicationOtp = typeof admissionApplicationOtps.$inferInsert;

/** One staff-defined field on an info-request form. `file` fields collect uploaded documents. */
export interface AdmissionInfoField {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'select' | 'mcq' | 'date' | 'file';
  /** Choices for select/mcq. */
  options?: string[];
  required?: boolean;
  /** file fields: allow multiple uploads. */
  multiple?: boolean;
}

/** A stored file reference inside a response (mirrors message attachments). */
export interface AdmissionInfoFileRef {
  fileName: string;
  storageKey: string;
  sizeBytes: number;
  contentType?: string | null;
}

/**
 * PUBLIC admission info-request: staff ask an applicant for extra/corrected information via a custom
 * form (text/select/mcq/date/file). Like the apply drafts this is token-secured (only the resume-token
 * HASH is stored) and NOT under portal tenant-RLS — the parent submits without an account. `responses`
 * holds the parent's answers ({ [fieldKey]: string | string[] | AdmissionInfoFileRef[] }).
 */
export const admissionInfoRequests = pgTable(
  'admission_info_requests',
  {
    id: primaryId(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    applicationId: uuid('application_id')
      .notNull()
      .references(() => admissionApplications.id, { onDelete: 'cascade' }),
    /** open (awaiting parent) | submitted | cancelled. */
    status: text('status').notNull().default('open'),
    /** Instructions shown to the parent. */
    message: text('message'),
    fields: jsonb('fields').$type<AdmissionInfoField[]>().notNull().default([]),
    resumeTokenHash: text('resume_token_hash').notNull(),
    /** Denormalised applicant contact email for notifications. */
    contactEmail: text('contact_email'),
    responses: jsonb('responses').$type<Record<string, unknown>>(),
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    version: integer('version').notNull().default(0),
    ...actorColumns,
    ...timestamps,
  },
  (t) => ({
    instIdx: index('admission_info_requests_institution_idx').on(t.institutionId),
    appIdx: index('admission_info_requests_application_idx').on(t.applicationId),
    statusIdx: index('admission_info_requests_status_idx').on(t.status),
  }),
);

export type AdmissionInfoRequest = typeof admissionInfoRequests.$inferSelect;
export type NewAdmissionInfoRequest = typeof admissionInfoRequests.$inferInsert;
