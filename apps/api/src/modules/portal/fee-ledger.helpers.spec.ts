import { describe, expect, it } from 'vitest';
import { allocateOldestDue, formatReceiptNo } from './fee-ledger.helpers';

describe('fee ledger helpers', () => {
  it('allocates oldest first with an exact sum', () => {
    const result = allocateOldestDue(12_000, [
      { id:'old', amount:10_000, amountPaid:2_000, status:'partial' },
      { id:'new', amount:10_000, amountPaid:0, status:'pending' },
    ]);
    expect(result).toEqual({ allocations:[{invoiceId:'old',amountMinor:8_000},{invoiceId:'new',amountMinor:4_000}], remainder:0 });
  });
  it('does not allocate cancelled invoices', () => {
    expect(allocateOldestDue(500,[{id:'x',amount:500,amountPaid:0,status:'cancelled'}]).remainder).toBe(500);
  });
  it('formats the permanent gapless receipt number', () => expect(formatReceiptNo('2026-27',42)).toBe('R/2026-27/000042'));
});
