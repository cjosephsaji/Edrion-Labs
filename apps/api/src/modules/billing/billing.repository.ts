import { Inject, Injectable } from '@nestjs/common';
import {
  and,
  asc,
  count,
  desc,
  eq,
  schema,
  sql,
  type Database,
  type Invoice,
  type NewCredit,
  type NewDiscount,
  type NewInvoice,
  type NewInvoiceItem,
  type NewPayment,
  type NewRefund,
  type NewUsageMetric,
  type Payment,
  type Refund,
  type SQL,
  type Subscription,
} from '@edrion/database';
import type {
  ListCreditsQuery,
  ListDiscountsQuery,
  ListInvoicesQuery,
  ListPaymentsQuery,
} from '@edrion/schemas';
import { DATABASE } from '../../common/tokens';

export interface InvoiceJoined extends Invoice {
  institutionName: string | null;
}

/** Subscription + plan price + active add-ons, read to build invoice line items. */
export interface SubscriptionBillingContext {
  subscription: Subscription;
  planName: string | null;
  planMonthlyPriceMinor: number;
  planAnnualPriceMinor: number;
  addons: { id: string; description: string; quantity: number; unitPriceMinor: number }[];
}

@Injectable()
export class BillingRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  // --- Invoices ---------------------------------------------------------------

  async listInvoices(q: ListInvoicesQuery): Promise<{ items: InvoiceJoined[]; total: number }> {
    const i = schema.invoices;
    const clauses: SQL[] = [];
    if (q.institutionId) clauses.push(eq(i.institutionId, q.institutionId));
    if (q.subscriptionId) clauses.push(eq(i.subscriptionId, q.subscriptionId));
    if (q.status) clauses.push(eq(i.status, q.status));
    const where = clauses.length ? and(...clauses) : undefined;

    const rows = await this.db
      .select({ invoice: i, institutionName: schema.institutions.displayName })
      .from(i)
      .leftJoin(schema.institutions, eq(schema.institutions.id, i.institutionId))
      .where(where)
      .orderBy(desc(i.createdAt))
      .limit(q.pageSize)
      .offset((q.page - 1) * q.pageSize);

    const totalRows = await this.db.select({ value: count() }).from(i).where(where);
    return {
      items: rows.map((r) => ({ ...r.invoice, institutionName: r.institutionName })),
      total: Number(totalRows[0]?.value ?? 0),
    };
  }

  async findInvoice(id: string): Promise<Invoice | undefined> {
    const [row] = await this.db.select().from(schema.invoices).where(eq(schema.invoices.id, id)).limit(1);
    return row;
  }

  async invoiceItems(invoiceId: string) {
    return this.db
      .select()
      .from(schema.invoiceItems)
      .where(eq(schema.invoiceItems.invoiceId, invoiceId))
      .orderBy(asc(schema.invoiceItems.createdAt));
  }

  async insertInvoice(values: NewInvoice): Promise<Invoice> {
    const [row] = await this.db.insert(schema.invoices).values(values).returning();
    return row!;
  }

  async insertInvoiceItems(values: NewInvoiceItem[]): Promise<void> {
    if (values.length) await this.db.insert(schema.invoiceItems).values(values);
  }

  async updateInvoiceWithVersion(
    id: string,
    expectedVersion: number,
    patch: Partial<NewInvoice>,
  ): Promise<Invoice | undefined> {
    const [row] = await this.db
      .update(schema.invoices)
      .set({ ...patch, version: expectedVersion + 1, updatedAt: new Date() })
      .where(and(eq(schema.invoices.id, id), eq(schema.invoices.version, expectedVersion)))
      .returning();
    return row;
  }

  async stampInvoice(id: string, patch: Partial<NewInvoice>): Promise<Invoice | undefined> {
    const [row] = await this.db
      .update(schema.invoices)
      .set({ ...patch, version: sql`${schema.invoices.version} + 1`, updatedAt: new Date() })
      .where(eq(schema.invoices.id, id))
      .returning();
    return row;
  }

  /** Count of finalized invoices, for the sequential invoice number. */
  async issuedInvoiceCount(): Promise<number> {
    const [row] = await this.db
      .select({ value: count() })
      .from(schema.invoices)
      .where(sql`${schema.invoices.number} is not null`);
    return Number(row?.value ?? 0);
  }

  // --- Payments ---------------------------------------------------------------

  async listPayments(q: ListPaymentsQuery): Promise<{ items: Payment[]; total: number }> {
    const p = schema.payments;
    const clauses: SQL[] = [];
    if (q.institutionId) clauses.push(eq(p.institutionId, q.institutionId));
    if (q.invoiceId) clauses.push(eq(p.invoiceId, q.invoiceId));
    if (q.status) clauses.push(eq(p.status, q.status));
    const where = clauses.length ? and(...clauses) : undefined;

    const items = await this.db
      .select()
      .from(p)
      .where(where)
      .orderBy(desc(p.createdAt))
      .limit(q.pageSize)
      .offset((q.page - 1) * q.pageSize);
    const totalRows = await this.db.select({ value: count() }).from(p).where(where);
    return { items, total: Number(totalRows[0]?.value ?? 0) };
  }

  async paymentsForInvoice(invoiceId: string): Promise<Payment[]> {
    return this.db.select().from(schema.payments).where(eq(schema.payments.invoiceId, invoiceId)).orderBy(desc(schema.payments.createdAt));
  }

  async findPayment(id: string): Promise<Payment | undefined> {
    const [row] = await this.db.select().from(schema.payments).where(eq(schema.payments.id, id)).limit(1);
    return row;
  }

  async insertPayment(values: NewPayment): Promise<Payment> {
    const [row] = await this.db.insert(schema.payments).values(values).returning();
    return row!;
  }

  async updatePayment(id: string, patch: Partial<NewPayment>): Promise<Payment | undefined> {
    const [row] = await this.db
      .update(schema.payments)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(schema.payments.id, id))
      .returning();
    return row;
  }

  /** Sum of succeeded payments already applied to an invoice. */
  async succeededPaidForInvoice(invoiceId: string): Promise<number> {
    const [row] = await this.db
      .select({ value: sql<number>`coalesce(sum(${schema.payments.amountMinor}), 0)` })
      .from(schema.payments)
      .where(and(eq(schema.payments.invoiceId, invoiceId), eq(schema.payments.status, 'succeeded')));
    return Number(row?.value ?? 0);
  }

  // --- Refunds ----------------------------------------------------------------

  async insertRefund(values: NewRefund): Promise<Refund> {
    const [row] = await this.db.insert(schema.refunds).values(values).returning();
    return row!;
  }

  async refundsForPayment(paymentId: string): Promise<Refund[]> {
    return this.db.select().from(schema.refunds).where(eq(schema.refunds.paymentId, paymentId)).orderBy(desc(schema.refunds.createdAt));
  }

  async refundedTotalForPayment(paymentId: string): Promise<number> {
    const [row] = await this.db
      .select({ value: sql<number>`coalesce(sum(${schema.refunds.amountMinor}), 0)` })
      .from(schema.refunds)
      .where(eq(schema.refunds.paymentId, paymentId));
    return Number(row?.value ?? 0);
  }

  // --- Credits ----------------------------------------------------------------

  async listCredits(q: ListCreditsQuery): Promise<{ items: (typeof schema.credits.$inferSelect)[]; total: number }> {
    const where = q.institutionId ? eq(schema.credits.institutionId, q.institutionId) : undefined;
    const items = await this.db
      .select()
      .from(schema.credits)
      .where(where)
      .orderBy(desc(schema.credits.createdAt))
      .limit(q.pageSize)
      .offset((q.page - 1) * q.pageSize);
    const totalRows = await this.db.select({ value: count() }).from(schema.credits).where(where);
    return { items, total: Number(totalRows[0]?.value ?? 0) };
  }

  async insertCredit(values: NewCredit) {
    const [row] = await this.db.insert(schema.credits).values(values).returning();
    return row!;
  }

  async creditBalanceForInstitution(institutionId: string): Promise<number> {
    const [row] = await this.db
      .select({ value: sql<number>`coalesce(sum(${schema.credits.remainingMinor}), 0)` })
      .from(schema.credits)
      .where(eq(schema.credits.institutionId, institutionId));
    return Number(row?.value ?? 0);
  }

  // --- Discounts --------------------------------------------------------------

  async listDiscounts(q: ListDiscountsQuery) {
    const where = q.institutionId ? eq(schema.discounts.institutionId, q.institutionId) : undefined;
    const items = await this.db
      .select()
      .from(schema.discounts)
      .where(where)
      .orderBy(desc(schema.discounts.createdAt))
      .limit(q.pageSize)
      .offset((q.page - 1) * q.pageSize);
    const totalRows = await this.db.select({ value: count() }).from(schema.discounts).where(where);
    return { items, total: Number(totalRows[0]?.value ?? 0) };
  }

  async insertDiscount(values: NewDiscount) {
    const [row] = await this.db.insert(schema.discounts).values(values).returning();
    return row!;
  }

  // --- Usage ------------------------------------------------------------------

  async insertUsage(values: NewUsageMetric) {
    const [row] = await this.db.insert(schema.usageMetrics).values(values).returning();
    return row!;
  }

  // --- Subscription context (for invoice generation) --------------------------

  async subscriptionBillingContext(subscriptionId: string): Promise<SubscriptionBillingContext | undefined> {
    const [sub] = await this.db
      .select()
      .from(schema.subscriptions)
      .where(eq(schema.subscriptions.id, subscriptionId))
      .limit(1);
    if (!sub) return undefined;
    const [pv] = await this.db
      .select()
      .from(schema.planVersions)
      .where(eq(schema.planVersions.id, sub.planVersionId))
      .limit(1);
    const [plan] = pv
      ? await this.db.select().from(schema.plans).where(eq(schema.plans.id, pv.planId)).limit(1)
      : [];
    const addonRows = await this.db
      .select()
      .from(schema.subscriptionAddons)
      .where(and(eq(schema.subscriptionAddons.subscriptionId, subscriptionId), eq(schema.subscriptionAddons.active, true)));

    return {
      subscription: sub,
      planName: plan?.name ?? null,
      planMonthlyPriceMinor: pv?.monthlyPriceMinor ?? 0,
      planAnnualPriceMinor: pv?.annualPriceMinor ?? 0,
      addons: addonRows.map((a) => ({
        id: a.id,
        description: `Campus add-on${a.campusId ? ` (${a.campusId.slice(0, 8)})` : ''}`,
        quantity: a.quantity,
        unitPriceMinor: a.unitPriceMinor,
      })),
    };
  }

  // --- Summary ----------------------------------------------------------------

  async invoiceSummary(institutionId: string): Promise<{ outstandingMinor: number; paidMinor: number; openCount: number }> {
    const [outstanding] = await this.db
      .select({ value: sql<number>`coalesce(sum(${schema.invoices.amountDueMinor}), 0)` })
      .from(schema.invoices)
      .where(and(eq(schema.invoices.institutionId, institutionId), eq(schema.invoices.status, 'open')));
    const [paid] = await this.db
      .select({ value: sql<number>`coalesce(sum(${schema.invoices.totalMinor}), 0)` })
      .from(schema.invoices)
      .where(and(eq(schema.invoices.institutionId, institutionId), eq(schema.invoices.status, 'paid')));
    const [openCount] = await this.db
      .select({ value: count() })
      .from(schema.invoices)
      .where(and(eq(schema.invoices.institutionId, institutionId), eq(schema.invoices.status, 'open')));
    return {
      outstandingMinor: Number(outstanding?.value ?? 0),
      paidMinor: Number(paid?.value ?? 0),
      openCount: Number(openCount?.value ?? 0),
    };
  }
}
