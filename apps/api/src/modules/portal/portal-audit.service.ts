import { Inject, Injectable } from '@nestjs/common';
import type { AuditWriter, AuditEventInput } from '@edrion/audit';
import type { AuditEvent } from '@edrion/database';
import type { PortalAuditExportQuery, PortalAuditListQuery } from '@edrion/schemas';
import { AUDIT_WRITER } from '../../common/tokens';
import type { ListResult } from './academics.service';
import { PortalAuditRepository } from './portal-audit.repository';
import { basePortalAudit, type PortalActionContext } from './portal-action-context';

const MODULE = 'portal-audit';

/**
 * Institution-portal Audit viewer service (Phase 11). Read-only over the append-only audit_events,
 * always confined to the principal's institution. Reads need `audit.view`; the CSV export needs the
 * sensitive `audit.export` — and the export itself is audited (a portal-audit / audit.export event),
 * so exporting the trail leaves its own trace.
 */
@Injectable()
export class PortalAuditService {
  constructor(
    private readonly repo: PortalAuditRepository,
    @Inject(AUDIT_WRITER) private readonly audit: AuditWriter,
  ) {}

  async list(ctx: PortalActionContext, q: PortalAuditListQuery): Promise<ListResult<AuditEvent>> {
    const page = await this.repo.list(ctx.principal.institutionId, q);
    return { ...page, page: q.page, pageSize: q.pageSize, hasMore: q.page * q.pageSize < page.total };
  }

  async filters(ctx: PortalActionContext) {
    const [modules, summary] = await Promise.all([
      this.repo.distinctModules(ctx.principal.institutionId),
      this.repo.summary(ctx.principal.institutionId),
    ]);
    return { modules, summary };
  }

  /** Build a CSV of the matching events and audit the export action. Returns the CSV + row count. */
  async export(ctx: PortalActionContext, q: PortalAuditExportQuery): Promise<{ csv: string; count: number }> {
    const rows = await this.repo.listForExport(ctx.principal.institutionId, q);
    const csv = toCsv(rows);
    await this.audit.logAudit({
      ...basePortalAudit(ctx),
      action: 'audit.export',
      module: MODULE,
      entityType: 'audit_export',
      entityId: ctx.principal.institutionId,
      newState: { count: rows.length, filters: { module: q.module, action: q.action, from: q.from, to: q.to } },
    } as AuditEventInput);
    return { csv, count: rows.length };
  }
}

const COLUMNS: { header: string; pick: (e: AuditEvent) => unknown }[] = [
  { header: 'occurred_at', pick: (e) => e.occurredAt?.toISOString() },
  { header: 'module', pick: (e) => e.module },
  { header: 'action', pick: (e) => e.action },
  { header: 'result', pick: (e) => e.result },
  { header: 'risk_level', pick: (e) => e.riskLevel },
  { header: 'actor_type', pick: (e) => e.actorType },
  { header: 'actor_name', pick: (e) => e.actorName },
  { header: 'campus_id', pick: (e) => e.campusId },
  { header: 'entity_type', pick: (e) => e.entityType },
  { header: 'entity_id', pick: (e) => e.entityId },
  { header: 'ai_involved', pick: (e) => e.aiInvolved },
  { header: 'ip', pick: (e) => e.ip },
  { header: 'request_id', pick: (e) => e.requestId },
];

function csvCell(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(rows: AuditEvent[]): string {
  const header = COLUMNS.map((c) => c.header).join(',');
  const lines = rows.map((e) => COLUMNS.map((c) => csvCell(c.pick(e))).join(','));
  return [header, ...lines].join('\n');
}
