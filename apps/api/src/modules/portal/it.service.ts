import { Injectable } from '@nestjs/common';
import { schema } from '@edrion/database';
import { PortalCrudEngine, type CrudConfig } from './portal-crud.engine';
import { PortalResourceService, resourceConfig } from './portal-resource.service';

/**
 * Institution-portal IT service (Phase 13 — IT Staff). devices register + access_requests queue.
 * IT security actions (reset-security / revoke-sessions) live on the Users controller and reuse
 * portal_sessions; security_events.view_limited reads an audit projection (see PortalAudit).
 */
@Injectable()
export class ItService extends PortalResourceService {
  constructor(crud: PortalCrudEngine) {
    super(crud);
  }

  protected readonly configs: Record<string, CrudConfig> = {
    devices: resourceConfig(schema.devices, {
      module: 'portal-it',
      entityType: 'device',
      actionPrefix: 'device',
      search: [schema.devices.name, schema.devices.assetTag, schema.devices.assignedTo],
      sortable: {
        name: schema.devices.name,
        kind: schema.devices.kind,
        status: schema.devices.status,
        createdAt: schema.devices.createdAt,
      },
      snapshot: (r) => ({ name: r.name, kind: r.kind, status: r.status }),
    }),
    'access-requests': resourceConfig(schema.accessRequests, {
      module: 'portal-it',
      entityType: 'access_request',
      actionPrefix: 'access.request',
      search: [schema.accessRequests.requesterName, schema.accessRequests.system],
      sortable: {
        requesterName: schema.accessRequests.requesterName,
        priority: schema.accessRequests.priority,
        status: schema.accessRequests.status,
        createdAt: schema.accessRequests.createdAt,
      },
      snapshot: (r) => ({ requesterName: r.requesterName, status: r.status }),
    }),
  };
}
