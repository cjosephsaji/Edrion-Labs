import { index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { actorColumns, primaryId, timestamps } from './_helpers';
import { institutions } from './institutions';
import { campuses } from './campuses';
import { students } from './people';

/**
 * INSTITUTION-PORTAL security module (Phase 13 — Security Staff). Campus-scoped, version-guarded.
 * `gate_passes`, `security_incidents` (sensitive write), `emergency_alerts` and the read-only-ish
 * `campus_access_logs` (gate in/out feed).
 */
export const gatePasses = pgTable(
  'gate_passes',
  {
    id: primaryId(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    campusId: uuid('campus_id').references(() => campuses.id, { onDelete: 'cascade' }),
    holderName: text('holder_name').notNull(),
    /** visitor | student | staff | vehicle. */
    kind: text('kind').notNull().default('visitor'),
    reason: text('reason'),
    issuedAt: timestamp('issued_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    /** active | used | expired | revoked. */
    status: text('status').notNull().default('active'),
    holderStudentId: uuid('holder_student_id').references(() => students.id, { onDelete: 'set null' }),
    requestId: uuid('request_id'),
    expectedReturnAt: timestamp('expected_return_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    revokedBy: uuid('revoked_by'),
    revokeReason: text('revoke_reason'),
    direction: text('direction').default('outgoing'),
    version: integer('version').notNull().default(0),
    ...actorColumns,
    ...timestamps,
  },
  (t) => ({
    instIdx: index('gate_passes_institution_idx').on(t.institutionId),
    scopeIdx: index('gate_passes_institution_campus_idx').on(t.institutionId, t.campusId),
    statusIdx: index('gate_passes_status_idx').on(t.status),
  }),
);

export const securityIncidents = pgTable(
  'security_incidents',
  {
    id: primaryId(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    campusId: uuid('campus_id').references(() => campuses.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description'),
    /** low | medium | high. */
    severity: text('severity').notNull().default('low'),
    location: text('location'),
    occurredAt: timestamp('occurred_at', { withTimezone: true }),
    /** open | investigating | resolved. */
    status: text('status').notNull().default('open'),
    version: integer('version').notNull().default(0),
    ...actorColumns,
    ...timestamps,
  },
  (t) => ({
    instIdx: index('security_incidents_institution_idx').on(t.institutionId),
    scopeIdx: index('security_incidents_institution_campus_idx').on(t.institutionId, t.campusId),
    statusIdx: index('security_incidents_status_idx').on(t.status),
  }),
);

export const emergencyAlerts = pgTable(
  'emergency_alerts',
  {
    id: primaryId(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    campusId: uuid('campus_id').references(() => campuses.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    message: text('message'),
    /** info | warning | critical. */
    level: text('level').notNull().default('info'),
    raisedAt: timestamp('raised_at', { withTimezone: true }),
    /** active | resolved. */
    status: text('status').notNull().default('active'),
    version: integer('version').notNull().default(0),
    ...actorColumns,
    ...timestamps,
  },
  (t) => ({
    instIdx: index('emergency_alerts_institution_idx').on(t.institutionId),
    scopeIdx: index('emergency_alerts_institution_campus_idx').on(t.institutionId, t.campusId),
    statusIdx: index('emergency_alerts_status_idx').on(t.status),
  }),
);

export const campusAccessLogs = pgTable(
  'campus_access_logs',
  {
    id: primaryId(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    campusId: uuid('campus_id').references(() => campuses.id, { onDelete: 'cascade' }),
    subjectName: text('subject_name').notNull(),
    /** in | out. */
    direction: text('direction').notNull().default('in'),
    gate: text('gate'),
    /** badge | manual. */
    method: text('method').notNull().default('badge'),
    occurredAt: timestamp('occurred_at', { withTimezone: true }),
    /** recorded | flagged. */
    status: text('status').notNull().default('recorded'),
    version: integer('version').notNull().default(0),
    ...actorColumns,
    ...timestamps,
  },
  (t) => ({
    instIdx: index('campus_access_logs_institution_idx').on(t.institutionId),
    scopeIdx: index('campus_access_logs_institution_campus_idx').on(t.institutionId, t.campusId),
    statusIdx: index('campus_access_logs_status_idx').on(t.status),
  }),
);

export type GatePass = typeof gatePasses.$inferSelect;
export type NewGatePass = typeof gatePasses.$inferInsert;
export type SecurityIncident = typeof securityIncidents.$inferSelect;
export type NewSecurityIncident = typeof securityIncidents.$inferInsert;
export type EmergencyAlert = typeof emergencyAlerts.$inferSelect;
export type NewEmergencyAlert = typeof emergencyAlerts.$inferInsert;
export type CampusAccessLog = typeof campusAccessLogs.$inferSelect;
export type NewCampusAccessLog = typeof campusAccessLogs.$inferInsert;
