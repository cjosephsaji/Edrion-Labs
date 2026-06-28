import { Injectable } from '@nestjs/common';
import { schema } from '@edrion/database';
import { PortalCrudEngine, type CrudConfig } from './portal-crud.engine';
import { PortalResourceService, resourceConfig } from './portal-resource.service';

/**
 * Institution-portal Facilities service (Phase 13 — Maintenance Staff). facilities, work_orders,
 * maintenance_tasks and facility_assets (the assets directory; writes are "inventory requests").
 */
@Injectable()
export class FacilitiesService extends PortalResourceService {
  constructor(crud: PortalCrudEngine) {
    super(crud);
  }

  protected readonly configs: Record<string, CrudConfig> = {
    facilities: resourceConfig(schema.facilities, {
      module: 'portal-facilities',
      entityType: 'facility',
      actionPrefix: 'facility',
      search: [schema.facilities.name, schema.facilities.location, schema.facilities.kind],
      sortable: {
        name: schema.facilities.name,
        kind: schema.facilities.kind,
        status: schema.facilities.status,
        createdAt: schema.facilities.createdAt,
      },
      snapshot: (r) => ({ name: r.name, kind: r.kind, status: r.status }),
    }),
    'work-orders': resourceConfig(schema.workOrders, {
      module: 'portal-facilities',
      entityType: 'work_order',
      actionPrefix: 'work.order',
      search: [schema.workOrders.title, schema.workOrders.assignedTo],
      sortable: {
        title: schema.workOrders.title,
        priority: schema.workOrders.priority,
        status: schema.workOrders.status,
        dueAt: schema.workOrders.dueAt,
        createdAt: schema.workOrders.createdAt,
      },
      snapshot: (r) => ({ title: r.title, priority: r.priority, status: r.status }),
    }),
    'maintenance-tasks': resourceConfig(schema.maintenanceTasks, {
      module: 'portal-facilities',
      entityType: 'maintenance_task',
      actionPrefix: 'maintenance.task',
      search: [schema.maintenanceTasks.title],
      sortable: {
        title: schema.maintenanceTasks.title,
        frequency: schema.maintenanceTasks.frequency,
        status: schema.maintenanceTasks.status,
        nextDueAt: schema.maintenanceTasks.nextDueAt,
        createdAt: schema.maintenanceTasks.createdAt,
      },
      snapshot: (r) => ({ title: r.title, frequency: r.frequency, status: r.status }),
    }),
    assets: resourceConfig(schema.facilityAssets, {
      module: 'portal-facilities',
      entityType: 'facility_asset',
      actionPrefix: 'facility.asset',
      search: [schema.facilityAssets.name, schema.facilityAssets.category, schema.facilityAssets.location],
      sortable: {
        name: schema.facilityAssets.name,
        category: schema.facilityAssets.category,
        status: schema.facilityAssets.status,
        createdAt: schema.facilityAssets.createdAt,
      },
      snapshot: (r) => ({ name: r.name, category: r.category, status: r.status }),
    }),
  };
}
