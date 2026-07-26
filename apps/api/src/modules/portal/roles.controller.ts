import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  createPortalRoleSchema,
  portalRolesListQuerySchema,
  setPortalRolePermissionsSchema,
  updatePortalRoleSchema,
  versionedDeleteSchema,
  type CreatePortalRoleInput,
  type PortalRolesListQuery,
  type SetPortalRolePermissionsInput,
  type UpdatePortalRoleInput,
  type VersionedDeleteInput,
} from '@edrion/schemas';
import { INSTITUTION_PERMISSIONS } from '@edrion/permissions/institution';
import type { InstitutionPrincipal, InstitutionScope } from '@edrion/auth';
import { Public } from '../../common/guards/auth.guard';
import { ReqContext, SkipRateLimit } from '../../common/decorators';
import type { EdrionRequestContext } from '../../common/request-context';
import { zodBody } from '../../common/zod-validation.pipe';
import { InstitutionAuthGuard } from './portal-auth.guard';
import { InstitutionPermissionsGuard } from './portal-permissions.guard';
import { CurrentInstitutionPrincipal, CurrentScope, RequireInstitutionPermissions } from './portal.decorators';
import { RolesService } from './roles.service';
import type { PortalActionContext } from './portal-action-context';

/**
 * Institution-portal Roles API (Phase 11) — the roles editor over the institution permission
 * catalogue + the code default roles (read-only). Reads need `roles.view`; writes need the
 * sensitive `roles.manage`. Built-in roles can be listed but never edited (ROLE_IS_SYSTEM).
 */
@ApiTags('portal-roles')
@Controller('portal/roles')
@Public()
@SkipRateLimit()
@UseGuards(InstitutionAuthGuard, InstitutionPermissionsGuard)
export class RolesController {
  constructor(private readonly service: RolesService) {}

  private ctx(p: InstitutionPrincipal, s: InstitutionScope, r: EdrionRequestContext): PortalActionContext {
    return { principal: p, scope: s, request: r };
  }

  /** The institution permission catalogue (grouped) — powers the permissions picker. */
  @Get('catalogue')
  @RequireInstitutionPermissions('roles.view')
  catalogue() {
    return { permissions: INSTITUTION_PERMISSIONS };
  }

  @Get()
  @RequireInstitutionPermissions('roles.view')
  list(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Query(zodBody(portalRolesListQuerySchema)) q: PortalRolesListQuery,
  ) {
    return this.service.list(this.ctx(p, s, r), q);
  }

  @Post()
  @RequireInstitutionPermissions('roles.manage')
  create(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(createPortalRoleSchema)) body: CreatePortalRoleInput,
  ) {
    return this.service.create(this.ctx(p, s, r), body);
  }

  @Patch(':id')
  @RequireInstitutionPermissions('roles.manage')
  update(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(updatePortalRoleSchema)) body: UpdatePortalRoleInput,
  ) {
    return this.service.update(this.ctx(p, s, r), id, body);
  }

  @Put(':id/permissions')
  @RequireInstitutionPermissions('roles.manage')
  setPermissions(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(setPortalRolePermissionsSchema)) body: SetPortalRolePermissionsInput,
  ) {
    return this.service.setPermissions(this.ctx(p, s, r), id, body);
  }

  @Delete(':id')
  @RequireInstitutionPermissions('roles.manage')
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
