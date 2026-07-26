import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { actorColumns, primaryId, timestamps } from './_helpers';
import { institutions } from './institutions';
import { campuses } from './campuses';
import { academicYears, classes, gradeLevels, academicTerms } from './academics';
import { students } from './people';
import { institutionUsers } from './users';
import { studentDocumentVault, studentRequests } from './requests';

/**
 * INSTITUTION-PORTAL fees (Phase 7). Three levels:
 *   - fee_structures: reusable fee templates (a tuition/transport/… charge for a grade/class/year),
 *     campus-scoped + version-guarded.
 *   - fee_invoices: a charge raised against ONE student, campus-scoped + version-guarded. Tracks the
 *     billed `amount` and the running `amount_paid`; `status` is derived from the two by the service.
 *   - fee_payments: the per-invoice payment lines. No campus column of its own — it inherits the
 *     invoice's campus and is only reachable through an invoice the caller can see (mirrors
 *     exam_schedules / assignment_submissions). Recording a payment is a small bridge: the service
 *     re-sums the payments and updates the invoice's amount_paid + status (like admissions→enrol).
 *
 * Same tenant convention as the rest of the portal. academics/people are referenced forward-only, so
 * plain `.references()` is safe (no Drizzle type cycle). Money is a whole-number integer in MINOR
 * units (e.g. cents) — the codebase has no decimals/numeric anywhere.
 */
