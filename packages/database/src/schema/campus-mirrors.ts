import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  date,
} from 'drizzle-orm/pg-core';
import { primaryId, timestamps } from './_helpers';
import { institutions } from './institutions';
import { campuses } from './campuses';
import { students } from './people';
import { studentRequests } from './requests';
import { libraryBooks, libraryLoans } from './library';
import { documentRenders } from './doc-gen';

export const studentRequestGates = pgTable(
  'student_request_gates',
  {
    id: primaryId(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    requestId: uuid('request_id')
      .notNull()
      .references(() => studentRequests.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    status: text('status').notNull().default('pending'),
    config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
    clearedAt: timestamp('cleared_at', { withTimezone: true }),
    clearedBy: uuid('cleared_by'),
    rejectedAt: timestamp('rejected_at', { withTimezone: true }),
    rejectedReason: text('rejected_reason'),
    waivedAt: timestamp('waived_at', { withTimezone: true }),
    waivedBy: uuid('waived_by'),
    version: integer('version').notNull().default(1),
    ...timestamps,
  },
  (t) => ({
    pendingIdx: index('student_request_gates_pending_idx').on(t.institutionId, t.status),
    requestKindUq: uniqueIndex('student_request_gates_request_kind_uq').on(t.requestId, t.kind),
  }),
);

export const libraryHolds = pgTable('library_holds', {
  id: primaryId(),
  institutionId: uuid('institution_id')
    .notNull()
    .references(() => institutions.id, { onDelete: 'cascade' }),
  campusId: uuid('campus_id')
    .notNull()
    .references(() => campuses.id, { onDelete: 'cascade' }),
  studentId: uuid('student_id')
    .notNull()
    .references(() => students.id, { onDelete: 'cascade' }),
  bookId: uuid('book_id')
    .notNull()
    .references(() => libraryBooks.id, { onDelete: 'cascade' }),
  status: text('status').notNull().default('active'),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  fulfilledLoanId: uuid('fulfilled_loan_id').references(() => libraryLoans.id, { onDelete: 'set null' }),
  cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
  version: integer('version').notNull().default(1),
  ...timestamps,
});

export const transportTripBroadcasts = pgTable('transport_trip_broadcasts', {
  id: primaryId(),
  institutionId: uuid('institution_id')
    .notNull()
    .references(() => institutions.id, { onDelete: 'cascade' }),
  campusId: uuid('campus_id').references(() => campuses.id, { onDelete: 'set null' }),
  routeId: uuid('route_id'),
  vehicleId: uuid('vehicle_id'),
  message: text('message').notNull(),
  sentAt: timestamp('sent_at', { withTimezone: true }).notNull().defaultNow(),
  sentBy: uuid('sent_by'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const studentIdCards = pgTable('student_id_cards', {
  id: primaryId(),
  institutionId: uuid('institution_id')
    .notNull()
    .references(() => institutions.id, { onDelete: 'cascade' }),
  campusId: uuid('campus_id').references(() => campuses.id, { onDelete: 'set null' }),
  studentId: uuid('student_id')
    .notNull()
    .references(() => students.id, { onDelete: 'cascade' }),
  documentRenderId: uuid('document_render_id').references(() => documentRenders.id, { onDelete: 'set null' }),
  status: text('status').notNull().default('active'),
  tokenVersion: integer('token_version').notNull().default(1),
  issuedAt: timestamp('issued_at', { withTimezone: true }).notNull().defaultNow(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  version: integer('version').notNull().default(1),
  ...timestamps,
});

export const identityScanAudit = pgTable(
  'identity_scan_audit',
  {
    id: primaryId(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id').references(() => students.id, { onDelete: 'set null' }),
    scanNonce: text('scan_nonce').notNull(),
    result: text('result').notNull(),
    contextKind: text('context_kind').notNull(),
    deviceId: text('device_id'),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    nonceUq: uniqueIndex('identity_scan_audit_nonce_uq').on(t.institutionId, t.scanNonce),
  }),
);

export const hostelMessMenus = pgTable('hostel_mess_menus', {
  id: primaryId(),
  institutionId: uuid('institution_id')
    .notNull()
    .references(() => institutions.id, { onDelete: 'cascade' }),
  campusId: uuid('campus_id')
    .notNull()
    .references(() => campuses.id, { onDelete: 'cascade' }),
  menuDate: date('menu_date').notNull(),
  mealSlot: text('meal_slot').notNull(),
  items: jsonb('items').$type<unknown[]>().notNull().default([]),
  version: integer('version').notNull().default(1),
  ...timestamps,
});

export const campusEvents = pgTable('campus_events', {
  id: primaryId(),
  institutionId: uuid('institution_id')
    .notNull()
    .references(() => institutions.id, { onDelete: 'cascade' }),
  campusId: uuid('campus_id').references(() => campuses.id, { onDelete: 'set null' }),
  title: text('title').notNull(),
  startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
  endsAt: timestamp('ends_at', { withTimezone: true }),
  capacity: integer('capacity'),
  isPaid: boolean('is_paid').notNull().default(false),
  feeMinor: integer('fee_minor').notNull().default(0),
  status: text('status').notNull().default('published'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const eventRegistrations = pgTable(
  'event_registrations',
  {
    id: primaryId(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => campusEvents.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    status: text('status').notNull().default('registered'),
    seatNo: integer('seat_no'),
    checkedInAt: timestamp('checked_in_at', { withTimezone: true }),
    feeInvoiceItemId: uuid('fee_invoice_item_id'),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    eventStudentUq: uniqueIndex('event_registrations_event_student_uq').on(t.eventId, t.studentId),
  }),
);
