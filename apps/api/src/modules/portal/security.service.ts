import { Injectable } from '@nestjs/common';
import { schema } from '@edrion/database';
import { PortalCrudEngine, type CrudConfig } from './portal-crud.engine';
import { PortalResourceService, resourceConfig } from './portal-resource.service';

/**
 * Institution-portal Security service (Phase 13 — Security Staff). gate_passes, security_incidents
 * (sensitive), emergency_alerts and campus_access_logs.
 */
@Injectable()
export class SecurityService extends PortalResourceService {
  constructor(crud: PortalCrudEngine) {
    super(crud);
  }

  protected readonly configs: Record<string, CrudConfig> = {
    'gate-passes': resourceConfig(schema.gatePasses, {
      module: 'portal-security',
      entityType: 'gate_pass',
      actionPrefix: 'gate.pass',
      search: [schema.gatePasses.holderName, schema.gatePasses.kind, schema.gatePasses.reason],
      sortable: {
        holderName: schema.gatePasses.holderName,
        kind: schema.gatePasses.kind,
        status: schema.gatePasses.status,
        issuedAt: schema.gatePasses.issuedAt,
        createdAt: schema.gatePasses.createdAt,
      },
      snapshot: (r) => ({ holderName: r.holderName, kind: r.kind, status: r.status }),
    }),
    incidents: resourceConfig(schema.securityIncidents, {
      module: 'portal-security',
      entityType: 'security_incident',
      actionPrefix: 'security.incident',
      search: [schema.securityIncidents.title, schema.securityIncidents.location],
      sortable: {
        title: schema.securityIncidents.title,
        severity: schema.securityIncidents.severity,
        status: schema.securityIncidents.status,
        occurredAt: schema.securityIncidents.occurredAt,
        createdAt: schema.securityIncidents.createdAt,
      },
      snapshot: (r) => ({ title: r.title, severity: r.severity, status: r.status }),
    }),
    alerts: resourceConfig(schema.emergencyAlerts, {
      module: 'portal-security',
      entityType: 'emergency_alert',
      actionPrefix: 'emergency.alert',
      search: [schema.emergencyAlerts.title],
      sortable: {
        title: schema.emergencyAlerts.title,
        level: schema.emergencyAlerts.level,
        status: schema.emergencyAlerts.status,
        raisedAt: schema.emergencyAlerts.raisedAt,
        createdAt: schema.emergencyAlerts.createdAt,
      },
      snapshot: (r) => ({ title: r.title, level: r.level, status: r.status }),
    }),
    'access-logs': resourceConfig(schema.campusAccessLogs, {
      module: 'portal-security',
      entityType: 'campus_access_log',
      actionPrefix: 'campus.access',
      search: [schema.campusAccessLogs.subjectName, schema.campusAccessLogs.gate],
      sortable: {
        subjectName: schema.campusAccessLogs.subjectName,
        direction: schema.campusAccessLogs.direction,
        status: schema.campusAccessLogs.status,
        occurredAt: schema.campusAccessLogs.occurredAt,
        createdAt: schema.campusAccessLogs.createdAt,
      },
      snapshot: (r) => ({ subjectName: r.subjectName, direction: r.direction }),
    }),
  };
}
