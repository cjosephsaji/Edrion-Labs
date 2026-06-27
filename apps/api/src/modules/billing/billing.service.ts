import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  calculateInvoiceTotals,
  type CreateDiscountInput,
  type CreateInvoiceInput,
  type CreateRefundInput,
  type DunningInput,
  type FinalizeInvoiceInput,
  type IssueCreditInput,
  type ListCreditsQuery,
  type ListDiscountsQuery,
  type ListInvoicesQuery,
  type ListPaymentsQuery,
  type RecordPaymentInput,
  type RecordUsageInput,
  type RetryPaymentInput,
  type VoidInvoiceInput,
} from '@edrion/schemas';
import type { AuditWriter, AuditEventInput } from '@edrion/audit';
import type { Invoice, NewInvoiceItem, Payment } from '@edrion/database';
import { AUDIT_WRITER } from '../../common/tokens';
import { baseAudit, type ActionContext } from '../../common/action-context';
import { IdempotencyService } from '../../common/idempotency.service';
import { BillingRepository } from './billing.repository';

const MODULE = 'billing';

@Injectable()
export class BillingService {
  constructor(
    private readonly repo: BillingRepository,
    private readonly idempotency: IdempotencyService,
    @Inject(AUDIT_WRITER) private readonly audit: AuditWriter,
  ) {}

  // --- Invoices ---------------------------------------------------------------

  listInvoices(q: ListInvoicesQuery) {
    return this.repo.listInvoices(q).then(({ items, total }) => ({ items, total }));
  }

  async getInvoice(id: string) {
    const invoice = await this.requireInvoice(id);
    const [items, payments] = await Promise.all([
      this.repo.invoiceItems(id),
      this.repo.paymentsForInvoice(id),
    ]);
    return { ...invoice, items, payments };
  }

  async createInvoice(input: CreateInvoiceInput, idemKey: string, ctx: ActionContext) {
    return (
      await this.idempotency.run(idemKey, 'billing.create_invoice', async () => {
        const billing = await this.repo.subscriptionBillingContext(input.subscriptionId);
        if (!billing) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Subscription not found' });
        const sub = billing.subscription;
        if (!sub.institutionId) {
          throw new BadRequestException({ code: 'NO_INSTITUTION', message: 'Subscription is not tied to an institution' });
        }

        const basePrice =
          sub.overridePriceMinor ??
          (sub.billingCycle === 'annual' ? billing.planAnnualPriceMinor : billing.planMonthlyPriceMinor);

        const lineInputs = [
          { kind: 'subscription', description: `${billing.planName ?? 'Plan'} (${sub.billingCycle})`, quantity: 1, unitPriceMinor: basePrice, amountMinor: basePrice },
          ...billing.addons.map((a) => ({
            kind: 'campus_addon',
            description: a.description,
            quantity: a.quantity,
            unitPriceMinor: a.unitPriceMinor,
            amountMinor: a.quantity * a.unitPriceMinor,
          })),
        ];

        const discountBps = input.discountBps ?? sub.discountBps;
        const taxRateBps = input.taxRateBps ?? 0;
        const totals = calculateInvoiceTotals(lineInputs, { discountBps, taxRateBps });

        const invoice = await this.repo.insertInvoice({
          institutionId: sub.institutionId,
          subscriptionId: sub.id,
          status: 'draft',
          currency: sub.currency,
          subtotalMinor: totals.subtotalMinor,
          discountMinor: totals.discountMinor,
          taxMinor: totals.taxMinor,
          totalMinor: totals.totalMinor,
          amountDueMinor: totals.totalMinor,
          taxRateBps,
          periodStart: input.periodStart ? new Date(input.periodStart) : sub.periodStart,
          periodEnd: input.periodEnd ? new Date(input.periodEnd) : sub.periodEnd,
          notes: input.notes ?? null,
          createdBy: ctx.principalContext.principal.employeeId,
        });

        const items: NewInvoiceItem[] = lineInputs.map((l) => ({
          invoiceId: invoice.id,
          kind: l.kind,
          description: l.description,
          quantity: l.quantity,
          unitPriceMinor: l.unitPriceMinor,
          amountMinor: l.amountMinor,
        }));
        await this.repo.insertInvoiceItems(items);

        await this.writeAudit(ctx, 'invoice', invoice.id, sub.institutionId, 'invoice.create', {
          newState: { subscriptionId: sub.id, totalMinor: totals.totalMinor, currency: invoice.currency },
        });
        return (await this.getInvoice(invoice.id)) as unknown as Record<string, unknown>;
      })
    ).result;
  }

