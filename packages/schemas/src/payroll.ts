import { z } from 'zod';
import { paginationQuerySchema, sortQuerySchema, versionSchema } from './common';

/**
 * Institution-Portal PAYROLL (Phase 7) request/response contracts: a payroll run for a period + the
 * per-employee items within it. Tenancy + the active campus scope are derived by the API, never the
 * body. Money is a whole-number integer in MINOR units (no decimals anywhere). `net` is computed by
 * the service (gross − deductions) and never trusted from the body.
 */

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD').nullish();
const shortText = (max = 120) => z.string().trim().max(max).nullish();
const money = z.coerce.number().int().min(0).max(1_000_000_000);

export const PAYROLL_STATUSES = ['draft', 'processing', 'approved', 'paid', 'cancelled'] as const;
export const payrollStatusSchema = z.enum(PAYROLL_STATUSES);
export type PayrollStatus = (typeof PAYROLL_STATUSES)[number];

export const PAYROLL_EMPLOYEE_TYPES = ['teacher', 'staff'] as const;
export const payrollEmployeeTypeSchema = z.enum(PAYROLL_EMPLOYEE_TYPES);
export type PayrollEmployeeType = (typeof PAYROLL_EMPLOYEE_TYPES)[number];

const withVersion = { version: versionSchema };

// --- payroll runs ------------------------------------------------------------

export const payrollRunsListQuerySchema = paginationQuerySchema.merge(sortQuerySchema).extend({
  search: z.string().trim().max(160).optional(),
  status: payrollStatusSchema.optional(),
});
export type PayrollRunsListQuery = z.infer<typeof payrollRunsListQuerySchema>;

export const createPayrollRunSchema = z.object({
  name: z.string().trim().min(1, 'Required').max(120),
  periodLabel: shortText(60),
  periodStart: isoDate,
  periodEnd: isoDate,
  payDate: isoDate,
  status: payrollStatusSchema.default('draft'),
  notes: shortText(500),
});
export type CreatePayrollRunInput = z.infer<typeof createPayrollRunSchema>;

export const updatePayrollRunSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  periodLabel: shortText(60),
  periodStart: isoDate,
  periodEnd: isoDate,
  payDate: isoDate,
  status: payrollStatusSchema.optional(),
  notes: shortText(500),
  ...withVersion,
});
export type UpdatePayrollRunInput = z.infer<typeof updatePayrollRunSchema>;

// --- payroll items (per employee within a run) -------------------------------

/** Exactly one of teacherId / staffId must be set, matching employeeType. */
const employeeRefined = <T extends { employeeType?: PayrollEmployeeType; teacherId?: unknown; staffId?: unknown }>(
  v: T,
) => (v.employeeType === 'staff' ? !!v.staffId : !!v.teacherId);

export const createPayrollItemSchema = z
  .object({
    employeeType: payrollEmployeeTypeSchema.default('teacher'),
    teacherId: z.string().uuid().nullish(),
    staffId: z.string().uuid().nullish(),
    gross: money.default(0),
    deductions: money.default(0),
    notes: shortText(500),
  })
  .refine(employeeRefined, {
    message: 'Select the employee matching the chosen type (teacher or staff).',
    path: ['teacherId'],
  });
export type CreatePayrollItemInput = z.infer<typeof createPayrollItemSchema>;

export const updatePayrollItemSchema = z.object({
  employeeType: payrollEmployeeTypeSchema.optional(),
  teacherId: z.string().uuid().nullish(),
  staffId: z.string().uuid().nullish(),
  gross: money.optional(),
  deductions: money.optional(),
  notes: shortText(500),
  ...withVersion,
});
export type UpdatePayrollItemInput = z.infer<typeof updatePayrollItemSchema>;
