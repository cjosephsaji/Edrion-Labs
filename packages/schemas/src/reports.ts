import { z } from 'zod';
import { paginationQuerySchema, sortQuerySchema, versionSchema } from './common';

/**
 * Institution-Portal REPORTS (Phase 9) request/response contracts: saved report definitions + their
 * generated runs (the export bridge). Tenancy (institution_id) + the active campus scope (campus_id) are
 * NEVER taken from the body. Reads need `reports.view`; defining/exporting needs the sensitive
 * `reports.export` key.
 */

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD').nullish();
const shortText = (max = 200) => z.string().trim().max(max).nullish();
const longText = (max = 4000) => z.string().trim().max(max).nullish();
const count = z.coerce.number().int().min(0).max(100_000_000);

export const REPORT_TYPES = ['attendance', 'fees', 'admissions', 'exams', 'payroll', 'custom'] as const;
export const reportTypeSchema = z.enum(REPORT_TYPES);
export type ReportType = (typeof REPORT_TYPES)[number];

export const REPORT_STATUSES = ['active', 'archived'] as const;
export const reportStatusSchema = z.enum(REPORT_STATUSES);
export type ReportStatus = (typeof REPORT_STATUSES)[number];

export const REPORT_FORMATS = ['csv', 'pdf', 'xlsx'] as const;
export const reportFormatSchema = z.enum(REPORT_FORMATS);
export type ReportFormat = (typeof REPORT_FORMATS)[number];

const withVersion = { version: versionSchema };

// --- definitions -------------------------------------------------------------

export const reportDefinitionsListQuerySchema = paginationQuerySchema.merge(sortQuerySchema).extend({
  search: z.string().trim().max(160).optional(),
  status: reportStatusSchema.optional(),
});
export type ReportDefinitionsListQuery = z.infer<typeof reportDefinitionsListQuerySchema>;

export const createReportDefinitionSchema = z.object({
  name: z.string().trim().min(1, 'Required').max(200),
  reportType: reportTypeSchema.default('custom'),
  referenceCode: z.string().trim().min(1, 'Required').max(80),
  description: shortText(500),
  config: longText(),
  status: reportStatusSchema.default('active'),
});
export type CreateReportDefinitionInput = z.infer<typeof createReportDefinitionSchema>;

export const updateReportDefinitionSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  reportType: reportTypeSchema.optional(),
  referenceCode: z.string().trim().min(1).max(80).optional(),
  description: shortText(500),
  config: longText(),
  status: reportStatusSchema.optional(),
  ...withVersion,
});
export type UpdateReportDefinitionInput = z.infer<typeof updateReportDefinitionSchema>;

// --- runs (exports of a definition) ------------------------------------------

/** Generate an export of a report (the export bridge). */
export const createReportRunSchema = z.object({
  format: reportFormatSchema.default('csv'),
  rowCount: count.default(0),
  generatedDate: isoDate,
  notes: shortText(500),
});
export type CreateReportRunInput = z.infer<typeof createReportRunSchema>;
