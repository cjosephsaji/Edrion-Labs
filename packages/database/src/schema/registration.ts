import { index, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import {
  actorColumns,
  institutionTypeEnum,
  primaryId,
  registrationReviewActionEnum,
  registrationStatusEnum,
  timestamps,
} from './_helpers';
import { institutions } from './institutions';
import { platformEmployees } from './identity';

/**
 * Institution Registration & Approval.
 *
 * A registration request is the public onboarding funnel's record. It is deliberately SEPARATE from
 * `institutions` — an application is never an institution; an *approved* application provisions one
 * (see `linked_institution_id`). Section data is stored as typed JSONB bags (so future fields land
 * without a migration), while the fields the reviewer directory filters/sorts on are promoted to
 * real columns — the same pattern `institutions` uses for `address`/`primary_contact`.
 */

export type RegInstitutionInfo = {
  legalName: string;
  displayName: string;
  type: string;
  website?: string;
  yearEstablished?: number;
  registrationNumber?: string;
  logoUrl?: string;
};

export type RegLocation = {
  country: string;
  region?: string;
  city: string;
  address: string;
  postalCode?: string;
  timezone: string;
};

export type RegCampusInfo = {
  currentCampuses: number;
  expectedCampusesNextYear?: number;
  firstCampusName: string;
  expectedStudents: number;
  expectedStaff?: number;
};

export type RegPrimaryContact = {
  fullName: string;
  jobTitle?: string;
  email: string;
  phone?: string;
  preferredContactMethod?: string;
};

export type RegSubscription = {
  /** Key of the plan the institution chose from the public catalogue. */
  planKey?: string;
  launchTimeline?: string;
  currentErp?: string;
  hearAboutUs?: string;
  additionalRequirements?: string;
};

export type RegConsent = {
  termsAccepted: boolean;
  privacyAccepted: boolean;
  marketingOptIn?: boolean;
  acceptedAt?: string;
};

export const institutionRegistrationRequests = pgTable(
  'institution_registration_requests',
  {
    id: primaryId(),
    /** Human reference shown to the applicant + reviewer, e.g. EDR-REG-2026-000145. Assigned on submit. */
    publicRef: text('public_ref').unique(),
    status: registrationStatusEnum('status').notNull().default('draft'),

    // Promoted, queryable columns (directory filter/sort). Mirror the JSONB section data.
    legalName: text('legal_name'),
    displayName: text('display_name'),
    type: institutionTypeEnum('type'),
    country: text('country'),
    region: text('region'),
    /** Standardized ISO 3166-2 subdivision code companion for `region` (name kept for review). */
    administrativeDivisionCode: text('administrative_division_code'),
    contactName: text('contact_name'),
    contactEmail: text('contact_email'),
    contactPhone: text('contact_phone'),
    /** Standardized E.164 companion for `contact_phone` (legacy value retained). */
    contactPhoneE164: text('contact_phone_e164'),
    campusesCount: integer('campuses_count'),
    expectedStudents: integer('expected_students'),
    preferredPlanKey: text('preferred_plan_key'),

    // Section blobs — future-proof. Promoted columns above are derived from these on save.
    institutionInfo: jsonb('institution_info').$type<RegInstitutionInfo>(),
    location: jsonb('location').$type<RegLocation>(),
    campusInfo: jsonb('campus_info').$type<RegCampusInfo>(),
    primaryContact: jsonb('primary_contact').$type<RegPrimaryContact>(),
    subscription: jsonb('subscription').$type<RegSubscription>(),
    consent: jsonb('consent').$type<RegConsent>(),

    // Email verification — submit is blocked unless `verified_email` matches the current contact email.
    emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
    verifiedEmail: text('verified_email'),

    // Review / decision.
    assignedReviewerId: uuid('assigned_reviewer_id').references(() => platformEmployees.id, {
      onDelete: 'set null',
    }),
    decidedBy: uuid('decided_by').references(() => platformEmployees.id, { onDelete: 'set null' }),
    decisionAt: timestamp('decision_at', { withTimezone: true }),
    rejectionReason: text('rejection_reason'),
    /** Set when an approved request provisions an institution. */
    linkedInstitutionId: uuid('linked_institution_id').references(() => institutions.id, {
      onDelete: 'set null',
    }),

    // Forensics / anti-abuse.
    submitterIp: text('submitter_ip'),
    submitterUserAgent: text('submitter_user_agent'),
    correlationId: text('correlation_id'),
    submittedAt: timestamp('submitted_at', { withTimezone: true }),

    version: integer('version').notNull().default(0),
    ...actorColumns,
    ...timestamps,
  },
  (t) => ({
    statusIdx: index('reg_requests_status_idx').on(t.status),
    typeIdx: index('reg_requests_type_idx').on(t.type),
    countryIdx: index('reg_requests_country_idx').on(t.country),
    emailIdx: index('reg_requests_contact_email_idx').on(t.contactEmail),
    reviewerIdx: index('reg_requests_reviewer_idx').on(t.assignedReviewerId),
    submittedIdx: index('reg_requests_submitted_idx').on(t.submittedAt),
  }),
);

/**
 * Email-verification OTPs. Only the SHA-256 hash of (code + pepper) is stored — never the code.
 * Single-use (`consumed_at`), time-boxed (`expires_at`), and throttled by `attempts`/`send_count`.
 */
export const institutionRegistrationOtps = pgTable(
  'institution_registration_otps',
  {
    id: primaryId(),
    requestId: uuid('request_id')
      .notNull()
      .references(() => institutionRegistrationRequests.id, { onDelete: 'cascade' }),
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
    requestIdx: index('reg_otps_request_idx').on(t.requestId, t.purpose),
    emailIdx: index('reg_otps_email_idx').on(t.email),
  }),
);

