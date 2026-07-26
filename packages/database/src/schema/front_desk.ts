import { index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { actorColumns, primaryId, timestamps } from './_helpers';
import { institutions } from './institutions';
import { campuses } from './campuses';

/**
 * INSTITUTION-PORTAL front-desk module (Phase 13 — Receptionist). Campus-scoped, version-guarded.
 * `visitors` is the check-in/out log (also read by Security via visitors.view); `appointments` is
 * the front-desk appointment book.
 */
export const visitors = pgTable(
  'visitors',
  {
    id: primaryId(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    campusId: uuid('campus_id').references(() => campuses.id, { onDelete: 'cascade' }),
    fullName: text('full_name').notNull(),
    purpose: text('purpose'),
    host: text('host'),
    badgeNo: text('badge_no'),
    checkInAt: timestamp('check_in_at', { withTimezone: true }),
    checkOutAt: timestamp('check_out_at', { withTimezone: true }),
    /** checked_in | checked_out. */
    status: text('status').notNull().default('checked_in'),
    version: integer('version').notNull().default(0),
    ...actorColumns,
    ...timestamps,
  },
  (t) => ({
    instIdx: index('visitors_institution_idx').on(t.institutionId),
    scopeIdx: index('visitors_institution_campus_idx').on(t.institutionId, t.campusId),
    statusIdx: index('visitors_status_idx').on(t.status),
  }),
);

export const appointments = pgTable(
  'appointments',
  {
    id: primaryId(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    campusId: uuid('campus_id').references(() => campuses.id, { onDelete: 'cascade' }),
    visitorName: text('visitor_name').notNull(),
    withWhom: text('with_whom'),
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }),
    notes: text('notes'),
    /** scheduled | completed | cancelled | no_show. */
    status: text('status').notNull().default('scheduled'),
    version: integer('version').notNull().default(0),
    ...actorColumns,
    ...timestamps,
  },
  (t) => ({
    instIdx: index('appointments_institution_idx').on(t.institutionId),
    scopeIdx: index('appointments_institution_campus_idx').on(t.institutionId, t.campusId),
    statusIdx: index('appointments_status_idx').on(t.status),
  }),
);

export type Visitor = typeof visitors.$inferSelect;
export type NewVisitor = typeof visitors.$inferInsert;
export type Appointment = typeof appointments.$inferSelect;
export type NewAppointment = typeof appointments.$inferInsert;
