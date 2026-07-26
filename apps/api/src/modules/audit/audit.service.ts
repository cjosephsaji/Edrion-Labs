import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { ListActivityQuery, ListAuditQuery } from '@edrion/schemas';
import type { AuditWriter } from '@edrion/audit';
import type { AuditEvent } from '@edrion/database';
import { AUDIT_WRITER } from '../../common/tokens';
import { baseAudit, type ActionContext } from '../../common/action-context';
import { AuditRepository } from './audit.repository';

const EXPORT_CAP = 10_000;
const CSV_COLUMNS = [
  'id',
  'occurredAt',
  'actorType',
  'actorName',
  'actorRole',
  'institutionName',
  'module',
  'action',
  'entityType',
  'entityId',
  'result',
  'riskLevel',
  'reason',
] as const;

@Injectable()
export class AuditService {
  constructor(
    private readonly repo: AuditRepository,
    @Inject(AUDIT_WRITER) private readonly audit: AuditWriter,
  ) {}

  listAudit(q: ListAuditQuery) {
    return this.repo.listAudit(q);
  }

  async getAudit(id: string) {
    const row = await this.repo.findAuditById(id);
    if (!row) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Audit event not found' });
    return row;
  }

  listActivity(q: ListActivityQuery) {
    return this.repo.listActivity(q);
  }

  /** Export filtered audit rows as CSV. The export itself is a sensitive, audited action. */
  async exportCsv(q: ListAuditQuery, ctx: ActionContext): Promise<{ filename: string; csv: string }> {
    const rows = await this.repo.exportAudit(q, EXPORT_CAP);
    const csv = this.toCsv(rows);

    await this.audit.logAudit({
      ...baseAudit(ctx),
      action: 'audit.export',
      module: 'audit',
      entityType: 'audit_export',
      newState: { rowCount: rows.length, filters: stripCursor(q) },
    } as Parameters<AuditWriter['logAudit']>[0]);

    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    return { filename: `audit-export-${stamp}.csv`, csv };
  }

  private toCsv(rows: AuditEvent[]): string {
    const header = CSV_COLUMNS.join(',');
    const lines = rows.map((r) =>
      CSV_COLUMNS.map((col) => csvCell((r as Record<string, unknown>)[col])).join(','),
    );
    return [header, ...lines].join('\n');
  }
}

function csvCell(value: unknown): string {
  if (value == null) return '';
  const s = value instanceof Date ? value.toISOString() : String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function stripCursor(q: ListAuditQuery): Record<string, unknown> {
  const { cursor: _cursor, limit: _limit, ...rest } = q;
  return rest;
}
