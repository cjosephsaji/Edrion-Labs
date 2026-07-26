import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, schema, sql, type Database } from '@edrion/database';
import type { AuditWriter, AuditEventInput } from '@edrion/audit';
import type { PutHealthProfileInput } from '@edrion/schemas';
import { AUDIT_WRITER, DATABASE } from '../../common/tokens';
import { assertWard } from './guardian-scope.guard';
import type { GuardianContext } from './guardian-context';
import { basePortalAudit, type PortalActionContext } from '../portal/portal-action-context';

const MODULE = 'parent-wellbeing';

/**
 * Wellbeing for a ward: the parent-maintained health profile (versioned), health-room visits, medical
 * incidents (structured fields only — never the nurse's free notes), the medication log, published
 * behaviour incidents (+ acknowledge), recognitions, and the counseling DISCLOSURE (the only
 * counseling surface a parent ever sees — counseling_cases/records are never queried here).
 */
@Injectable()
export class ParentWellbeingService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(AUDIT_WRITER) private readonly audit: AuditWriter,
  ) {}

  async getHealthProfile(guardian: GuardianContext, studentId: string) {
    assertWard(guardian, studentId, 'health');
    const [row] = await this.db
      .select()
      .from(schema.parentHealthProfiles)
      .where(eq(schema.parentHealthProfiles.studentId, studentId))
      .orderBy(desc(schema.parentHealthProfiles.revision))
      .limit(1);
    return row ?? null;
  }

  async putHealthProfile(
    ctx: PortalActionContext,
    guardian: GuardianContext,
    studentId: string,
    input: PutHealthProfileInput,
  ) {
    const scope = assertWard(guardian, studentId, 'health');
    const [current] = await this.db
      .select({ revision: schema.parentHealthProfiles.revision })
      .from(schema.parentHealthProfiles)
      .where(eq(schema.parentHealthProfiles.studentId, studentId))
      .orderBy(desc(schema.parentHealthProfiles.revision))
      .limit(1);
    const revision = (current?.revision ?? 0) + 1;
    // Versioned: a new row per edit (full history retained); the highest revision is authoritative.
    // last_verified_* reset so the nurse re-verifies the new revision.
    const [row] = await this.db
      .insert(schema.parentHealthProfiles)
      .values({
        institutionId: guardian.institutionId,
        campusId: scope.campusId,
        studentId,
        bloodGroup: input.bloodGroup ?? null,
        allergies: input.allergies,
        chronicConditions: input.chronicConditions,
        currentMedications: input.currentMedications,
        dietaryRestrictions: input.dietaryRestrictions ?? null,
        doctorName: input.doctorName ?? null,
        doctorPhone: input.doctorPhone ?? null,
        insuranceRef: input.insuranceRef ?? null,
        vaccinations: input.vaccinations,
        emergencyContacts: input.emergencyContacts,
        revision,
      })
      .returning();
    // Nurse notification is emitted by the fanout worker (health_profile.updated); audit here.
    await this.write(ctx, 'parent.health_profile.update', row!.id, { newState: { revision, studentId } });
    return row;
  }

  async visits(guardian: GuardianContext, studentId: string) {
    assertWard(guardian, studentId, 'health');
    const t = schema.healthRecords;
    const rows = await this.db
      .select({ id: t.id, title: t.title, reason: t.reason, actionTaken: t.actionTaken, recordType: t.recordType, recordedAt: t.recordedAt })
      .from(t)
      .where(eq(t.studentId, studentId))
      .orderBy(desc(t.recordedAt))
      .limit(50);
    return { items: rows };
  }

  async incidents(guardian: GuardianContext, studentId: string) {
    assertWard(guardian, studentId, 'health');
    const t = schema.medicalIncidents;
    // Structured fields only — the nurse's free-form notes/treatment detail are not exposed.
    const rows = await this.db
      .select({ id: t.id, title: t.title, description: t.description, severity: t.severity, location: t.location, actionTaken: t.actionTaken, occurredAt: t.occurredAt, status: t.status })
      .from(t)
      .where(eq(t.studentId, studentId))
      .orderBy(desc(t.occurredAt))
      .limit(50);
    return { items: rows };
  }

  async medications(guardian: GuardianContext, studentId: string) {
    assertWard(guardian, studentId, 'health');
    const t = schema.medicationLogs;
    const rows = await this.db
      .select({ id: t.id, medication: t.medication, dosage: t.dosage, administeredAt: t.administeredAt, status: t.status })
      .from(t)
      .where(eq(t.studentId, studentId))
      .orderBy(desc(t.administeredAt))
      .limit(50);
    return { items: rows };
  }

  async behavior(guardian: GuardianContext, studentId: string) {
    assertWard(guardian, studentId, 'behavior');
    const t = schema.studentIncidents;
    // Published-to-guardians only (publish gate in SQL).
    const rows = await this.db
      .select({ id: t.id, category: t.category, title: t.title, description: t.description, severity: t.severity, status: t.status, occurredOn: t.occurredOn, parentAckRequired: t.parentAckRequired, parentAcknowledgedAt: t.parentAcknowledgedAt })
      .from(t)
      .where(and(eq(t.studentId, studentId), eq(t.notifyGuardians, true), sql`${t.publishedAt} is not null`))
      .orderBy(desc(t.occurredOn));
    return { items: rows };
  }

  async acknowledgeBehavior(ctx: PortalActionContext, guardian: GuardianContext, incidentId: string) {
    const [row] = await this.db
      .select()
      .from(schema.studentIncidents)
      .where(eq(schema.studentIncidents.id, incidentId))
      .limit(1);
    if (!row || !row.notifyGuardians || !row.publishedAt) {
      throw new NotFoundException({ code: 'INCIDENT_NOT_FOUND', message: 'No such published incident.' });
    }
    assertWard(guardian, row.studentId, 'behavior');
    await this.db
      .update(schema.studentIncidents)
      .set({ parentAcknowledgedAt: new Date() })
      .where(eq(schema.studentIncidents.id, incidentId));
    await this.write(ctx, 'parent.behavior.acknowledge', incidentId, { newState: { acknowledged: true } });
    return { ok: true };
  }

  async recognitions(guardian: GuardianContext, studentId: string) {
    assertWard(guardian, studentId);
    const t = schema.studentRecognitions;
    const rows = await this.db
      .select()
      .from(t)
      .where(eq(t.studentId, studentId))
      .orderBy(desc(t.awardedAt));
    return { items: rows };
  }

  /** The disclosure record for this ward, or 404. Nothing else about counseling is ever revealed. */
  async counselingDisclosure(guardian: GuardianContext, studentId: string) {
    assertWard(guardian, studentId);
    const [row] = await this.db
      .select({ counselorDisplayName: schema.counselingDisclosures.counselorDisplayName, contactNote: schema.counselingDisclosures.contactNote, disclosedAt: schema.counselingDisclosures.disclosedAt })
      .from(schema.counselingDisclosures)
      .where(and(eq(schema.counselingDisclosures.studentId, studentId), sql`${schema.counselingDisclosures.revokedAt} is null`))
      .limit(1);
    if (!row) throw new NotFoundException({ code: 'NO_DISCLOSURE', message: 'No counseling contact disclosed.' });
    return row;
  }

  private async write(ctx: PortalActionContext, action: string, entityId: string, extra: Partial<AuditEventInput> = {}) {
    await this.audit.logAudit({ ...basePortalAudit(ctx), action, module: MODULE, entityType: 'parent_wellbeing', entityId, ...extra } as AuditEventInput);
  }
}
