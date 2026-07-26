import { describe, expect, it, vi } from 'vitest';
import { BillingService } from './billing.service';
import type { ActionContext } from '../../common/action-context';

const INSTITUTION_ID = '11111111-1111-1111-1111-111111111111';
const SUB_ID = '22222222-2222-2222-2222-222222222222';
const INVOICE_ID = '33333333-3333-3333-3333-333333333333';
const PAYMENT_ID = '44444444-4444-4444-4444-444444444444';
const EMPLOYEE_ID = '55555555-5555-5555-5555-555555555555';

function makeCtx(): ActionContext {
  return {
    principalContext: {
      principal: {
        employeeId: EMPLOYEE_ID,
        email: 'owner@edrion.dev',
        fullName: 'Owner',
        roleKeys: ['finance_administrator'],
        permissions: { keys: new Set<string>(), hasWildcard: false },
        mfaEnrolled: true,
        lastAuthAt: new Date(),
      },
    },
    request: { requestId: 'r', correlationId: 'c', ip: '127.0.0.1', userAgent: 'vitest', apiEndpoint: 'POST /billing' },
  } as ActionContext;
}

/** Idempotency stub: runs the operation once, no replay store. */
const passthroughIdem = {
  run: async (_k: string | undefined, _s: string, fn: () => Promise<Record<string, unknown>>) => ({ result: await fn(), replayed: false }),
};

function makeService(repoOverrides: Record<string, unknown> = {}) {
  let lastInvoice: Record<string, unknown> | undefined;
  const repo = {
    subscriptionBillingContext: vi.fn(),
    insertInvoice: vi.fn().mockImplementation(async (v: Record<string, unknown>) => {
      lastInvoice = { id: INVOICE_ID, ...v };
      return lastInvoice;
    }),
    insertInvoiceItems: vi.fn().mockResolvedValue(undefined),
    invoiceItems: vi.fn().mockResolvedValue([]),
    paymentsForInvoice: vi.fn().mockResolvedValue([]),
    findInvoice: vi.fn().mockImplementation(async () => lastInvoice),
    findPayment: vi.fn(),
    refundedTotalForPayment: vi.fn().mockResolvedValue(0),
    insertRefund: vi.fn().mockImplementation(async (v: Record<string, unknown>) => ({ id: 'ref-1', ...v })),
    updatePayment: vi.fn().mockResolvedValue(undefined),
    stampInvoice: vi.fn().mockResolvedValue(undefined),
    ...repoOverrides,
  };
  const audit = { logAudit: vi.fn().mockResolvedValue(undefined) };
  const service = new BillingService(repo as never, passthroughIdem as never, audit as never);
  return { service, repo, audit };
}

describe('BillingService.createInvoice', () => {
  it('builds line items + totals from the subscription and audits invoice.create', async () => {
    const { service, repo, audit } = makeService({
      subscriptionBillingContext: vi.fn().mockResolvedValue({
        subscription: { id: SUB_ID, institutionId: INSTITUTION_ID, billingCycle: 'monthly', currency: 'USD', overridePriceMinor: null, discountBps: 0, periodStart: new Date(), periodEnd: new Date() },
        planName: 'Standard',
        planMonthlyPriceMinor: 49_900,
        planAnnualPriceMinor: 499_000,
        addons: [{ id: 'a1', description: 'Campus add-on', quantity: 2, unitPriceMinor: 9_900 }],
      }),
    });
    const invoice = await service.createInvoice({ subscriptionId: SUB_ID, taxRateBps: 1800 }, 'idem-key-123', makeCtx());
    // 49900 + 2*9900 = 69700 subtotal; tax 18% = 12546; total 82246
    expect(invoice.subtotalMinor).toBe(69_700);
    expect(invoice.taxMinor).toBe(12_546);
    expect(invoice.totalMinor).toBe(82_246);
    expect(invoice.amountDueMinor).toBe(82_246);
    expect(repo.insertInvoiceItems).toHaveBeenCalled();
    expect(audit.logAudit.mock.calls.at(-1)?.[0].action).toBe('invoice.create');
  });
});

describe('BillingService.createRefund', () => {
  it('rejects a refund that exceeds the remaining refundable amount', async () => {
    const { service } = makeService({
      findPayment: vi.fn().mockResolvedValue({ id: PAYMENT_ID, institutionId: INSTITUTION_ID, status: 'succeeded', amountMinor: 10_000, currency: 'USD', invoiceId: null }),
      refundedTotalForPayment: vi.fn().mockResolvedValue(8_000),
    });
    await expect(
      service.createRefund({ paymentId: PAYMENT_ID, amountMinor: 5_000, reason: 'partial refund attempt' }, 'idem-refund-1', makeCtx()),
    ).rejects.toMatchObject({ response: { code: 'REFUND_EXCEEDS_PAYMENT' } });
  });

  it('refunds within the remaining amount and marks the payment refunded when fully covered', async () => {
    const { service, repo, audit } = makeService({
      findPayment: vi.fn().mockResolvedValue({ id: PAYMENT_ID, institutionId: INSTITUTION_ID, status: 'succeeded', amountMinor: 10_000, currency: 'USD', invoiceId: null }),
      refundedTotalForPayment: vi.fn().mockResolvedValue(0),
    });
    await service.createRefund({ paymentId: PAYMENT_ID, reason: 'full refund please' }, 'idem-refund-2', makeCtx());
    expect(repo.updatePayment).toHaveBeenCalledWith(PAYMENT_ID, { status: 'refunded' });
    expect(audit.logAudit.mock.calls.at(-1)?.[0].action).toBe('refund.create');
  });
});

describe('BillingService.voidInvoice', () => {
  it('refuses to void a paid invoice', async () => {
    const { service } = makeService({
      findInvoice: vi.fn().mockResolvedValue({ id: INVOICE_ID, institutionId: INSTITUTION_ID, status: 'paid', version: 1 }),
    });
    await expect(
      service.voidInvoice(INVOICE_ID, { reason: 'mistaken invoice', version: 1 }, makeCtx()),
    ).rejects.toMatchObject({ response: { code: 'PAID_INVOICE' } });
  });
});
