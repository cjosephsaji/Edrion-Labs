import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  createPortalSettingSchema,
  portalSettingsListQuerySchema,
  updatePortalSettingSchema,
  versionedDeleteSchema,
  type CreatePortalSettingInput,
  type PortalSettingsListQuery,
  type UpdatePortalSettingInput,
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
import { SettingsService } from './settings.service';
import type { PortalActionContext } from './portal-action-context';

/**
 * Institution-portal Settings API (Phase 11) — the campus-scoped settings tree. Reads need
 * `institution_settings.view`; writes need the sensitive `institution_settings.manage`.
 */
@ApiTags('portal-settings')
@Controller('portal/settings')
@Public()
@SkipRateLimit()
@UseGuards(InstitutionAuthGuard, InstitutionPermissionsGuard)
export class SettingsController {
  constructor(private readonly service: SettingsService) {}

  private ctx(p: InstitutionPrincipal, s: InstitutionScope, r: EdrionRequestContext): PortalActionContext {
    return { principal: p, scope: s, request: r };
  }

  @Get()
  @RequireInstitutionPermissions('institution_settings.view')
  list(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Query(zodBody(portalSettingsListQuerySchema)) q: PortalSettingsListQuery,
  ) {
    return this.service.list(this.ctx(p, s, r), q);
  }

  @Post()
  @RequireInstitutionPermissions('institution_settings.manage')
  create(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(createPortalSettingSchema)) body: CreatePortalSettingInput,
  ) {
    return this.service.create(this.ctx(p, s, r), body);
  }

  @Patch(':id')
  @RequireInstitutionPermissions('institution_settings.manage')
  update(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(updatePortalSettingSchema)) body: UpdatePortalSettingInput,
  ) {
    return this.service.update(this.ctx(p, s, r), id, body);
  }

  @Delete(':id')
  @RequireInstitutionPermissions('institution_settings.manage')
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
