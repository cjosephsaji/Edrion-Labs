import { index, integer, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { actorColumns, primaryId, timestamps } from './_helpers';
import { institutions } from './institutions';
import { campuses } from './campuses';
import { students } from './people';

/**
 * INSTITUTION-PORTAL transport (Phase 8). Two campus-scoped catalogue tables + a per-student join:
 *   - transport_routes: a named route with an optional fare, campus-scoped + version-guarded.
 *   - transport_vehicles: a vehicle, optionally assigned to a route, campus-scoped + version-guarded.
 *   - transport_assignments: a student's assignment to a route. No campus column of its own — it
 *     inherits the route's campus and is only reachable through a route the caller can see (mirrors
 *     fee_payments / exam_schedules). One assignment per (route, student); Students are the FK target.
 *
 * Same tenant convention. academics/people are referenced forward-only, so plain `.references()` is
 * safe (no Drizzle type cycle). Money (fare) is a whole-number integer in MINOR units.
 */
export const transportRoutes = pgTable(
  'transport_routes',
  {
    id: primaryId(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    campusId: uuid('campus_id').references(() => campuses.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    code: text('code'),
    description: text('description'),
    /** Fare per student, minor units. */
    fare: integer('fare').notNull().default(0),
    /** active | inactive. */
    status: text('status').notNull().default('active'),
    version: integer('version').notNull().default(0),
    ...actorColumns,
    ...timestamps,
  },
  (t) => ({
    instIdx: index('transport_routes_institution_idx').on(t.institutionId),
    scopeIdx: index('transport_routes_institution_campus_idx').on(t.institutionId, t.campusId),
    statusIdx: index('transport_routes_status_idx').on(t.status),
  }),
);

/** A transport vehicle, optionally serving a route. */
export const transportVehicles = pgTable(
  'transport_vehicles',
  {
    id: primaryId(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    campusId: uuid('campus_id').references(() => campuses.id, { onDelete: 'cascade' }),
    registrationNo: text('registration_no').notNull(),
    model: text('model'),
    capacity: integer('capacity').notNull().default(0),
    routeId: uuid('route_id').references(() => transportRoutes.id, { onDelete: 'set null' }),
    driverName: text('driver_name'),
    driverPhone: text('driver_phone'),
    /** active | maintenance | inactive. */
    status: text('status').notNull().default('active'),
    version: integer('version').notNull().default(0),
    ...actorColumns,
    ...timestamps,
  },
  (t) => ({
    instIdx: index('transport_vehicles_institution_idx').on(t.institutionId),
    scopeIdx: index('transport_vehicles_institution_campus_idx').on(t.institutionId, t.campusId),
    routeIdx: index('transport_vehicles_route_idx').on(t.routeId),
    statusIdx: index('transport_vehicles_status_idx').on(t.status),
  }),
);

/** A student's assignment to a route. Inherits the route's campus (no campus column of its own). */
export const transportAssignments = pgTable(
  'transport_assignments',
  {
    id: primaryId(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    routeId: uuid('route_id')
      .notNull()
      .references(() => transportRoutes.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    stopName: text('stop_name'),
    /** HH:MM pickup / drop times (free-text, validated in zod). */
    pickupTime: text('pickup_time'),
    dropTime: text('drop_time'),
    /** active | inactive. */
    status: text('status').notNull().default('active'),
    notes: text('notes'),
    version: integer('version').notNull().default(0),
    ...actorColumns,
    ...timestamps,
  },
  (t) => ({
    instIdx: index('transport_assignments_institution_idx').on(t.institutionId),
    routeIdx: index('transport_assignments_route_idx').on(t.routeId),
    studentIdx: index('transport_assignments_student_idx').on(t.studentId),
    uniq: uniqueIndex('transport_assignment_uniq').on(t.routeId, t.studentId),
  }),
);

export type TransportRoute = typeof transportRoutes.$inferSelect;
export type NewTransportRoute = typeof transportRoutes.$inferInsert;
export type TransportVehicle = typeof transportVehicles.$inferSelect;
export type NewTransportVehicle = typeof transportVehicles.$inferInsert;
export type TransportAssignment = typeof transportAssignments.$inferSelect;
export type NewTransportAssignment = typeof transportAssignments.$inferInsert;
