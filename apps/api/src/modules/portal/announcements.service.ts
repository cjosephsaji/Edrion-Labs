import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { resolveScopeFilter, type InstitutionScope, type ScopeFilter } from '@edrion/auth';
import type { AuditWriter, AuditEventInput } from '@edrion/audit';
import type {
  AnnouncementsListQuery,
  CreateAnnouncementInput,
  CreateNotificationInput,
  NotificationsListQuery,
  PublishAnnouncementInput,
  UpdateAnnouncementInput,
  UpdateNotificationInput,
} from '@edrion/schemas';
import { AUDIT_WRITER } from '../../common/tokens';
import type { Page } from './academics.repository';
import type { ListResult } from './academics.service';
import { AnnouncementsRepository } from './announcements.repository';
import { RecipientResolver } from './recipient-resolver.service';
import { basePortalAudit, type PortalActionContext } from './portal-action-context';
import { TodayNotifyService } from '../student/today/today-notify.service';

const BROADCAST_LABEL: Record<string, string> = {
  all: 'Everyone',
  teachers: 'All teachers',
  students: 'All students',
  parents: 'All parents',
  staff: 'All staff',
};

const ANNOUNCEMENTS_MODULE = 'portal-announcements';
const NOTIFICATIONS_MODULE = 'portal-notifications';

/**
 * Institution-portal Announcements service (Phase 9). Announcements are campus-scoped + version-guarded
 * like every other portal resource; `reference_code` is unique within the institution (a friendly 409).
 * Publishing a draft stamps published_at + status and fans out a notification (the publish→notify
 * bridge, like admissions→enrol). All mutations are audited.
 */
@Injectable()
export class AnnouncementsService {
  constructor(
    private readonly repo: AnnouncementsRepository,
    private readonly recipients: RecipientResolver,
    @Inject(AUDIT_WRITER) private readonly audit: AuditWriter,
    private readonly todayNotify: TodayNotifyService,
  ) {}

  async list(ctx: PortalActionContext, q: AnnouncementsListQuery) {
    const f = this.filter(ctx);
    const page = await this.repo.listAnnouncements(ctx.principal.institutionId, f.campusIds, q);
    const items = await this.attachTargets(ctx.principal.institutionId, page.items);
    return this.paginate({ items, total: page.total }, q);
  }

  /** Attach the labeled recipient targets to a page of announcements (one batched resolve). */
  private async attachTargets<T extends { id: string }>(institutionId: string, rows: T[]) {
    const map = await this.repo.getTargetsFor(institutionId, rows.map((r) => r.id));
    const flat: Array<{ aid: string; kind: string; refId: string | null }> = [];
    for (const [aid, targets] of map) for (const t of targets) flat.push({ aid, kind: t.kind, refId: t.refId });
    const described = await this.recipients.describeTargets(institutionId, flat.map((f) => ({ kind: f.kind, refId: f.refId })));
    const byAnn = new Map<string, Array<{ kind: string; refId: string | null; label: string }>>();
    flat.forEach((f, i) => {
      const arr = byAnn.get(f.aid) ?? [];
      arr.push(described[i]!);
      byAnn.set(f.aid, arr);
    });
    return rows.map((r) => ({ ...r, targets: byAnn.get(r.id) ?? [] }));
  }

  async create(ctx: PortalActionContext, input: CreateAnnouncementInput) {
    const code = input.referenceCode.trim();
    if (await this.repo.findAnnouncementByCode(ctx.principal.institutionId, code)) {
      throw new ConflictException({ code: 'ANNOUNCEMENT_EXISTS', message: `An announcement with code "${code}" already exists.` });
    }
    const campusId = this.createCampusId(ctx.scope);
    const row = await this.repo.insertAnnouncement({
      institutionId: ctx.principal.institutionId,
      campusId,
      title: input.title,
      body: input.body ?? null,
      referenceCode: code,
      audience: input.audience,
      category: input.category ?? null,
      status: input.status,
      pinned: input.pinned,
      publishAt: input.publishAt ?? null,
      publishedAt: input.status === 'published' ? new Date() : null,
      createdBy: ctx.principal.institutionUserId,
    });
    if (input.targets) {
      await this.repo.setAnnouncementTargets(row.id, ctx.principal.institutionId, input.targets);
    }
    await this.write(ctx, ANNOUNCEMENTS_MODULE, 'announcement.create', 'announcement', row.id, campusId, {
      newState: { title: row.title, referenceCode: row.referenceCode, status: row.status },
    });
    return row;
  }

