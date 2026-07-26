import { z } from 'zod';
import { paginationQuerySchema, reasonSchema, sortQuerySchema, versionSchema } from './common';

export const billingCurrencySchema = z.enum(['USD', 'INR', 'EUR', 'GBP', 'AED']);
export const invoiceStatusSchema = z.enum(['draft', 'open', 'paid', 'void', 'uncollectible', 'refunded']);
export const paymentStatusSchema = z.enum(['pending', 'succeeded', 'failed', 'refunded']);
export const dunningStateSchema = z.enum(['none', 'reminder', 'overdue', 'final_notice', 'written_off']);
export const discountKindSchema = z.enum(['percentage', 'fixed']);
export const discountAppliesToSchema = z.enum(['invoice', 'subscription']);

// --- Pure invoice totals (reused by FE preview + service + tested) ------------------------

export interface InvoiceLineInput {
  amountMinor: number;
}

export interface InvoiceTotals {
  subtotalMinor: number;
  discountMinor: number;
  taxMinor: number;
  totalMinor: number;
}

/**
 * Compute invoice totals from line items: subtotal → discount (fixed wins over bps) →
 * tax on the discounted subtotal → total. Pure, integer minor units; unit-tested. Tax never
 * applies to the discount, and a discount can never exceed the subtotal.
 */
export function calculateInvoiceTotals(
  items: InvoiceLineInput[],
  opts: { discountBps?: number; discountFixedMinor?: number; taxRateBps?: number } = {},
): InvoiceTotals {
  const subtotalMinor = items.reduce((sum, i) => sum + i.amountMinor, 0);
  const rawDiscount =
    opts.discountFixedMinor ?? Math.round((subtotalMinor * (opts.discountBps ?? 0)) / 10_000);
  const discountMinor = Math.max(0, Math.min(rawDiscount, subtotalMinor));
  const taxable = subtotalMinor - discountMinor;
  const taxMinor = Math.round((taxable * (opts.taxRateBps ?? 0)) / 10_000);
  const totalMinor = taxable + taxMinor;
  return { subtotalMinor, discountMinor, taxMinor, totalMinor };
}

// --- Invoices -----------------------------------------------------------------------------

export const listInvoicesQuerySchema = paginationQuerySchema.merge(sortQuerySchema).extend({
  institutionId: z.string().uuid().optional(),
  subscriptionId: z.string().uuid().optional(),
  status: invoiceStatusSchema.optional(),
});
export type ListInvoicesQuery = z.infer<typeof listInvoicesQuerySchema>;

/** Generate a draft invoice from a subscription's current state (base + add-ons + discount). */
export const createInvoiceSchema = z.object({
  subscriptionId: z.string().uuid(),
  periodStart: z.string().datetime().optional(),
  periodEnd: z.string().datetime().optional(),
  taxRateBps: z.number().int().min(0).max(10_000).optional(),
  discountBps: z.number().int().min(0).max(10_000).optional(),
  notes: z.string().trim().max(500).optional(),
});
export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>;

export const finalizeInvoiceSchema = z.object({
  dueAt: z.string().datetime().optional(),
});
export type FinalizeInvoiceInput = z.infer<typeof finalizeInvoiceSchema>;

export const voidInvoiceSchema = z.object({ reason: reasonSchema, version: versionSchema });
export type VoidInvoiceInput = z.infer<typeof voidInvoiceSchema>;

export const dunningSchema = z.object({ dunningState: dunningStateSchema, reason: reasonSchema, version: versionSchema });
export type DunningInput = z.infer<typeof dunningSchema>;

// --- Payments -----------------------------------------------------------------------------

export const listPaymentsQuerySchema = paginationQuerySchema.merge(sortQuerySchema).extend({
  institutionId: z.string().uuid().optional(),
  invoiceId: z.string().uuid().optional(),
  status: paymentStatusSchema.optional(),
});
export type ListPaymentsQuery = z.infer<typeof listPaymentsQuerySchema>;

export const recordPaymentSchema = z.object({
  invoiceId: z.string().uuid().optional(),
  institutionId: z.string().uuid(),
  amountMinor: z.number().int().positive(),
  method: z.string().trim().max(40).default('card'),
  provider: z.string().trim().max(40).default('manual'),
  providerRef: z.string().trim().max(120).optional(),
  /** false records a failed payment (drops into the failed-payment queue). */
  succeeded: z.boolean().default(true),
  failureReason: z.string().trim().max(200).optional(),
});
export type RecordPaymentInput = z.infer<typeof recordPaymentSchema>;

/** Re-attempt a failed payment (dunning). */
export const retryPaymentSchema = z.object({
  succeeded: z.boolean().default(true),
  failureReason: z.string().trim().max(200).optional(),
  reason: reasonSchema,
});
export type RetryPaymentInput = z.infer<typeof retryPaymentSchema>;

// --- Refunds ------------------------------------------------------------------------------

export const createRefundSchema = z.object({
  paymentId: z.string().uuid(),
  /** Omit to refund the full payment amount. */
  amountMinor: z.number().int().positive().optional(),
  reason: reasonSchema,
});
export type CreateRefundInput = z.infer<typeof createRefundSchema>;

// --- Credits ------------------------------------------------------------------------------

export const listCreditsQuerySchema = paginationQuerySchema.extend({
  institutionId: z.string().uuid().optional(),
});
export type ListCreditsQuery = z.infer<typeof listCreditsQuerySchema>;

export const issueCreditSchema = z.object({
  institutionId: z.string().uuid(),
  subscriptionId: z.string().uuid().optional(),
  amountMinor: z.number().int().positive(),
  currency: billingCurrencySchema.default('USD'),
  source: z.string().trim().max(40).default('manual'),
  reason: reasonSchema,
  expiresAt: z.string().datetime().optional(),
});
export type IssueCreditInput = z.infer<typeof issueCreditSchema>;

// --- Discounts ----------------------------------------------------------------------------

export const listDiscountsQuerySchema = paginationQuerySchema.extend({
  institutionId: z.string().uuid().optional(),
});
export type ListDiscountsQuery = z.infer<typeof listDiscountsQuerySchema>;

export const createDiscountSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    code: z.string().trim().min(2).max(40).optional(),
    institutionId: z.string().uuid().optional(),
    kind: discountKindSchema,
    valueBps: z.number().int().min(0).max(10_000).optional(),
    valueMinor: z.number().int().min(0).max(1_000_000_000).optional(),
    currency: billingCurrencySchema.optional(),
    appliesTo: discountAppliesToSchema.default('invoice'),
    startsAt: z.string().datetime().optional(),
    endsAt: z.string().datetime().optional(),
  })
  .refine((d) => (d.kind === 'percentage' ? d.valueBps != null : d.valueMinor != null), {
    message: 'percentage discounts need valueBps; fixed discounts need valueMinor',
  });
export type CreateDiscountInput = z.infer<typeof createDiscountSchema>;

// --- Usage --------------------------------------------------------------------------------

export const recordUsageSchema = z.object({
  institutionId: z.string().uuid(),
  subscriptionId: z.string().uuid().optional(),
  metric: z.string().trim().min(1).max(80),
  quantity: z.number().int().min(0),
  periodStart: z.string().datetime().optional(),
  periodEnd: z.string().datetime().optional(),
});
export type RecordUsageInput = z.infer<typeof recordUsageSchema>;

// --- Entitlements (read-resolution) -------------------------------------------------------

export const entitlementsQuerySchema = z.object({ institutionId: z.string().uuid() });
export type EntitlementsQuery = z.infer<typeof entitlementsQuerySchema>;
