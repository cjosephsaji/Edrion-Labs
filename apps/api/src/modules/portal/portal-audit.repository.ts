import { Inject, Injectable } from '@nestjs/common';
import {
  and,
  count,
  desc,
  eq,
  gte,
  ilike,
  lte,
  or,
  schema,
  sql,
  type Database,
  type SQL,
} from '@edrion/database';
import type { AuditEvent } from '@edrion/database';
import type { PortalAuditExportQuery, PortalAuditListQuery } from '@edrion/schemas';
import { DATABASE } from '../../common/tokens';
import type { Page } from './academics.repository';

/**
 * Read-only typed SQL over the append-only audit_events, ALWAYS confined to one institution. The
 * portal never writes here directly — the audit writer owns inserts; this repo only selects (the
 * export is also a select). Ordered newest-first.
 */
@Injectable()
export class PortalAuditRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  private conds(institutionId: string, q: PortalAuditListQuery | PortalAuditExportQuery): SQL[] {
    const t = schema.auditEvents;
    const conds: SQL[] = [eq(t.institutionId, institutionId)];
    if (q.module) conds.push(eq(t.module, q.module));
    if (q.action) conds.push(eq(t.action, q.action));
    if (q.campusId) conds.push(eq(t.campusId, q.campusId));
    if (q.riskLevel) conds.push(eq(t.riskLevel, q.riskLevel));
    if (q.result) conds.push(eq(t.result, q.result));
    if (q.aiInvolved !== undefined) conds.push(eq(t.aiInvolved, q.aiInvolved));
    if (q.from) conds.push(gte(t.occurredAt, new Date(q.from)));
    if (q.to) conds.push(lte(t.occurredAt, new Date(q.to)));
    if (q.search) {
      const s = or(
        ilike(t.action, `%${q.search}%`),
        ilike(t.module, `%${q.search}%`),
        ilike(t.actorName, `%${q.search}%`),
        ilike(t.entityType, `%${q.search}%`),
        ilike(t.entityId, `%${q.search}%`),
      );
      if (s) conds.push(s);
    }
    return conds;
  }

  async list(institutionId: string, q: PortalAuditListQuery): Promise<Page<AuditEvent>> {
    const t = schema.auditEvents;
    const where = and(...this.conds(institutionId, q));
    const items = await this.db
      .select()
      .from(t)
      .where(where)
      .orderBy(desc(t.occurredAt))
      .limit(q.pageSize)
      .offset((q.page - 1) * q.pageSize);
    const [tot] = await this.db.select({ value: count() }).from(t).where(where);
    return { items, total: Number(tot?.value ?? 0) };
  }

  async listForExport(institutionId: string, q: PortalAuditExportQuery): Promise<AuditEvent[]> {
    const t = schema.auditEvents;
    const where = and(...this.conds(institutionId, q));
    return this.db.select().from(t).where(where).orderBy(desc(t.occurredAt)).limit(q.limit);
  }

  /** Distinct module names seen for this institution — powers the viewer's module filter. */
  async distinctModules(institutionId: string): Promise<string[]> {
    const t = schema.auditEvents;
    const rows = await this.db
      .selectDistinct({ module: t.module })
      .from(t)
      .where(eq(t.institutionId, institutionId))
      .orderBy(t.module);
    return rows.map((r) => r.module).filter(Boolean);
  }

  /** Lightweight summary counts for the viewer header (total + by risk in the current window). */
  async summary(institutionId: string): Promise<{ total: number; failures: number; aiInvolved: number }> {
    const t = schema.auditEvents;
    const [row] = await this.db
      .select({
        total: count(),
        failures: sql<number>`count(*) filter (where ${t.result} = 'failure')`,
        aiInvolved: sql<number>`count(*) filter (where ${t.aiInvolved} = true)`,
      })
      .from(t)
      .where(eq(t.institutionId, institutionId));
    return {
      total: Number(row?.total ?? 0),
      failures: Number(row?.failures ?? 0),
      aiInvolved: Number(row?.aiInvolved ?? 0),
    };
  }
}
