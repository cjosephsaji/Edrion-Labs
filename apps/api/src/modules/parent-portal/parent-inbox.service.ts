import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, gte, inArray, isNull, lte, lt, schema, type Database } from '@edrion/database';
import type { AuditWriter, AuditEventInput } from '@edrion/audit';
import type { CreateDocumentRequestInput, CreateProfileChangeRequestInput, ParentListQuery } from '@edrion/schemas';
import { AUDIT_WRITER, DATABASE } from '../../common/tokens';
import { assertWard } from './guardian-scope.guard';
import type { GuardianContext } from './guardian-context';
import { basePortalAudit, type PortalActionContext } from '../portal/portal-action-context';

const MODULE = 'parent-inbox';

/** Notification feed, calendar, document vault + certificate requests, and profile-change requests. */
@Injectable()
export class ParentInboxService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(AUDIT_WRITER) private readonly audit: AuditWriter,
  ) {}

  // ── Notifications ─────────────────────────────────────────────────────────────
  async notifications(guardian: GuardianContext, q: ParentListQuery) {
    const t = schema.parentNotifications;
    const conds = [eq(t.guardianUserId, guardian.guardianUserId)];
    if (q.cursor) conds.push(lt(t.createdAt, new Date(q.cursor)));
    const rows = await this.db.select().from(t).where(and(...conds)).orderBy(desc(t.createdAt)).limit(q.limit + 1);
    const nextCursor = rows.length > q.limit ? rows[q.limit]!.createdAt.toISOString() : null;
    return { items: rows.slice(0, q.limit), nextCursor };
  }

  async readNotification(guardian: GuardianContext, id: string) {
    await this.db.update(schema.parentNotifications).set({ readAt: new Date() }).where(and(eq(schema.parentNotifications.id, id), eq(schema.parentNotifications.guardianUserId, guardian.guardianUserId)));
    return { ok: true };
  }

  async readAllNotifications(guardian: GuardianContext) {
    await this.db.update(schema.parentNotifications).set({ readAt: new Date() }).where(and(eq(schema.parentNotifications.guardianUserId, guardian.guardianUserId), isNull(schema.parentNotifications.readAt)));
    return { ok: true };
  }

  // ── Calendar ──────────────────────────────────────────────────────────────────
  async calendar(guardian: GuardianContext, month?: string) {
    const t = schema.calendarEvents;
    const conds = [eq(t.institutionId, guardian.institutionId)];
    if (month && /^\d{4}-\d{2}$/.test(month)) {
      const start = new Date(`${month}-01T00:00:00Z`);
      const end = new Date(start.getFullYear(), start.getMonth() + 1, 1);
      conds.push(gte(t.startsOn, start));
      conds.push(lte(t.startsOn, end));
    }
    const rows = await this.db.select().from(t).where(and(...conds)).orderBy(t.startsOn);
    return { items: rows };
  }

  // ── Documents ───────────────────────────────────────────────────────────────
  async documents(guardian: GuardianContext, studentId: string, type?: string) {
    assertWard(guardian, studentId, 'documents');
    const t = schema.studentDocuments;
    const conds = [eq(t.studentId, studentId), eq(t.published, true)];
    if (type) conds.push(eq(t.type, type));
    const rows = await this.db.select().from(t).where(and(...conds)).orderBy(desc(t.issuedAt));
    // fileRef is a storage key; a short-lived signed URL is minted by the download route (not the list).
    return { items: rows.map((r) => ({ id: r.id, type: r.type, title: r.title, contentType: r.contentType, issuedAt: r.issuedAt, downloadPath: `/v1/parent/documents/${r.id}/file` })) };
  }

  async createDocumentRequest(ctx: PortalActionContext, guardian: GuardianContext, input: CreateDocumentRequestInput) {
    const scope = assertWard(guardian, input.studentId, 'documents');
    const [row] = await this.db
      .insert(schema.documentRequests)
      .values({ institutionId: guardian.institutionId, campusId: scope.campusId, studentId: input.studentId, guardianUserId: guardian.guardianUserId, type: input.type, note: input.note ?? null, status: 'requested' })
      .returning();
    await this.write(ctx, 'parent.document_request.create', row!.id, { newState: { type: input.type, studentId: input.studentId } });
    return row;
  }

  async documentRequests(guardian: GuardianContext, studentId?: string) {
    const ids = studentId ? [assertWard(guardian, studentId).studentId] : guardian.studentIds;
    if (!ids.length) return { items: [] };
    const rows = await this.db.select().from(schema.documentRequests).where(inArray(schema.documentRequests.studentId, ids)).orderBy(desc(schema.documentRequests.createdAt));
    return { items: rows };
  }

  // ── Profile change requests ────────────────────────────────────────────────────
  async createProfileChange(ctx: PortalActionContext, guardian: GuardianContext, input: CreateProfileChangeRequestInput) {
    const scope = assertWard(guardian, input.studentId);
    const [row] = await this.db
      .insert(schema.profileChangeRequests)
      .values({ institutionId: guardian.institutionId, campusId: scope.campusId, studentId: input.studentId, guardianUserId: guardian.guardianUserId, fieldGroup: input.fieldGroup, proposedChanges: input.proposedChanges, status: 'submitted' })
      .returning();
    await this.write(ctx, 'parent.profile_change.create', row!.id, { newState: { fieldGroup: input.fieldGroup, studentId: input.studentId } });
    return row;
  }

  async profileChanges(guardian: GuardianContext, studentId?: string) {
    const ids = studentId ? [assertWard(guardian, studentId).studentId] : guardian.studentIds;
    if (!ids.length) return { items: [] };
    const rows = await this.db.select().from(schema.profileChangeRequests).where(inArray(schema.profileChangeRequests.studentId, ids)).orderBy(desc(schema.profileChangeRequests.createdAt));
    return { items: rows };
  }

  private async write(ctx: PortalActionContext, action: string, entityId: string, extra: Partial<AuditEventInput> = {}) {
    await this.audit.logAudit({ ...basePortalAudit(ctx), action, module: MODULE, entityType: 'parent_inbox', entityId, ...extra } as AuditEventInput);
  }
}
