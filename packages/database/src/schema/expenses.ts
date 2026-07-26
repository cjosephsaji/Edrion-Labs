import { date, index, integer, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { actorColumns, primaryId, timestamps } from './_helpers';
import { institutions } from './institutions';
import { campuses } from './campuses';

/**
 * INSTITUTION-PORTAL school expenses — the money going OUT of the school (the counterpart to fees
 * coming in). A flat, campus-scoped, version-guarded ledger owned by the Finance Manager: rent,
 * utilities, supplies, maintenance, salaries paid outside payroll, events, etc. Same tenant
 * convention as the rest of the portal; served by the generic PortalCrudEngine.
 *
 * Money (`amount`) is a whole-number integer in MINOR units (e.g. paise) — the codebase keeps no
 * decimals anywhere; the web enters major units and stores ×100.
 */
export const schoolExpenses = pgTable(
  'school_expenses',
  {
    id: primaryId(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    campusId: uuid('campus_id').references(() => campuses.id, { onDelete: 'cascade' }),
    /** Short label for the spend, e.g. "August electricity". */
    title: text('title').notNull(),
    /** salaries | utilities | supplies | maintenance | rent | transport | events | misc (validated in zod). */
    category: text('category').notNull().default('misc'),
    /** Who was paid (supplier/payee). */
    vendor: text('vendor'),
    /** Spend amount, minor units. */
    amount: integer('amount').notNull().default(0),
    /** cash | card | bank_transfer | cheque | online | other. */
    method: text('method').notNull().default('bank_transfer'),
    /** Bill / invoice / cheque number for reconciliation. */
    reference: text('reference'),
    expenseDate: date('expense_date'),
    /** pending | paid | cancelled. */
    status: text('status').notNull().default('pending'),
    notes: text('notes'),
    version: integer('version').notNull().default(0),
    ...actorColumns,
    ...timestamps,
  },
  (t) => ({
    instIdx: index('school_expenses_institution_idx').on(t.institutionId),
    scopeIdx: index('school_expenses_institution_campus_idx').on(t.institutionId, t.campusId),
    categoryIdx: index('school_expenses_category_idx').on(t.category),
    statusIdx: index('school_expenses_status_idx').on(t.status),
    dateIdx: index('school_expenses_date_idx').on(t.institutionId, t.expenseDate),
  }),
);

export type SchoolExpense = typeof schoolExpenses.$inferSelect;
export type NewSchoolExpense = typeof schoolExpenses.$inferInsert;
