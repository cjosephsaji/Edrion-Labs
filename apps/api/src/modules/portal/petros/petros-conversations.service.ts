import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  PetrosCreateConversationInput,
  PetrosListConversationsQuery,
  PetrosUpdateConversationInput,
} from '@edrion/schemas';
import type { PetrosConversation } from '@edrion/database';
import { PetrosRepository } from './petros.repository';
import type { PortalActionContext } from '../portal-action-context';

/** Conversation CRUD. Conversations are PRIVATE — every access checks the owning user. */
@Injectable()
export class PetrosConversationsService {
  constructor(private readonly repo: PetrosRepository) {}

  async create(ctx: PortalActionContext, input: PetrosCreateConversationInput): Promise<PetrosConversation> {
    return this.repo.insertConversation({
      institutionId: ctx.principal.institutionId,
      campusId: ctx.scope.mode === 'campus' ? ctx.scope.campusId : null,
      institutionUserId: ctx.principal.institutionUserId,
      title: input.title ?? null,
      createdBy: ctx.principal.institutionUserId,
    });
  }

  async list(ctx: PortalActionContext, q: PetrosListConversationsQuery) {
    const { items, total } = await this.repo.listConversations(
      ctx.principal.institutionId,
      ctx.principal.institutionUserId,
      q,
    );
    return { items, total, page: q.page, pageSize: q.pageSize, hasMore: q.page * q.pageSize < total };
  }

  async requireOwned(ctx: PortalActionContext, id: string): Promise<PetrosConversation> {
    const conversation = await this.repo.findConversation(id, ctx.principal.institutionId);
    if (!conversation) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Conversation not found' });
    if (conversation.institutionUserId !== ctx.principal.institutionUserId) {
      throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Conversations are private to their owner.' });
    }
    return conversation;
  }

  async detail(ctx: PortalActionContext, id: string) {
    const conversation = await this.requireOwned(ctx, id);
    const messages = await this.repo.messagesForConversation(id);
    const pending = await this.repo.activePendingTurnForConversation(id);
    return {
      conversation,
      messages,
      pendingTurn: pending
        ? { id: pending.id, kind: pending.kind, runId: pending.runId, payload: pending.payload, expiresAt: pending.expiresAt }
        : null,
    };
  }

  async update(ctx: PortalActionContext, id: string, input: PetrosUpdateConversationInput) {
    await this.requireOwned(ctx, id);
    const updated = await this.repo.updateConversationWithVersion(id, input.version, {
      title: input.title,
      pinned: input.pinned,
      status: input.status,
      updatedBy: ctx.principal.institutionUserId,
    });
    if (!updated) {
      throw new ConflictException({ code: 'VERSION_CONFLICT', message: 'This conversation changed. Reload and retry.' });
    }
    return updated;
  }
}
