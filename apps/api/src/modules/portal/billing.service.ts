import { Inject, Injectable } from '@nestjs/common';
import { and, count, desc, eq, schema, type Database } from '@edrion/database';
import type { PaginationQuery } from '@edrion/schemas';
import { AUDIT_WRITER } from '../../common/tokens';
import { DATABASE } from '../../common/tokens';
import type { AuditWriter, AuditEventInput } from '@edrion/audit';
import type { ListResult } from './academics.service';
import { basePortalAudit, type PortalActionContext } from './portal-action-context';

const MODULE = 'portal-billing';

/** Read-only projection of the tenant's current Edrion subscription. */
export interface BillingSubscriptionView {
  id: string;
  status: string;
  billingCycle: string;
  currency: string;
  /** Effective recurring price (minor units): override wins, else the plan-version cycle price. */
  priceMinor: number;
  perCampusPriceMinor: number;
  baseCampusAllowance: number;
  periodStart: string;
  periodEnd: string;
  trialEndsAt: string | null;
  cancelAt: string | null;
  plan: { key: string; name: string; description: string | null };
}

export interface BillingInvoiceView {
  id: string;
  number: string | null;
  status: string;
  currency: string;
  totalMinor: number;
  amountPaidMinor: number;
  amountDueMinor: number;
  periodStart: string | null;
  periodEnd: string | null;
  issuedAt: string | null;
  dueAt: string | null;
  paidAt: string | null;
}

export interface BillingPlanView {
  key: string;
  name: string;
  description: string | null;
  currency: string;
  monthlyPriceMinor: number;
  annualPriceMinor: number;
  perCampusPriceMinor: number;
}

/**
 * Institution-portal Billing service (Administration) — READ-ONLY. Surfaces the tenant's own Edrion
 * subscription + invoices (the platform/super-admin owns writes). Everything is confined to the
 * principal's institution; there are no mutations in this pass. Gated by `billing.view`.
 */
@Injectable()
export class BillingService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(AUDIT_WRITER) private readonly audit: AuditWriter,
  ) {}

  /** The institution's most recent subscription joined to its plan + plan version, or null. */
  async getSubscription(ctx: PortalActionContext): Promise<{ subscription: BillingSubscriptionView | null }> {
    const [sub] = await this.db
      .select()
      .from(schema.subscriptions)
      .where(eq(schema.subscriptions.institutionId, ctx.principal.institutionId))
      .orderBy(desc(schema.subscriptions.createdAt))
      .limit(1);
    if (!sub) return { subscription: null };
    const [pv] = await this.db
      .select()
      .from(schema.planVersions)
      .where(eq(schema.planVersions.id, sub.planVersionId))
      .limit(1);
    const [plan] = pv
      ? await this.db.select().from(schema.plans).where(eq(schema.plans.id, pv.planId)).limit(1)
      : [];
    const cyclePrice = sub.billingCycle === 'annual' ? (pv?.annualPriceMinor ?? 0) : (pv?.monthlyPriceMinor ?? 0);
    await this.write(ctx, 'billing.subscription.view', sub.id);
    return {
      subscription: {
        id: sub.id,
        status: sub.status,
        billingCycle: sub.billingCycle,
        currency: sub.currency,
        priceMinor: sub.overridePriceMinor ?? cyclePrice,
        perCampusPriceMinor: sub.institutionPerCampusPriceMinor ?? pv?.perCampusPriceMinor ?? 0,
        baseCampusAllowance: pv?.baseCampusAllowance ?? 1,
        periodStart: sub.periodStart.toISOString(),
        periodEnd: sub.periodEnd.toISOString(),
        trialEndsAt: sub.trialEndsAt ? sub.trialEndsAt.toISOString() : null,
        cancelAt: sub.cancelAt ? sub.cancelAt.toISOString() : null,
        plan: {
          key: plan?.key ?? '—',
          name: plan?.name ?? 'Unknown plan',
          description: plan?.description ?? null,
        },
      },
    };
  }

  /** Edrion invoices billed to this institution, newest first, paginated. */
  async listInvoices(ctx: PortalActionContext, q: PaginationQuery): Promise<ListResult<BillingInvoiceView>> {
    const where = eq(schema.invoices.institutionId, ctx.principal.institutionId);
    const rows = await this.db
      .select()
      .from(schema.invoices)
      .where(where)
      .orderBy(desc(schema.invoices.createdAt))
      .limit(q.pageSize)
      .offset((q.page - 1) * q.pageSize);
    const [tot] = await this.db.select({ value: count() }).from(schema.invoices).where(where);
    const total = Number(tot?.value ?? 0);
    const items: BillingInvoiceView[] = rows.map((r) => ({
      id: r.id,
      number: r.number,
      status: r.status,
      currency: r.currency,
      totalMinor: r.totalMinor,
      amountPaidMinor: r.amountPaidMinor,
      amountDueMinor: r.amountDueMinor,
      periodStart: r.periodStart ? r.periodStart.toISOString() : null,
      periodEnd: r.periodEnd ? r.periodEnd.toISOString() : null,
      issuedAt: r.issuedAt ? r.issuedAt.toISOString() : null,
      dueAt: r.dueAt ? r.dueAt.toISOString() : null,
      paidAt: r.paidAt ? r.paidAt.toISOString() : null,
    }));
    return { items, total, page: q.page, pageSize: q.pageSize, hasMore: q.page * q.pageSize < total };
  }

  /** The published institution plan catalogue (latest published version per plan) for upgrade info. */
  async listPlans(): Promise<{ plans: BillingPlanView[] }> {
    const rows = await this.db
      .select({
        key: schema.plans.key,
        name: schema.plans.name,
        description: schema.plans.description,
        currency: schema.planVersions.currency,
        monthlyPriceMinor: schema.planVersions.monthlyPriceMinor,
        annualPriceMinor: schema.planVersions.annualPriceMinor,
        perCampusPriceMinor: schema.planVersions.perCampusPriceMinor,
        planVersion: schema.planVersions.version,
      })
      .from(schema.plans)
      .innerJoin(schema.planVersions, eq(schema.planVersions.planId, schema.plans.id))
      .where(
        and(
          eq(schema.plans.audience, 'institution'),
          eq(schema.plans.status, 'published'),
          eq(schema.planVersions.status, 'published'),
        ),
      )
      .orderBy(desc(schema.planVersions.version));
    const seen = new Set<string>();
    const plans: BillingPlanView[] = [];
    for (const r of rows) {
      if (seen.has(r.key)) continue;
      seen.add(r.key);
      plans.push({
        key: r.key,
        name: r.name,
        description: r.description,
        currency: r.currency,
        monthlyPriceMinor: r.monthlyPriceMinor,
        annualPriceMinor: r.annualPriceMinor,
        perCampusPriceMinor: r.perCampusPriceMinor,
      });
    }
    return { plans };
  }

  private async write(ctx: PortalActionContext, action: string, entityId: string): Promise<void> {
    await this.audit.logAudit({
      ...basePortalAudit(ctx),
      action,
      module: MODULE,
      entityType: 'subscription',
      entityId,
    } as AuditEventInput);
  }
}
