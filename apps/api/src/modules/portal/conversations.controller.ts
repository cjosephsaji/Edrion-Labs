import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Injectable,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request as ExpressRequest, Response as ExpressResponse } from 'express';
import { and, asc, desc, eq, gt, ilike, inArray, isNotNull, isNull, schema, sql, type Database } from '@edrion/database';
import { resolveScopeFilter } from '@edrion/auth';
import type { InstitutionPrincipal, InstitutionScope } from '@edrion/auth';
import {
  addParticipantsSchema,
  conversationsListQuerySchema,
  createConversationSchema,
  messagesListQuerySchema,
  postMessageSchema,
  updateConversationSchema,
  type AddParticipantsInput,
  type ConversationsListQuery,
  type CreateConversationInput,
  type MessagesListQuery,
  type PostMessageInput,
  previewRecipientsSchema,
  type PreviewRecipientsInput,
  type UpdateConversationInput,
} from '@edrion/schemas';
import { Public } from '../../common/guards/auth.guard';
import { ReqContext, SkipRateLimit } from '../../common/decorators';
import type { EdrionRequestContext } from '../../common/request-context';
import { zodBody } from '../../common/zod-validation.pipe';
import { DATABASE } from '../../common/tokens';
import { InstitutionAuthGuard } from './portal-auth.guard';
import { InstitutionPermissionsGuard } from './portal-permissions.guard';
import { CurrentInstitutionPrincipal, CurrentScope, RequireInstitutionPermissions } from './portal.decorators';
import type { PortalActionContext } from './portal-action-context';
import { PortalEntityResolver, type RefType } from './portal-entity-resolver';
import { RecipientResolver } from './recipient-resolver.service';
import { AttachmentStorageService } from './attachment-storage.service';

/** Collect a raw request body into a Buffer, rejecting anything over `max` bytes. */
function readRawBody(req: ExpressRequest, max: number): Promise<Buffer> {
  return new Promise((resolvePromise, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let done = false;
    req.on('data', (c: Buffer) => {
      if (done) return;
      size += c.length;
      if (size > max) {
        done = true;
        req.destroy();
        reject(new BadRequestException({ code: 'FILE_TOO_LARGE', message: `File exceeds the ${max}-byte limit.` }));
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!done) resolvePromise(Buffer.concat(chunks));
    });
    req.on('error', (e) => {
      if (!done) reject(e);
    });
  });
}

/** Strip any path components / control chars from a client-supplied file name. */
function sanitizeFileName(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? 'attachment';
  const clean = [...base]
    .filter((character) => character !== '-' && character !== '"' && character.charCodeAt(0) !== 31)
    .join('')
    .trim();
  return (clean || 'attachment').slice(0, 255);
}

type ParticipantRef = { participantType: string; participantId: string };

const REF_TYPE: Record<string, RefType> = { student: 'student', teacher: 'teacher', staff: 'staff', parent: 'parent', user: 'user' };

/**
 * Messaging v2 — a real chat over conversations/participants/messages (admin-redesign Phase 4).
 * Everything is confined to conversations the caller participates in; the caller is the portal user
 * `ctx.principal.institutionUserId`. Participants are directory people or portal users; unread is
 * derived from each participant's `last_read_at`. Gated by `messages.use`.
 */