  async finalizeInvoice(id: string, input: FinalizeInvoiceInput, ctx: ActionContext) {
    const invoice = await this.requireInvoice(id);
    if (invoice.status !== 'draft') {
      throw new BadRequestException({ code: 'NOT_DRAFT', message: 'Only a draft invoice can be finalized' });
    }
    const number = `INV-${String(100000 + (await this.repo.issuedInvoiceCount()) + 1)}`;
    const updated = await this.repo.stampInvoice(id, {
      status: 'open',
      number,
      issuedAt: new Date(),
      dueAt: input.dueAt ? new Date(input.dueAt) : new Date(Date.now() + 14 * 86_400_000),
      updatedBy: ctx.principalContext.principal.employeeId,
    });
    await this.writeAudit(ctx, 'invoice', id, invoice.institutionId, 'invoice.finalize', {
      previousState: { status: 'draft' },
      newState: { status: 'open', number },
    });
    return this.getInvoice((updated ?? invoice).id);
  }

  async voidInvoice(id: string, input: VoidInvoiceInput, ctx: ActionContext) {
    const invoice = await this.requireInvoice(id);
    if (invoice.status === 'paid') {
      throw new BadRequestException({ code: 'PAID_INVOICE', message: 'A paid invoice cannot be voided; issue a refund instead' });
    }
    const updated = await this.repo.updateInvoiceWithVersion(id, input.version, {
      status: 'void',
      voidedAt: new Date(),
      amountDueMinor: 0,
      updatedBy: ctx.principalContext.principal.employeeId,
    });
    if (!updated) throw this.versionConflict();
    await this.writeAudit(ctx, 'invoice', id, invoice.institutionId, 'invoice.void', {
      reason: input.reason,
      previousState: { status: invoice.status },
      newState: { status: 'void' },
    });
    return this.getInvoice(id);
  }

  async advanceDunning(id: string, input: DunningInput, ctx: ActionContext) {
    const invoice = await this.requireInvoice(id);
    const updated = await this.repo.updateInvoiceWithVersion(id, input.version, {
      dunningState: input.dunningState,
      status: input.dunningState === 'written_off' ? 'uncollectible' : invoice.status,
      updatedBy: ctx.principalContext.principal.employeeId,
    });
    if (!updated) throw this.versionConflict();
    await this.writeAudit(ctx, 'invoice', id, invoice.institutionId, 'invoice.dunning', {
      reason: input.reason,
      previousState: { dunningState: invoice.dunningState },
      newState: { dunningState: input.dunningState },
    });
    return this.getInvoice(id);
  }

  // --- Payments ---------------------------------------------------------------

  listPayments(q: ListPaymentsQuery) {
    return this.repo.listPayments(q);
  }

  async recordPayment(input: RecordPaymentInput, idemKey: string, ctx: ActionContext) {
    return (
      await this.idempotency.run(idemKey, 'billing.record_payment', async () => {
        const succeeded = input.succeeded;
        const payment = await this.repo.insertPayment({
          institutionId: input.institutionId,
          invoiceId: input.invoiceId ?? null,
          status: succeeded ? 'succeeded' : 'failed',
          method: input.method,
          amountMinor: input.amountMinor,
          provider: input.provider,
          providerRef: input.providerRef ?? null,
          failureReason: succeeded ? null : input.failureReason ?? 'declined',
          idempotencyKey: idemKey,
          processedAt: new Date(),
          createdBy: ctx.principalContext.principal.employeeId,
        });
        if (input.invoiceId) await this.applyPaymentToInvoice(input.invoiceId, succeeded);
        await this.writeAudit(ctx, 'payment', payment.id, input.institutionId, 'payment.record', {
          newState: { amountMinor: input.amountMinor, status: payment.status, invoiceId: input.invoiceId ?? null },
        });
        return payment as unknown as Record<string, unknown>;
      })
    ).result;
  }

