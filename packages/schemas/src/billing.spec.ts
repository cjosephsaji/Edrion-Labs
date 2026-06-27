import { describe, expect, it } from 'vitest';
import { calculateInvoiceTotals, createDiscountSchema } from './billing';

describe('calculateInvoiceTotals', () => {
  const items = [{ amountMinor: 49_900 }, { amountMinor: 9_900 }]; // 59,800

  it('sums line items with no discount or tax', () => {
    const t = calculateInvoiceTotals(items);
    expect(t).toEqual({ subtotalMinor: 59_800, discountMinor: 0, taxMinor: 0, totalMinor: 59_800 });
  });

  it('applies a bps discount then taxes the discounted subtotal', () => {
    const t = calculateInvoiceTotals(items, { discountBps: 1000, taxRateBps: 1800 }); // 10% off, 18% tax
    expect(t.discountMinor).toBe(5_980);
    // taxable 53,820 → tax 9,688 (rounded)
    expect(t.taxMinor).toBe(9_688);
    expect(t.totalMinor).toBe(63_508);
  });

  it('a fixed discount wins over bps and never exceeds the subtotal', () => {
    const t = calculateInvoiceTotals(items, { discountBps: 5000, discountFixedMinor: 1_000_000 });
    expect(t.discountMinor).toBe(59_800); // clamped to subtotal
    expect(t.totalMinor).toBe(0);
  });

  it('handles an empty invoice', () => {
    expect(calculateInvoiceTotals([])).toEqual({ subtotalMinor: 0, discountMinor: 0, taxMinor: 0, totalMinor: 0 });
  });
});

describe('createDiscountSchema', () => {
  it('requires valueBps for a percentage discount', () => {
    expect(() => createDiscountSchema.parse({ name: 'Promo', kind: 'percentage', appliesTo: 'invoice' })).toThrow();
    expect(createDiscountSchema.parse({ name: 'Promo', kind: 'percentage', valueBps: 1500, appliesTo: 'invoice' }).valueBps).toBe(1500);
  });

  it('requires valueMinor for a fixed discount', () => {
    expect(() => createDiscountSchema.parse({ name: 'Flat', kind: 'fixed', appliesTo: 'invoice' })).toThrow();
    expect(createDiscountSchema.parse({ name: 'Flat', kind: 'fixed', valueMinor: 5000, appliesTo: 'invoice' }).valueMinor).toBe(5000);
  });
});
