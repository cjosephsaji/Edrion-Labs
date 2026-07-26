import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  createMessagePostSchema,
  createMessageThreadSchema,
  messageThreadsListQuerySchema,
  updateMessagePostSchema,
  updateMessageThreadSchema,
  versionedDeleteSchema,
  type CreateMessagePostInput,
  type CreateMessageThreadInput,
  type MessageThreadsListQuery,
  type UpdateMessagePostInput,
  type UpdateMessageThreadInput,
  type VersionedDeleteInput,
} from '@edrion/schemas';
import type { InstitutionPrincipal, InstitutionScope } from '@edrion/auth';
import { Public } from '../../common/guards/auth.guard';
import { ReqContext, SkipRateLimit } from '../../common/decorators';
import type { EdrionRequestContext } from '../../common/request-context';
import { zodBody } from '../../common/zod-validation.pipe';
import { InstitutionAuthGuard } from './portal-auth.guard';
import { InstitutionPermissionsGuard } from './portal-permissions.guard';
import { CurrentInstitutionPrincipal, CurrentScope, RequireInstitutionPermissions } from './portal.decorators';
import { MessagingService } from './messaging.service';
import type { PortalActionContext } from './portal-action-context';

/**
 * Institution-portal Messaging API (Phase 9) — threads + the posts within a thread. The single
 * messages.use key gates both reads and writes. Posts are nested under a thread the caller can see.
 */
@ApiTags('portal-messages')
@Controller('portal/messages')
@Public()
@SkipRateLimit()
@UseGuards(InstitutionAuthGuard, InstitutionPermissionsGuard)
export class MessagesController {
  constructor(private readonly service: MessagingService) {}

  private ctx(p: InstitutionPrincipal, s: InstitutionScope, r: EdrionRequestContext): PortalActionContext {
    return { principal: p, scope: s, request: r };
  }

  // --- threads ---------------------------------------------------------------

  @Get('threads')
  @RequireInstitutionPermissions('messages.use')
  listThreads(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Query(zodBody(messageThreadsListQuerySchema)) q: MessageThreadsListQuery,
  ) {
    return this.service.listThreads(this.ctx(p, s, r), q);
  }

  @Post('threads')
  @RequireInstitutionPermissions('messages.use')
  createThread(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(createMessageThreadSchema)) body: CreateMessageThreadInput,
  ) {
    return this.service.createThread(this.ctx(p, s, r), body);
  }

  @Patch('threads/:id')
  @RequireInstitutionPermissions('messages.use')
  updateThread(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(updateMessageThreadSchema)) body: UpdateMessageThreadInput,
  ) {
    return this.service.updateThread(this.ctx(p, s, r), id, body);
  }

  @Delete('threads/:id')
  @RequireInstitutionPermissions('messages.use')
  deleteThread(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(versionedDeleteSchema)) body: VersionedDeleteInput,
  ) {
    return this.service.deleteThread(this.ctx(p, s, r), id, body.version);
  }

  // --- posts (within a thread) -----------------------------------------------

  @Get('threads/:id/posts')
  @RequireInstitutionPermissions('messages.use')
  listPosts(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
  ) {
    return this.service.listPosts(this.ctx(p, s, r), id);
  }

  @Post('threads/:id/posts')
  @RequireInstitutionPermissions('messages.use')
  createPost(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(createMessagePostSchema)) body: CreateMessagePostInput,
  ) {
    return this.service.createPost(this.ctx(p, s, r), id, body);
  }

  @Patch('threads/:id/posts/:postId')
  @RequireInstitutionPermissions('messages.use')
  updatePost(
    @Param('id') id: string,
    @Param('postId') postId: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(updateMessagePostSchema)) body: UpdateMessagePostInput,
  ) {
    return this.service.updatePost(this.ctx(p, s, r), id, postId, body);
  }

  @Delete('threads/:id/posts/:postId')
  @RequireInstitutionPermissions('messages.use')
  removePost(
    @Param('id') id: string,
    @Param('postId') postId: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
  ) {
    return this.service.removePost(this.ctx(p, s, r), id, postId);
  }
}
