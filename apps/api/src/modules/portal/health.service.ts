import { Injectable } from '@nestjs/common';
import { schema } from '@edrion/database';
import { PortalCrudEngine, type CrudConfig } from './portal-crud.engine';
import { PortalResourceService, resourceConfig } from './portal-resource.service';

/**
 * Institution-portal Health service (Phase 13 — School Nurse). Three campus-scoped, version-guarded
 * resources over health_records / medical_incidents / medication_logs. Medical writes are sensitive
 * (recent-auth enforced by the guard) and every mutation is audited via the shared CRUD engine.
 */
@Injectable()
export class HealthService extends PortalResourceService {
  constructor(crud: PortalCrudEngine) {
    super(crud);
  }

  protected readonly configs: Record<string, CrudConfig> = {
    records: resourceConfig(schema.healthRecords, {
      module: 'portal-health',
      entityType: 'health_record',
      actionPrefix: 'health.record',
      search: [schema.healthRecords.title, schema.healthRecords.recordType, schema.healthRecords.bloodGroup],
      sortable: {
        title: schema.healthRecords.title,
        recordType: schema.healthRecords.recordType,
        status: schema.healthRecords.status,
        recordedAt: schema.healthRecords.recordedAt,
        createdAt: schema.healthRecords.createdAt,
      },
      snapshot: (r) => ({ title: r.title, recordType: r.recordType, status: r.status }),
    }),
    incidents: resourceConfig(schema.medicalIncidents, {
      module: 'portal-health',
      entityType: 'medical_incident',
      actionPrefix: 'medical.incident',
      search: [schema.medicalIncidents.title, schema.medicalIncidents.location],
      sortable: {
        title: schema.medicalIncidents.title,
        severity: schema.medicalIncidents.severity,
        status: schema.medicalIncidents.status,
        occurredAt: schema.medicalIncidents.occurredAt,
        createdAt: schema.medicalIncidents.createdAt,
      },
      snapshot: (r) => ({ title: r.title, severity: r.severity, status: r.status }),
    }),
    medications: resourceConfig(schema.medicationLogs, {
      module: 'portal-health',
      entityType: 'medication_log',
      actionPrefix: 'medication.log',
      search: [schema.medicationLogs.medication, schema.medicationLogs.dosage],
      sortable: {
        medication: schema.medicationLogs.medication,
        status: schema.medicationLogs.status,
        administeredAt: schema.medicationLogs.administeredAt,
        createdAt: schema.medicationLogs.createdAt,
      },
      snapshot: (r) => ({ medication: r.medication, status: r.status }),
    }),
  };
}
