import { Inject, Injectable } from '@nestjs/common';
import {
  and,
  asc,
  count,
  desc,
  eq,
  isNull,
  schema,
  type Database,
  type SQL,
} from '@edrion/database';
import type { ListAiPoliciesQuery } from '@edrion/schemas';
import type {
  AiActionRule,
  AiPolicy,
  NewAiActionRule,
  NewAiPolicy,
} from '@edrion/database';
import { DATABASE } from '../../common/tokens';

/** Typed SQL only. No business rules — the service owns those. */
@Injectable()
export class AiGovernanceRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  // --- Policies -----------------------------------------------------------------------------

  private buildPolicyWhere(q: ListAiPoliciesQuery): SQL | undefined {
    const clauses: SQL[] = [];
    if (q.scope) clauses.push(eq(schema.aiPolicies.scope, q.scope));
    if (q.mode) clauses.push(eq(schema.aiPolicies.mode, q.mode));
    return clauses.length ? and(...clauses) : undefined;
  }

  async listPolicies(q: ListAiPoliciesQuery): Promise<{ items: AiPolicy[]; total: number }> {
    const where = this.buildPolicyWhere(q);
    const items = await this.db
      .select()
      .from(schema.aiPolicies)
      .where(where)
      .orderBy(asc(schema.aiPolicies.scope), desc(schema.aiPolicies.updatedAt))
      .limit(q.pageSize)
      .offset((q.page - 1) * q.pageSize);
    const totalRows = await this.db.select({ value: count() }).from(schema.aiPolicies).where(where);
    return { items, total: Number(totalRows[0]?.value ?? 0) };
  }

  /** Every policy row, for deterministic resolution. */
  allPolicies(): Promise<AiPolicy[]> {
    return this.db.select().from(schema.aiPolicies).orderBy(asc(schema.aiPolicies.scope));
  }

  findPolicyById(id: string): Promise<AiPolicy | undefined> {
    return this.db
      .select()
      .from(schema.aiPolicies)
      .where(eq(schema.aiPolicies.id, id))
      .limit(1)
      .then((r) => r[0]);
  }

  findPolicy(scope: string, scopeId: string | null): Promise<AiPolicy | undefined> {
    const scopeIdClause = scopeId
      ? eq(schema.aiPolicies.scopeId, scopeId)
      : isNull(schema.aiPolicies.scopeId);
    return this.db
      .select()
      .from(schema.aiPolicies)
      .where(and(eq(schema.aiPolicies.scope, scope as never), scopeIdClause))
      .limit(1)
      .then((r) => r[0]);
  }

  async insertPolicy(values: NewAiPolicy): Promise<AiPolicy> {
    const [row] = await this.db.insert(schema.aiPolicies).values(values).returning();
    return row!;
  }

  async updatePolicy(id: string, patch: Partial<NewAiPolicy>): Promise<AiPolicy | undefined> {
    const [row] = await this.db
      .update(schema.aiPolicies)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(schema.aiPolicies.id, id))
      .returning();
    return row;
  }

  /** Optimistic-concurrency update — only writes if the version still matches. */
  async updatePolicyWithVersion(
    id: string,
    expectedVersion: number,
    patch: Partial<NewAiPolicy>,
  ): Promise<AiPolicy | undefined> {
    const [row] = await this.db
      .update(schema.aiPolicies)
      .set({ ...patch, version: expectedVersion + 1, updatedAt: new Date() })
      .where(and(eq(schema.aiPolicies.id, id), eq(schema.aiPolicies.version, expectedVersion)))
      .returning();
    return row;
  }

  async deletePolicy(id: string): Promise<void> {
    await this.db.delete(schema.aiPolicies).where(eq(schema.aiPolicies.id, id));
  }

  // --- Action rules -------------------------------------------------------------------------

  listRules(): Promise<AiActionRule[]> {
    return this.db
      .select()
      .from(schema.aiActionRules)
      .orderBy(asc(schema.aiActionRules.capability), asc(schema.aiActionRules.action));
  }

  findRuleById(id: string): Promise<AiActionRule | undefined> {
    return this.db
      .select()
      .from(schema.aiActionRules)
      .where(eq(schema.aiActionRules.id, id))
      .limit(1)
      .then((r) => r[0]);
  }

  findRule(capability: string, action: string | null): Promise<AiActionRule | undefined> {
    const actionClause = action
      ? eq(schema.aiActionRules.action, action)
      : isNull(schema.aiActionRules.action);
    return this.db
      .select()
      .from(schema.aiActionRules)
      .where(and(eq(schema.aiActionRules.capability, capability as never), actionClause))
      .limit(1)
      .then((r) => r[0]);
  }

  async insertRule(values: NewAiActionRule): Promise<AiActionRule> {
    const [row] = await this.db.insert(schema.aiActionRules).values(values).returning();
    return row!;
  }

  async updateRule(id: string, patch: Partial<NewAiActionRule>): Promise<AiActionRule | undefined> {
    const [row] = await this.db
      .update(schema.aiActionRules)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(schema.aiActionRules.id, id))
      .returning();
    return row;
  }

  async deleteRule(id: string): Promise<void> {
    await this.db.delete(schema.aiActionRules).where(eq(schema.aiActionRules.id, id));
  }
}
