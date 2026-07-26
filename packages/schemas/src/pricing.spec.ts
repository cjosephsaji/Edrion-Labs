import { describe, expect, it } from 'vitest';
import { Currency } from '@edrion/shared-types';
import {
  calculateCampusCharge,
  calculatePlanChangeProration,
  prorateMinorByDays,
  type CampusPricingContext,
  type PlanChangeProrationContext,
} from './pricing';

describe('prorateMinorByDays', () => {
  it('floors tuition proration and exposes its basis', () => {
    expect(prorateMinorByDays(10_000, '2026-01-01', '2026-01-11', '2026-01-06')).toEqual({
      amountMinor: 5_000,
      factor: 0.5,
      totalDays: 10,
      billableDays: 5,
    });
  });
});

const baseCtx: CampusPricingContext = {
  baseCampusAllowance: 2,
  currentCampusCount: 2,
  perCampusPriceMinor: 10_000, // 100.00
  currency: Currency.USD,
  periodStart: '2026-06-01T00:00:00.000Z',
  periodEnd: '2026-07-01T00:00:00.000Z',
};

describe('calculateCampusCharge', () => {
  it('is free when inside the base allowance', () => {
    const r = calculateCampusCharge({ ...baseCtx, currentCampusCount: 1 });
    expect(r.includedInBase).toBe(true);
    expect(r.totalMinor).toBe(0);
  });

  it('charges full price at period start (no proration loss)', () => {
    const r = calculateCampusCharge(baseCtx, { effectiveDate: baseCtx.periodStart });
    expect(r.includedInBase).toBe(false);
    expect(r.prorationFactor).toBe(1);
    expect(r.subtotalMinor).toBe(10_000);
    expect(r.totalMinor).toBe(10_000);
  });

  it('prorates by remaining days in the period', () => {
    // Effective mid-period (15 days remaining of 30) → ~50%.
    const r = calculateCampusCharge(baseCtx, { effectiveDate: '2026-06-16T00:00:00.000Z' });
    expect(r.prorationFactor).toBeCloseTo(0.5, 1);
    expect(r.subtotalMinor).toBe(5_000);
  });

  it('applies a custom discount in basis points', () => {
    const r = calculateCampusCharge(baseCtx, {
      effectiveDate: baseCtx.periodStart,
      customDiscountBps: 2500, // 25%
    });
    expect(r.discountMinor).toBe(2_500);
    expect(r.subtotalMinor).toBe(7_500);
  });

  it('applies tax after discount', () => {
    const r = calculateCampusCharge(
      { ...baseCtx, taxRateBps: 1800 },
      { effectiveDate: baseCtx.periodStart },
    );
    expect(r.taxMinor).toBe(1_800);
    expect(r.totalMinor).toBe(11_800);
  });

  it('prefers an institution-specific price override', () => {
    const r = calculateCampusCharge(
      { ...baseCtx, institutionOverridePriceMinor: 6_000 },
      { effectiveDate: baseCtx.periodStart },
    );
    expect(r.listPriceMinor).toBe(6_000);
    expect(r.totalMinor).toBe(6_000);
  });

  it('forcePaidAddon charges even within allowance', () => {
    const r = calculateCampusCharge(
      { ...baseCtx, currentCampusCount: 0 },
      { forcePaidAddon: true, effectiveDate: baseCtx.periodStart },
    );
    expect(r.includedInBase).toBe(false);
    expect(r.totalMinor).toBe(10_000);
  });
});

const changeCtx: PlanChangeProrationContext = {
  currency: Currency.USD,
  currentPeriodPriceMinor: 49_900, // current plan 499.00 / month
  newPeriodPriceMinor: 99_900, // new plan 999.00 / month
  periodStart: '2026-06-01T00:00:00.000Z',
  periodEnd: '2026-07-01T00:00:00.000Z',
};

describe('calculatePlanChangeProration', () => {
  it('at period start credits the full current plan and charges the full new plan', () => {
    const r = calculatePlanChangeProration(changeCtx, { effectiveDate: changeCtx.periodStart });
    expect(r.prorationFactor).toBe(1);
    expect(r.creditUnusedMinor).toBe(49_900);
    expect(r.chargeNewMinor).toBe(99_900);
    expect(r.subtotalMinor).toBe(50_000); // pure upgrade delta
    expect(r.isCredit).toBe(false);
  });

  it('prorates an upgrade mid-period (≈50% of 30 days)', () => {
    const r = calculatePlanChangeProration(changeCtx, { effectiveDate: '2026-06-16T00:00:00.000Z' });
    expect(r.prorationFactor).toBeCloseTo(0.5, 1);
    expect(r.creditUnusedMinor).toBe(24_950);
    expect(r.chargeNewMinor).toBe(49_950);
    expect(r.subtotalMinor).toBe(25_000);
  });

  it('a downgrade nets to a credit (negative total, no tax on a credit)', () => {
    const r = calculatePlanChangeProration(
      { ...changeCtx, currentPeriodPriceMinor: 99_900, newPeriodPriceMinor: 49_900, taxRateBps: 1800 },
      { effectiveDate: changeCtx.periodStart },
    );
    expect(r.subtotalMinor).toBe(-50_000);
    expect(r.taxMinor).toBe(0);
    expect(r.totalMinor).toBe(-50_000);
    expect(r.isCredit).toBe(true);
  });

  it('taxes a positive net change after proration', () => {
    const r = calculatePlanChangeProration(
      { ...changeCtx, taxRateBps: 1800 },
      { effectiveDate: changeCtx.periodStart },
    );
    expect(r.subtotalMinor).toBe(50_000);
    expect(r.taxMinor).toBe(9_000);
    expect(r.totalMinor).toBe(59_000);
  });
});
