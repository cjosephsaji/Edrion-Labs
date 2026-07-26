import { date, index, integer, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { actorColumns, primaryId, timestamps } from './_helpers';
import { institutions } from './institutions';
import { campuses } from './campuses';

/**
 * INSTITUTION-PORTAL reports (Phase 9). A two-level model with an export bridge (like exams):
 *   - report_definitions: a saved/reusable report — type + a free-text config. `reference_code` is
 *     unique within the institution (a friendly 409 instead of a unique-index 500).
 *   - report_runs: the generated exports of a definition. No campus column of its own — it inherits the
 *     definition's campus and is only reachable through a definition the caller can see (mirrors
 *     exam_schedules). Generating a run is the export action (gated by `reports.export`). Reads are
 *     gated by `reports.view`; defining/exporting needs the sensitive `reports.export` key.
 *
 * Same tenant convention; references only institutions/campuses, so plain `.references()` is safe.
 */
export const reportDefinitions = pgTable(
  'report_definitions',
  {
    id: primaryId(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    campusId: uuid('campus_id').references(() => campuses.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    /** attendance | fees | admissions | exams | payroll | custom. */
    reportType: text('report_type').notNull().default('custom'),
    /** Unique within the institution — a human reference (friendly 409 on collision). */
    referenceCode: text('reference_code').notNull(),
    description: text('description'),
    /** Free-text JSON config (filters/columns); the API never trusts tenancy from it. */
    config: text('config'),
    /** active | archived. */
    status: text('status').notNull().default('active'),
    version: integer('version').notNull().default(0),
    ...actorColumns,
    ...timestamps,
  },
  (t) => ({
    instIdx: index('report_definitions_institution_idx').on(t.institutionId),
    scopeIdx: index('report_definitions_institution_campus_idx').on(t.institutionId, t.campusId),
    statusIdx: index('report_definitions_status_idx').on(t.status),
    codeUniq: uniqueIndex('report_definition_code_uniq').on(t.institutionId, t.referenceCode),
  }),
);

/** A generated export of a definition. Inherits the definition's campus (no campus column of its own). */
export const reportRuns = pgTable(
  'report_runs',
  {
    id: primaryId(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    reportId: uuid('report_id')
      .notNull()
      .references(() => reportDefinitions.id, { onDelete: 'cascade' }),
    /** csv | pdf | xlsx. */
    format: text('format').notNull().default('csv'),
    /** completed | failed. */
    status: text('status').notNull().default('completed'),
    /** Number of rows in the generated export. */
    rowCount: integer('row_count').notNull().default(0),
    generatedDate: date('generated_date'),
    notes: text('notes'),
    version: integer('version').notNull().default(0),
    ...actorColumns,
    ...timestamps,
  },
  (t) => ({
    instIdx: index('report_runs_institution_idx').on(t.institutionId),
    reportIdx: index('report_runs_report_idx').on(t.reportId),
  }),
);

export type ReportDefinition = typeof reportDefinitions.$inferSelect;
export type NewReportDefinition = typeof reportDefinitions.$inferInsert;
export type ReportRun = typeof reportRuns.$inferSelect;
export type NewReportRun = typeof reportRuns.$inferInsert;
