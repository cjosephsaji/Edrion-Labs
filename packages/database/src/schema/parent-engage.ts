import { sql } from 'drizzle-orm';
import { date, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { actorColumns, primaryId, timestamps } from './_helpers';
import { institutions } from './institutions';
import { campuses } from './campuses';
import { students } from './people';
import { staff } from './people';
import { institutionUsers } from './users';

/**
 * PARENT-PORTAL engagement tables: consent forms, parent-teacher meetings (PTM) and absence notes.
 * Consent responses use an append-only supersede pattern (never UPDATE a response). PTM bookings are
 * capacity-safe (SELECT ... FOR UPDATE at the service layer). Absence notes auto-link to attendance
 * on acknowledgement.
 */

/** A consent request to guardians (photo/media, trip, medical-treatment, custom). */
export const parentConsentForms = pgTable(
  'parent_consent_forms',
  {
    id: primaryId(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    campusId: uuid('campus_id').references(() => campuses.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description'),
    /** photo_media | trip | medical_treatment | custom. */
    consentType: text('consent_type').notNull().default('custom'),
    audienceScope: text('audience_scope').notNull().default('institution'),
    audienceRefId: uuid('audience_ref_id'),
    /** [{value,label}] response options; defaults to yes/no when empty. */
    options: jsonb('options').$type<unknown[]>().notNull().default([]),
    dueAt: timestamp('due_at', { withTimezone: true }),
    /** draft | published | closed. */
    status: text('status').notNull().default('draft'),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    version: integer('version').notNull().default(0),
    ...actorColumns,
    ...timestamps,
  },
  (t) => ({
    instIdx: index('parent_consent_forms_institution_idx').on(t.institutionId),
    statusIdx: index('parent_consent_forms_status_idx').on(t.institutionId, t.status),
  }),
);

/** A guardian's consent response for one student. Append-only: a new row supersedes the prior one. */
export const parentConsentResponses = pgTable(
  'parent_consent_responses',
  {
    id: primaryId(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    consentFormId: uuid('consent_form_id')
      .notNull()
      .references(() => parentConsentForms.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    guardianUserId: uuid('guardian_user_id')
      .notNull()
      .references(() => institutionUsers.id, { onDelete: 'cascade' }),
    /** The chosen option value (e.g. "yes" | "no" | custom option value). */
    response: text('response').notNull(),
    note: text('note'),
    respondedAt: timestamp('responded_at', { withTimezone: true }).notNull().defaultNow(),
    /** Set on the prior row when this guardian re-responds (supersede pattern). */
    supersededAt: timestamp('superseded_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => ({
    formIdx: index('parent_consent_responses_form_idx').on(t.consentFormId),
    activeIdx: index('parent_consent_responses_active_idx').on(
      t.consentFormId,
      t.studentId,
      t.supersededAt,
    ),
  }),
);

/** A parent-teacher meeting event: a window across which slots are generated per teacher. */
export const parentPtmEvents = pgTable(
  'parent_ptm_events',
  {
    id: primaryId(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    campusId: uuid('campus_id').references(() => campuses.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description'),
    startsOn: date('starts_on'),
    endsOn: date('ends_on'),
    /** minutes per slot. */
    slotLengthMinutes: integer('slot_length_minutes').notNull().default(15),
    /** draft | published | closed. */
    status: text('status').notNull().default('draft'),
    version: integer('version').notNull().default(0),
    ...actorColumns,
    ...timestamps,
  },
  (t) => ({
    instIdx: index('parent_ptm_events_institution_idx').on(t.institutionId),
    statusIdx: index('parent_ptm_events_status_idx').on(t.institutionId, t.status),
  }),
);

/** A bookable PTM slot for one teacher at a specific time. */
export const parentPtmSlots = pgTable(
  'parent_ptm_slots',
  {
    id: primaryId(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    eventId: uuid('event_id')
      .notNull()
      .references(() => parentPtmEvents.id, { onDelete: 'cascade' }),
    teacherId: uuid('teacher_id')
      .notNull()
      .references(() => staff.id, { onDelete: 'cascade' }),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    /** Bookable capacity (usually 1). */
    capacity: integer('capacity').notNull().default(1),
    bookedCount: integer('booked_count').notNull().default(0),
    version: integer('version').notNull().default(0),
    ...actorColumns,
    ...timestamps,
  },
  (t) => ({
    eventIdx: index('parent_ptm_slots_event_idx').on(t.eventId),
    teacherIdx: index('parent_ptm_slots_teacher_idx').on(t.teacherId, t.startsAt),
  }),
);

/** A guardian's booking of a PTM slot for one student. One active booking per (event, student). */
export const parentPtmBookings = pgTable(
  'parent_ptm_bookings',
  {
    id: primaryId(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    eventId: uuid('event_id')
      .notNull()
      .references(() => parentPtmEvents.id, { onDelete: 'cascade' }),
    slotId: uuid('slot_id')
      .notNull()
      .references(() => parentPtmSlots.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    guardianUserId: uuid('guardian_user_id')
      .notNull()
      .references(() => institutionUsers.id, { onDelete: 'cascade' }),
    /** booked | cancelled | attended | no_show. */
    status: text('status').notNull().default('booked'),
    note: text('note'),
    version: integer('version').notNull().default(0),
    ...actorColumns,
    ...timestamps,
  },
  (t) => ({
    eventIdx: index('parent_ptm_bookings_event_idx').on(t.eventId),
    slotIdx: index('parent_ptm_bookings_slot_idx').on(t.slotId),
    /** At most one active (booked) booking per (event, student) — enforced by a partial unique index. */
    activeUniq: uniqueIndex('parent_ptm_booking_active_uniq')
      .on(t.eventId, t.studentId)
      .where(sql`status = 'booked'`),
  }),
);

/** A guardian-submitted absence note for a student. Links to attendance when acknowledged. */
export const parentAbsenceNotes = pgTable(
  'parent_absence_notes',
  {
    id: primaryId(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    campusId: uuid('campus_id').references(() => campuses.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    guardianUserId: uuid('guardian_user_id')
      .notNull()
      .references(() => institutionUsers.id, { onDelete: 'cascade' }),
    dateFrom: date('date_from').notNull(),
    dateTo: date('date_to').notNull(),
    /** illness | family | travel | other. */
    reasonCategory: text('reason_category').notNull().default('other'),
    note: text('note'),
    /** {name,url,storageKey,contentType,bytes} | null. */
    attachment: jsonb('attachment').$type<unknown>(),
    /** submitted | acknowledged | rejected. */
    status: text('status').notNull().default('submitted'),
    reviewedBy: uuid('reviewed_by').references(() => institutionUsers.id, { onDelete: 'set null' }),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    reviewNote: text('review_note'),
    version: integer('version').notNull().default(0),
    ...actorColumns,
    ...timestamps,
  },
  (t) => ({
    instIdx: index('parent_absence_notes_institution_idx').on(t.institutionId),
    studentIdx: index('parent_absence_notes_student_idx').on(t.studentId),
    statusIdx: index('parent_absence_notes_status_idx').on(t.institutionId, t.status),
  }),
);

export type ParentConsentForm = typeof parentConsentForms.$inferSelect;
export type NewParentConsentForm = typeof parentConsentForms.$inferInsert;
export type ParentConsentResponse = typeof parentConsentResponses.$inferSelect;
export type NewParentConsentResponse = typeof parentConsentResponses.$inferInsert;
export type ParentPtmEvent = typeof parentPtmEvents.$inferSelect;
export type NewParentPtmEvent = typeof parentPtmEvents.$inferInsert;
export type ParentPtmSlot = typeof parentPtmSlots.$inferSelect;
export type NewParentPtmSlot = typeof parentPtmSlots.$inferInsert;
export type ParentPtmBooking = typeof parentPtmBookings.$inferSelect;
export type NewParentPtmBooking = typeof parentPtmBookings.$inferInsert;
export type ParentAbsenceNote = typeof parentAbsenceNotes.$inferSelect;
export type NewParentAbsenceNote = typeof parentAbsenceNotes.$inferInsert;
