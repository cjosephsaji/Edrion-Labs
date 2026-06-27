import { Inject, Injectable } from '@nestjs/common';
import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  schema,
  type Database,
  type NewSubscriptionAddon,
  type PgColumn,
  type Plan,
  type PlanVersion,
  type SQL,
  type Subscription,
  type SubscriptionAddon,
} from '@edrion/database';
import type { ListSubscriptionsQuery } from '@edrion/schemas';
import { DATABASE } from '../../common/tokens';

const SORTABLE: Record<string, PgColumn> = {
  status: schema.subscriptions.status,
  createdAt: schema.subscriptions.createdAt,
  updatedAt: schema.subscriptions.updatedAt,
  periodEnd: schema.subscriptions.periodEnd,
};

/** A subscription joined with its institution + plan, for list rows and detail. */
export interface SubscriptionJoined {
  subscription: Subscription;
  institutionName: string | null;
  planId: string | null;
  planKey: string | null;
  planName: string | null;
  planAudience: string | null;
  planVersionNumber: number | null;
  planMonthlyPriceMinor: number | null;
  planAnnualPriceMinor: number | null;
  planPerCampusPriceMinor: number | null;
  planBaseCampusAllowance: number | null;
  planUsageLimits: Record<string, number> | null;
}

@Injectable()
export class SubscriptionsRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  private buildWhere(q: ListSubscriptionsQuery): SQL | undefined {
    const s = schema.subscriptions;
    const clauses: SQL[] = [];
    if (q.institutionId) clauses.push(eq(s.institutionId, q.institutionId));
    if (q.status) clauses.push(eq(s.status, q.status));
    if (q.billingCycle) clauses.push(eq(s.billingCycle, q.billingCycle));
    if (q.search) {
      const c = ilike(schema.institutions.displayName, `%${q.search}%`);
      if (c) clauses.push(c);
    }
    return clauses.length ? and(...clauses) : undefined;
  }

  private joinSelect() {
    return this.db
      .select({
        subscription: schema.subscriptions,
        institutionName: schema.institutions.displayName,
        planId: schema.plans.id,
        planKey: schema.plans.key,
        planName: schema.plans.name,
        planAudience: schema.plans.audience,
        planVersionNumber: schema.planVersions.version,
        planMonthlyPriceMinor: schema.planVersions.monthlyPriceMinor,
        planAnnualPriceMinor: schema.planVersions.annualPriceMinor,
        planPerCampusPriceMinor: schema.planVersions.perCampusPriceMinor,
        planBaseCampusAllowance: schema.planVersions.baseCampusAllowance,
        planUsageLimits: schema.planVersions.usageLimits,
      })
      .from(schema.subscriptions)
      .leftJoin(schema.institutions, eq(schema.institutions.id, schema.subscriptions.institutionId))
      .leftJoin(schema.planVersions, eq(schema.planVersions.id, schema.subscriptions.planVersionId))
      .leftJoin(schema.plans, eq(schema.plans.id, schema.planVersions.planId));
  }

  async list(q: ListSubscriptionsQuery): Promise<{ items: SubscriptionJoined[]; total: number }> {
    const where = this.buildWhere(q);
    const sortCol = (q.sortBy && SORTABLE[q.sortBy]) || schema.subscriptions.createdAt;
    const order = q.sortDir === 'asc' ? asc(sortCol) : desc(sortCol);

    const rows = await this.joinSelect()
      .where(where)
      .orderBy(order)
      .limit(q.pageSize)
      .offset((q.page - 1) * q.pageSize);

    const totalRows = await this.db
      .select({ value: count() })
      .from(schema.subscriptions)
      .leftJoin(schema.institutions, eq(schema.institutions.id, schema.subscriptions.institutionId))
      .where(where);

    return { items: rows as SubscriptionJoined[], total: Number(totalRows[0]?.value ?? 0) };
  }

  async summaryByStatus(institutionId?: string): Promise<Record<string, number>> {
    const where = institutionId ? eq(schema.subscriptions.institutionId, institutionId) : undefined;
    const rows = await this.db
      .select({ status: schema.subscriptions.status, value: count() })
      .from(schema.subscriptions)
      .where(where)
      .groupBy(schema.subscriptions.status);
    return Object.fromEntries(rows.map((r) => [r.status, Number(r.value)]));
  }

  async findById(id: string): Promise<Subscription | undefined> {
    const [row] = await this.db.select().from(schema.subscriptions).where(eq(schema.subscriptions.id, id)).limit(1);
    return row;
  }

  async findJoined(id: string): Promise<SubscriptionJoined | undefined> {
    const [row] = await this.joinSelect().where(eq(schema.subscriptions.id, id)).limit(1);
    return row as SubscriptionJoined | undefined;
  }

  /** The latest subscription for an institution — for the institution-detail tab. */
  async findJoinedByInstitution(institutionId: string): Promise<SubscriptionJoined | undefined> {
    const [row] = await this.joinSelect()
      .where(eq(schema.subscriptions.institutionId, institutionId))
      .orderBy(desc(schema.subscriptions.createdAt))
      .limit(1);
    return row as SubscriptionJoined | undefined;
  }

  async planVersionWithPlan(
    planVersionId: string,
  ): Promise<{ planVersion: PlanVersion; plan: Plan } | undefined> {
    const [pv] = await this.db
      .select()
      .from(schema.planVersions)
      .where(eq(schema.planVersions.id, planVersionId))
      .limit(1);
    if (!pv) return undefined;
    const [plan] = await this.db.select().from(schema.plans).where(eq(schema.plans.id, pv.planId)).limit(1);
    if (!plan) return undefined;
    return { planVersion: pv, plan };
  }

  async updateWithVersion(
    id: string,
    expectedVersion: number,
    patch: Partial<Subscription>,
  ): Promise<Subscription | undefined> {
    const [row] = await this.db
      .update(schema.subscriptions)
      .set({ ...patch, version: expectedVersion + 1, updatedAt: new Date() })
      .where(and(eq(schema.subscriptions.id, id), eq(schema.subscriptions.version, expectedVersion)))
      .returning();
    return row;
  }

  async addonsForSub(subscriptionId: string): Promise<SubscriptionAddon[]> {
    return this.db
      .select()
      .from(schema.subscriptionAddons)
      .where(eq(schema.subscriptionAddons.subscriptionId, subscriptionId))
      .orderBy(desc(schema.subscriptionAddons.createdAt));
  }

  async insertAddon(values: NewSubscriptionAddon): Promise<SubscriptionAddon> {
    const [row] = await this.db.insert(schema.subscriptionAddons).values(values).returning();
    return row!;
  }

  async findAddon(addonId: string): Promise<SubscriptionAddon | undefined> {
    const [row] = await this.db
      .select()
      .from(schema.subscriptionAddons)
      .where(eq(schema.subscriptionAddons.id, addonId))
      .limit(1);
    return row;
  }

  async deactivateAddon(addonId: string): Promise<void> {
    await this.db
      .update(schema.subscriptionAddons)
      .set({ active: false, updatedAt: new Date() })
      .where(eq(schema.subscriptionAddons.id, addonId));
  }

  async campusCountForInstitution(institutionId: string): Promise<number> {
    const rows = await this.db
      .select({ value: count() })
      .from(schema.campuses)
      .where(eq(schema.campuses.institutionId, institutionId));
    return Number(rows[0]?.value ?? 0);
  }
}
