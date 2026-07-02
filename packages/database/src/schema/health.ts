import { boolean, date, index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { actorColumns, primaryId, timestamps } from './_helpers';
import { institutions } from './institutions';
import { campuses } from './campuses';
import { students } from './people';

/**
 * INSTITUTION-PORTAL health module (Phase 13 — School Nurse). Three flat, campus-scoped,
 * version-guarded tables following the same tenant convention as the rest of the portal. Medical
 * data is sensitive: every write is gated by a sensitive permission key + audited at the service
 * layer. `student_id` optionally links a record to a student (set null if the student is removed).
 */
export const healthRecords = pgTable(
  'health_records',
  {
    id: primaryId(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    campusId: uuid('campus_id').references(() => campuses.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id').references(() => students.id, { onDelete: 'set null' }),
    /** allergy | condition | vaccination | note | visit. */
    recordType: text('record_type').notNull().default('note'),
    title: text('title').notNull(),
    details: text('details'),
    bloodGroup: text('blood_group'),
    /** Redesign (P2): clinical context so a record reads as a real nurse visit, not an id. */
    reason: text('reason'),
    symptoms: text('symptoms'),
    actionTaken: text('action_taken'),
    treatment: text('treatment'),
    /** Who attended the student (free-text name/role; a formal staff FK can layer on later). */
    attendedBy: text('attended_by'),
    followUpRequired: boolean('follow_up_required').notNull().default(false),
    followUpAt: date('follow_up_at'),
    /** active | resolved | archived. */
    status: text('status').notNull().default('active'),
    recordedAt: date('recorded_at'),
    version: integer('version').notNull().default(0),
    ...actorColumns,
    ...timestamps,
  },
  (t) => ({
    instIdx: index('health_records_institution_idx').on(t.institutionId),
    scopeIdx: index('health_records_institution_campus_idx').on(t.institutionId, t.campusId),
    statusIdx: index('health_records_status_idx').on(t.status),
  }),
);

export const medicalIncidents = pgTable(
  'medical_incidents',
  {
    id: primaryId(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    campusId: uuid('campus_id').references(() => campuses.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id').references(() => students.id, { onDelete: 'set null' }),
    title: text('title').notNull(),
    description: text('description'),
    /** low | medium | high. */
    severity: text('severity').notNull().default('low'),
    location: text('location'),
    /** Redesign (P2): what was done + by whom + follow-up, so an incident is legible at a glance. */
    actionTaken: text('action_taken'),
    treatment: text('treatment'),
    attendedBy: text('attended_by'),
    followUpRequired: boolean('follow_up_required').notNull().default(false),
    followUpAt: date('follow_up_at'),
    occurredAt: timestamp('occurred_at', { withTimezone: true }),
    /** open | resolved. */
    status: text('status').notNull().default('open'),
    version: integer('version').notNull().default(0),
    ...actorColumns,
    ...timestamps,
  },
  (t) => ({
    instIdx: index('medical_incidents_institution_idx').on(t.institutionId),
    scopeIdx: index('medical_incidents_institution_campus_idx').on(t.institutionId, t.campusId),
    statusIdx: index('medical_incidents_status_idx').on(t.status),
  }),
);

export const medicationLogs = pgTable(
  'medication_logs',
  {
    id: primaryId(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    campusId: uuid('campus_id').references(() => campuses.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id').references(() => students.id, { onDelete: 'set null' }),
    medication: text('medication').notNull(),
    dosage: text('dosage'),
    administeredAt: timestamp('administered_at', { withTimezone: true }),
    /** Redesign (P2): who gave the dose (free-text name/role). */
    administeredBy: text('administered_by'),
    notes: text('notes'),
    /** administered | scheduled | missed. */
    status: text('status').notNull().default('administered'),
    version: integer('version').notNull().default(0),
    ...actorColumns,
    ...timestamps,
  },
  (t) => ({
    instIdx: index('medication_logs_institution_idx').on(t.institutionId),
    scopeIdx: index('medication_logs_institution_campus_idx').on(t.institutionId, t.campusId),
    statusIdx: index('medication_logs_status_idx').on(t.status),
  }),
);

export type HealthRecord = typeof healthRecords.$inferSelect;
export type NewHealthRecord = typeof healthRecords.$inferInsert;
export type MedicalIncident = typeof medicalIncidents.$inferSelect;
export type NewMedicalIncident = typeof medicalIncidents.$inferInsert;
export type MedicationLog = typeof medicationLogs.$inferSelect;
export type NewMedicationLog = typeof medicationLogs.$inferInsert;
