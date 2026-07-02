import { Injectable } from '@nestjs/common';
import { schema } from '@edrion/database';
import { PortalCrudEngine, type CrudConfig } from './portal-crud.engine';
import { PortalResourceService, resourceConfig } from './portal-resource.service';
import { PortalEntityResolver } from './portal-entity-resolver';
import type { PortalActionContext } from './portal-action-context';

/**
 * Institution-portal Counseling service (Phase 13 — Counselor; enriched in admin-redesign Phase 7).
 * Counseling notes are sensitive: the `records` resource sets `auditReads` so a note GET writes a
 * `counseling.note.view` audit event in addition to write audits; cases are gated by the sensitive
 * counseling_cases.manage key. Every read is enriched with the full student card (like Health).
 */
@Injectable()
export class CounselingService extends PortalResourceService {
  constructor(
    crud: PortalCrudEngine,
    private readonly resolver: PortalEntityResolver,
  ) {
    super(crud);
  }

  private enrichStudents = async (rows: Array<Record<string, unknown>>, ctx: PortalActionContext) => {
    const ids = rows.map((r) => r.studentId).filter((v): v is string => typeof v === 'string' && !!v);
    const ctxMap = await this.resolver.studentContexts(ctx.principal.institutionId, ids);
    for (const r of rows) r.student = typeof r.studentId === 'string' ? (ctxMap[r.studentId] ?? null) : null;
    return rows;
  };

  protected readonly configs: Record<string, CrudConfig> = {
    records: resourceConfig(schema.counselingRecords, {
      module: 'portal-counseling',
      entityType: 'counseling_note',
      actionPrefix: 'counseling.note',
      search: [schema.counselingRecords.title, schema.counselingRecords.sessionType],
      sortable: {
        title: schema.counselingRecords.title,
        sessionType: schema.counselingRecords.sessionType,
        status: schema.counselingRecords.status,
        sessionAt: schema.counselingRecords.sessionAt,
        createdAt: schema.counselingRecords.createdAt,
      },
      snapshot: (r) => ({ title: r.title, sessionType: r.sessionType, status: r.status }),
      auditReads: true,
      enrich: this.enrichStudents,
    }),
    cases: resourceConfig(schema.counselingCases, {
      module: 'portal-counseling',
      entityType: 'counseling_case',
      actionPrefix: 'counseling.case',
      search: [schema.counselingCases.title],
      sortable: {
        title: schema.counselingCases.title,
        priority: schema.counselingCases.priority,
        status: schema.counselingCases.status,
        createdAt: schema.counselingCases.createdAt,
      },
      snapshot: (r) => ({ title: r.title, priority: r.priority, status: r.status }),
      enrich: this.enrichStudents,
    }),
  };
}
