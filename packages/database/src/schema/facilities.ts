import { date, index, integer, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { actorColumns, primaryId, timestamps } from './_helpers';
import { institutions } from './institutions';
import { campuses } from './campuses';

/**
 * INSTITUTION-PORTAL facilities module (Phase 13 — Maintenance Staff). Campus-scoped,
 * version-guarded. `facilities` (buildings/rooms/utilities), `work_orders` (repair requests),
 * `maintenance_tasks` (recurring upkeep) and `facility_assets` (the assets.view directory).
 */
export const facilities = pgTable(
  'facilities',
  {
    id: primaryId(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    campusId: uuid('campus_id').references(() => campuses.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    /** building | room | utility | ground. */
    kind: text('kind').notNull().default('room'),
    location: text('location'),
    /** operational | maintenance | closed. */
    status: text('status').notNull().default('operational'),
    version: integer('version').notNull().default(0),
    ...actorColumns,
    ...timestamps,
  },
  (t) => ({
    instIdx: index('facilities_institution_idx').on(t.institutionId),
    scopeIdx: index('facilities_institution_campus_idx').on(t.institutionId, t.campusId),
    statusIdx: index('facilities_status_idx').on(t.status),
  }),
);

export const workOrders = pgTable(
  'work_orders',
  {
    id: primaryId(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    campusId: uuid('campus_id').references(() => campuses.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description'),
    /** low | medium | high. */
    priority: text('priority').notNull().default('medium'),
    assignedTo: text('assigned_to'),
    dueAt: date('due_at'),
    /** open | in_progress | done | cancelled. */
    status: text('status').notNull().default('open'),
    version: integer('version').notNull().default(0),
    ...actorColumns,
    ...timestamps,
  },
  (t) => ({
    instIdx: index('work_orders_institution_idx').on(t.institutionId),
    scopeIdx: index('work_orders_institution_campus_idx').on(t.institutionId, t.campusId),
    statusIdx: index('work_orders_status_idx').on(t.status),
  }),
);

export const maintenanceTasks = pgTable(
  'maintenance_tasks',
  {
    id: primaryId(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    campusId: uuid('campus_id').references(() => campuses.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    /** daily | weekly | monthly | quarterly | annual. */
    frequency: text('frequency').notNull().default('monthly'),
    nextDueAt: date('next_due_at'),
    notes: text('notes'),
    /** pending | done. */
    status: text('status').notNull().default('pending'),
    version: integer('version').notNull().default(0),
    ...actorColumns,
    ...timestamps,
  },
  (t) => ({
    instIdx: index('maintenance_tasks_institution_idx').on(t.institutionId),
    scopeIdx: index('maintenance_tasks_institution_campus_idx').on(t.institutionId, t.campusId),
    statusIdx: index('maintenance_tasks_status_idx').on(t.status),
  }),
);

export const facilityAssets = pgTable(
  'facility_assets',
  {
    id: primaryId(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    campusId: uuid('campus_id').references(() => campuses.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    category: text('category'),
    location: text('location'),
    /** active | retired. */
    status: text('status').notNull().default('active'),
    version: integer('version').notNull().default(0),
    ...actorColumns,
    ...timestamps,
  },
  (t) => ({
    instIdx: index('facility_assets_institution_idx').on(t.institutionId),
    scopeIdx: index('facility_assets_institution_campus_idx').on(t.institutionId, t.campusId),
    statusIdx: index('facility_assets_status_idx').on(t.status),
  }),
);

export type Facility = typeof facilities.$inferSelect;
export type NewFacility = typeof facilities.$inferInsert;
export type WorkOrder = typeof workOrders.$inferSelect;
export type NewWorkOrder = typeof workOrders.$inferInsert;
export type MaintenanceTask = typeof maintenanceTasks.$inferSelect;
export type NewMaintenanceTask = typeof maintenanceTasks.$inferInsert;
export type FacilityAsset = typeof facilityAssets.$inferSelect;
export type NewFacilityAsset = typeof facilityAssets.$inferInsert;
