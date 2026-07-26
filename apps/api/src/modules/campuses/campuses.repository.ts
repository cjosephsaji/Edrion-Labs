import { Inject, Injectable } from '@nestjs/common';
import { and, count, desc, eq, schema, type Database } from '@edrion/database';
import type { Campus, NewCampus, PlanVersion, Subscription } from '@edrion/database';
import type { ListCampusesQuery } from '@edrion/schemas';
import { DATABASE } from '../../common/tokens';

@Injectable()
export class CampusesRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async list(q: ListCampusesQuery): Promise<{ items: Campus[]; total: number }> {
    const clauses = [];
    if (q.institutionId) clauses.push(eq(schema.campuses.institutionId, q.institutionId));
    if (q.billingStatus) clauses.push(eq(schema.campuses.billingStatus, q.billingStatus));
    if (q.active !== undefined) clauses.push(eq(schema.campuses.isActive, q.active));
    const where = clauses.length ? and(...clauses) : undefined;

    const items = await this.db
      .select()
      .from(schema.campuses)
      .where(where)
      .orderBy(desc(schema.campuses.createdAt))
      .limit(q.pageSize)
      .offset((q.page - 1) * q.pageSize);
    const totalRows = await this.db.select({ value: count() }).from(schema.campuses).where(where);
    return { items, total: Number(totalRows[0]?.value ?? 0) };
  }

  async countForInstitution(institutionId: string): Promise<number> {
    const rows = await this.db
      .select({ value: count() })
      .from(schema.campuses)
      .where(eq(schema.campuses.institutionId, institutionId));
    return Number(rows[0]?.value ?? 0);
  }

  /** Codes already taken within an institution — feeds the auto-generated, unique campus code. */
  async existingCodes(institutionId: string): Promise<string[]> {
    const rows = await this.db
      .select({ code: schema.campuses.code })
      .from(schema.campuses)
      .where(eq(schema.campuses.institutionId, institutionId));
    return rows.map((r) => r.code);
  }

  async findById(id: string): Promise<Campus | undefined> {
    const [row] = await this.db.select().from(schema.campuses).where(eq(schema.campuses.id, id)).limit(1);
    return row;
  }

  async insert(values: NewCampus): Promise<Campus> {
    const [row] = await this.db.insert(schema.campuses).values(values).returning();
    return row!;
  }

  async updateStatus(id: string, expectedVersion: number, patch: Partial<NewCampus>): Promise<Campus | undefined> {
    const [row] = await this.db
      .update(schema.campuses)
      .set({ ...patch, version: expectedVersion + 1, updatedAt: new Date() })
      .where(and(eq(schema.campuses.id, id), eq(schema.campuses.version, expectedVersion)))
      .returning();
    return row;
  }

  /** The active subscription + its plan version, used to build the pricing context. */
  async activeSubscriptionWithPlan(
    institutionId: string,
  ): Promise<{ subscription: Subscription; planVersion: PlanVersion } | undefined> {
    const [sub] = await this.db
      .select()
      .from(schema.subscriptions)
      .where(eq(schema.subscriptions.institutionId, institutionId))
      .orderBy(desc(schema.subscriptions.createdAt))
      .limit(1);
    if (!sub) return undefined;
    const [pv] = await this.db
      .select()
      .from(schema.planVersions)
      .where(eq(schema.planVersions.id, sub.planVersionId))
      .limit(1);
    if (!pv) return undefined;
    return { subscription: sub, planVersion: pv };
  }
}
