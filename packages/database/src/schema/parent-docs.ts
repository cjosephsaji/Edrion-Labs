import { index, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { boolean } from 'drizzle-orm/pg-core';
import { actorColumns, primaryId, timestamps } from './_helpers';
import { institutions } from './institutions';
import { campuses } from './campuses';
import { students } from './people';
import { feeInvoices } from './fees';
import { institutionUsers } from './users';

/**
 * PARENT-PORTAL documents tables.
 *  - student_documents: school-published files per student. Served via short-lived signed URLs only.
 *  - document_requests: parent-requested certificates (some chargeable → linked fee invoice).
 *  - profile_change_requests: parent-submitted corrections; on approval the service applies the change
 *    to the canonical record and audits both.
 */

/** A school-published document for one student (report card, id card, certificate, receipt, …). */
export const studentDocuments = pgTable(
  'student_documents',
  {
    id: primaryId(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    campusId: uuid('campus_id').references(() => campuses.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    /** report_card | id_card | certificate | transfer_certificate | bonafide | receipt | photo | other. */
    type: text('type').notNull().default('other'),
    title: text('title').notNull(),
    /** Storage key / URL seam (served via signed URL by the attachment storage service). */
    fileRef: text('file_ref').notNull(),
    contentType: text('content_type'),
    issuedAt: timestamp('issued_at', { withTimezone: true }),
    published: boolean('published').notNull().default(true),
    issuedBy: uuid('issued_by').references(() => institutionUsers.id, { onDelete: 'set null' }),
    version: integer('version').notNull().default(0),
    ...actorColumns,
    ...timestamps,
  },
  (t) => ({
    studentIdx: index('student_documents_student_idx').on(t.studentId, t.type),
    instIdx: index('student_documents_institution_idx').on(t.institutionId),
  }),
);

/** A parent request for a certificate. Some types are chargeable (linked fee invoice). */
export const documentRequests = pgTable(
  'document_requests',
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
    /** bonafide | transfer_certificate | fee_receipt_duplicate | character_certificate | custom. */
    type: text('type').notNull().default('custom'),
    note: text('note'),
    /** requested | in_progress | ready | rejected. */
    status: text('status').notNull().default('requested'),
    /** Set when the request is chargeable. */
    feeInvoiceId: uuid('fee_invoice_id').references(() => feeInvoices.id, { onDelete: 'set null' }),
    /** Set on fulfilment (bridge to student_documents). */
    fulfilledDocumentId: uuid('fulfilled_document_id').references(() => studentDocuments.id, {
      onDelete: 'set null',
    }),
    decidedBy: uuid('decided_by').references(() => institutionUsers.id, { onDelete: 'set null' }),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    version: integer('version').notNull().default(0),
    ...actorColumns,
    ...timestamps,
  },
  (t) => ({
    studentIdx: index('document_requests_student_idx').on(t.studentId),
    statusIdx: index('document_requests_status_idx').on(t.institutionId, t.status),
  }),
);

/** A parent-submitted correction to a student/guardian record, approved by staff. */
export const profileChangeRequests = pgTable(
  'profile_change_requests',
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
    /** address | phone | email | photo | guardian_details | dietary | other. */
    fieldGroup: text('field_group').notNull().default('other'),
    /** {field: newValue, …}. */
    proposedChanges: jsonb('proposed_changes').$type<Record<string, unknown>>().notNull().default({}),
    /** submitted | approved | rejected. */
    status: text('status').notNull().default('submitted'),
    reviewedBy: uuid('reviewed_by').references(() => institutionUsers.id, { onDelete: 'set null' }),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    reviewNote: text('review_note'),
    version: integer('version').notNull().default(0),
    ...actorColumns,
    ...timestamps,
  },
  (t) => ({
    studentIdx: index('profile_change_requests_student_idx').on(t.studentId),
    statusIdx: index('profile_change_requests_status_idx').on(t.institutionId, t.status),
  }),
);

export type StudentDocument = typeof studentDocuments.$inferSelect;
export type NewStudentDocument = typeof studentDocuments.$inferInsert;
export type DocumentRequest = typeof documentRequests.$inferSelect;
export type NewDocumentRequest = typeof documentRequests.$inferInsert;
export type ProfileChangeRequest = typeof profileChangeRequests.$inferSelect;
export type NewProfileChangeRequest = typeof profileChangeRequests.$inferInsert;