@Injectable()
export class ConversationsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly entities: PortalEntityResolver,
    private readonly recipients: RecipientResolver,
    private readonly storage: AttachmentStorageService,
  ) {}

  /** Ceiling for a single uploaded attachment (bytes) — surfaced for the raw-body reader. */
  get maxAttachmentBytes(): number {
    return this.storage.maxBytes;
  }

  private me(ctx: PortalActionContext): ParticipantRef {
    return { participantType: 'user', participantId: ctx.principal.institutionUserId };
  }

  // --- reads -----------------------------------------------------------------

  async list(ctx: PortalActionContext, q: ConversationsListQuery) {
    const me = this.me(ctx);
    const cp = schema.conversationParticipants;
    const myRows = await this.db
      .select({ conversationId: cp.conversationId, lastReadAt: cp.lastReadAt, muted: cp.muted })
      .from(cp)
      .where(and(eq(cp.institutionId, ctx.principal.institutionId), eq(cp.participantType, me.participantType), eq(cp.participantId, me.participantId), isNull(cp.removedAt)));
    const myMap = new Map(myRows.map((r) => [r.conversationId, r]));
    const ids = myRows.map((r) => r.conversationId);
    if (ids.length === 0) return { items: [], total: 0, page: q.page, pageSize: q.pageSize, hasMore: false };

    const c = schema.conversations;
    const conds = [eq(c.institutionId, ctx.principal.institutionId), inArray(c.id, ids)];
    if (q.filter === 'archived') conds.push(sql`${c.archivedAt} is not null`);
    else conds.push(sql`${c.archivedAt} is null`);
    if (q.search) {
      const s = ilike(c.title, `%${q.search}%`);
      if (s) conds.push(s);
    }
    const convos = await this.db.select().from(c).where(and(...conds)).orderBy(desc(c.lastMessageAt));

    // Enrich each: participants (resolved), unread count, last message preview.
    const enriched = await Promise.all(convos.map((conv) => this.toSummary(ctx, conv, myMap.get(conv.id)?.lastReadAt ?? null, myMap.get(conv.id)?.muted ?? false)));
    let items = enriched;
    if (q.filter === 'unread') items = items.filter((i) => i.unreadCount > 0);

    const total = items.length;
    const start = (q.page - 1) * q.pageSize;
    items = items.slice(start, start + q.pageSize);
    return { items, total, page: q.page, pageSize: q.pageSize, hasMore: start + q.pageSize < total };
  }


  /** WhatsApp-style title: when only one other person is in the chat, show their name to this viewer. */
  private conversationDisplayName(
    conv: { title: string | null; isGroup: boolean },
    others: Array<{ label: string }>,
  ): string {
    if (others.length === 1) return others[0]!.label;
    if (conv.title) return conv.title;
    if (others.length > 0) return others.map((o) => o.label).join(', ');
    return 'Conversation';
  }

  private async findExistingDirectUserChat(
    institutionId: string,
    myUserId: string,
    otherUserId: string,
  ): Promise<string | null> {
    const cp = schema.conversationParticipants;
    const c = schema.conversations;
    const myRows = await this.db
      .select({ conversationId: cp.conversationId })
      .from(cp)
      .innerJoin(c, eq(c.id, cp.conversationId))
      .where(
        and(
          eq(cp.institutionId, institutionId),
          eq(cp.participantType, 'user'),
          eq(cp.participantId, myUserId),
          isNull(cp.removedAt),
          eq(c.isGroup, false),
          eq(c.institutionId, institutionId),
        ),
      );
    for (const row of myRows) {
      const parts = await this.activeParticipants(institutionId, row.conversationId);
      if (parts.length !== 2) continue;
      if (!parts.every((p) => p.participantType === 'user')) continue;
      const ids = new Set(parts.map((p) => p.participantId));
      if (ids.has(myUserId) && ids.has(otherUserId)) return row.conversationId;
    }
    return null;
  }

  private async toSummary(ctx: PortalActionContext, conv: typeof schema.conversations.$inferSelect, myLastReadAt: Date | null, myMuted: boolean) {
    const parts = await this.activeParticipants(ctx.principal.institutionId, conv.id);
    const labeled = await this.labelParticipants(ctx.principal.institutionId, parts);
    const me = this.me(ctx);
    const others = labeled.filter((p) => !(p.participantType === me.participantType && p.participantId === me.participantId));
    const m = schema.messages;
    const [unread] = await this.db
      .select({ value: sql<number>`count(*)::int` })
      .from(m)
      .where(and(eq(m.conversationId, conv.id), myLastReadAt ? gt(m.createdAt, myLastReadAt) : sql`true`, sql`${m.senderId} <> ${me.participantId}`));
    const [last] = await this.db.select().from(m).where(eq(m.conversationId, conv.id)).orderBy(desc(m.createdAt)).limit(1);
    return {
      id: conv.id,
      title: conv.title,
      isGroup: conv.isGroup,
      name: this.conversationDisplayName(conv, others),
      participants: labeled,
      participantCount: labeled.length,
      lastMessage: last ? { body: last.body, createdAt: last.createdAt } : null,
      lastMessageAt: conv.lastMessageAt,
      unreadCount: Number(unread?.value ?? 0),
      muted: myMuted,
      archived: conv.archivedAt !== null,
      closed: conv.closedAt !== null,
    };
  }

  async get(ctx: PortalActionContext, id: string) {
    const conv = await this.requireParticipant(ctx, id);
    const mine = await this.myParticipant(ctx, id);
    return this.toSummary(ctx, conv, mine?.lastReadAt ?? null, mine?.muted ?? false);
  }

  async messages(ctx: PortalActionContext, id: string, q: MessagesListQuery) {
    await this.requireParticipant(ctx, id);
    const m = schema.messages;
    const rows = await this.db
      .select()
      .from(m)
      .where(eq(m.conversationId, id))
      .orderBy(asc(m.createdAt))
      .limit(q.pageSize)
      .offset((q.page - 1) * q.pageSize);
    // Resolve sender labels + attachments + read receipts.
    const senders = rows.map((r) => ({ participantType: r.senderType, participantId: r.senderId }));
    const labels = await this.labelParticipants(ctx.principal.institutionId, senders);
    const labelOf = new Map(labels.map((l) => [`${l.participantType}:${l.participantId}`, l.label]));
    const attByMsg = await this.attachmentsFor(rows.map((r) => r.id));
    const othersLastRead = await this.othersMaxRead(ctx, id);
    return rows.map((r) => ({
      id: r.id,
      body: r.body,
      senderType: r.senderType,
      senderId: r.senderId,
      senderName: labelOf.get(`${r.senderType}:${r.senderId}`) ?? 'Unknown',
      replyToId: r.replyToId,
      createdAt: r.createdAt,
      mine: r.senderType === 'user' && r.senderId === ctx.principal.institutionUserId,
      readByOthers: othersLastRead !== null && r.createdAt <= othersLastRead,
      attachments: attByMsg.get(r.id) ?? [],
    }));
  }

  // --- writes ----------------------------------------------------------------

  async create(ctx: PortalActionContext, input: CreateConversationInput) {
    const me = this.me(ctx);
    const people = await this.participantsFromTargets(ctx, input.targets);
    // De-dup + drop the creator (added as owner below).
    const uniq = new Map<string, ParticipantRef>();
    for (const p of people) uniq.set(`${p.participantType}:${p.participantId}`, p);
    uniq.delete(`${me.participantType}:${me.participantId}`);
    const members = [...uniq.values()];
    if (members.length === 0) {
      throw new BadRequestException({
        code: 'CANNOT_MESSAGE_SELF',
        message: 'Add at least one recipient other than yourself.',
      });
    }

    const isDirect = members.length === 1;
    const isGroup = isDirect ? false : (input.isGroup ?? true);
    const title = isDirect ? null : (input.title ?? null);
    const now = new Date();

    // Re-open an existing 1:1 user chat instead of creating a duplicate thread.
    if (isDirect && members[0]!.participantType === 'user') {
      const existingId = await this.findExistingDirectUserChat(
        ctx.principal.institutionId,
        me.participantId,
        members[0]!.participantId,
      );
      if (existingId) {
        if (input.body) await this.postMessage(ctx, existingId, { body: input.body });
        return this.get(ctx, existingId);
      }
    }

    const campusId = ctx.scope.mode === 'campus' ? ctx.scope.campusId : null;
    const [conv] = await this.db
      .insert(schema.conversations)
      .values({ institutionId: ctx.principal.institutionId, campusId, title, isGroup, lastMessageAt: input.body ? now : null, createdBy: ctx.principal.institutionUserId })
      .returning();

    const rows = [
      { institutionId: ctx.principal.institutionId, conversationId: conv!.id, participantType: me.participantType, participantId: me.participantId, role: 'owner', lastReadAt: now, addedBy: ctx.principal.institutionUserId },
      ...members.map((p) => ({ institutionId: ctx.principal.institutionId, conversationId: conv!.id, participantType: p.participantType, participantId: p.participantId, role: 'member', addedBy: ctx.principal.institutionUserId })),
    ];
    await this.db.insert(schema.conversationParticipants).values(rows);

    if (input.body) {
      await this.db.insert(schema.messages).values({ institutionId: ctx.principal.institutionId, conversationId: conv!.id, senderType: me.participantType, senderId: me.participantId, body: input.body });
    }
    return this.get(ctx, conv!.id);
  }

  async postMessage(ctx: PortalActionContext, id: string, input: PostMessageInput) {
    await this.requireParticipant(ctx, id);
    const me = this.me(ctx);
    const now = new Date();
    const [msg] = await this.db
      .insert(schema.messages)
      .values({ institutionId: ctx.principal.institutionId, conversationId: id, senderType: me.participantType, senderId: me.participantId, body: input.body, replyToId: input.replyToId ?? null })
      .returning();
    if (input.attachments?.length) {
      await this.db.insert(schema.messageAttachments).values(
        input.attachments.map((a) => ({ institutionId: ctx.principal.institutionId, messageId: msg!.id, fileName: a.fileName, contentType: a.contentType ?? null, sizeBytes: a.sizeBytes ?? null, storageKey: null })),
      );
    }
    await this.db.update(schema.conversations).set({ lastMessageAt: now, updatedAt: now }).where(eq(schema.conversations.id, id));
    await this.setMyRead(ctx, id, now);
    return { id: msg!.id, createdAt: msg!.createdAt };
  }

  /** Store an uploaded file against a message the caller can see, returning its attachment record. */
  async uploadAttachment(
    ctx: PortalActionContext,
    conversationId: string,
    messageId: string,
    fileName: string,
    contentType: string | null,
    buffer: Buffer,
  ) {
    await this.requireParticipant(ctx, conversationId);
    if (buffer.length === 0) {
      throw new BadRequestException({ code: 'EMPTY_FILE', message: 'The uploaded file is empty.' });
    }
    const [msg] = await this.db
      .select({ id: schema.messages.id })
      .from(schema.messages)
      .where(
        and(
          eq(schema.messages.id, messageId),
          eq(schema.messages.conversationId, conversationId),
          eq(schema.messages.institutionId, ctx.principal.institutionId),
        ),
      )
      .limit(1);
    if (!msg) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Message not found' });
    const storageKey = await this.storage.save(ctx.principal.institutionId, buffer);
    const [row] = await this.db
      .insert(schema.messageAttachments)
      .values({
        institutionId: ctx.principal.institutionId,
        messageId,
        fileName,
        contentType: contentType ?? null,
        sizeBytes: buffer.length,
        storageKey,
      })
      .returning();
    await this.db.update(schema.conversations).set({ updatedAt: new Date() }).where(eq(schema.conversations.id, conversationId));
    return {
      id: row!.id,
      fileName: row!.fileName,
      contentType: row!.contentType,
      sizeBytes: row!.sizeBytes,
      ready: true,
    };
  }

  /** Resolve a stored attachment the caller may read (participant of its conversation). */
  async getAttachment(ctx: PortalActionContext, conversationId: string, attachmentId: string) {
    await this.requireParticipant(ctx, conversationId);
    const a = schema.messageAttachments;
    const m = schema.messages;
    const [row] = await this.db
      .select({ fileName: a.fileName, contentType: a.contentType, storageKey: a.storageKey })
      .from(a)
      .innerJoin(m, eq(m.id, a.messageId))
      .where(and(eq(a.id, attachmentId), eq(a.institutionId, ctx.principal.institutionId), eq(m.conversationId, conversationId)))
      .limit(1);
    if (!row || !row.storageKey) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Attachment not found' });
    return { fileName: row.fileName, contentType: row.contentType, storageKey: row.storageKey };
  }

  /** Open a read stream for a resolved storage key (traversal-guarded in the storage service). */
  streamAttachment(storageKey: string) {
    return this.storage.stream(storageKey);
  }

  async markRead(ctx: PortalActionContext, id: string) {
    await this.requireParticipant(ctx, id);
    await this.setMyRead(ctx, id, new Date());
    return { ok: true };
  }

  async addParticipants(ctx: PortalActionContext, id: string, input: AddParticipantsInput) {
    await this.requireParticipant(ctx, id);
    const people = await this.participantsFromTargets(ctx, input.targets);
    const existing = await this.activeParticipants(ctx.principal.institutionId, id, true);
    const existingKeys = new Set(existing.map((p) => `${p.participantType}:${p.participantId}`));
    const me = this.me(ctx);
    const toAdd = people.filter(
      (p) =>
        !existingKeys.has(`${p.participantType}:${p.participantId}`) &&
        !(p.participantType === me.participantType && p.participantId === me.participantId),
    );
    if (toAdd.length) {
      await this.db.insert(schema.conversationParticipants).values(
        toAdd.map((p) => ({ institutionId: ctx.principal.institutionId, conversationId: id, participantType: p.participantType, participantId: p.participantId, role: 'member', addedBy: ctx.principal.institutionUserId })),
      );
    }
    // Re-activate any previously removed members that were re-added.
    await this.db
      .update(schema.conversationParticipants)
      .set({ removedAt: null })
      .where(and(eq(schema.conversationParticipants.conversationId, id), sql`${schema.conversationParticipants.removedAt} is not null`, inArray(schema.conversationParticipants.participantId, people.map((p) => p.participantId))));
    if (toAdd.length > 0) await this.db.update(schema.conversations).set({ isGroup: true }).where(eq(schema.conversations.id, id));
    return this.get(ctx, id);
  }

  async removeParticipant(ctx: PortalActionContext, id: string, participantType: string, participantId: string) {
    await this.requireParticipant(ctx, id);
    await this.db
      .update(schema.conversationParticipants)
      .set({ removedAt: new Date() })
      .where(and(eq(schema.conversationParticipants.conversationId, id), eq(schema.conversationParticipants.participantType, participantType), eq(schema.conversationParticipants.participantId, participantId)));
    return this.get(ctx, id);
  }

  async update(ctx: PortalActionContext, id: string, input: UpdateConversationInput) {
    await this.requireParticipant(ctx, id);
    const patch: Record<string, unknown> = {};
    if (input.title !== undefined) patch.title = input.title;
    if (input.archived !== undefined) patch.archivedAt = input.archived ? new Date() : null;
    if (input.closed !== undefined) patch.closedAt = input.closed ? new Date() : null;
    if (Object.keys(patch).length) {
      patch.updatedAt = new Date();
      await this.db.update(schema.conversations).set(patch).where(eq(schema.conversations.id, id));
    }
    if (input.muted !== undefined) {
      const me = this.me(ctx);
      await this.db
        .update(schema.conversationParticipants)
        .set({ muted: input.muted })
        .where(and(eq(schema.conversationParticipants.conversationId, id), eq(schema.conversationParticipants.participantType, me.participantType), eq(schema.conversationParticipants.participantId, me.participantId)));
    }
    return this.get(ctx, id);
  }

  // --- helpers ---------------------------------------------------------------

  private async participantsFromTargets(ctx: PortalActionContext, targets: { kind: string; refId?: string | null }[]): Promise<ParticipantRef[]> {
    const campusIds = resolveScopeFilter(ctx.principal, ctx.scope).campusIds;
    const resolved = await this.recipients.resolve(ctx.principal.institutionId, campusIds, targets);
    const refs: ParticipantRef[] = [
      ...resolved.studentIds.map((participantId) => ({ participantType: 'student', participantId })),
      ...resolved.parentIds.map((participantId) => ({ participantType: 'parent', participantId })),
      ...resolved.userIds.map((participantId) => ({ participantType: 'user', participantId })),
    ];
    const teacherSet = new Set(resolved.teacherIds);
    const staffIds = [...new Set([...resolved.teacherIds, ...resolved.staffIds])];
    const linkedUsers = await this.staffLoginMap(ctx.principal.institutionId, staffIds);
    for (const staffId of staffIds) {
      const userId = linkedUsers.get(staffId);
      if (userId) refs.push({ participantType: 'user', participantId: userId });
      else refs.push({ participantType: teacherSet.has(staffId) ? 'teacher' : 'staff', participantId: staffId });
    }
    return refs;
  }

  /** Staff directory rows linked to a portal login — messaging uses `user` participants. */
  private async staffLoginMap(institutionId: string, staffIds: string[]): Promise<Map<string, string>> {
    if (staffIds.length === 0) return new Map();
    const rows = await this.db
      .select({ id: schema.staff.id, institutionUserId: schema.staff.institutionUserId })
      .from(schema.staff)
      .where(and(eq(schema.staff.institutionId, institutionId), inArray(schema.staff.id, staffIds), isNotNull(schema.staff.institutionUserId)));
    return new Map(rows.map((r) => [r.id, r.institutionUserId!]));
  }

  private async activeParticipants(institutionId: string, conversationId: string, includeRemoved = false): Promise<ParticipantRef[]> {
    const cp = schema.conversationParticipants;
    const conds = [eq(cp.institutionId, institutionId), eq(cp.conversationId, conversationId)];
    if (!includeRemoved) conds.push(isNull(cp.removedAt));
    const rows = await this.db.select({ participantType: cp.participantType, participantId: cp.participantId }).from(cp).where(and(...conds));
    return rows;
  }

  private async labelParticipants(institutionId: string, parts: ParticipantRef[]) {
    const buckets: Record<string, string[]> = { student: [], teacher: [], staff: [], parent: [], user: [] };
    for (const p of parts) if (buckets[p.participantType]) buckets[p.participantType]!.push(p.participantId);
    const refs = await this.entities.resolve(institutionId, {
      studentIds: buckets.student,
      teacherIds: buckets.teacher,
      staffIds: buckets.staff,
      parentIds: buckets.parent,
      userIds: buckets.user,
    });
    const bucketFor = (type: string) => refs[REF_TYPE[type] ?? 'user'];
    return parts.map((p) => ({ participantType: p.participantType, participantId: p.participantId, label: bucketFor(p.participantType)?.[p.participantId]?.label ?? 'Unknown', sub: bucketFor(p.participantType)?.[p.participantId]?.sub ?? null }));
  }

  private async attachmentsFor(messageIds: string[]) {
    const out = new Map<string, Array<{ id: string; fileName: string; contentType: string | null; sizeBytes: number | null; ready: boolean }>>();
    if (messageIds.length === 0) return out;
    const a = schema.messageAttachments;
    const rows = await this.db.select().from(a).where(inArray(a.messageId, messageIds));
    for (const r of rows) {
      const list = out.get(r.messageId) ?? [];
      list.push({ id: r.id, fileName: r.fileName, contentType: r.contentType, sizeBytes: r.sizeBytes, ready: r.storageKey !== null });
      out.set(r.messageId, list);
    }
    return out;
  }

  private async othersMaxRead(ctx: PortalActionContext, conversationId: string): Promise<Date | null> {
    const me = this.me(ctx);
    const cp = schema.conversationParticipants;
    const [row] = await this.db
      .select({ maxRead: sql<Date | null>`max(${cp.lastReadAt})` })
      .from(cp)
      .where(and(eq(cp.conversationId, conversationId), isNull(cp.removedAt), sql`not (${cp.participantType} = ${me.participantType} and ${cp.participantId} = ${me.participantId})`));
    return row?.maxRead ?? null;
  }

  private async myParticipant(ctx: PortalActionContext, conversationId: string) {
    const me = this.me(ctx);
    const cp = schema.conversationParticipants;
    const [row] = await this.db
      .select()
      .from(cp)
      .where(and(eq(cp.conversationId, conversationId), eq(cp.participantType, me.participantType), eq(cp.participantId, me.participantId)))
      .limit(1);
    return row;
  }

  private async setMyRead(ctx: PortalActionContext, conversationId: string, at: Date) {
    const me = this.me(ctx);
    await this.db
      .update(schema.conversationParticipants)
      .set({ lastReadAt: at })
      .where(and(eq(schema.conversationParticipants.conversationId, conversationId), eq(schema.conversationParticipants.participantType, me.participantType), eq(schema.conversationParticipants.participantId, me.participantId)));
  }

  /** Assert the caller is an active participant of the conversation (the access gate). */
  private async requireParticipant(ctx: PortalActionContext, id: string) {
    const [conv] = await this.db
      .select()
      .from(schema.conversations)
      .where(and(eq(schema.conversations.id, id), eq(schema.conversations.institutionId, ctx.principal.institutionId)))
      .limit(1);
    if (!conv) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Conversation not found' });
    const mine = await this.myParticipant(ctx, id);
    if (!mine || mine.removedAt !== null) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Conversation not found' });
    return conv;
  }

  async previewRecipients(ctx: PortalActionContext, targets: { kind: string; refId?: string | null }[]) {
    const campusIds = resolveScopeFilter(ctx.principal, ctx.scope).campusIds;
    return this.recipients.resolve(ctx.principal.institutionId, campusIds, targets);
  }
}

