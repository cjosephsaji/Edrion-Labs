import { date, index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { actorColumns, primaryId, timestamps } from './_helpers';
import { institutions } from './institutions';
import { campuses } from './campuses';
import { students } from './people';
import { institutionUsers } from './users';

/**
 * PARENT-PORTAL safety / gate / transport tables.
 *  - pickup_authorizations: parent-managed list of who may collect the ward (school-verified).
 *  - early_leave_requests: parent-initiated; approval creates a gate_passes row (bridge in service).
 *  - gate_exit_events: append-only campus exit/entry feed; drives the "ward exited campus" alert.
 *  - transport_incidents: delays/breakdowns fanned out to guardians on the route.
 *  - hostel_outing_requests: boarder outing/leave/visit requests, warden-approved.
 *
 * route_id / vehicle_id are plain uuid columns with FK constraints added by hand in the migration
 * (to keep this leaf file decoupled from transport.ts), mirroring the people→academics FK convention.
 */

/** A person a guardian authorizes to collect their ward. New/edited entries need school verification. */
export const pickupAuthorizations = pgTable(
  'pickup_authorizations',
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
    personName: text('person_name').notNull(),
    relationship: text('relationship'),
    phone: text('phone'),
    /** student_documents ids (photo + id proof). */
    photoDocumentId: uuid('photo_document_id'),
    idProofDocumentId: uuid('id_proof_document_id'),
    /** active | revoked | pending_school_verification. */
    status: text('status').notNull().default('pending_school_verification'),
    validUntil: date('valid_until'),
    verifiedBy: uuid('verified_by').references(() => institutionUsers.id, { onDelete: 'set null' }),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    version: integer('version').notNull().default(0),
    ...actorColumns,
    ...timestamps,
  },
  (t) => ({
    studentIdx: index('pickup_authorizations_student_idx').on(t.studentId),
    statusIdx: index('pickup_authorizations_status_idx').on(t.institutionId, t.status),
  }),
);

/** A parent request to collect the ward early on a given day. Approval generates a gate pass. */
export const earlyLeaveRequests = pgTable(
  'early_leave_requests',
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
    leaveDate: date('leave_date').notNull(),
    /** "HH:MM" 24-hour. */
    leaveTime: text('leave_time'),
    reason: text('reason'),
    pickupAuthorizationId: uuid('pickup_authorization_id').references(() => pickupAuthorizations.id, {
      onDelete: 'set null',
    }),
    /** requested | approved | denied | completed. */
    status: text('status').notNull().default('requested'),
    /** Generated gate pass id on approval (bridge to gate_passes). */
    gatePassId: uuid('gate_pass_id'),
    decidedBy: uuid('decided_by').references(() => institutionUsers.id, { onDelete: 'set null' }),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    decisionNote: text('decision_note'),
    version: integer('version').notNull().default(0),
    ...actorColumns,
    ...timestamps,
  },
  (t) => ({
    studentIdx: index('early_leave_requests_student_idx').on(t.studentId),
    statusIdx: index('early_leave_requests_status_idx').on(t.institutionId, t.status),
  }),
);

/** Append-only campus exit/entry feed for a student. Drives the immediate "ward exited" alert. */
export const gateExitEvents = pgTable(
  'gate_exit_events',
  {
    id: primaryId(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    campusId: uuid('campus_id').references(() => campuses.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    /** exit | entry | early_leave | late_arrival. */
    type: text('type').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
    recordedBy: uuid('recorded_by').references(() => institutionUsers.id, { onDelete: 'set null' }),
    pickupPerson: text('pickup_person'),
    ...timestamps,
  },
  (t) => ({
    studentIdx: index('gate_exit_events_student_idx').on(t.studentId, t.occurredAt),
    instIdx: index('gate_exit_events_institution_idx').on(t.institutionId, t.occurredAt),
  }),
);

/** A transport disruption on a route. Fanned out to guardians of students assigned to the route. */
export const transportIncidents = pgTable(
  'transport_incidents',
  {
    id: primaryId(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    campusId: uuid('campus_id').references(() => campuses.id, { onDelete: 'cascade' }),
    /** FK to transport_routes(id) — added by hand in the migration. */
    routeId: uuid('route_id').notNull(),
    /** FK to transport_vehicles(id) — added by hand in the migration. */
    vehicleId: uuid('vehicle_id'),
    /** delay | breakdown | route_change | safety. */
    type: text('type').notNull().default('delay'),
    description: text('description'),
    affectsDate: date('affects_date'),
    /** open | resolved. */
    status: text('status').notNull().default('open'),
    recordedBy: uuid('recorded_by').references(() => institutionUsers.id, { onDelete: 'set null' }),
    version: integer('version').notNull().default(0),
    ...actorColumns,
    ...timestamps,
  },
  (t) => ({
    routeIdx: index('transport_incidents_route_idx').on(t.routeId, t.affectsDate),
    instIdx: index('transport_incidents_institution_idx').on(t.institutionId, t.status),
  }),
);

/** A boarder outing / leave / guardian-visit request, warden-approved. */
export const hostelOutingRequests = pgTable(
  'hostel_outing_requests',
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
    /** outing | leave | guardian_visit. */
    type: text('type').notNull().default('outing'),
    fromAt: timestamp('from_at', { withTimezone: true }).notNull(),
    toAt: timestamp('to_at', { withTimezone: true }).notNull(),
    reason: text('reason'),
    /** requested | approved | denied | out | returned. */
    status: text('status').notNull().default('requested'),
    decidedBy: uuid('decided_by').references(() => institutionUsers.id, { onDelete: 'set null' }),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    decisionNote: text('decision_note'),
    version: integer('version').notNull().default(0),
    ...actorColumns,
    ...timestamps,
  },
  (t) => ({
    studentIdx: index('hostel_outing_requests_student_idx').on(t.studentId),
    statusIdx: index('hostel_outing_requests_status_idx').on(t.institutionId, t.status),
  }),
);

export type PickupAuthorization = typeof pickupAuthorizations.$inferSelect;
export type NewPickupAuthorization = typeof pickupAuthorizations.$inferInsert;
export type EarlyLeaveRequest = typeof earlyLeaveRequests.$inferSelect;
export type NewEarlyLeaveRequest = typeof earlyLeaveRequests.$inferInsert;
export type GateExitEvent = typeof gateExitEvents.$inferSelect;
export type NewGateExitEvent = typeof gateExitEvents.$inferInsert;
export type TransportIncident = typeof transportIncidents.$inferSelect;
export type NewTransportIncident = typeof transportIncidents.$inferInsert;
export type HostelOutingRequest = typeof hostelOutingRequests.$inferSelect;
export type NewHostelOutingRequest = typeof hostelOutingRequests.$inferInsert;
