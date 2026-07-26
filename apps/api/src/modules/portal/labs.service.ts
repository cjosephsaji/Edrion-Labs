import { Injectable } from '@nestjs/common';
import { schema } from '@edrion/database';
import { PortalCrudEngine, type CrudConfig } from './portal-crud.engine';
import { PortalResourceService, resourceConfig } from './portal-resource.service';

/**
 * Institution-portal Labs service (Phase 13 — Lab Staff). Campus-scoped, version-guarded resources
 * over lab_assets (inventory/equipment/consumables via `kind`), lab_schedules and lab_incidents.
 */
@Injectable()
export class LabsService extends PortalResourceService {
  constructor(crud: PortalCrudEngine) {
    super(crud);
  }

  protected readonly configs: Record<string, CrudConfig> = {
    assets: resourceConfig(schema.labAssets, {
      module: 'portal-labs',
      entityType: 'lab_asset',
      actionPrefix: 'lab.asset',
      search: [schema.labAssets.name, schema.labAssets.location, schema.labAssets.kind],
      sortable: {
        name: schema.labAssets.name,
        kind: schema.labAssets.kind,
        quantity: schema.labAssets.quantity,
        status: schema.labAssets.status,
        createdAt: schema.labAssets.createdAt,
      },
      snapshot: (r) => ({ name: r.name, kind: r.kind, status: r.status }),
    }),
    schedules: resourceConfig(schema.labSchedules, {
      module: 'portal-labs',
      entityType: 'lab_schedule',
      actionPrefix: 'lab.schedule',
      search: [schema.labSchedules.labName, schema.labSchedules.title],
      sortable: {
        labName: schema.labSchedules.labName,
        title: schema.labSchedules.title,
        status: schema.labSchedules.status,
        scheduledAt: schema.labSchedules.scheduledAt,
        createdAt: schema.labSchedules.createdAt,
      },
      snapshot: (r) => ({ labName: r.labName, title: r.title, status: r.status }),
    }),
    incidents: resourceConfig(schema.labIncidents, {
      module: 'portal-labs',
      entityType: 'lab_incident',
      actionPrefix: 'lab.incident',
      search: [schema.labIncidents.title],
      sortable: {
        title: schema.labIncidents.title,
        severity: schema.labIncidents.severity,
        status: schema.labIncidents.status,
        occurredAt: schema.labIncidents.occurredAt,
        createdAt: schema.labIncidents.createdAt,
      },
      snapshot: (r) => ({ title: r.title, severity: r.severity, status: r.status }),
    }),
  };
}