  async retryPayment(id: string, input: RetryPaymentInput, ctx: ActionContext) {
    const payment = await this.requirePayment(id);
    if (payment.status !== 'failed') {
      throw new BadRequestException({ code: 'NOT_FAILED', message: 'Only a failed payment can be retried' });
    }
    const updated = await this.repo.updatePayment(id, {
      status: input.succeeded ? 'succeeded' : 'failed',
      failureReason: input.succeeded ? null : input.failureReason ?? 'declined',
      processedAt: new Date(),
    });
    if (payment.invoiceId) await this.applyPaymentToInvoice(payment.invoiceId, input.succeeded);
    await this.writeAudit(ctx, 'payment', id, payment.institutionId, 'payment.retry', {
      reason: input.reason,
      previousState: { status: 'failed' },
      newState: { status: updated?.status },
    });
    return updated;
  }

  /** Recompute an invoice's paid/due/status from its succeeded payments. */
  private async applyPaymentToInvoice(invoiceId: string, succeeded: boolean): Promise<void> {
    const invoice = await this.repo.findInvoice(invoiceId);
    if (!invoice) return;
    if (!succeeded) {
      await this.repo.stampInvoice(invoiceId, {
        attemptCount: invoice.attemptCount + 1,
        dunningState: invoice.dunningState === 'none' ? 'overdue' : invoice.dunningState,
      });
      return;
    }
    const paid = await this.repo.succeededPaidForInvoice(invoiceId);
    const fullyPaid = paid >= invoice.totalMinor;
    await this.repo.stampInvoice(invoiceId, {
      amountPaidMinor: paid,
      amountDueMinor: Math.max(0, invoice.totalMinor - paid),
      status: fullyPaid ? 'paid' : invoice.status === 'draft' ? 'open' : invoice.status,
      paidAt: fullyPaid ? new Date() : invoice.paidAt,
      dunningState: fullyPaid ? 'none' : invoice.dunningState,
    });
  }

  // --- Refunds ----------------------------------------------------------------

  async createRefund(input: CreateRefundInput, idemKey: string, ctx: ActionContext) {
    return (
      await this.idempotency.run(idemKey, 'billing.create_refund', async () => {
        const payment = await this.requirePayment(input.paymentId);
        if (payment.status !== 'succeeded' && payment.status !== 'refunded') {
          throw new BadRequestException({ code: 'NOT_REFUNDABLE', message: 'Only a succeeded payment can be refunded' });
        }
        const already = await this.repo.refundedTotalForPayment(input.paymentId);
        const amount = input.amountMinor ?? payment.amountMinor - already;
        if (amount <= 0 || already + amount > payment.amountMinor) {
          throw new BadRequestException({ code: 'REFUND_EXCEEDS_PAYMENT', message: 'Refund exceeds the remaining refundable amount' });
        }
        const refund = await this.repo.insertRefund({
          paymentId: payment.id,
          invoiceId: payment.invoiceId,
          institutionId: payment.institutionId,
          amountMinor: amount,
          currency: payment.currency,
          reason: input.reason,
          status: 'succeeded',
          createdBy: ctx.principalContext.principal.employeeId,
        });
        const fullyRefunded = already + amount >= payment.amountMinor;
        if (fullyRefunded) await this.repo.updatePayment(payment.id, { status: 'refunded' });
        if (payment.invoiceId) {
          const inv = await this.repo.findInvoice(payment.invoiceId);
          if (inv) await this.repo.stampInvoice(payment.invoiceId, { status: 'refunded' });
        }
        await this.writeAudit(ctx, 'refund', refund.id, payment.institutionId, 'refund.create', {
          reason: input.reason,
          newState: { paymentId: payment.id, amountMinor: amount, fullyRefunded },
        });
        return refund as unknown as Record<string, unknown>;
      })
    ).result;
  }

