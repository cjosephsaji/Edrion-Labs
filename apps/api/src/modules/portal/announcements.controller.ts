import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  announcementsListQuerySchema,
  createAnnouncementSchema,
  createNotificationSchema,
  notificationsListQuerySchema,
  publishAnnouncementSchema,
  updateAnnouncementSchema,
  updateNotificationSchema,
  versionedDeleteSchema,
  type AnnouncementsListQuery,
  type CreateAnnouncementInput,
  type CreateNotificationInput,
  type NotificationsListQuery,
  type PublishAnnouncementInput,
  type UpdateAnnouncementInput,
  type UpdateNotificationInput,
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
import { AnnouncementsService, NotificationsService } from './announcements.service';
import type { PortalActionContext } from './portal-action-context';

/**
 * Institution-portal Announcements API (Phase 9). Reads need announcements.view; mutations + publish
 * need the sensitive announcements.send. Publishing fans out a notification (the bridge).
 */
@ApiTags('portal-announcements')
@Controller('portal/announcements')
@Public()
@SkipRateLimit()
@UseGuards(InstitutionAuthGuard, InstitutionPermissionsGuard)
export class AnnouncementsController {
  constructor(private readonly service: AnnouncementsService) {}

  private ctx(p: InstitutionPrincipal, s: InstitutionScope, r: EdrionRequestContext): PortalActionContext {
    return { principal: p, scope: s, request: r };
  }

  @Get()
  @RequireInstitutionPermissions('announcements.view')
  list(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Query(zodBody(announcementsListQuerySchema)) q: AnnouncementsListQuery,
  ) {
    return this.service.list(this.ctx(p, s, r), q);
  }

  @Post()
  @RequireInstitutionPermissions('announcements.send')
  create(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(createAnnouncementSchema)) body: CreateAnnouncementInput,
  ) {
    return this.service.create(this.ctx(p, s, r), body);
  }

  @Patch(':id')
  @RequireInstitutionPermissions('announcements.send')
  update(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(updateAnnouncementSchema)) body: UpdateAnnouncementInput,
  ) {
    return this.service.update(this.ctx(p, s, r), id, body);
  }

  @Post(':id/publish')
  @RequireInstitutionPermissions('announcements.send')
  publish(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(publishAnnouncementSchema)) body: PublishAnnouncementInput,
  ) {
    return this.service.publish(this.ctx(p, s, r), id, body);
  }

  @Delete(':id')
  @RequireInstitutionPermissions('announcements.send')
  remove(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(versionedDeleteSchema)) body: VersionedDeleteInput,
  ) {
    return this.service.remove(this.ctx(p, s, r), id, body.version);
  }
}

/**
 * Institution-portal Notifications API (Phase 9). No dedicated key — gated by announcements.view (read)
 * / announcements.send (mutate). Mark-read at POST :id/read.
 */
@ApiTags('portal-notifications')
@Controller('portal/notifications')
@Public()
@SkipRateLimit()
@UseGuards(InstitutionAuthGuard, InstitutionPermissionsGuard)
export class NotificationsController {
  constructor(private readonly service: NotificationsService) {}

  private ctx(p: InstitutionPrincipal, s: InstitutionScope, r: EdrionRequestContext): PortalActionContext {
    return { principal: p, scope: s, request: r };
  }

  @Get()
  @RequireInstitutionPermissions('announcements.view')
  list(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Query(zodBody(notificationsListQuerySchema)) q: NotificationsListQuery,
  ) {
    return this.service.list(this.ctx(p, s, r), q);
  }

  @Post()
  @RequireInstitutionPermissions('announcements.send')
  create(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(createNotificationSchema)) body: CreateNotificationInput,
  ) {
    return this.service.create(this.ctx(p, s, r), body);
  }

  @Patch(':id')
  @RequireInstitutionPermissions('announcements.send')
  update(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(updateNotificationSchema)) body: UpdateNotificationInput,
  ) {
    return this.service.update(this.ctx(p, s, r), id, body);
  }

  @Post(':id/read')
  @RequireInstitutionPermissions('announcements.send')
  markRead(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
  ) {
    return this.service.markRead(this.ctx(p, s, r), id);
  }

  @Delete(':id')
  @RequireInstitutionPermissions('announcements.send')
  remove(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(versionedDeleteSchema)) body: VersionedDeleteInput,
  ) {
    return this.service.remove(this.ctx(p, s, r), id, body.version);
  }
}
