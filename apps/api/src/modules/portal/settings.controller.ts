import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  createPortalSettingSchema,
  portalSettingsListQuerySchema,
  putEffectiveSettingsSchema,
  putNavigationLayoutSchema,
  putNomenclatureOverridesSchema,
  updateInstitutionProfileSchema,
  updatePortalSettingSchema,
  versionedDeleteSchema,
  type CreatePortalSettingInput,
  type PortalSettingsListQuery,
  type PutEffectiveSettingsInput,
  type PutNavigationLayoutInput,
  type PutNomenclatureOverridesInput,
  type UpdateInstitutionProfileInput,
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

  /** The resolved, typed global settings (registry defaults overlaid with stored overrides). */
  @Get('effective')
  @RequireInstitutionPermissions('institution_settings.view')
  effective(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
  ) {
    return this.service.getEffective(this.ctx(p, s, r));
  }

  /** The institution's own editable profile (identity, location, primary contact, derived currency). */
  @Get('profile')
  @RequireInstitutionPermissions('institution_settings.view')
  profile(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
  ) {
    return this.service.getProfile(this.ctx(p, s, r));
  }

  @Put('profile')
  @RequireInstitutionPermissions('institution_settings.manage')
  saveProfile(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(updateInstitutionProfileSchema)) body: UpdateInstitutionProfileInput,
  ) {
    return this.service.updateProfile(this.ctx(p, s, r), body);
  }

  @Post('effective')
  @RequireInstitutionPermissions('institution_settings.manage')
  saveEffective(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(putEffectiveSettingsSchema)) body: PutEffectiveSettingsInput,
  ) {
    return this.service.putEffective(this.ctx(p, s, r), body);
  }

  @Post('nomenclature')
  @RequireInstitutionPermissions('institution_settings.manage')
  saveNomenclature(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(putNomenclatureOverridesSchema)) body: PutNomenclatureOverridesInput,
  ) {
    return this.service.putNomenclatureOverrides(this.ctx(p, s, r), body);
  }

  @Post('navigation')
  @RequireInstitutionPermissions('institution_settings.manage')
  saveNavigation(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(putNavigationLayoutSchema)) body: PutNavigationLayoutInput,
  ) {
    return this.service.putNavigationLayout(this.ctx(p, s, r), body);
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
