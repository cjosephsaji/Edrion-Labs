import { index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { actorColumns, primaryId, timestamps } from './_helpers';
import { institutions } from './institutions';
import { campuses } from './campuses';

/**
 * INSTITUTION-PORTAL labs module (Phase 13 — Lab Staff). Campus-scoped, version-guarded. A single
 * `lab_assets` table covers inventory, equipment and consumables via a `kind` discriminator;
 * schedules and incidents are separate flat tables.
 */
export const labAssets = pgTable(
  'lab_assets',
  {
    id: primaryId(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    campusId: uuid('campus_id').references(() => campuses.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    /** inventory | equipment | consumable. */
    kind: text('kind').notNull().default('equipment'),
    quantity: integer('quantity').notNull().default(0),
    unit: text('unit'),
    location: text('location'),
    /** available | in_use | maintenance | retired. */
    status: text('status').notNull().default('available'),
    version: integer('version').notNull().default(0),
    ...actorColumns,
    ...timestamps,
  },
  (t) => ({
    instIdx: index('lab_assets_institution_idx').on(t.institutionId),
    scopeIdx: index('lab_assets_institution_campus_idx').on(t.institutionId, t.campusId),
    statusIdx: index('lab_assets_status_idx').on(t.status),
  }),
);

export const labSchedules = pgTable(
  'lab_schedules',
  {
    id: primaryId(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    campusId: uuid('campus_id').references(() => campuses.id, { onDelete: 'cascade' }),
    labName: text('lab_name').notNull(),
    title: text('title').notNull(),
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }),
    durationMinutes: integer('duration_minutes'),
    /** scheduled | completed | cancelled. */
    status: text('status').notNull().default('scheduled'),
    version: integer('version').notNull().default(0),
    ...actorColumns,
    ...timestamps,
  },
  (t) => ({
    instIdx: index('lab_schedules_institution_idx').on(t.institutionId),
    scopeIdx: index('lab_schedules_institution_campus_idx').on(t.institutionId, t.campusId),
    statusIdx: index('lab_schedules_status_idx').on(t.status),
  }),
);

export const labIncidents = pgTable(
  'lab_incidents',
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
    occurredAt: timestamp('occurred_at', { withTimezone: true }),
    /** open | resolved. */
    status: text('status').notNull().default('open'),
    version: integer('version').notNull().default(0),
    ...actorColumns,
    ...timestamps,
  },
  (t) => ({
    instIdx: index('lab_incidents_institution_idx').on(t.institutionId),
    scopeIdx: index('lab_incidents_institution_campus_idx').on(t.institutionId, t.campusId),
    statusIdx: index('lab_incidents_status_idx').on(t.status),
  }),
);

export type LabAsset = typeof labAssets.$inferSelect;
export type NewLabAsset = typeof labAssets.$inferInsert;
export type LabSchedule = typeof labSchedules.$inferSelect;
export type NewLabSchedule = typeof labSchedules.$inferInsert;
export type LabIncident = typeof labIncidents.$inferSelect;
export type NewLabIncident = typeof labIncidents.$inferInsert;
