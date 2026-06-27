import { Inject, Injectable } from '@nestjs/common';
import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  inArray,
  or,
  schema,
  sql,
  type Database,
  type NewPlan,
  type NewPlanVersion,
  type PgColumn,
  type Plan,
  type PlanVersion,
  type SQL,
} from '@edrion/database';
import type { ListPlansQuery } from '@edrion/schemas';
import { DATABASE } from '../../common/tokens';

const SORTABLE: Record<string, PgColumn> = {
  name: schema.plans.name,
  key: schema.plans.key,
  status: schema.plans.status,
  createdAt: schema.plans.createdAt,
  updatedAt: schema.plans.updatedAt,
};

/** Subscription statuses that still consume a plan version (block-aware archive guard). */
const LIVE_SUBSCRIPTION_STATUSES = ['trial', 'active', 'past_due', 'grace', 'paused'];

/** Typed SQL only. No business rules — the service owns immutable-versioning logic. */
@Injectable()
export class PlansRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  private buildWhere(q: ListPlansQuery): SQL | undefined {
    const p = schema.plans;
    const clauses: SQL[] = [];
    if (q.search) {
      const s = or(ilike(p.name, `%${q.search}%`), ilike(p.key, `%${q.search}%`));
      if (s) clauses.push(s);
    }
    if (q.status) clauses.push(eq(p.status, q.status));
    if (q.audience) clauses.push(eq(p.audience, q.audience));
    return clauses.length ? and(...clauses) : undefined;
  }

  async list(q: ListPlansQuery): Promise<{ items: Plan[]; total: number; latestByPlan: Map<string, PlanVersion> }> {
    const where = this.buildWhere(q);
    const sortCol = (q.sortBy && SORTABLE[q.sortBy]) || schema.plans.updatedAt;
    const order = q.sortDir === 'asc' ? asc(sortCol) : desc(sortCol);

    const items = await this.db
      .select()
      .from(schema.plans)
      .where(where)
      .orderBy(order)
      .limit(q.pageSize)
      .offset((q.page - 1) * q.pageSize);

    const totalRows = await this.db.select({ value: count() }).from(schema.plans).where(where);

    const latestByPlan = await this.latestVersionByPlan(items.map((p) => p.id));
    return { items, total: Number(totalRows[0]?.value ?? 0), latestByPlan };
  }

  /** Status counts for the directory summary cards (single grouped query). */
  async summaryByStatus(): Promise<Record<string, number>> {
    const rows = await this.db
      .select({ status: schema.plans.status, value: count() })
      .from(schema.plans)
      .groupBy(schema.plans.status);
    return Object.fromEntries(rows.map((r) => [r.status, Number(r.value)]));
  }

  /** The highest-numbered version per plan id (latest, regardless of status). */
  async latestVersionByPlan(planIds: string[]): Promise<Map<string, PlanVersion>> {
    const map = new Map<string, PlanVersion>();
    if (planIds.length === 0) return map;
    const rows = await this.db
      .select()
      .from(schema.planVersions)
      .where(inArray(schema.planVersions.planId, planIds))
      .orderBy(asc(schema.planVersions.version));
    for (const v of rows) map.set(v.planId, v); // ascending → last write wins = highest version
    return map;
  }

  async findPlanById(id: string): Promise<Plan | undefined> {
    const [row] = await this.db.select().from(schema.plans).where(eq(schema.plans.id, id)).limit(1);
    return row;
  }

  async findPlanByKey(key: string): Promise<Plan | undefined> {
    const [row] = await this.db.select().from(schema.plans).where(eq(schema.plans.key, key)).limit(1);
    return row;
  }

  async versionsForPlan(planId: string): Promise<PlanVersion[]> {
    return this.db
      .select()
      .from(schema.planVersions)
      .where(eq(schema.planVersions.planId, planId))
      .orderBy(asc(schema.planVersions.version));
  }

  async findVersionById(versionId: string): Promise<PlanVersion | undefined> {
    const [row] = await this.db
      .select()
      .from(schema.planVersions)
      .where(eq(schema.planVersions.id, versionId))
      .limit(1);
    return row;
  }

  async maxVersion(planId: string): Promise<number> {
    const [row] = await this.db
      .select({ value: sql<number>`coalesce(max(${schema.planVersions.version}), 0)` })
      .from(schema.planVersions)
      .where(eq(schema.planVersions.planId, planId));
    return Number(row?.value ?? 0);
  }

  async insertPlan(values: NewPlan): Promise<Plan> {
    const [row] = await this.db.insert(schema.plans).values(values).returning();
    return row!;
  }

  async insertVersion(values: NewPlanVersion): Promise<PlanVersion> {
    const [row] = await this.db.insert(schema.planVersions).values(values).returning();
    return row!;
  }

  /** Optimistic-concurrency plan status update; undefined on a version mismatch (→ 409). */
  async updatePlanWithVersion(
    id: string,
    expectedVersion: number,
    patch: Partial<NewPlan>,
  ): Promise<Plan | undefined> {
    const [row] = await this.db
      .update(schema.plans)
      .set({ ...patch, version: expectedVersion + 1, updatedAt: new Date() })
      .where(and(eq(schema.plans.id, id), eq(schema.plans.version, expectedVersion)))
      .returning();
    return row;
  }

  /** Version-less plan stamp (used when publishing flips plan → published). */
  async stampPlan(id: string, patch: Partial<NewPlan>): Promise<Plan | undefined> {
    const [row] = await this.db
      .update(schema.plans)
      .set({ ...patch, version: sql`${schema.plans.version} + 1`, updatedAt: new Date() })
      .where(eq(schema.plans.id, id))
      .returning();
    return row;
  }

  /** Transition a version draft → published. Guarded on status='draft'; undefined if not draft. */
  async publishVersionRow(versionId: string, updatedBy: string | null): Promise<PlanVersion | undefined> {
    const [row] = await this.db
      .update(schema.planVersions)
      .set({ status: 'published', publishedAt: new Date(), updatedBy, updatedAt: new Date() })
      .where(and(eq(schema.planVersions.id, versionId), eq(schema.planVersions.status, 'draft')))
      .returning();
    return row;
  }

  /** Supersede any other currently-published version of the plan (published → archived). */
  async archiveOtherPublishedVersions(planId: string, exceptVersionId: string): Promise<void> {
    await this.db
      .update(schema.planVersions)
      .set({ status: 'archived', archivedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(schema.planVersions.planId, planId),
          eq(schema.planVersions.status, 'published'),
          sql`${schema.planVersions.id} <> ${exceptVersionId}`,
        ),
      );
  }

  /** Count live subscriptions pinned to any version of this plan (archive impact awareness). */
  async liveSubscriptionCount(planId: string): Promise<number> {
    const [row] = await this.db
      .select({ value: count() })
      .from(schema.subscriptions)
      .innerJoin(schema.planVersions, eq(schema.planVersions.id, schema.subscriptions.planVersionId))
      .where(
        and(
          eq(schema.planVersions.planId, planId),
          inArray(schema.subscriptions.status, LIVE_SUBSCRIPTION_STATUSES),
        ),
      );
    return Number(row?.value ?? 0);
  }
}
