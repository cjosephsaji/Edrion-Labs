import { Injectable } from '@nestjs/common';
import { schema } from '@edrion/database';
import { PortalCrudEngine, type CrudConfig } from './portal-crud.engine';
import { PortalResourceService, resourceConfig } from './portal-resource.service';
import { PortalEntityResolver } from './portal-entity-resolver';
import type { PortalActionContext } from './portal-action-context';

/**
 * Institution-portal Health service (Phase 13 — School Nurse; redesigned in the admin-panel Phase 2).
 * Three campus-scoped, version-guarded resources over health_records / medical_incidents /
 * medication_logs. Medical writes are sensitive (recent-auth enforced by the guard) and every mutation
 * is audited via the shared CRUD engine. Every read is enriched with the full student card
 * (name/class/grade/section/campus/age/guardian) so a record is never shown as a bare UUID.
 */
@Injectable()
export class HealthService extends PortalResourceService {
  constructor(
    crud: PortalCrudEngine,
    private readonly resolver: PortalEntityResolver,
  ) {
    super(crud);
  }

  /** Attach the resolved `student` card to every row that links a student (used by all three configs). */
  private enrichStudents = async (rows: Array<Record<string, unknown>>, ctx: PortalActionContext) => {
    const ids = rows.map((r) => r.studentId).filter((v): v is string => typeof v === 'string' && !!v);
    const ctxMap = await this.resolver.studentContexts(ctx.principal.institutionId, ids);
    for (const r of rows) r.student = typeof r.studentId === 'string' ? (ctxMap[r.studentId] ?? null) : null;
    return rows;
  };

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
      enrich: this.enrichStudents,
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
      enrich: this.enrichStudents,
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
      enrich: this.enrichStudents,
    }),
  };
}