  async update(ctx: PortalActionContext, id: string, input: UpdateAnnouncementInput) {
    const f = this.filter(ctx);
    const existing = await this.repo.findAnnouncement(id, ctx.principal.institutionId);
    this.assertInScope(existing?.campusId ?? null, existing, f);
    const nextCode = (input.referenceCode ?? existing!.referenceCode).trim();
    if (nextCode !== existing!.referenceCode) {
      const dupe = await this.repo.findAnnouncementByCode(ctx.principal.institutionId, nextCode);
      if (dupe && dupe.id !== id) {
        throw new ConflictException({ code: 'ANNOUNCEMENT_EXISTS', message: `An announcement with code "${nextCode}" already exists.` });
      }
    }
    const nextStatus = input.status ?? existing!.status;
    const updated = await this.repo.updateAnnouncement(id, input.version, {
      title: input.title ?? existing!.title,
      body: input.body === undefined ? existing!.body : input.body,
      referenceCode: nextCode,
      audience: input.audience ?? existing!.audience,
      category: input.category === undefined ? existing!.category : input.category,
      status: nextStatus,
      pinned: input.pinned ?? existing!.pinned,
      publishAt: input.publishAt === undefined ? existing!.publishAt : input.publishAt,
      publishedAt: nextStatus === 'published' && !existing!.publishedAt ? new Date() : existing!.publishedAt,
      updatedBy: ctx.principal.institutionUserId,
    });
    if (!updated) throw this.versionConflict();
    if (input.targets !== undefined) {
      await this.repo.setAnnouncementTargets(id, ctx.principal.institutionId, input.targets);
    }
    await this.write(ctx, ANNOUNCEMENTS_MODULE, 'announcement.update', 'announcement', id, updated.campusId, {
      newState: { title: updated.title, status: updated.status },
    });
    return updated;
  }

  async remove(ctx: PortalActionContext, id: string, version: number) {
    const f = this.filter(ctx);
    const existing = await this.repo.findAnnouncement(id, ctx.principal.institutionId);
    this.assertInScope(existing?.campusId ?? null, existing, f);
    const ok = await this.repo.deleteAnnouncement(id, version);
    if (!ok) throw this.versionConflict();
    await this.write(ctx, ANNOUNCEMENTS_MODULE, 'announcement.delete', 'announcement', id, existing!.campusId, {
      previousState: { title: existing!.title, referenceCode: existing!.referenceCode },
    });
    return { deleted: true };
  }

  /** Publish a draft announcement and fan out a notification (the bridge). */
  async publish(ctx: PortalActionContext, id: string, input: PublishAnnouncementInput) {
    const f = this.filter(ctx);
    const existing = await this.repo.findAnnouncement(id, ctx.principal.institutionId);
    this.assertInScope(existing?.campusId ?? null, existing, f);
    if (existing!.status === 'published') {
      throw new ConflictException({ code: 'ALREADY_PUBLISHED', message: 'This announcement has already been published.' });
    }
    const updated = await this.repo.updateAnnouncement(id, existing!.version, {
      status: 'published',
      publishedAt: new Date(),
      updatedBy: ctx.principal.institutionUserId,
    });
    if (!updated) throw this.versionConflict();
    const audience = input.audience ?? updated.audience;

    // Resolve the rich targets (Phase 3) to a real recipient count + summary; fall back to the legacy
    // audience broadcast when no targets were set.
    const targets = (await this.repo.getTargetsFor(ctx.principal.institutionId, [id])).get(id) ?? [];
    let recipientCount: number | null = null;
    let targetSummary: string | null = null;
    let resolvedStudents:string[]=[];
    if (targets.length > 0) {
      const resolved = await this.recipients.resolve(
        ctx.principal.institutionId,
        f.campusIds,
        targets.map((t) => ({ kind: t.kind, refId: t.refId })),
      );
      recipientCount = resolved.count;
      targetSummary = resolved.summary;
      resolvedStudents=resolved.studentIds;
    } else {
      targetSummary = BROADCAST_LABEL[audience] ?? 'Everyone';
      if(audience==='students'||audience==='all'){const resolved=await this.recipients.resolve(ctx.principal.institutionId,f.campusIds,[{kind:'all_students'}]);resolvedStudents=resolved.studentIds;recipientCount=resolved.count;}
    }

    const notification = await this.repo.insertNotification({
      institutionId: ctx.principal.institutionId,
      campusId: updated.campusId,
      title: updated.title,
      body: updated.body,
      kind: 'announcement',
      audience,
      announcementId: updated.id,
      status: 'unread',
      recipientCount,
      targetSummary,
      createdBy: ctx.principal.institutionUserId,
    });
    await this.write(ctx, ANNOUNCEMENTS_MODULE, 'announcement.publish', 'announcement', id, updated.campusId, {
      newState: { status: updated.status, notificationId: notification.id, audience, recipientCount },
    });
    if(resolvedStudents.length)await this.todayNotify.fanoutInstitutionStudents(ctx.principal.institutionId,resolvedStudents,{eventKey:`announcement:${updated.id}:published`,type:'announcement',sourceModule:'announcements',title:updated.title,body:updated.body??'',deepLink:`/announcements/${updated.id}`}).catch(()=>undefined);
    return { announcement: updated, notification };
  }