  // --- Credits ----------------------------------------------------------------

  listCredits(q: ListCreditsQuery) {
    return this.repo.listCredits(q);
  }

  async issueCredit(input: IssueCreditInput, idemKey: string, ctx: ActionContext) {
    return (
      await this.idempotency.run(idemKey, 'billing.issue_credit', async () => {
        const credit = await this.repo.insertCredit({
          institutionId: input.institutionId,
          subscriptionId: input.subscriptionId ?? null,
          amountMinor: input.amountMinor,
          remainingMinor: input.amountMinor,
          currency: input.currency,
          reason: input.reason,
          source: input.source,
          expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
          createdBy: ctx.principalContext.principal.employeeId,
        });
        await this.writeAudit(ctx, 'credit', credit.id, input.institutionId, 'credit.issue', {
          reason: input.reason,
          newState: { amountMinor: input.amountMinor, currency: input.currency, source: input.source },
        });
        return credit as unknown as Record<string, unknown>;
      })
    ).result;
  }

  // --- Discounts --------------------------------------------------------------

  listDiscounts(q: ListDiscountsQuery) {
    return this.repo.listDiscounts(q);
  }

  async createDiscount(input: CreateDiscountInput, ctx: ActionContext) {
    const discount = await this.repo.insertDiscount({
      name: input.name,
      code: input.code ?? null,
      institutionId: input.institutionId ?? null,
      kind: input.kind,
      valueBps: input.valueBps ?? null,
      valueMinor: input.valueMinor ?? null,
      currency: input.currency ?? null,
      appliesTo: input.appliesTo,
      startsAt: input.startsAt ? new Date(input.startsAt) : null,
      endsAt: input.endsAt ? new Date(input.endsAt) : null,
      createdBy: ctx.principalContext.principal.employeeId,
    });
    await this.writeAudit(ctx, 'discount', discount.id, input.institutionId ?? undefined, 'discount.create', {
      newState: { name: input.name, kind: input.kind, appliesTo: input.appliesTo },
    });
    return discount;
  }

  // --- Usage ------------------------------------------------------------------

  async recordUsage(input: RecordUsageInput, ctx: ActionContext) {
    const row = await this.repo.insertUsage({
      institutionId: input.institutionId,
      subscriptionId: input.subscriptionId ?? null,
      metric: input.metric,
      quantity: input.quantity,
      periodStart: input.periodStart ? new Date(input.periodStart) : null,
      periodEnd: input.periodEnd ? new Date(input.periodEnd) : null,
    });
    await this.writeAudit(ctx, 'usage_metric', row.id, input.institutionId, 'usage.record', {
      newState: { metric: input.metric, quantity: input.quantity },
    });
    return row;
  }

  // --- Summary ----------------------------------------------------------------

  async summary(institutionId: string) {
    const [invoice, creditBalanceMinor] = await Promise.all([
      this.repo.invoiceSummary(institutionId),
      this.repo.creditBalanceForInstitution(institutionId),
    ]);
    return { ...invoice, creditBalanceMinor };
  }

  // --- Helpers ----------------------------------------------------------------

  private async requireInvoice(id: string): Promise<Invoice> {
    const invoice = await this.repo.findInvoice(id);
    if (!invoice) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Invoice not found' });
    return invoice;
  }

  private async requirePayment(id: string): Promise<Payment> {
    const payment = await this.repo.findPayment(id);
    if (!payment) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Payment not found' });
    return payment;
  }

  private async writeAudit(
    ctx: ActionContext,
    entityType: string,
    entityId: string,
    institutionId: string | undefined,
    action: string,
    extra: Partial<AuditEventInput> = {},
  ): Promise<void> {
    await this.audit.logAudit({
      ...baseAudit(ctx),
      action,
      module: MODULE,
      entityType,
      entityId,
      institutionId,
      ...extra,
    } as AuditEventInput);
  }

  private versionConflict() {
    return new ConflictException({ code: 'VERSION_CONFLICT', message: 'This invoice changed since you loaded it. Reload and try again.' });
  }
}