export const feeStructures = pgTable(
  'fee_structures',
  {
    id: primaryId(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    campusId: uuid('campus_id').references(() => campuses.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    /** tuition | admission | transport | hostel | exam | library | misc (free-text; validated in zod). */
    feeType: text('fee_type').notNull().default('tuition'),
    gradeLevelId: uuid('grade_level_id').references(() => gradeLevels.id, { onDelete: 'set null' }),
    classId: uuid('class_id').references(() => classes.id, { onDelete: 'set null' }),
    academicYearId: uuid('academic_year_id').references(() => academicYears.id, { onDelete: 'set null' }),
    /** Optional link to a structured academic term period (when frequency = term). */
    termId: uuid('term_id').references(() => academicTerms.id, { onDelete: 'set null' }),
    /**
     * Department-agnostic placement, for the college-wide charge: "Year 1, Semester 1 tuition —
     * every programme". `grade_level_id` and `term_id` cannot express that, because a university's
     * "Year 1" and "Semester 1" are a separate row per department, so pointing at one silently bills
     * one department. These are the *numbers* those rows share (grade_levels.level and
     * academic_terms.sequence), which is the only handle that crosses departments — the same reason
     * programme_subjects keys on `semester_sequence` rather than a term row.
     *
     * NULL = not scoped that way. Set these OR the id columns, not both.
     */
    gradeLevelNumber: integer('grade_level_number'),
    termSequence: integer('term_sequence'),
    /** Default amount in minor units. */
    amount: integer('amount').notNull().default(0),
    /** one_time | monthly | term | annual. */
    frequency: text('frequency').notNull().default('one_time'),
    description: text('description'),
    /** draft | active | archived. */
    status: text('status').notNull().default('draft'),
    currentVersion: integer('current_version').notNull().default(1),
    lateFeePolicy: jsonb('late_fee_policy').$type<Record<string, unknown>>(),
    category: text('category'),
    version: integer('version').notNull().default(0),
    ...actorColumns,
    ...timestamps,
  },
  (t) => ({
    instIdx: index('fee_structures_institution_idx').on(t.institutionId),
    scopeIdx: index('fee_structures_institution_campus_idx').on(t.institutionId, t.campusId),
    statusIdx: index('fee_structures_status_idx').on(t.status),
  }),
);

/** A fee charged to one student. One invoice number per institution. */
export const feeInvoices = pgTable(
  'fee_invoices',
  {
    id: primaryId(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    campusId: uuid('campus_id').references(() => campuses.id, { onDelete: 'cascade' }),
    /** Human invoice number (unique within the institution). */
    invoiceNo: text('invoice_no').notNull(),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    feeStructureId: uuid('fee_structure_id').references(() => feeStructures.id, { onDelete: 'set null' }),
    /** Direct year stamp — fee_structure_id is nullable (ad-hoc invoices). */
    academicYearId: uuid('academic_year_id').references(() => academicYears.id, { onDelete: 'set null' }),
    termId: uuid('term_id').references(() => academicTerms.id, { onDelete: 'set null' }),
    /**
     * Charge origin for the unified parent fees view (§4.3): tuition | fine | transport | hostel | other.
     * Lets library fines and transport/hostel charges surface alongside tuition without a structure.
     */
    source: text('source').notNull().default('tuition'),
    /** Billed total, minor units. */
    amount: integer('amount').notNull().default(0),
    /** Running total paid, minor units. Maintained by the payment bridge; balance = amount − amount_paid. */
    amountPaid: integer('amount_paid').notNull().default(0),
    /** pending | partial | paid | overdue | cancelled. Derived from amount vs amount_paid. */
    status: text('status').notNull().default('pending'),
    issueDate: date('issue_date'),
    dueDate: date('due_date'),
    structureVersionNo: integer('structure_version_no'),
    installmentSeq: integer('installment_seq'),
    /** structure | request | manual. Deliberately separate from source's tuition/fine/etc meaning. */
    origin: text('origin').notNull().default('structure'),
    linkedRequestId: uuid('linked_request_id').references(() => studentRequests.id, { onDelete: 'set null' }),
    generationBatchId: uuid('generation_batch_id'),
    notes: text('notes'),
    version: integer('version').notNull().default(0),
    ...actorColumns,
    ...timestamps,
  },
  (t) => ({
    instIdx: index('fee_invoices_institution_idx').on(t.institutionId),
    scopeIdx: index('fee_invoices_institution_campus_idx').on(t.institutionId, t.campusId),
    studentIdx: index('fee_invoices_student_idx').on(t.studentId),
    statusIdx: index('fee_invoices_status_idx').on(t.status),
    yearIdx: index('fee_invoices_year_idx').on(t.academicYearId),
    invoiceUniq: uniqueIndex('fee_invoice_no_uniq').on(t.institutionId, t.invoiceNo),
  }),
);

/** A payment line against an invoice. Inherits the invoice's campus (no campus column of its own). */
export const feePayments = pgTable(
  'fee_payments',
  {
    id: primaryId(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    invoiceId: uuid('invoice_id')
      .notNull()
      .references(() => feeInvoices.id, { onDelete: 'cascade' }),
    /** Amount paid, minor units. */
    amount: integer('amount').notNull().default(0),
    /** cash | card | bank_transfer | cheque | online | other. */
    method: text('method').notNull().default('cash'),
    reference: text('reference'),
    paidDate: date('paid_date'),
    notes: text('notes'),
    channel: text('channel').notNull().default('desk'),
    paymentState: text('payment_state').notNull().default('captured'),
    instrument: jsonb('instrument').$type<Record<string, unknown>>(),
    receiptId: uuid('receipt_id').references(() => feeReceipts.id, { onDelete: 'set null' }),
    recordedBy: uuid('recorded_by').references(() => institutionUsers.id, { onDelete: 'set null' }),
    intentId: uuid('intent_id'),
    version: integer('version').notNull().default(0),
    ...actorColumns,
    ...timestamps,
  },
  (t) => ({
    instIdx: index('fee_payments_institution_idx').on(t.institutionId),
    invoiceIdx: index('fee_payments_invoice_idx').on(t.invoiceId),
  }),
);

/** Immutable snapshots used by generated invoices. Money uses PostgreSQL integer minor units. */
export const feeStructureVersions = pgTable(
  'fee_structure_versions',
  {
    id: primaryId(),
    institutionId: uuid('institution_id').notNull().references(() => institutions.id, { onDelete: 'cascade' }),
    structureId: uuid('structure_id').notNull().references(() => feeStructures.id, { onDelete: 'cascade' }),
    versionNo: integer('version_no').notNull(),
    lineItems: jsonb('line_items').$type<Array<Record<string, unknown>>>().notNull(),
    installmentSchedule: jsonb('installment_schedule').$type<Array<Record<string, unknown>>>().notNull(),
    lateFeePolicy: jsonb('late_fee_policy').$type<Record<string, unknown>>(),
    createdBy: uuid('created_by').references(() => institutionUsers.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ uniqueVersion: uniqueIndex('fee_structure_versions_unique').on(t.structureId, t.versionNo) }),
);

export const feeInvoiceItems = pgTable(
  'fee_invoice_items',
  {
    id: primaryId(),
    institutionId: uuid('institution_id').notNull().references(() => institutions.id, { onDelete: 'cascade' }),
    invoiceId: uuid('invoice_id').notNull().references(() => feeInvoices.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id').notNull().references(() => students.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    category: text('category').notNull().default('other'),
    label: text('label').notNull(),
    /** Integer minor units cap each value at ~₹2.1 crore. */
    amountMinor: integer('amount_minor').notNull(),
    taxMinor: integer('tax_minor').notNull().default(0),
    source: jsonb('source').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ invoiceIdx: index('fee_invoice_items_invoice_idx').on(t.invoiceId) }),
);

export const feeReceiptSequences = pgTable(
  'fee_receipt_sequences',
  {
    institutionId: uuid('institution_id').notNull().references(() => institutions.id, { onDelete: 'cascade' }),
    campusId: uuid('campus_id').notNull().references(() => campuses.id, { onDelete: 'cascade' }),
    fyLabel: text('fy_label').notNull(),
    nextNo: integer('next_no').notNull().default(1),
  },
  (t) => ({ pk: primaryKey({ columns: [t.institutionId, t.campusId, t.fyLabel] }) }),
);

export const feeReceipts = pgTable(
  'fee_receipts',
  {
    id: primaryId(),
    institutionId: uuid('institution_id').notNull().references(() => institutions.id, { onDelete: 'cascade' }),
    campusId: uuid('campus_id').notNull().references(() => campuses.id, { onDelete: 'restrict' }),
    studentId: uuid('student_id').notNull().references(() => students.id, { onDelete: 'restrict' }),
    paymentGroupId: uuid('payment_group_id').notNull(),
    receiptNo: text('receipt_no').notNull(),
    fyLabel: text('fy_label').notNull(),
    /** Integer minor units cap each value at ~₹2.1 crore. */
    amountMinor: integer('amount_minor').notNull(),
    method: text('method').notNull(),
    lineSnapshot: jsonb('line_snapshot').$type<Array<Record<string, unknown>>>().notNull(),
    pdfStorageRef: text('pdf_storage_ref'),
    vaultDocumentId: uuid('vault_document_id').references(() => studentDocumentVault.id, { onDelete: 'set null' }),
    status: text('status').notNull().default('issued'),
    cancelledReason: text('cancelled_reason'),
    refundStatus: text('refund_status'),
    refundAmountMinor: integer('refund_amount_minor'),
    refundReason: text('refund_reason'),
    refundProposedBy: uuid('refund_proposed_by').references(() => institutionUsers.id, { onDelete: 'set null' }),
    refundSecondApprovedBy: uuid('refund_second_approved_by').references(() => institutionUsers.id, { onDelete: 'set null' }),
    version: integer('version').notNull().default(0),
    issuedBy: uuid('issued_by').references(() => institutionUsers.id, { onDelete: 'set null' }),
    issuedAt: timestamp('issued_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ receiptUnique: uniqueIndex('fee_receipts_no_unique').on(t.institutionId, t.campusId, t.receiptNo), studentIdx: index('fee_receipts_student_idx').on(t.studentId, t.issuedAt) }),
);

export const feeWaivers = pgTable(
  'fee_waivers',
  {
    id: primaryId(),
    institutionId: uuid('institution_id').notNull().references(() => institutions.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id').notNull().references(() => students.id, { onDelete: 'cascade' }),
    invoiceId: uuid('invoice_id').notNull().references(() => feeInvoices.id, { onDelete: 'cascade' }),
    label: text('label').notNull(),
    amountMinor: integer('amount_minor').notNull(),
    reason: text('reason').notNull(),
    status: text('status').notNull().default('proposed'),
    proposedBy: uuid('proposed_by').notNull().references(() => institutionUsers.id, { onDelete: 'restrict' }),
    approvedBy: uuid('approved_by').references(() => institutionUsers.id, { onDelete: 'set null' }),
    secondApprovedBy: uuid('second_approved_by').references(() => institutionUsers.id, { onDelete: 'set null' }),
    thresholdSnapshotMinor: integer('threshold_snapshot_minor').notNull(),
    requestId: uuid('request_id').references(() => studentRequests.id, { onDelete: 'set null' }),
    version: integer('version').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
);

/** Inbound gateway delivery log. This is intentionally separate from outbound webhook_deliveries. */
export const feeGatewayEvents = pgTable(
  'fee_gateway_events',
  {
    id: primaryId(),
    institutionId: uuid('institution_id').references(() => institutions.id, { onDelete: 'set null' }),
    gateway: text('gateway').notNull(),
    providerEventId: text('provider_event_id').notNull(),
    eventType: text('event_type').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    signatureValid: boolean('signature_valid').notNull(),
    outcome: text('outcome').notNull(),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ providerUnique: uniqueIndex('fee_gateway_events_provider_unique').on(t.gateway, t.providerEventId) }),
);

export const institutionFeeConfig = pgTable('institution_fee_config', {
  institutionId: uuid('institution_id').primaryKey().references(() => institutions.id, { onDelete: 'cascade' }),
  partialPaymentAllowed: boolean('partial_payment_allowed').notNull().default(false),
  waiverTwoPersonThresholdMinor: integer('waiver_two_person_threshold_minor').notNull().default(1_000_000),
  refundTwoPersonThresholdMinor: integer('refund_two_person_threshold_minor').notNull().default(500_000),
  duesBlock: jsonb('dues_block').$type<Record<string, unknown>>().notNull().default({ hall_ticket: false, result: false, tc: false, threshold_mode: 'any_overdue', grace_days: 0 }),
  reminderOffsets: integer('reminder_offsets').array().notNull().default([7, 3, 1]),
  receiptTemplateRef: text('receipt_template_ref'),
  lateFeeRunHour: integer('late_fee_run_hour').notNull().default(2),
  bounceFeeMinor: integer('bounce_fee_minor').notNull().default(0),
  tallyLedgerMap: jsonb('tally_ledger_map').$type<Record<string, string>>(),
  version: integer('version').notNull().default(0),
  ...actorColumns,
  ...timestamps,
});

export type FeeStructure = typeof feeStructures.$inferSelect;
export type NewFeeStructure = typeof feeStructures.$inferInsert;
export type FeeInvoice = typeof feeInvoices.$inferSelect;
export type NewFeeInvoice = typeof feeInvoices.$inferInsert;
export type FeePayment = typeof feePayments.$inferSelect;
export type NewFeePayment = typeof feePayments.$inferInsert;
export type FeeStructureVersion = typeof feeStructureVersions.$inferSelect;
export type FeeInvoiceItem = typeof feeInvoiceItems.$inferSelect;
export type FeeReceipt = typeof feeReceipts.$inferSelect;
export type FeeWaiver = typeof feeWaivers.$inferSelect;