/**
 * Reviewer actions against a request — the review history + internal notes (employee-only; never
 * exposed on any public payload). Append-only in practice; one row per assign/note/decision.
 */
export const institutionRegistrationReviews = pgTable(
  'institution_registration_reviews',
  {
    id: primaryId(),
    requestId: uuid('request_id')
      .notNull()
      .references(() => institutionRegistrationRequests.id, { onDelete: 'cascade' }),
    reviewerId: uuid('reviewer_id').references(() => platformEmployees.id, { onDelete: 'set null' }),
    action: registrationReviewActionEnum('action').notNull(),
    fromStatus: text('from_status'),
    toStatus: text('to_status'),
    note: text('note'),
    rejectionReason: text('rejection_reason'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    requestIdx: index('reg_reviews_request_idx').on(t.requestId, t.createdAt),
  }),
);

/**
 * Future document uploads (government registration, business verification …). Table + RLS exist
 * now so the feature can be added without a migration; no upload endpoint is built yet.
 */
export const institutionRegistrationAttachments = pgTable(
  'institution_registration_attachments',
  {
    id: primaryId(),
    requestId: uuid('request_id')
      .notNull()
      .references(() => institutionRegistrationRequests.id, { onDelete: 'cascade' }),
    fileName: text('file_name').notNull(),
    contentType: text('content_type').notNull(),
    sizeBytes: integer('size_bytes').notNull().default(0),
    storageKey: text('storage_key').notNull(),
    kind: text('kind'),
    uploadedByEmployeeId: uuid('uploaded_by_employee_id').references(() => platformEmployees.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    requestIdx: index('reg_attachments_request_idx').on(t.requestId),
  }),
);

/**
 * Onboarding checklist generated when a request is approved (the "onboarding records"). The future
 * onboarding module drives these toward Go-Live; for now approval seeds a default checklist.
 */
export const institutionOnboardingTasks = pgTable(
  'institution_onboarding_tasks',
  {
    id: primaryId(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    label: text('label').notNull(),
    status: text('status').notNull().default('pending'),
    order: integer('order').notNull().default(0),
    ...timestamps,
  },
  (t) => ({
    instIdx: index('onboarding_tasks_institution_idx').on(t.institutionId),
  }),
);

export type InstitutionRegistrationRequest = typeof institutionRegistrationRequests.$inferSelect;
export type NewInstitutionRegistrationRequest = typeof institutionRegistrationRequests.$inferInsert;
export type InstitutionRegistrationOtp = typeof institutionRegistrationOtps.$inferSelect;
export type NewInstitutionRegistrationOtp = typeof institutionRegistrationOtps.$inferInsert;
export type InstitutionRegistrationReview = typeof institutionRegistrationReviews.$inferSelect;
export type NewInstitutionRegistrationReview = typeof institutionRegistrationReviews.$inferInsert;
export type InstitutionRegistrationAttachment =
  typeof institutionRegistrationAttachments.$inferSelect;
export type InstitutionOnboardingTask = typeof institutionOnboardingTasks.$inferSelect;
export type NewInstitutionOnboardingTask = typeof institutionOnboardingTasks.$inferInsert;
