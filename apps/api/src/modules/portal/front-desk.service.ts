import { Injectable } from '@nestjs/common';
import { schema } from '@edrion/database';
import { PortalCrudEngine, type CrudConfig } from './portal-crud.engine';
import { PortalResourceService, resourceConfig } from './portal-resource.service';

/**
 * Institution-portal Front Desk service (Phase 13 — Receptionist). visitors (the check-in/out log,
 * also read by Security via visitors.view) and appointments.
 */
@Injectable()
export class FrontDeskService extends PortalResourceService {
  constructor(crud: PortalCrudEngine) {
    super(crud);
  }

  protected readonly configs: Record<string, CrudConfig> = {
    visitors: resourceConfig(schema.visitors, {
      module: 'portal-front-desk',
      entityType: 'visitor',
      actionPrefix: 'visitor',
      search: [schema.visitors.fullName, schema.visitors.host, schema.visitors.badgeNo],
      sortable: {
        fullName: schema.visitors.fullName,
        status: schema.visitors.status,
        checkInAt: schema.visitors.checkInAt,
        createdAt: schema.visitors.createdAt,
      },
      snapshot: (r) => ({ fullName: r.fullName, status: r.status }),
    }),
    appointments: resourceConfig(schema.appointments, {
      module: 'portal-front-desk',
      entityType: 'appointment',
      actionPrefix: 'appointment',
      search: [schema.appointments.visitorName, schema.appointments.withWhom],
      sortable: {
        visitorName: schema.appointments.visitorName,
        status: schema.appointments.status,
        scheduledAt: schema.appointments.scheduledAt,
        createdAt: schema.appointments.createdAt,
      },
      snapshot: (r) => ({ visitorName: r.visitorName, status: r.status }),
    }),
  };
}
