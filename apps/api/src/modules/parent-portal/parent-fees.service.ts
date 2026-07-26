import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, desc, eq, inArray, schema, type Database } from '@edrion/database';
import type { AuditWriter, AuditEventInput } from '@edrion/audit';
import type { CreatePaymentIntentInput, PaymentWebhookInput } from '@edrion/schemas';
import { AUDIT_WRITER, DATABASE } from '../../common/tokens';
import { assertWard } from './guardian-scope.guard';
import type { GuardianContext } from './guardian-context';
import type { PortalActionContext } from '../portal/portal-action-context';
import { basePortalAudit } from '../portal/portal-action-context';
import { PaymentProviderRegistry } from './payment-provider.registry';
import { FeeLedgerService } from '../portal/fee-ledger.service';

const MODULE = 'parent-fees';

/**
 * Unified fees for a ward (tuition + fines + transport + hostel, via fee_invoices.source), plus the
 * online-payment lifecycle: create an intent (idempotent), settle ONLY via a verified webhook. Gated
 * by the guardian's `fees` visibility. Money is minor units throughout.
 */
@Injectable()
export class ParentFeesService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(AUDIT_WRITER) private readonly audit: AuditWriter,
    private readonly providers: PaymentProviderRegistry,
    private readonly ledger: FeeLedgerService,
  ) {}

  /** Ward ids the caller may see fees for (excludes wards with fees hidden). */
  private feeVisibleWards(guardian: GuardianContext, studentId?: string): string[] {
    if (studentId) {
      assertWard(guardian, studentId, 'fees');
      return [studentId];
    }
    return guardian.students.filter((s) => !s.hidden.fees).map((s) => s.studentId);
  }

  async listFees(guardian: GuardianContext, studentId?: string) {
    const ids = this.feeVisibleWards(guardian, studentId);
    if (!ids.length) return { invoices: [], totals: { outstandingMinor: 0, bySource: {} }, currency: 'INR' };
    const inv = schema.feeInvoices;
    const rows = await this.db
      .select()
      .from(inv)
      .where(inArray(inv.studentId, ids))
      .orderBy(desc(inv.issueDate));
    const bySource: Record<string, number> = {};
    let outstanding = 0;
    for (const r of rows) {
      const bal = Math.max(0, r.amount - r.amountPaid);
      if (r.status !== 'paid' && r.status !== 'cancelled') {
        outstanding += bal;
        bySource[r.source] = (bySource[r.source] ?? 0) + bal;
      }
    }
    return {
      invoices: rows.map((r) => ({
        id: r.id,
        invoiceNo: r.invoiceNo,
        studentId: r.studentId,
        source: r.source,
        amountMinor: r.amount,
        amountPaidMinor: r.amountPaid,
        balanceMinor: Math.max(0, r.amount - r.amountPaid),
        status: r.status,
        issueDate: r.issueDate,
        dueDate: r.dueDate,
      })),
      totals: { outstandingMinor: outstanding, bySource },
      currency: 'INR',
    };
  }

  private async loadWardInvoice(guardian: GuardianContext, invoiceId: string) {
    const [invoice] = await this.db
      .select()
      .from(schema.feeInvoices)
      .where(eq(schema.feeInvoices.id, invoiceId))
      .limit(1);
    if (!invoice) throw new NotFoundException({ code: 'INVOICE_NOT_FOUND', message: 'Invoice not found.' });
    assertWard(guardian, invoice.studentId, 'fees');
    return invoice;
  }

  async getInvoice(guardian: GuardianContext, invoiceId: string) {
    const invoice = await this.loadWardInvoice(guardian, invoiceId);
    const payments = await this.db
      .select()
      .from(schema.feePayments)
      .where(eq(schema.feePayments.invoiceId, invoiceId))
      .orderBy(desc(schema.feePayments.paidDate));
    return {
      id: invoice.id,
      invoiceNo: invoice.invoiceNo,
      studentId: invoice.studentId,
      source: invoice.source,
      amountMinor: invoice.amount,
      amountPaidMinor: invoice.amountPaid,
      balanceMinor: Math.max(0, invoice.amount - invoice.amountPaid),
      status: invoice.status,
      issueDate: invoice.issueDate,
      dueDate: invoice.dueDate,
      notes: invoice.notes,
      payments: payments.map((p) => ({ id: p.id, amountMinor: p.amount, method: p.method, paidDate: p.paidDate })),
    };
  }

  async createPaymentIntent(
    ctx: PortalActionContext,
    guardian: GuardianContext,
    invoiceId: string,
    input: CreatePaymentIntentInput,
    idempotencyKey: string | undefined,
  ) {
    const invoice = await this.loadWardInvoice(guardian, invoiceId);
    const balance = Math.max(0, invoice.amount - invoice.amountPaid);
    if (balance <= 0) throw new BadRequestException({ code: 'INVOICE_SETTLED', message: 'Nothing left to pay.' });
    const amount = input.amount ?? balance;
    if (amount > balance) throw new BadRequestException({ code: 'AMOUNT_EXCEEDS_BALANCE', message: 'Amount exceeds balance.' });

    // Idempotent create: replay the existing intent for the same key.
    if (idempotencyKey) {
      const [existing] = await this.db
        .select()
        .from(schema.parentPaymentIntents)
        .where(
          and(
            eq(schema.parentPaymentIntents.institutionId, guardian.institutionId),
            eq(schema.parentPaymentIntents.idempotencyKey, idempotencyKey),
          ),
        )
        .limit(1);
      if (existing) {
        return { intentId: existing.id, providerRef: existing.providerRef, amountMinor: existing.amount, status: existing.status, provider: existing.provider };
      }
    }

    const id = randomUUID();
    const provider = this.providers.configured();
    const created = await provider.createIntent({ intentId: id, amountMinor: amount, currency: 'INR', invoiceNo: invoice.invoiceNo });
    const [row] = await this.db
      .insert(schema.parentPaymentIntents)
      .values({
        id,
        institutionId: guardian.institutionId,
        feeInvoiceId: invoice.id,
        guardianUserId: guardian.guardianUserId,
        amount,
        provider: provider.key,
        providerRef: created.providerRef,
        status: created.status,
        idempotencyKey: idempotencyKey ?? null,
      })
      .returning();
    await this.writeAudit(ctx, 'parent.payment_intent.create', row!.id, { newState: { amount, invoiceNo: invoice.invoiceNo, providerRef: created.providerRef } });
    return { intentId: row!.id, providerRef: created.providerRef, amountMinor: amount, status: created.status, provider: provider.key };
  }

  /**
   * Settle a payment from a signed provider webhook. Verifies HMAC over the raw body, is idempotent on
   * replay, inserts a fee_payments row and re-derives the invoice balance/status. UNAUTHENTICATED
   * route — the signature is the only trust anchor.
   */
  async settleWebhook(rawBody: string, signature: string, payload: PaymentWebhookInput, providerEventId?: string) {
    return this.ledger.settleProviderEvent({
      provider: payload.provider,
      providerEventId: providerEventId ?? `${payload.provider}:${payload.event}:${payload.providerRef}`,
      eventType: payload.event,
      providerRef: payload.providerRef,
      amountMinor: payload.amount,
      status: payload.status,
      payload,
      rawBody,
      signature,
    });
  }

  async receipts(guardian: GuardianContext, studentId?: string) {
    const ids = this.feeVisibleWards(guardian, studentId);
    if (!ids.length) return { receipts: [] };
    const receipts = await this.db.select().from(schema.feeReceipts)
      .where(inArray(schema.feeReceipts.studentId, ids)).orderBy(desc(schema.feeReceipts.issuedAt));
    return {
      receipts: receipts.map((receipt) => ({
        id: receipt.id, receiptNo: receipt.receiptNo, studentId: receipt.studentId,
        amountMinor: receipt.amountMinor, method: receipt.method, issuedAt: receipt.issuedAt,
        status: receipt.status, cancelledReason: receipt.cancelledReason, pdfStorageRef: receipt.pdfStorageRef,
      })),
    };
  }

  private async writeAudit(ctx: PortalActionContext, action: string, entityId: string, extra: Partial<AuditEventInput> = {}) {
    await this.audit.logAudit({
      ...basePortalAudit(ctx),
      action,
      module: MODULE,
      entityType: 'parent_payment_intent',
      entityId,
      ...extra,
    } as AuditEventInput);
  }
}
