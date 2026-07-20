import { z } from 'zod';

/** PostgreSQL integer minor-unit ceiling (~₹2.1 crore per value). */
export const moneyMinorSchema = z.number().int().min(-2_147_483_648).max(2_147_483_647);
const positiveMoney = moneyMinorSchema.positive();

export const feeLineCategorySchema = z.enum(['tuition','exam','lab','transport','hostel','other']);
export const feeStructureLineSchema = z.object({
  key: z.string().trim().min(1).max(80), label: z.string().trim().min(1).max(160),
  amount_minor: moneyMinorSchema.nonnegative(), tax_pct: z.number().min(0).max(100).default(0),
  category: feeLineCategorySchema,
});
export const feeInstallmentSchema = z.object({
  seq: z.number().int().positive(), label: z.string().trim().min(1).max(120),
  due_date: z.string().date(), pct_bps: z.number().int().min(1).max(10_000),
});
export const lateFeePolicySchema = z.object({
  mode: z.enum(['none','flat','percent','per_day']), amount_minor: moneyMinorSchema.nonnegative().optional(),
  pct_bps: z.number().int().min(0).max(10_000).optional(), per_day_minor: moneyMinorSchema.nonnegative().optional(),
  grace_days: z.number().int().min(0).max(90).default(0), cap_minor: moneyMinorSchema.nonnegative().nullable().optional(),
});
export const createFeeStructureVersionSchema = z.object({
  version: z.number().int().min(0),
  line_items: z.array(feeStructureLineSchema).min(1).max(100),
  installment_schedule: z.array(feeInstallmentSchema).min(1).max(24),
  late_fee_policy: lateFeePolicySchema,
  regenerate_unbilled: z.boolean().default(true),
}).superRefine((value, ctx) => {
  if (value.installment_schedule.reduce((sum, item) => sum + item.pct_bps, 0) !== 10_000) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['installment_schedule'], message: 'INSTALLMENTS_INVALID' });
  }
});
export type CreateFeeStructureVersionInput = z.infer<typeof createFeeStructureVersionSchema>;

export const generateFeeInvoicesSchema = z.object({
  version_no: z.number().int().positive(), installment_seqs: z.array(z.number().int().positive()).min(1),
  student_ids: z.array(z.string().uuid()).min(1).max(5_000),
});
export type GenerateFeeInvoicesInput = z.infer<typeof generateFeeInvoicesSchema>;

export const recordDeskFeePaymentSchema = z.object({
  student_id: z.string().uuid(), amount_minor: positiveMoney,
  method: z.enum(['cash','cheque','dd','bank_transfer']), reference: z.string().trim().max(120).optional(),
  instrument: z.record(z.unknown()).optional(), note: z.string().trim().max(500).optional(),
  invoice_ids: z.array(z.string().uuid()).optional(),
});
export type RecordDeskFeePaymentInput = z.infer<typeof recordDeskFeePaymentSchema>;

export const studentFeeIntentSchema = z.object({
  amount_minor: positiveMoney, invoice_ids: z.array(z.string().uuid()).min(1).max(20),
});
export type StudentFeeIntentInput = z.infer<typeof studentFeeIntentSchema>;
export const confirmFeeIntentSchema = z.object({ payment_id:z.string().trim().min(1).max(200), signature:z.string().trim().min(16).max(512) });
export type ConfirmFeeIntentInput = z.infer<typeof confirmFeeIntentSchema>;

export const feeWaiverSchema = z.object({
  student_id: z.string().uuid(), invoice_id: z.string().uuid(), label: z.string().trim().min(1).max(120),
  amount_minor: positiveMoney, reason: z.string().trim().min(10).max(1000), request_id: z.string().uuid().optional(),
});
export type FeeWaiverInput = z.infer<typeof feeWaiverSchema>;

export const feeDecisionSchema = z.object({ version: z.number().int().min(0), note: z.string().trim().min(10).max(1000).optional() });
export const feeBounceSchema = z.object({ reason: z.string().trim().min(10).max(1000), add_bounce_fee: z.boolean().default(false) });
export const feeRefundSchema = z.object({ amount_minor: positiveMoney, reason: z.string().trim().min(10).max(1000) });
export const feeDisputeDecisionSchema = z.object({ outcome:z.enum(['captured','reversed']), note:z.string().trim().min(10).max(1000) });

export const institutionFeeConfigSchema = z.object({
  partial_payment_allowed: z.boolean(), waiver_two_person_threshold_minor: moneyMinorSchema.nonnegative(),
  refund_two_person_threshold_minor: moneyMinorSchema.nonnegative(),
  dues_block: z.object({ hall_ticket:z.boolean(),result:z.boolean(),tc:z.boolean(),threshold_mode:z.enum(['any_overdue','amount_gte']),threshold_minor:moneyMinorSchema.nonnegative().optional(),grace_days:z.number().int().min(0).max(90) }),
  reminder_offsets: z.array(z.number().int().min(-365).max(365)).max(20), receipt_template_ref: z.string().uuid().nullable().optional(),
  late_fee_run_hour: z.number().int().min(0).max(23), bounce_fee_minor: moneyMinorSchema.nonnegative(),
  tally_ledger_map: z.record(z.string()).nullable().optional(), version: z.number().int().min(0),
});
export type InstitutionFeeConfigInput = z.infer<typeof institutionFeeConfigSchema>;
