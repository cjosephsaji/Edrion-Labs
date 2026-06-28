import { Injectable } from '@nestjs/common';
import { schema } from '@edrion/database';
import { PortalCrudEngine, type CrudConfig } from './portal-crud.engine';
import { PortalResourceService, resourceConfig } from './portal-resource.service';

/**
 * Institution-portal Counseling service (Phase 13 — Counselor). Counseling notes are sensitive:
 * the `records` resource sets `auditReads` so a note GET writes a `counseling.note.view` audit event
 * (an explicit Phase-13 requirement) in addition to write audits; cases are gated by the sensitive
 * counseling_cases.manage key.
 */
@Injectable()
export class CounselingService extends PortalResourceService {
  constructor(crud: PortalCrudEngine) {
    super(crud);
  }

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
    }),
  };
}
