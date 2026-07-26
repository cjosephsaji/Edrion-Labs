import { Inject, Injectable } from '@nestjs/common';
import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  inArray,
  isNull,
  or,
  schema,
  type Database,
  type PgColumn,
  type SQL,
} from '@edrion/database';
import type {
  NewPortalAiConfirmation,
  NewPortalAiRun,
  NewPortalAiToolCall,
  PortalAiConfirmation,
  PortalAiRun,
  PortalAiToolCall,
} from '@edrion/database';
import type { PortalRunsListQuery } from '@edrion/schemas';
import { DATABASE } from '../../common/tokens';
import type { CampusFilter, Page } from './academics.repository';

/**
 * Typed SQL for the institution-portal Copilot tables (Phase 10). Same contract as the other portal
 * repos: every query is confined to one institution; campus-scoped reads also include
 * institution-owned (campus_id IS NULL) runs. The service owns scope/lifecycle/guardrail/audit.
 */
@Injectable()
export class PortalCopilotRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  private scopeConds(instCol: PgColumn, campusCol: PgColumn, institutionId: string, campusIds: CampusFilter): SQL[] {
    const conds: SQL[] = [eq(instCol, institutionId)];
    if (campusIds) {
      const inScope = or(isNull(campusCol), inArray(campusCol, campusIds));
      if (inScope) conds.push(inScope);
    }
    return conds;
  }

  // --- runs ------------------------------------------------------------------

  async listRuns(institutionId: string, campusIds: CampusFilter, q: PortalRunsListQuery): Promise<Page<PortalAiRun>> {
    const t = schema.portalAiRuns;
    const conds = this.scopeConds(t.institutionId, t.campusId, institutionId, campusIds);
    if (q.status) conds.push(eq(t.status, q.status));
    if (q.search) {
      const s = or(ilike(t.prompt, `%${q.search}%`), ilike(t.summary, `%${q.search}%`));
      if (s) conds.push(s);
    }
    const where = and(...conds);
    const rows = await this.db
      .select()
      .from(t)
      .where(where)
      .orderBy(desc(t.startedAt))
      .limit(q.pageSize)
      .offset((q.page - 1) * q.pageSize);
    const [tot] = await this.db.select({ value: count() }).from(t).where(where);
    return { items: rows, total: Number(tot?.value ?? 0) };
  }

  async findRun(id: string, institutionId: string): Promise<PortalAiRun | undefined> {
    const t = schema.portalAiRuns;
    const [row] = await this.db.select().from(t).where(and(eq(t.id, id), eq(t.institutionId, institutionId))).limit(1);
    return row;
  }

  async insertRun(values: NewPortalAiRun): Promise<PortalAiRun> {
    const [row] = await this.db.insert(schema.portalAiRuns).values(values).returning();
    return row!;
  }

  async updateRun(id: string, patch: Partial<NewPortalAiRun>): Promise<PortalAiRun | undefined> {
    const t = schema.portalAiRuns;
    const [row] = await this.db
      .update(t)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(t.id, id))
      .returning();
    return row;
  }

  // --- tool calls ------------------------------------------------------------

  async insertToolCall(values: NewPortalAiToolCall): Promise<PortalAiToolCall> {
    const [row] = await this.db.insert(schema.portalAiToolCalls).values(values).returning();
    return row!;
  }

  async updateToolCall(id: string, patch: Partial<NewPortalAiToolCall>): Promise<PortalAiToolCall | undefined> {
    const t = schema.portalAiToolCalls;
    const [row] = await this.db
      .update(t)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(t.id, id))
      .returning();
    return row;
  }

  async toolCallsForRun(runId: string): Promise<PortalAiToolCall[]> {
    const t = schema.portalAiToolCalls;
    return this.db.select().from(t).where(eq(t.runId, runId)).orderBy(asc(t.createdAt));
  }

  // --- confirmations ---------------------------------------------------------

  async insertConfirmation(values: NewPortalAiConfirmation): Promise<PortalAiConfirmation> {
    const [row] = await this.db.insert(schema.portalAiConfirmations).values(values).returning();
    return row!;
  }

  async confirmationsForRun(runId: string): Promise<PortalAiConfirmation[]> {
    const t = schema.portalAiConfirmations;
    return this.db.select().from(t).where(eq(t.runId, runId)).orderBy(asc(t.createdAt));
  }
}
