import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, desc, eq, inArray, schema, type Database } from '@edrion/database';
import type { AuditWriter, AuditEventInput } from '@edrion/audit';
import { ActorType } from '@edrion/shared-types';
import type { CreatePaymentIntentInput, PaymentWebhookInput } from '@edrion/schemas';
import { AUDIT_WRITER, DATABASE } from '../../common/tokens';
import { assertWard } from './guardian-scope.guard';
import type { GuardianContext } from './guardian-context';
import type { PortalActionContext } from '../portal/portal-action-context';
import { basePortalAudit } from '../portal/portal-action-context';
import { MockPaymentProvider } from './mock-payment.provider';

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
    private readonly mock: MockPaymentProvider,
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
    const created = await this.mock.createIntent({ intentId: id, amountMinor: amount, currency: 'INR', invoiceNo: invoice.invoiceNo });
    const [row] = await this.db
      .insert(schema.parentPaymentIntents)
      .values({
        id,
        institutionId: guardian.institutionId,
        feeInvoiceId: invoice.id,
        guardianUserId: guardian.guardianUserId,
        amount,
        provider: 'mock',
        providerRef: created.providerRef,
        status: created.status,
        idempotencyKey: idempotencyKey ?? null,
      })
      .returning();
    await this.writeAudit(ctx, 'parent.payment_intent.create', row!.id, { newState: { amount, invoiceNo: invoice.invoiceNo, providerRef: created.providerRef } });
    return { intentId: row!.id, providerRef: created.providerRef, amountMinor: amount, status: created.status, provider: 'mock' };
  }

  /**
   * Settle a payment from a signed provider webhook. Verifies HMAC over the raw body, is idempotent on
   * replay, inserts a fee_payments row and re-derives the invoice balance/status. UNAUTHENTICATED
   * route — the signature is the only trust anchor.
   */
  async settleWebhook(rawBody: string, signature: string, payload: PaymentWebhookInput) {
    if (!this.mock.verifyWebhook(rawBody, signature)) {
      throw new ForbiddenException({ code: 'BAD_SIGNATURE', message: 'Webhook signature verification failed.' });
    }
    const [intent] = await this.db
      .select()
      .from(schema.parentPaymentIntents)
      .where(eq(schema.parentPaymentIntents.providerRef, payload.providerRef))
      .limit(1);
    if (!intent) throw new NotFoundException({ code: 'INTENT_NOT_FOUND', message: 'No matching intent.' });

    // Idempotent replay: already settled → ack without a second payment.
    if (intent.status === 'succeeded') return { ok: true, alreadySettled: true, paymentId: intent.settledPaymentId };
    if (payload.status !== 'succeeded') {
      await this.db.update(schema.parentPaymentIntents).set({ status: payload.status }).where(eq(schema.parentPaymentIntents.id, intent.id));
      return { ok: true, settled: false, status: payload.status };
    }

    const [invoice] = await this.db.select().from(schema.feeInvoices).where(eq(schema.feeInvoices.id, intent.feeInvoiceId)).limit(1);
    if (!invoice) throw new NotFoundException({ code: 'INVOICE_NOT_FOUND', message: 'Invoice gone.' });

    const paymentId = randomUUID();
    const newPaid = invoice.amountPaid + intent.amount;
    const status = newPaid >= invoice.amount ? 'paid' : 'partial';
    await this.db.insert(schema.feePayments).values({
      id: paymentId,
      institutionId: invoice.institutionId,
      invoiceId: invoice.id,
      amount: intent.amount,
      method: 'online',
      reference: payload.providerRef,
      paidDate: new Date().toISOString().slice(0, 10),
    });
    await this.db.update(schema.feeInvoices).set({ amountPaid: newPaid, status }).where(eq(schema.feeInvoices.id, invoice.id));
    await this.db
      .update(schema.parentPaymentIntents)
      .set({ status: 'succeeded', settledPaymentId: paymentId, settledAt: new Date() })
      .where(eq(schema.parentPaymentIntents.id, intent.id));

    await this.audit.logAudit({
      actorType: ActorType.InstitutionUser,
      actorId: intent.guardianUserId,
      institutionId: invoice.institutionId,
      action: 'parent.payment.settle',
      module: MODULE,
      entityType: 'fee_payment',
      entityId: paymentId,
      newState: { amount: intent.amount, invoiceNo: invoice.invoiceNo, providerRef: payload.providerRef },
    } as AuditEventInput);
    return { ok: true, settled: true, paymentId, invoiceStatus: status };
  }

  async receipts(guardian: GuardianContext, studentId?: string) {
    const ids = this.feeVisibleWards(guardian, studentId);
    if (!ids.length) return { receipts: [] };
    const invoiceRows = await this.db
      .select({ id: schema.feeInvoices.id, invoiceNo: schema.feeInvoices.invoiceNo, studentId: schema.feeInvoices.studentId })
      .from(schema.feeInvoices)
      .where(inArray(schema.feeInvoices.studentId, ids));
    if (!invoiceRows.length) return { receipts: [] };
    const invoiceIds = invoiceRows.map((r) => r.id);
    const byId = new Map(invoiceRows.map((r) => [r.id, r]));
    const payments = await this.db
      .select()
      .from(schema.feePayments)
      .where(inArray(schema.feePayments.invoiceId, invoiceIds))
      .orderBy(desc(schema.feePayments.paidDate));
    return {
      receipts: payments.map((p) => ({
        id: p.id,
        invoiceNo: byId.get(p.invoiceId)?.invoiceNo ?? null,
        studentId: byId.get(p.invoiceId)?.studentId ?? null,
        amountMinor: p.amount,
        method: p.method,
        reference: p.reference,
        paidDate: p.paidDate,
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
