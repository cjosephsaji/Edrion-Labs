import { date, index, integer, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { actorColumns, primaryId, timestamps } from './_helpers';
import { institutions } from './institutions';
import { campuses } from './campuses';
import { academicYears, classes, gradeLevels } from './academics';
import { students } from './people';

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
    /** Default amount in minor units. */
    amount: integer('amount').notNull().default(0),
    /** one_time | monthly | term | annual. */
    frequency: text('frequency').notNull().default('one_time'),
    description: text('description'),
    /** active | inactive. */
    status: text('status').notNull().default('active'),
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
    /** Billed total, minor units. */
    amount: integer('amount').notNull().default(0),
    /** Running total paid, minor units. Maintained by the payment bridge; balance = amount − amount_paid. */
    amountPaid: integer('amount_paid').notNull().default(0),
    /** pending | partial | paid | overdue | cancelled. Derived from amount vs amount_paid. */
    status: text('status').notNull().default('pending'),
    issueDate: date('issue_date'),
    dueDate: date('due_date'),
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
    version: integer('version').notNull().default(0),
    ...actorColumns,
    ...timestamps,
  },
  (t) => ({
    instIdx: index('fee_payments_institution_idx').on(t.institutionId),
    invoiceIdx: index('fee_payments_invoice_idx').on(t.invoiceId),
  }),
);

export type FeeStructure = typeof feeStructures.$inferSelect;
export type NewFeeStructure = typeof feeStructures.$inferInsert;
export type FeeInvoice = typeof feeInvoices.$inferSelect;
export type NewFeeInvoice = typeof feeInvoices.$inferInsert;
export type FeePayment = typeof feePayments.$inferSelect;
export type NewFeePayment = typeof feePayments.$inferInsert;