  // === helpers ===============================================================

  private filter(ctx: PortalActionContext): ScopeFilter {
    return resolveScopeFilter(ctx.principal, ctx.scope);
  }

  private createCampusId(scope: InstitutionScope): string | null {
    return scope.mode === 'campus' ? scope.campusId : null;
  }

  private assertInScope<T>(campusId: string | null, row: T | undefined, filter: ScopeFilter): asserts row is T {
    if (!row) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Not found' });
    if (campusId === null) return;
    if (filter.campusIds === null) return;
    if (!filter.campusIds.includes(campusId)) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Not found in the current scope' });
    }
  }

  private paginate<T>(page: Page<T>, q: { page: number; pageSize: number }): ListResult<T> {
    return { ...page, page: q.page, pageSize: q.pageSize, hasMore: q.page * q.pageSize < page.total };
  }

  private async write(
    ctx: PortalActionContext,
    module: string,
    action: string,
    entityType: string,
    entityId: string,
    campusId: string | null,
    extra: Partial<AuditEventInput> = {},
  ): Promise<void> {
    await this.audit.logAudit({
      ...basePortalAudit(ctx),
      action,
      module,
      entityType,
      entityId,
      campusId: campusId ?? undefined,
      ...extra,
    } as AuditEventInput);
  }

  private versionConflict() {
    return new ConflictException({
      code: 'VERSION_CONFLICT',
      message: 'This record changed since you loaded it. Reload and try again.',
    });
  }
}

/**
 * Institution-portal Notifications service (Phase 9). The notification feed is campus-scoped +
 * version-guarded; an optional announcement link is pre-checked for a friendly 400. Marking a
 * notification read stamps read_at; reading a read notification again is a friendly 409. The portal has
 * no dedicated notifications permission key — it is gated by announcements.view / announcements.send.
 * All mutations are audited under portal-notifications.
 */
@Injectable()
export class NotificationsService {
  constructor(
    private readonly repo: AnnouncementsRepository,
    @Inject(AUDIT_WRITER) private readonly audit: AuditWriter,
  ) {}

  async list(ctx: PortalActionContext, q: NotificationsListQuery) {
    const f = this.filter(ctx);
    return this.paginate(await this.repo.listNotifications(ctx.principal.institutionId, f.campusIds, q), q);
  }

  async create(ctx: PortalActionContext, input: CreateNotificationInput) {
    if (input.announcementId) {
      const announcement = await this.repo.findAnnouncement(input.announcementId, ctx.principal.institutionId);
      if (!announcement) throw new BadRequestException({ code: 'INVALID_REFERENCE', message: 'Unknown announcement' });
    }
    const campusId = this.createCampusId(ctx.scope);
    const row = await this.repo.insertNotification({
      institutionId: ctx.principal.institutionId,
      campusId,
      title: input.title,
      body: input.body ?? null,
      kind: input.kind,
      audience: input.audience,
      announcementId: input.announcementId ?? null,
      status: 'unread',
      createdBy: ctx.principal.institutionUserId,
    });
    await this.write(ctx, 'notification.create', 'notification', row.id, campusId, {
      newState: { title: row.title, kind: row.kind },
    });
    return row;
  }

