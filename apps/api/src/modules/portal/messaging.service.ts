import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { resolveScopeFilter, type InstitutionScope, type ScopeFilter } from '@edrion/auth';
import type { AuditWriter, AuditEventInput } from '@edrion/audit';
import type {
  CreateMessagePostInput,
  CreateMessageThreadInput,
  MessageThreadsListQuery,
  UpdateMessagePostInput,
  UpdateMessageThreadInput,
} from '@edrion/schemas';
import { AUDIT_WRITER } from '../../common/tokens';
import type { Page } from './academics.repository';
import type { ListResult } from './academics.service';
import { MessagingRepository } from './messaging.repository';
import { basePortalAudit, type PortalActionContext } from './portal-action-context';

const MODULE = 'portal-messages';

/**
 * Institution-portal Messaging service (Phase 9). A thread is campus-scoped + version-guarded; the posts
 * inherit the thread's campus and are only reachable through a thread the caller can see
 * (requireThreadInScope). `reference_code` is unique within the institution (a friendly 409). Both reads
 * and writes are gated by the single messages.use key. All mutations are audited.
 */
@Injectable()
export class MessagingService {
  constructor(
    private readonly repo: MessagingRepository,
    @Inject(AUDIT_WRITER) private readonly audit: AuditWriter,
  ) {}

  // === threads ===============================================================

  async listThreads(ctx: PortalActionContext, q: MessageThreadsListQuery) {
    const f = this.filter(ctx);
    return this.paginate(await this.repo.listThreads(ctx.principal.institutionId, f.campusIds, q), q);
  }

  async createThread(ctx: PortalActionContext, input: CreateMessageThreadInput) {
    const code = input.referenceCode.trim();
    if (await this.repo.findThreadByCode(ctx.principal.institutionId, code)) {
      throw new ConflictException({ code: 'THREAD_EXISTS', message: `A thread with code "${code}" already exists.` });
    }
    const campusId = this.createCampusId(ctx.scope);
    const row = await this.repo.insertThread({
      institutionId: ctx.principal.institutionId,
      campusId,
      subject: input.subject,
      referenceCode: code,
      category: input.category ?? null,
      status: input.status,
      createdBy: ctx.principal.institutionUserId,
    });
    await this.write(ctx, 'thread.create', 'message_thread', row.id, campusId, {
      newState: { subject: row.subject, referenceCode: row.referenceCode },
    });
    return row;
  }

  async updateThread(ctx: PortalActionContext, id: string, input: UpdateMessageThreadInput) {
    const f = this.filter(ctx);
    const existing = await this.repo.findThread(id, ctx.principal.institutionId);
    this.assertInScope(existing?.campusId ?? null, existing, f);
    const nextCode = (input.referenceCode ?? existing!.referenceCode).trim();
    if (nextCode !== existing!.referenceCode) {
      const dupe = await this.repo.findThreadByCode(ctx.principal.institutionId, nextCode);
      if (dupe && dupe.id !== id) {
        throw new ConflictException({ code: 'THREAD_EXISTS', message: `A thread with code "${nextCode}" already exists.` });
      }
    }
    const updated = await this.repo.updateThread(id, input.version, {
      subject: input.subject ?? existing!.subject,
      referenceCode: nextCode,
      category: input.category === undefined ? existing!.category : input.category,
      status: input.status ?? existing!.status,
      updatedBy: ctx.principal.institutionUserId,
    });
    if (!updated) throw this.versionConflict();
    await this.write(ctx, 'thread.update', 'message_thread', id, updated.campusId, {
      newState: { subject: updated.subject, status: updated.status },
    });
    return updated;
  }

  async deleteThread(ctx: PortalActionContext, id: string, version: number) {
    const f = this.filter(ctx);
    const existing = await this.repo.findThread(id, ctx.principal.institutionId);
    this.assertInScope(existing?.campusId ?? null, existing, f);
    const ok = await this.repo.deleteThread(id, version);
    if (!ok) throw this.versionConflict();
    await this.write(ctx, 'thread.delete', 'message_thread', id, existing!.campusId, {
      previousState: { subject: existing!.subject, referenceCode: existing!.referenceCode },
    });
    return { deleted: true };
  }

  // === posts (within a thread) ===============================================

  async listPosts(ctx: PortalActionContext, threadId: string) {
    await this.requireThreadInScope(ctx, threadId);
    return this.repo.listPosts(threadId);
  }

  async createPost(ctx: PortalActionContext, threadId: string, input: CreateMessagePostInput) {
    const thread = await this.requireThreadInScope(ctx, threadId);
    const post = await this.repo.insertPost({
      institutionId: ctx.principal.institutionId,
      threadId,
      body: input.body,
      authorName: input.authorName ?? null,
      senderType: input.senderType,
      postedDate: input.postedDate ?? null,
      createdBy: ctx.principal.institutionUserId,
    });
    await this.write(ctx, 'post.create', 'message_post', post.id, thread.campusId, {
      newState: { threadId, senderType: post.senderType },
    });
    return post;
  }

  async updatePost(ctx: PortalActionContext, threadId: string, postId: string, input: UpdateMessagePostInput) {
    const thread = await this.requireThreadInScope(ctx, threadId);
    const post = await this.repo.findPost(postId, threadId);
    if (!post) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Post not found' });
    const updated = await this.repo.updatePost(postId, input.version, {
      body: input.body ?? post.body,
      authorName: input.authorName === undefined ? post.authorName : input.authorName,
      senderType: input.senderType ?? post.senderType,
      postedDate: input.postedDate === undefined ? post.postedDate : input.postedDate,
      updatedBy: ctx.principal.institutionUserId,
    });
    if (!updated) throw this.versionConflict();
    await this.write(ctx, 'post.update', 'message_post', postId, thread.campusId, {
      newState: { threadId, senderType: updated.senderType },
    });
    return updated;
  }

  async removePost(ctx: PortalActionContext, threadId: string, postId: string) {
    const thread = await this.requireThreadInScope(ctx, threadId);
    const post = await this.repo.findPost(postId, threadId);
    if (!post) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Post not found' });
    await this.repo.deletePost(postId);
    await this.write(ctx, 'post.remove', 'message_post', postId, thread.campusId, {
      previousState: { threadId, senderType: post.senderType },
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

  private async requireThreadInScope(ctx: PortalActionContext, threadId: string) {
    const f = this.filter(ctx);
    const thread = await this.repo.findThread(threadId, ctx.principal.institutionId);
    this.assertInScope(thread?.campusId ?? null, thread, f);
    return thread;
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
      module: MODULE,
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
