import { sql } from 'drizzle-orm';
import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { actorColumns, primaryId, timestamps } from './_helpers';
import { institutions } from './institutions';
import { campuses } from './campuses';
import { students } from './people';
import { institutionUsers } from './users';

/**
 * PARENT-PORTAL wellbeing tables.
 *  - parent_health_profiles: parent-maintained health profile, versioned; edits notify the nurse who
 *    can mark it verified. Full history retained (a new version row per edit).
 *  - student_recognitions: staff-recorded merits/awards, always visible to guardians.
 *  - counseling_disclosures: the ONLY counseling surface a parent ever sees — created explicitly by a
 *    counselor. counseling_cases / counseling_records content is never queried by any parent endpoint.
 *
 * Behaviour incidents reuse the existing `student_incidents` (conduct) table — see conduct.ts.
 */

/** A versioned, parent-maintained health profile snapshot for one student. Latest version is authoritative. */
export const parentHealthProfiles = pgTable(
  'parent_health_profiles',
  {
    id: primaryId(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    campusId: uuid('campus_id').references(() => campuses.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    bloodGroup: text('blood_group'),
    /** [string]. */
    allergies: jsonb('allergies').$type<string[]>().notNull().default([]),
    chronicConditions: jsonb('chronic_conditions').$type<string[]>().notNull().default([]),
    /** [{name,dose,schedule}]. */
    currentMedications: jsonb('current_medications').$type<unknown[]>().notNull().default([]),
    dietaryRestrictions: text('dietary_restrictions'),
    doctorName: text('doctor_name'),
    doctorPhone: text('doctor_phone'),
    insuranceRef: text('insurance_ref'),
    /** [{name,date,docRef}]. */
    vaccinations: jsonb('vaccinations').$type<unknown[]>().notNull().default([]),
    /** Ordered [{name,relationship,phone}]. */
    emergencyContacts: jsonb('emergency_contacts').$type<unknown[]>().notNull().default([]),
    /** Nurse (institution_users) who verified this version. */
    lastVerifiedBy: uuid('last_verified_by').references(() => institutionUsers.id, {
      onDelete: 'set null',
    }),
    lastVerifiedAt: timestamp('last_verified_at', { withTimezone: true }),
    /** Monotonic per-student revision; the highest is the current profile (history retained). */
    revision: integer('revision').notNull().default(1),
    version: integer('version').notNull().default(0),
    ...actorColumns,
    ...timestamps,
  },
  (t) => ({
    studentIdx: index('parent_health_profiles_student_idx').on(t.studentId, t.revision),
    instIdx: index('parent_health_profiles_institution_idx').on(t.institutionId),
  }),
);

/** A student recognition (merit/award/certificate/badge). Always visible; celebrated in UI + digest. */
export const studentRecognitions = pgTable(
  'student_recognitions',
  {
    id: primaryId(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    campusId: uuid('campus_id').references(() => campuses.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    /** merit | award | certificate | badge | sports | arts | academics. */
    type: text('type').notNull().default('merit'),
    title: text('title').notNull(),
    description: text('description'),
    awardedAt: timestamp('awarded_at', { withTimezone: true }).notNull().defaultNow(),
    awardedBy: uuid('awarded_by').references(() => institutionUsers.id, { onDelete: 'set null' }),
    /** Optional linked certificate in student_documents. */
    certificateDocumentId: uuid('certificate_document_id'),
    version: integer('version').notNull().default(0),
    ...actorColumns,
    ...timestamps,
  },
  (t) => ({
    studentIdx: index('student_recognitions_student_idx').on(t.studentId, t.awardedAt),
    instIdx: index('student_recognitions_institution_idx').on(t.institutionId),
  }),
);

/** A counselor's explicit disclosure of contact availability to a student's guardians. */
export const counselingDisclosures = pgTable(
  'counseling_disclosures',
  {
    id: primaryId(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    campusId: uuid('campus_id').references(() => campuses.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    counselorUserId: uuid('counselor_user_id')
      .notNull()
      .references(() => institutionUsers.id, { onDelete: 'set null' }),
    counselorDisplayName: text('counselor_display_name').notNull(),
    contactNote: text('contact_note'),
    disclosedAt: timestamp('disclosed_at', { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    version: integer('version').notNull().default(0),
    ...actorColumns,
    ...timestamps,
  },
  (t) => ({
    studentIdx: index('counseling_disclosures_student_idx').on(t.studentId),
    /** At most one active (non-revoked) disclosure per student. */
    activeUniq: uniqueIndex('counseling_disclosure_active_uniq')
      .on(t.studentId)
      .where(sql`revoked_at is null`),
  }),
);

export type ParentHealthProfile = typeof parentHealthProfiles.$inferSelect;
export type NewParentHealthProfile = typeof parentHealthProfiles.$inferInsert;
export type StudentRecognition = typeof studentRecognitions.$inferSelect;
export type NewStudentRecognition = typeof studentRecognitions.$inferInsert;
export type CounselingDisclosure = typeof counselingDisclosures.$inferSelect;
export type NewCounselingDisclosure = typeof counselingDisclosures.$inferInsert;