@ApiTags('portal-conversations')
@Controller('portal/conversations')
@Public()
@SkipRateLimit()
@UseGuards(InstitutionAuthGuard, InstitutionPermissionsGuard)
export class ConversationsController {
  constructor(private readonly svc: ConversationsService) {}

  private ctx(p: InstitutionPrincipal, s: InstitutionScope, r: EdrionRequestContext): PortalActionContext {
    return { principal: p, scope: s, request: r };
  }

  @Get()
  @RequireInstitutionPermissions('messages.use')
  list(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Query(zodBody(conversationsListQuerySchema)) q: ConversationsListQuery,
  ) {
    return this.svc.list(this.ctx(p, s, r), q);
  }

  @Post()
  @RequireInstitutionPermissions('messages.use')
  create(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(createConversationSchema)) body: CreateConversationInput,
  ) {
    return this.svc.create(this.ctx(p, s, r), body);
  }

  @Post('recipients/preview')
  @RequireInstitutionPermissions('messages.use')
  previewRecipients(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(previewRecipientsSchema)) body: PreviewRecipientsInput,
  ) {
    return this.svc.previewRecipients(this.ctx(p, s, r), body.targets);
  }


  @Get(':id')
  @RequireInstitutionPermissions('messages.use')
  get(@Param('id') id: string, @CurrentInstitutionPrincipal() p: InstitutionPrincipal, @CurrentScope() s: InstitutionScope, @ReqContext() r: EdrionRequestContext) {
    return this.svc.get(this.ctx(p, s, r), id);
  }

  @Get(':id/messages')
  @RequireInstitutionPermissions('messages.use')
  messages(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Query(zodBody(messagesListQuerySchema)) q: MessagesListQuery,
  ) {
    return this.svc.messages(this.ctx(p, s, r), id, q);
  }

  @Post(':id/messages')
  @RequireInstitutionPermissions('messages.use')
  post(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(postMessageSchema)) body: PostMessageInput,
  ) {
    return this.svc.postMessage(this.ctx(p, s, r), id, body);
  }

  /**
   * Upload a real file for a message. Sent as a raw binary body (not multipart) with the name/type
   * in headers, so no multipart dependency is needed and the JSON body parser never touches it.
   */
  @Post(':id/messages/:messageId/attachments')
  @RequireInstitutionPermissions('messages.use')
  async uploadAttachment(
    @Param('id') id: string,
    @Param('messageId') messageId: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Req() req: ExpressRequest,
  ) {
    const buffer = await readRawBody(req, this.svc.maxAttachmentBytes);
    const rawName = req.header('x-file-name');
    const fileName = sanitizeFileName(rawName ? decodeURIComponent(rawName) : 'attachment');
    const contentType = req.header('x-file-type')?.slice(0, 160) || null;
    return this.svc.uploadAttachment(this.ctx(p, s, r), id, messageId, fileName, contentType, buffer);
  }

  /** Stream a stored attachment back to the caller (participant-gated). */
  @Get(':id/attachments/:attachmentId')
  @RequireInstitutionPermissions('messages.use')
  async downloadAttachment(
    @Param('id') id: string,
    @Param('attachmentId') attachmentId: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Res() res: ExpressResponse,
  ) {
    const att = await this.svc.getAttachment(this.ctx(p, s, r), id, attachmentId);
    res.setHeader('Content-Type', att.contentType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${att.fileName}"`);
    this.svc.streamAttachment(att.storageKey).pipe(res);
  }

  @Post(':id/read')
  @RequireInstitutionPermissions('messages.use')
  read(@Param('id') id: string, @CurrentInstitutionPrincipal() p: InstitutionPrincipal, @CurrentScope() s: InstitutionScope, @ReqContext() r: EdrionRequestContext) {
    return this.svc.markRead(this.ctx(p, s, r), id);
  }

  @Post(':id/participants')
  @RequireInstitutionPermissions('messages.use')
  addParticipants(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(addParticipantsSchema)) body: AddParticipantsInput,
  ) {
    return this.svc.addParticipants(this.ctx(p, s, r), id, body);
  }

  @Post(':id/participants/:type/:pid/remove')
  @RequireInstitutionPermissions('messages.use')
  removeParticipant(
    @Param('id') id: string,
    @Param('type') type: string,
    @Param('pid') pid: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
  ) {
    return this.svc.removeParticipant(this.ctx(p, s, r), id, type, pid);
  }

  @Patch(':id')
  @RequireInstitutionPermissions('messages.use')
  update(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(updateConversationSchema)) body: UpdateConversationInput,
  ) {
    return this.svc.update(this.ctx(p, s, r), id, body);
  }
}