  async update(ctx: PortalActionContext, id: string, input: UpdateNotificationInput) {
    const f = this.filter(ctx);
    const existing = await this.repo.findNotification(id, ctx.principal.institutionId);
    this.assertInScope(existing?.campusId ?? null, existing, f);
    const nextStatus = input.status ?? existing!.status;
    const updated = await this.repo.updateNotification(id, input.version, {
      title: input.title ?? existing!.title,
      body: input.body === undefined ? existing!.body : input.body,
      kind: input.kind ?? existing!.kind,
      audience: input.audience ?? existing!.audience,
      status: nextStatus,
      readAt: nextStatus === 'read' && !existing!.readAt ? new Date() : existing!.readAt,
      updatedBy: ctx.principal.institutionUserId,
    });
    if (!updated) throw this.versionConflict();
    await this.write(ctx, 'notification.update', 'notification', id, updated.campusId, {
      newState: { title: updated.title, status: updated.status },
    });
    return updated;
  }

  /** Mark a notification read — idempotency is explicit: reading a read one again is a friendly 409. */
  async markRead(ctx: PortalActionContext, id: string) {
    const f = this.filter(ctx);
    const existing = await this.repo.findNotification(id, ctx.principal.institutionId);
    this.assertInScope(existing?.campusId ?? null, existing, f);
    if (existing!.status === 'read') {
      throw new ConflictException({ code: 'ALREADY_READ', message: 'This notification is already read.' });
    }
    const updated = await this.repo.updateNotification(id, existing!.version, {
      status: 'read',
      readAt: new Date(),
      updatedBy: ctx.principal.institutionUserId,
    });
    if (!updated) throw this.versionConflict();
    await this.write(ctx, 'notification.read', 'notification', id, updated.campusId, {
      newState: { status: updated.status },
    });
    return updated;
  }

  async remove(ctx: PortalActionContext, id: string, version: number) {
    const f = this.filter(ctx);
    const existing = await this.repo.findNotification(id, ctx.principal.institutionId);
    this.assertInScope(existing?.campusId ?? null, existing, f);
    const ok = await this.repo.deleteNotification(id, version);
    if (!ok) throw this.versionConflict();
    await this.write(ctx, 'notification.delete', 'notification', id, existing!.campusId, {
      previousState: { title: existing!.title },
    });
    return { deleted: true };
  }

  // === helpers ===============================================================

  private filter(ctx: PortalActionContext): ScopeFilter {
    return resolveScopeFilter(ctx.principal, ctx.scope);
  }

  private createCampusId(scope: InstitutionScope): string | null {
    return scope.mode === 'campus' ? scope.campusId : null;
  }

  private assertInScope<T>(campusId: string | null, row: T | undefined, filter: ScopeFilter): asserts row is T {
    if (!row) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Not found' });
    if (campusId === null) return;
    if (filter.campusIds === null) return;
    if (!filter.campusIds.includes(campusId)) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Not found in the current scope' });
    }
  }

  private paginate<T>(page: Page<T>, q: { page: number; pageSize: number }): ListResult<T> {
    return { ...page, page: q.page, pageSize: q.pageSize, hasMore: q.page * q.pageSize < page.total };
  }

  private async write(
    ctx: PortalActionContext,
    action: string,
    entityType: string,
    entityId: string,
    campusId: string | null,
    extra: Partial<AuditEventInput> = {},
  ): Promise<void> {
    await this.audit.logAudit({
      ...basePortalAudit(ctx),
      action,
      module: NOTIFICATIONS_MODULE,
      entityType,
      entityId,
      campusId: campusId ?? undefined,
      ...extra,
    } as AuditEventInput);
  }

  private versionConflict() {
    return new ConflictException({
      code: 'VERSION_CONFLICT',
      message: 'This record changed since you loaded it. Reload and try again.',
    });
  }
}
