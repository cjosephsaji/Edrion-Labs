import { z } from 'zod';
import { paginationQuerySchema, sortQuerySchema, versionSchema, academicScopeQuerySchema } from './common';

/**
 * Institution-Portal FEES (Phase 7) request/response contracts: fee structures (templates),
 * per-student invoices, and the payments recorded against them. Tenancy (institution_id) + the active
 * campus scope (campus_id) are NEVER taken from the body — the API derives them from the authenticated
 * principal + scope header. Money is a whole-number integer in MINOR units (the codebase has no
 * decimals anywhere).
 */

const optionalUuid = z.string().uuid().nullish();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD').nullish();
const shortText = (max = 120) => z.string().trim().max(max).nullish();
/** Money, minor units (whole number). */
const money = z.coerce.number().int().min(0).max(1_000_000_000);

export const FEE_TYPES = ['tuition', 'admission', 'transport', 'hostel', 'exam', 'library', 'misc'] as const;
export const feeTypeSchema = z.enum(FEE_TYPES);
export type FeeType = (typeof FEE_TYPES)[number];

export const FEE_FREQUENCIES = ['one_time', 'monthly', 'term', 'annual'] as const;
export const feeFrequencySchema = z.enum(FEE_FREQUENCIES);
export type FeeFrequency = (typeof FEE_FREQUENCIES)[number];

export const FEE_STRUCTURE_STATUSES = ['active', 'inactive'] as const;
export const feeStructureStatusSchema = z.enum(FEE_STRUCTURE_STATUSES);
export type FeeStructureStatus = (typeof FEE_STRUCTURE_STATUSES)[number];

export const FEE_INVOICE_STATUSES = ['pending', 'partial', 'paid', 'overdue', 'cancelled'] as const;
export const feeInvoiceStatusSchema = z.enum(FEE_INVOICE_STATUSES);
export type FeeInvoiceStatus = (typeof FEE_INVOICE_STATUSES)[number];

export const FEE_PAYMENT_METHODS = ['cash', 'card', 'bank_transfer', 'cheque', 'online', 'other'] as const;
export const feePaymentMethodSchema = z.enum(FEE_PAYMENT_METHODS);
export type FeePaymentMethod = (typeof FEE_PAYMENT_METHODS)[number];

const withVersion = { version: versionSchema };

// --- fee structures (templates) ----------------------------------------------

export const feeStructuresListQuerySchema = paginationQuerySchema
  .merge(sortQuerySchema)
  .merge(academicScopeQuerySchema)
  .extend({
  search: z.string().trim().max(160).optional(),
  status: feeStructureStatusSchema.optional(),
  feeType: feeTypeSchema.optional(),
  departmentId: z.string().uuid().optional(),
  programmeLevelId: z.string().uuid().optional(),
  gradeLevelId: z.string().uuid().optional(),
  classId: z.string().uuid().optional(),
  /** Year number and term slot — the department-agnostic facets. See `slot` fields below. */
  gradeLevelNumber: z.coerce.number().int().min(0).max(20).optional(),
  semesterSequence: z.coerce.number().int().min(1).max(20).optional(),
});
export type FeeStructuresListQuery = z.infer<typeof feeStructuresListQuerySchema>;

/**
 * Placement by *number* rather than by row id, so one structure covers every department: a
 * university's "Year 1" / "Semester 1" is a separate row per department, so `gradeLevelId` /
 * `termId` would pin the charge to one of them. Null = not scoped that way.
 */
const slot = {
  gradeLevelNumber: z.coerce.number().int().min(0).max(20).nullish(),
  termSequence: z.coerce.number().int().min(1).max(20).nullish(),
};

/** A structure is placed by ids OR by numbers — mixing the two would double-scope the charge. */
const notBothPlacements = (v: {
  gradeLevelId?: string | null;
  termId?: string | null;
  gradeLevelNumber?: number | null;
  termSequence?: number | null;
}) =>
  !(
    (v.gradeLevelNumber != null || v.termSequence != null) &&
    (v.gradeLevelId != null || v.termId != null)
  );
const bothPlacementsMessage = {
  message:
    'Use either a specific year/term or a college-wide year number and term slot — not both.',
  path: ['gradeLevelNumber'] as (string | number)[],
};

export const createFeeStructureSchema = z
  .object({
    name: z.string().trim().min(1, 'Required').max(120),
    feeType: feeTypeSchema.default('tuition'),
    gradeLevelId: optionalUuid,
    classId: optionalUuid,
    academicYearId: optionalUuid,
    termId: optionalUuid,
    ...slot,
    amount: money.default(0),
    frequency: feeFrequencySchema.default('one_time'),
    description: shortText(500),
    status: feeStructureStatusSchema.default('active'),
  })
  .refine(notBothPlacements, bothPlacementsMessage);
export type CreateFeeStructureInput = z.infer<typeof createFeeStructureSchema>;

export const updateFeeStructureSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    feeType: feeTypeSchema.optional(),
    gradeLevelId: optionalUuid,
    classId: optionalUuid,
    academicYearId: optionalUuid,
    termId: optionalUuid,
    ...slot,
    amount: money.optional(),
    frequency: feeFrequencySchema.optional(),
    description: shortText(500),
    status: feeStructureStatusSchema.optional(),
    ...withVersion,
  })
  .refine(notBothPlacements, bothPlacementsMessage);
export type UpdateFeeStructureInput = z.infer<typeof updateFeeStructureSchema>;

// --- fee invoices (per student) ----------------------------------------------

export const feeInvoicesListQuerySchema = paginationQuerySchema
  .merge(sortQuerySchema)
  .merge(academicScopeQuerySchema)
  .extend({
  search: z.string().trim().max(160).optional(),
  status: feeInvoiceStatusSchema.optional(),
  studentId: z.string().uuid().optional(),
});
export type FeeInvoicesListQuery = z.infer<typeof feeInvoicesListQuerySchema>;

export const createFeeInvoiceSchema = z.object({
  invoiceNo: z.string().trim().min(1, 'Required').max(60),
  studentId: z.string().uuid(),
  feeStructureId: optionalUuid,
  amount: money,
  issueDate: isoDate,
  dueDate: isoDate,
  status: feeInvoiceStatusSchema.default('pending'),
  notes: shortText(500),
});
export type CreateFeeInvoiceInput = z.infer<typeof createFeeInvoiceSchema>;

export const updateFeeInvoiceSchema = z.object({
  invoiceNo: z.string().trim().min(1).max(60).optional(),
  studentId: z.string().uuid().optional(),
  feeStructureId: optionalUuid,
  amount: money.optional(),
  issueDate: isoDate,
  dueDate: isoDate,
  status: feeInvoiceStatusSchema.optional(),
  notes: shortText(500),
  ...withVersion,
});
export type UpdateFeeInvoiceInput = z.infer<typeof updateFeeInvoiceSchema>;

// --- payments (against an invoice) -------------------------------------------

/** Record a payment against an invoice. The service re-sums + updates the invoice's status/balance. */
export const recordFeePaymentSchema = z.object({
  amount: z.coerce.number().int().min(1, 'Amount must be greater than zero').max(1_000_000_000),
  method: feePaymentMethodSchema.default('cash'),
  reference: shortText(120),
  paidDate: isoDate,
  notes: shortText(500),
});
export type RecordFeePaymentInput = z.infer<typeof recordFeePaymentSchema>;
