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
  sql,
  type Database,
  type PgColumn,
  type SQL,
} from '@edrion/database';
import type { NewReportDefinition, NewReportRun, ReportDefinition, ReportRun } from '@edrion/database';
import type { ReportDefinitionsListQuery } from '@edrion/schemas';
import { DATABASE } from '../../common/tokens';
import type { CampusFilter, Page } from './academics.repository';

export interface ReportDefinitionRow extends ReportDefinition {
  runCount: number;
}

/**
 * Typed SQL for the institution-portal reports tables (definitions + runs). Same contract as the other
 * portal repos: every query is confined to one institution; campus-scoped definition reads also include
 * institution-owned (campus_id IS NULL) rows. Runs inherit the definition's campus and are only reachable
 * through a definition the caller can see; the service owns scope/version/audit + the export bridge.
 */
@Injectable()
export class ReportsRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  private scopeConds(instCol: PgColumn, campusCol: PgColumn, institutionId: string, campusIds: CampusFilter): SQL[] {
    const conds: SQL[] = [eq(instCol, institutionId)];
    if (campusIds) {
      const inScope = or(isNull(campusCol), inArray(campusCol, campusIds));
      if (inScope) conds.push(inScope);
    }
    return conds;
  }

  private order(col: PgColumn | undefined, dir: 'asc' | 'desc', fallback: PgColumn): SQL {
    const c = col ?? fallback;
    return dir === 'asc' ? asc(c) : desc(c);
  }

  // --- definitions -----------------------------------------------------------

  async listDefinitions(institutionId: string, campusIds: CampusFilter, q: ReportDefinitionsListQuery): Promise<Page<ReportDefinitionRow>> {
    const t = schema.reportDefinitions;
    const conds = this.scopeConds(t.institutionId, t.campusId, institutionId, campusIds);
    if (q.status) conds.push(eq(t.status, q.status));
    if (q.search) {
      const s = or(ilike(t.name, `%${q.search}%`), ilike(t.referenceCode, `%${q.search}%`), ilike(t.reportType, `%${q.search}%`));
      if (s) conds.push(s);
    }
    const where = and(...conds);
    const sortable: Record<string, PgColumn> = {
      name: t.name,
      referenceCode: t.referenceCode,
      reportType: t.reportType,
      status: t.status,
      createdAt: t.createdAt,
    };
    const runCount = sql<number>`(select count(*) from ${schema.reportRuns} rr where rr.report_id = ${t.id})`;
    const rows = await this.db
      .select({ def: t, runCount })
      .from(t)
      .where(where)
      .orderBy(this.order(q.sortBy ? sortable[q.sortBy] : undefined, q.sortDir, t.createdAt))
      .limit(q.pageSize)
      .offset((q.page - 1) * q.pageSize);
    const [tot] = await this.db.select({ value: count() }).from(t).where(where);
    return {
      items: rows.map((r) => ({ ...r.def, runCount: Number(r.runCount ?? 0) })),
      total: Number(tot?.value ?? 0),
    };
  }

  async findDefinition(id: string, institutionId: string): Promise<ReportDefinition | undefined> {
    const t = schema.reportDefinitions;
    const [row] = await this.db.select().from(t).where(and(eq(t.id, id), eq(t.institutionId, institutionId))).limit(1);
    return row;
  }

  async findDefinitionByCode(institutionId: string, referenceCode: string): Promise<ReportDefinition | undefined> {
    const t = schema.reportDefinitions;
    const [row] = await this.db
      .select()
      .from(t)
      .where(and(eq(t.institutionId, institutionId), eq(t.referenceCode, referenceCode)))
      .limit(1);
    return row;
  }

  async insertDefinition(values: NewReportDefinition): Promise<ReportDefinition> {
    const [row] = await this.db.insert(schema.reportDefinitions).values(values).returning();
    return row!;
  }

  async updateDefinition(id: string, version: number, patch: Partial<NewReportDefinition>): Promise<ReportDefinition | undefined> {
    const t = schema.reportDefinitions;
    const [row] = await this.db
      .update(t)
      .set({ ...patch, version: version + 1, updatedAt: new Date() })
      .where(and(eq(t.id, id), eq(t.version, version)))
      .returning();
    return row;
  }

  async deleteDefinition(id: string, version: number): Promise<boolean> {
    const t = schema.reportDefinitions;
    const rows = await this.db.delete(t).where(and(eq(t.id, id), eq(t.version, version))).returning({ id: t.id });
    return rows.length > 0;
  }

  // --- runs (exports of a definition) ----------------------------------------

  async listRuns(reportId: string): Promise<ReportRun[]> {
    const t = schema.reportRuns;
    return this.db.select().from(t).where(eq(t.reportId, reportId)).orderBy(desc(t.createdAt));
  }

  async findRun(id: string, reportId: string): Promise<ReportRun | undefined> {
    const t = schema.reportRuns;
    const [row] = await this.db.select().from(t).where(and(eq(t.id, id), eq(t.reportId, reportId))).limit(1);
    return row;
  }

  async insertRun(values: NewReportRun): Promise<ReportRun> {
    const [row] = await this.db.insert(schema.reportRuns).values(values).returning();
    return row!;
  }

  async deleteRun(id: string): Promise<boolean> {
    const t = schema.reportRuns;
    const rows = await this.db.delete(t).where(eq(t.id, id)).returning({ id: t.id });
    return rows.length > 0;
  }
}
