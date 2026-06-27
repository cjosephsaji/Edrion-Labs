import { Inject, Injectable } from '@nestjs/common';
import { count, desc, eq, schema, type Database, type PlanVersion, type Subscription } from '@edrion/database';
import { DATABASE } from '../../common/tokens';

export interface EntitlementSource {
  subscription: Subscription;
  planName: string | null;
  planVersion: PlanVersion;
  campusCount: number;
}

@Injectable()
export class EntitlementsRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async resolve(institutionId: string): Promise<EntitlementSource | undefined> {
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

    const [plan] = await this.db.select().from(schema.plans).where(eq(schema.plans.id, pv.planId)).limit(1);
    const [campuses] = await this.db
      .select({ value: count() })
      .from(schema.campuses)
      .where(eq(schema.campuses.institutionId, institutionId));

    return { subscription: sub, planName: plan?.name ?? null, planVersion: pv, campusCount: Number(campuses?.value ?? 0) };
  }
}
