import { date, index, integer, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { actorColumns, primaryId, timestamps } from './_helpers';
import { institutions } from './institutions';
import { campuses } from './campuses';
import { staff } from './people';

/**
 * INSTITUTION-PORTAL payroll (Phase 7). A two-level model, mirroring exams/assignments:
 *   - payroll_runs: ONE pay run for a period (e.g. "March 2026"), campus-scoped + version-guarded.
 *     Owns the period, pay date and lifecycle status.
 *   - payroll_items: the per-employee lines WITHIN a run — gross, deductions, net. No campus column
 *     of its own: it inherits the run's campus and is only reachable through a run the caller can see.
 *     An employee is a teacher OR a staff member (employee_type discriminates which FK is set); the
 *     service enforces exactly one, pre-checks it for a friendly 400, and rejects a duplicate
 *     (run, employee) with a friendly 409. `net` is computed = gross − deductions.
 *
 * Same tenant convention; teachers/staff are forward-only, so plain `.references()` is safe. Money is
 * a whole-number integer in MINOR units (the codebase has no decimals anywhere).
 */
export const payrollRuns = pgTable(
  'payroll_runs',
  {
    id: primaryId(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    campusId: uuid('campus_id').references(() => campuses.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    /** Free-text period label, e.g. "March 2026". */
    periodLabel: text('period_label'),
    periodStart: date('period_start'),
    periodEnd: date('period_end'),
    payDate: date('pay_date'),
    /** draft | processing | approved | paid | cancelled. */
    status: text('status').notNull().default('draft'),
    notes: text('notes'),
    version: integer('version').notNull().default(0),
    ...actorColumns,
    ...timestamps,
  },
  (t) => ({
    instIdx: index('payroll_runs_institution_idx').on(t.institutionId),
    scopeIdx: index('payroll_runs_institution_campus_idx').on(t.institutionId, t.campusId),
    statusIdx: index('payroll_runs_status_idx').on(t.status),
  }),
);

/** A per-employee line within a payroll run. Inherits the run's campus. */
export const payrollItems = pgTable(
  'payroll_items',
  {
    id: primaryId(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    payrollRunId: uuid('payroll_run_id')
      .notNull()
      .references(() => payrollRuns.id, { onDelete: 'cascade' }),
    /** teacher | staff — which FK below identifies the employee. */
    employeeType: text('employee_type').notNull().default('teacher'),
    teacherId: uuid('teacher_id').references(() => staff.id, { onDelete: 'set null' }),
    staffId: uuid('staff_id').references(() => staff.id, { onDelete: 'set null' }),
    /** Gross pay, minor units. */
    gross: integer('gross').notNull().default(0),
    /** Total deductions, minor units. */
    deductions: integer('deductions').notNull().default(0),
    /** Net pay (gross − deductions), minor units. Computed by the service. */
    net: integer('net').notNull().default(0),
    notes: text('notes'),
    version: integer('version').notNull().default(0),
    ...actorColumns,
    ...timestamps,
  },
  (t) => ({
    instIdx: index('payroll_items_institution_idx').on(t.institutionId),
    runIdx: index('payroll_items_run_idx').on(t.payrollRunId),
    teacherIdx: index('payroll_items_teacher_idx').on(t.teacherId),
    staffIdx: index('payroll_items_staff_idx').on(t.staffId),
  }),
);

export type PayrollRun = typeof payrollRuns.$inferSelect;
export type NewPayrollRun = typeof payrollRuns.$inferInsert;
export type PayrollItem = typeof payrollItems.$inferSelect;
export type NewPayrollItem = typeof payrollItems.$inferInsert;
