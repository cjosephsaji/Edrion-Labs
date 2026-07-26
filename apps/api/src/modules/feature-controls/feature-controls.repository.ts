import { Inject, Injectable } from '@nestjs/common';
import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  isNull,
  or,
  schema,
  type Database,
  type PgColumn,
  type SQL,
} from '@edrion/database';
import type { ListFeaturesQuery } from '@edrion/schemas';
import type {
  FeatureAssignment,
  FeatureDefinition,
  FeatureRollout,
  NewFeatureAssignment,
  NewFeatureDefinition,
  NewFeatureRollout,
} from '@edrion/database';
import { DATABASE } from '../../common/tokens';

const SORTABLE: Record<string, PgColumn> = {
  name: schema.featureDefinitions.name,
  key: schema.featureDefinitions.key,
  module: schema.featureDefinitions.module,
  status: schema.featureDefinitions.status,
  releaseStage: schema.featureDefinitions.releaseStage,
  createdAt: schema.featureDefinitions.createdAt,
  updatedAt: schema.featureDefinitions.updatedAt,
};

/** Typed SQL only. No business rules — the service owns those. */
@Injectable()
export class FeatureControlsRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  private buildWhere(q: ListFeaturesQuery): SQL | undefined {
    const clauses: SQL[] = [];
    if (q.search) {
      const s = or(
        ilike(schema.featureDefinitions.name, `%${q.search}%`),
        ilike(schema.featureDefinitions.key, `%${q.search}%`),
      );
      if (s) clauses.push(s);
    }
    if (q.module) clauses.push(eq(schema.featureDefinitions.module, q.module));
    if (q.status) clauses.push(eq(schema.featureDefinitions.status, q.status));
    if (q.releaseStage) clauses.push(eq(schema.featureDefinitions.releaseStage, q.releaseStage));
    return clauses.length ? and(...clauses) : undefined;
  }

  async list(q: ListFeaturesQuery): Promise<{ items: FeatureDefinition[]; total: number }> {
    const where = this.buildWhere(q);
    const sortCol = (q.sortBy && SORTABLE[q.sortBy]) || schema.featureDefinitions.updatedAt;
    const order = q.sortDir === 'asc' ? asc(sortCol) : desc(sortCol);

    const items = await this.db
      .select()
      .from(schema.featureDefinitions)
      .where(where)
      .orderBy(order)
      .limit(q.pageSize)
      .offset((q.page - 1) * q.pageSize);

    const totalRows = await this.db
      .select({ value: count() })
      .from(schema.featureDefinitions)
      .where(where);

    return { items, total: Number(totalRows[0]?.value ?? 0) };
  }

  /** Status counts for the directory summary cards (single grouped query). */
  async summaryByStatus(): Promise<Record<string, number>> {
    const rows = await this.db
      .select({ status: schema.featureDefinitions.status, value: count() })
      .from(schema.featureDefinitions)
      .groupBy(schema.featureDefinitions.status);
    return Object.fromEntries(rows.map((r) => [r.status, Number(r.value)]));
  }

  findById(id: string): Promise<FeatureDefinition | undefined> {
    return this.db
      .select()
      .from(schema.featureDefinitions)
      .where(eq(schema.featureDefinitions.id, id))
      .limit(1)
      .then((r) => r[0]);
  }

  findByKey(key: string): Promise<FeatureDefinition | undefined> {
    return this.db
      .select()
      .from(schema.featureDefinitions)
      .where(eq(schema.featureDefinitions.key, key))
      .limit(1)
      .then((r) => r[0]);
  }

  async insert(values: NewFeatureDefinition): Promise<FeatureDefinition> {
    const [row] = await this.db.insert(schema.featureDefinitions).values(values).returning();
    return row!;
  }

  async updateWithVersion(
    id: string,
    expectedVersion: number,
    patch: Partial<NewFeatureDefinition>,
  ): Promise<FeatureDefinition | undefined> {
    const [row] = await this.db
      .update(schema.featureDefinitions)
      .set({ ...patch, version: expectedVersion + 1, updatedAt: new Date() })
      .where(
        and(
          eq(schema.featureDefinitions.id, id),
          eq(schema.featureDefinitions.version, expectedVersion),
        ),
      )
      .returning();
    return row;
  }

  // --- Assignments --------------------------------------------------------------------------

  assignmentsForFeature(featureId: string): Promise<FeatureAssignment[]> {
    return this.db
      .select()
      .from(schema.featureAssignments)
      .where(eq(schema.featureAssignments.featureId, featureId))
      .orderBy(desc(schema.featureAssignments.updatedAt));
  }

  findAssignment(
    featureId: string,
    scope: string,
    scopeId: string | null,
  ): Promise<FeatureAssignment | undefined> {
    const scopeIdClause = scopeId
      ? eq(schema.featureAssignments.scopeId, scopeId)
      : isNull(schema.featureAssignments.scopeId);
    return this.db
      .select()
      .from(schema.featureAssignments)
      .where(
        and(
          eq(schema.featureAssignments.featureId, featureId),
          eq(schema.featureAssignments.scope, scope as never),
          scopeIdClause,
        ),
      )
      .limit(1)
      .then((r) => r[0]);
  }

  findAssignmentById(id: string): Promise<FeatureAssignment | undefined> {
    return this.db
      .select()
      .from(schema.featureAssignments)
      .where(eq(schema.featureAssignments.id, id))
      .limit(1)
      .then((r) => r[0]);
  }

  async insertAssignment(values: NewFeatureAssignment): Promise<FeatureAssignment> {
    const [row] = await this.db.insert(schema.featureAssignments).values(values).returning();
    return row!;
  }

  async updateAssignment(
    id: string,
    patch: Partial<NewFeatureAssignment>,
  ): Promise<FeatureAssignment | undefined> {
    const [row] = await this.db
      .update(schema.featureAssignments)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(schema.featureAssignments.id, id))
      .returning();
    return row;
  }

  async deleteAssignment(id: string): Promise<void> {
    await this.db.delete(schema.featureAssignments).where(eq(schema.featureAssignments.id, id));
  }

  // --- Rollouts -----------------------------------------------------------------------------

  rolloutsForFeature(featureId: string): Promise<FeatureRollout[]> {
    return this.db
      .select()
      .from(schema.featureRollouts)
      .where(eq(schema.featureRollouts.featureId, featureId))
      .orderBy(asc(schema.featureRollouts.type));
  }

  findRolloutByType(featureId: string, type: string): Promise<FeatureRollout | undefined> {
    return this.db
      .select()
      .from(schema.featureRollouts)
      .where(and(eq(schema.featureRollouts.featureId, featureId), eq(schema.featureRollouts.type, type as never)))
      .limit(1)
      .then((r) => r[0]);
  }

  findRolloutById(id: string): Promise<FeatureRollout | undefined> {
    return this.db
      .select()
      .from(schema.featureRollouts)
      .where(eq(schema.featureRollouts.id, id))
      .limit(1)
      .then((r) => r[0]);
  }

  async insertRollout(values: NewFeatureRollout): Promise<FeatureRollout> {
    const [row] = await this.db.insert(schema.featureRollouts).values(values).returning();
    return row!;
  }

  async updateRollout(
    id: string,
    patch: Partial<NewFeatureRollout>,
  ): Promise<FeatureRollout | undefined> {
    const [row] = await this.db
      .update(schema.featureRollouts)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(schema.featureRollouts.id, id))
      .returning();
    return row;
  }

  async deleteRollout(id: string): Promise<void> {
    await this.db.delete(schema.featureRollouts).where(eq(schema.featureRollouts.id, id));
  }

  /** All assignment+rollout rows for a key, for live resolution (single feature). */
  async loadForResolution(
    key: string,
  ): Promise<
    { definition: FeatureDefinition; assignments: FeatureAssignment[]; rollouts: FeatureRollout[] } | undefined
  > {
    const definition = await this.findByKey(key);
    if (!definition) return undefined;
    const [assignments, rollouts] = await Promise.all([
      this.assignmentsForFeature(definition.id),
      this.rolloutsForFeature(definition.id),
    ]);
    return { definition, assignments, rollouts };
  }
}
