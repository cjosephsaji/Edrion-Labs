import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { desc, eq, schema, type Database } from '@edrion/database';
import type { AuditWriter, AuditEventInput } from '@edrion/audit';
import type {
  CreateEarlyLeaveRequestInput,
  CreatePickupAuthorizationInput,
  UpdatePickupAuthorizationInput,
} from '@edrion/schemas';
import { AUDIT_WRITER, DATABASE } from '../../common/tokens';
import { assertWard } from './guardian-scope.guard';
import type { GuardianContext } from './guardian-context';
import { basePortalAudit, type PortalActionContext } from '../portal/portal-action-context';

const MODULE = 'parent-safety';

/** Pickup authorizations, early-leave requests and the gate exit/entry feed for a ward. */
@Injectable()
export class ParentSafetyService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(AUDIT_WRITER) private readonly audit: AuditWriter,
  ) {}

  async listPickups(guardian: GuardianContext, studentId: string) {
    assertWard(guardian, studentId);
    const rows = await this.db
      .select()
      .from(schema.pickupAuthorizations)
      .where(eq(schema.pickupAuthorizations.studentId, studentId))
      .orderBy(desc(schema.pickupAuthorizations.createdAt));
    return { items: rows };
  }

  async createPickup(ctx: PortalActionContext, guardian: GuardianContext, studentId: string, input: CreatePickupAuthorizationInput) {
    const scope = assertWard(guardian, studentId);
    const [row] = await this.db
      .insert(schema.pickupAuthorizations)
      .values({
        institutionId: guardian.institutionId,
        campusId: scope.campusId,
        studentId,
        guardianUserId: guardian.guardianUserId,
        personName: input.personName,
        relationship: input.relationship,
        phone: input.phone ?? null,
        photoDocumentId: input.photoDocumentId ?? null,
        idProofDocumentId: input.idProofDocumentId ?? null,
        validUntil: input.validUntil ?? null,
        status: 'pending_school_verification',
      })
      .returning();
    await this.write(ctx, 'parent.pickup.create', row!.id, { newState: { personName: input.personName } });
    return row;
  }

  private async loadWardPickup(guardian: GuardianContext, id: string) {
    const [row] = await this.db.select().from(schema.pickupAuthorizations).where(eq(schema.pickupAuthorizations.id, id)).limit(1);
    if (!row) throw new NotFoundException({ code: 'PICKUP_NOT_FOUND', message: 'Not found.' });
    assertWard(guardian, row.studentId);
    return row;
  }

  async updatePickup(ctx: PortalActionContext, guardian: GuardianContext, id: string, input: UpdatePickupAuthorizationInput) {
    const row = await this.loadWardPickup(guardian, id);
    if (row.version !== input.version) throw new ConflictException({ code: 'VERSION_CONFLICT', message: 'Please reload.' });
    // Any edit re-enters school verification.
    const [updated] = await this.db
      .update(schema.pickupAuthorizations)
      .set({
        personName: input.personName ?? row.personName,
        relationship: input.relationship ?? row.relationship,
        phone: input.phone ?? row.phone,
        validUntil: input.validUntil ?? row.validUntil,
        status: 'pending_school_verification',
        verifiedBy: null,
        verifiedAt: null,
        version: row.version + 1,
      })
      .where(eq(schema.pickupAuthorizations.id, id))
      .returning();
    await this.write(ctx, 'parent.pickup.update', id, { newState: { status: 'pending_school_verification' } });
    return updated;
  }

  async revokePickup(ctx: PortalActionContext, guardian: GuardianContext, id: string) {
    const row = await this.loadWardPickup(guardian, id);
    await this.db
      .update(schema.pickupAuthorizations)
      .set({ status: 'revoked', version: row.version + 1 })
      .where(eq(schema.pickupAuthorizations.id, id));
    await this.write(ctx, 'parent.pickup.revoke', id, { previousState: { status: row.status } });
    return { ok: true };
  }

  async createEarlyLeave(ctx: PortalActionContext, guardian: GuardianContext, studentId: string, input: CreateEarlyLeaveRequestInput) {
    const scope = assertWard(guardian, studentId);
    const [row] = await this.db
      .insert(schema.earlyLeaveRequests)
      .values({
        institutionId: guardian.institutionId,
        campusId: scope.campusId,
        studentId,
        guardianUserId: guardian.guardianUserId,
        leaveDate: input.leaveDate,
        leaveTime: input.leaveTime ?? null,
        reason: input.reason ?? null,
        pickupAuthorizationId: input.pickupAuthorizationId ?? null,
        status: 'requested',
      })
      .returning();
    await this.write(ctx, 'parent.early_leave.create', row!.id, { newState: { leaveDate: input.leaveDate } });
    return row;
  }

  async listEarlyLeave(guardian: GuardianContext, studentId: string) {
    assertWard(guardian, studentId);
    const rows = await this.db
      .select()
      .from(schema.earlyLeaveRequests)
      .where(eq(schema.earlyLeaveRequests.studentId, studentId))
      .orderBy(desc(schema.earlyLeaveRequests.createdAt));
    return { items: rows };
  }

  async gateEvents(guardian: GuardianContext, studentId: string) {
    assertWard(guardian, studentId);
    const rows = await this.db
      .select()
      .from(schema.gateExitEvents)
      .where(eq(schema.gateExitEvents.studentId, studentId))
      .orderBy(desc(schema.gateExitEvents.occurredAt))
      .limit(50);
    return { items: rows };
  }

  private async write(ctx: PortalActionContext, action: string, entityId: string, extra: Partial<AuditEventInput> = {}) {
    await this.audit.logAudit({ ...basePortalAudit(ctx), action, module: MODULE, entityType: 'parent_safety', entityId, ...extra } as AuditEventInput);
  }
}
