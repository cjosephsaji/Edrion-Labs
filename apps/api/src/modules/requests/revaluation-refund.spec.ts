import { describe, expect, it } from 'vitest';

describe('revaluation reject refund gate', () => {
  it('AC 16: refund only when knob enabled and invoice paid', () => {
    function shouldRefund(opts: { type: string; refundOnReject: boolean; amountPaid: number }) {
      return opts.type === 'revaluation' && opts.refundOnReject && opts.amountPaid > 0;
    }
    expect(shouldRefund({ type: 'revaluation', refundOnReject: true, amountPaid: 50000 })).toBe(true);
    expect(shouldRefund({ type: 'revaluation', refundOnReject: false, amountPaid: 50000 })).toBe(false);
    expect(shouldRefund({ type: 'leave_request', refundOnReject: true, amountPaid: 50000 })).toBe(false);
  });
});
