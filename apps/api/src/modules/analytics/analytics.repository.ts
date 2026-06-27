import { Inject, Injectable } from '@nestjs/common';
import { and, count, eq, schema, sql, type Database } from '@edrion/database';
import { DATABASE } from '../../common/tokens';

/** Minimal institution row used to derive pending actions (single query, no N+1). */
export interface PendingInstitutionRow {
  id: string;
  displayName: string;
  status: string;
  onboardingStatus: string;
  trialEndsAt: Date | null;
  riskFlags: string[] | null;
}

export interface DashboardAggregates {
  institutions: Record<string, number>;
  subscriptions: Record<string, number>;
  billing: {
    outstandingMinor: number;
    paidMinor: number;
    openInvoices: number;
    creditBalanceMinor: number;
  };
  users: { institutionUsers: number; independentUsers: number };
  revenue: { recurringMonthlyMinor: number };
}

/** Typed SQL only. Read-only aggregates — grouped queries, run in parallel. */
@Injectable()
export class AnalyticsRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async dashboard(): Promise<DashboardAggregates> {
    const [instRows, subRows, billingRows, revenueRows, iuRows, indRows] = await Promise.all([
      // Institutions by status (single GROUP BY).
      this.db
        .select({ status: schema.institutions.status, value: count() })
        .from(schema.institutions)
        .groupBy(schema.institutions.status),
      // Subscriptions by status.
      this.db
        .select({ status: schema.subscriptions.status, value: count() })
        .from(schema.subscriptions)
        .groupBy(schema.subscriptions.status),
      // Billing rollup — conditional sums in one row.
      this.db
        .select({
          outstanding: sql<number>`coalesce(sum(case when ${schema.invoices.status} in ('open','past_due','uncollectible') then ${schema.invoices.amountDueMinor} else 0 end), 0)`,
          paid: sql<number>`coalesce(sum(${schema.invoices.amountPaidMinor}), 0)`,
          openInvoices: sql<number>`coalesce(sum(case when ${schema.invoices.status} = 'open' then 1 else 0 end), 0)`,
        })
        .from(schema.invoices),
      // Recurring monthly revenue — active subscriptions × (override ?? plan monthly price). One join.
      this.db
        .select({
          recurring: sql<number>`coalesce(sum(coalesce(${schema.subscriptions.overridePriceMinor}, ${schema.planVersions.monthlyPriceMinor})), 0)`,
        })
        .from(schema.subscriptions)
        .innerJoin(
          schema.planVersions,
          eq(schema.subscriptions.planVersionId, schema.planVersions.id),
        )
        .where(eq(schema.subscriptions.status, 'active')),
      this.db.select({ value: count() }).from(schema.institutionUsers),
      this.db.select({ value: count() }).from(schema.independentUsers),
    ]);

    const creditRows = await this.db
      .select({ value: sql<number>`coalesce(sum(${schema.credits.remainingMinor}), 0)` })
      .from(schema.credits);

    return {
      institutions: Object.fromEntries(instRows.map((r) => [r.status, Number(r.value)])),
      subscriptions: Object.fromEntries(subRows.map((r) => [r.status, Number(r.value)])),
      billing: {
        outstandingMinor: Number(billingRows[0]?.outstanding ?? 0),
        paidMinor: Number(billingRows[0]?.paid ?? 0),
        openInvoices: Number(billingRows[0]?.openInvoices ?? 0),
        creditBalanceMinor: Number(creditRows[0]?.value ?? 0),
      },
      users: {
        institutionUsers: Number(iuRows[0]?.value ?? 0),
        independentUsers: Number(indRows[0]?.value ?? 0),
      },
      revenue: { recurringMonthlyMinor: Number(revenueRows[0]?.recurring ?? 0) },
    };
  }

  /** All institutions with the fields needed to classify pending actions (single query). */
  institutionsForPendingActions(): Promise<PendingInstitutionRow[]> {
    return this.db
      .select({
        id: schema.institutions.id,
        displayName: schema.institutions.displayName,
        status: schema.institutions.status,
        onboardingStatus: schema.institutions.onboardingStatus,
        trialEndsAt: schema.institutions.trialEndsAt,
        riskFlags: schema.institutions.riskFlags,
      })
      .from(schema.institutions);
  }

  /** Overdue open invoices (due date passed) — critical pending actions. */
  overdueInvoices(): Promise<{ id: string; institutionId: string; number: string | null; amountDueMinor: number; dueAt: Date | null }[]> {
    return this.db
      .select({
        id: schema.invoices.id,
        institutionId: schema.invoices.institutionId,
        number: schema.invoices.number,
        amountDueMinor: schema.invoices.amountDueMinor,
        dueAt: schema.invoices.dueAt,
      })
      .from(schema.invoices)
      .where(and(eq(schema.invoices.status, 'open'), sql`${schema.invoices.dueAt} < now()`));
  }
}
