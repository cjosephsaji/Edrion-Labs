import type { Currency } from '@edrion/shared-types';

/**
 * Pure campus pricing engine. No IO — fed by the subscription's current state. Used by the
 * billing service to produce the confirmation preview before any charge is generated.
 *
 * All money is integer minor units. Proration is day-based on the current billing period.
 */

export interface CampusPricingContext {
  /** Campuses the base plan includes at no extra charge. */
  baseCampusAllowance: number;
  /** Campuses already counted against the subscription (included + paid). */
  currentCampusCount: number;
  /** Per-campus add-on price (minor units) for this subscription. */
  perCampusPriceMinor: number;
  currency: Currency;
  /** Institution-specific override of the per-campus price, if any. */
  institutionOverridePriceMinor?: number;
  /** Current billing period, ISO dates. Used for proration. */
  periodStart: string;
  periodEnd: string;
  /** Tax rate in basis points (e.g. 1800 = 18%). 0 if not applicable. */
  taxRateBps?: number;
}

export interface CampusChargeBreakdown {
  /** True when the new campus fits inside the base allowance → no charge. */
  includedInBase: boolean;
  currency: Currency;
  /** Full-period list price before proration/discount. */
  listPriceMinor: number;
  /** Discount applied (custom discount), minor units. */
  discountMinor: number;
  /** Proration factor applied, 0..1 (1 = full period). */
  prorationFactor: number;
  /** Charge after proration + discount, before tax. */
  subtotalMinor: number;
  taxMinor: number;
  /** Final amount that will hit the next invoice. */
  totalMinor: number;
  effectiveDate: string;
  nextInvoiceImpactMinor: number;
}

function clampFactor(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

/** Day count between two ISO dates (UTC), minimum 1. */
function dayDiff(from: string, to: string): number {
  const ms = Date.parse(to) - Date.parse(from);
  return Math.max(1, Math.round(ms / 86_400_000));
}

/**
 * Compute the charge for adding one campus.
 *
 * - Inside base allowance → £0, includedInBase=true.
 * - Otherwise list price = institution override ?? per-campus price.
 * - Prorated by remaining days in the current period from the effective date.
 * - Custom discount (bps) applied to the prorated subtotal, then tax.
 */
export function calculateCampusCharge(
  ctx: CampusPricingContext,
  opts: { effectiveDate?: string; forcePaidAddon?: boolean; customDiscountBps?: number } = {},
): CampusChargeBreakdown {
  const effectiveDate = opts.effectiveDate ?? ctx.periodStart;
  const includedInBase =
    !opts.forcePaidAddon && ctx.currentCampusCount < ctx.baseCampusAllowance;

  const currency = ctx.currency;

  if (includedInBase) {
    return {
      includedInBase: true,
      currency,
      listPriceMinor: 0,
      discountMinor: 0,
      prorationFactor: 1,
      subtotalMinor: 0,
      taxMinor: 0,
      totalMinor: 0,
      effectiveDate,
      nextInvoiceImpactMinor: 0,
    };
  }

  const listPriceMinor = ctx.institutionOverridePriceMinor ?? ctx.perCampusPriceMinor;

  const periodDays = dayDiff(ctx.periodStart, ctx.periodEnd);
  const remainingDays = dayDiff(effectiveDate, ctx.periodEnd);
  const prorationFactor = clampFactor(remainingDays / periodDays);

  const proratedBeforeDiscount = Math.round(listPriceMinor * prorationFactor);

  const discountBps = opts.customDiscountBps ?? 0;
  const discountMinor = Math.round((proratedBeforeDiscount * discountBps) / 10_000);
  const subtotalMinor = proratedBeforeDiscount - discountMinor;

  const taxRateBps = ctx.taxRateBps ?? 0;
  const taxMinor = Math.round((subtotalMinor * taxRateBps) / 10_000);
  const totalMinor = subtotalMinor + taxMinor;

  return {
    includedInBase: false,
    currency,
    listPriceMinor,
    discountMinor,
    prorationFactor,
    subtotalMinor,
    taxMinor,
    totalMinor,
    effectiveDate,
    nextInvoiceImpactMinor: totalMinor,
  };
}

// --- Subscription plan-change / cycle-change proration -------------------------------------

export interface PlanChangeProrationContext {
  currency: Currency;
  /** Price already paid for the current period on the current plan/cycle (minor). */
  currentPeriodPriceMinor: number;
  /** Price of the new plan/cycle for the same period (minor). */
  newPeriodPriceMinor: number;
  periodStart: string;
  periodEnd: string;
  /** Tax rate in basis points (e.g. 1800 = 18%). 0 if not applicable. */
  taxRateBps?: number;
}

export interface PlanChangeProrationBreakdown {
  currency: Currency;
  /** Remaining-days / period-days fraction the change applies to, 0..1. */
  prorationFactor: number;
  /** Credit for the unused remainder of the current plan (minor). */
  creditUnusedMinor: number;
  /** Prorated charge for the new plan over the remaining days (minor). */
  chargeNewMinor: number;
  /** chargeNew − creditUnused, before tax. Negative = net credit to the customer. */
  subtotalMinor: number;
  /** Tax on a positive net charge only (a net credit is not taxed). */
  taxMinor: number;
  /** Net effect on the next invoice. Negative = credit. */
  totalMinor: number;
  isCredit: boolean;
  effectiveDate: string;
  nextInvoiceImpactMinor: number;
}

/**
 * Day-based proration for an in-period plan change (also covers a billing-cycle switch, which is
 * just a plan change where only the price differs). Credits the unused remainder of the current
 * plan and charges the new plan over the same remaining days; the net hits the next invoice. A
 * downgrade nets to a credit (negative total). Pure — no IO — fed by the subscription's state.
 */
export function calculatePlanChangeProration(
  ctx: PlanChangeProrationContext,
  opts: { effectiveDate?: string } = {},
): PlanChangeProrationBreakdown {
  const effectiveDate = opts.effectiveDate ?? ctx.periodStart;
  const periodDays = dayDiff(ctx.periodStart, ctx.periodEnd);
  const remainingDays = dayDiff(effectiveDate, ctx.periodEnd);
  const prorationFactor = clampFactor(remainingDays / periodDays);

  const creditUnusedMinor = Math.round(ctx.currentPeriodPriceMinor * prorationFactor);
  const chargeNewMinor = Math.round(ctx.newPeriodPriceMinor * prorationFactor);
  const subtotalMinor = chargeNewMinor - creditUnusedMinor;

  const taxRateBps = ctx.taxRateBps ?? 0;
  const taxMinor = subtotalMinor > 0 ? Math.round((subtotalMinor * taxRateBps) / 10_000) : 0;
  const totalMinor = subtotalMinor + taxMinor;

  return {
    currency: ctx.currency,
    prorationFactor,
    creditUnusedMinor,
    chargeNewMinor,
    subtotalMinor,
    taxMinor,
    totalMinor,
    isCredit: totalMinor < 0,
    effectiveDate,
    nextInvoiceImpactMinor: totalMinor,
  };
}
