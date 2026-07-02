import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  createPortalCampusSchema,
  portalCampusesListQuerySchema,
  updatePortalCampusSchema,
  versionedDeleteSchema,
  type CreatePortalCampusInput,
  type PortalCampusesListQuery,
  type UpdatePortalCampusInput,
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
import { PortalCampusesService } from './portal-campuses.service';
import type { PortalActionContext } from './portal-action-context';

/**
 * Institution-portal Campuses API (Administration). Reads need `campuses.view`; create/update/delete
 * the sensitive `campuses.manage`. Codes are system-generated + immutable; billing is owned by the
 * platform control-plane, so this tenant surface never touches charges.
 */
@ApiTags('portal-campuses')
@Controller('portal/campuses')
@Public()
@SkipRateLimit()
@UseGuards(InstitutionAuthGuard, InstitutionPermissionsGuard)
export class PortalCampusesController {
  constructor(private readonly svc: PortalCampusesService) {}

  private ctx(p: InstitutionPrincipal, s: InstitutionScope, r: EdrionRequestContext): PortalActionContext {
    return { principal: p, scope: s, request: r };
  }

  @Get()
  @RequireInstitutionPermissions('campuses.view')
  list(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Query(zodBody(portalCampusesListQuerySchema)) q: PortalCampusesListQuery,
  ) {
    return this.svc.list(this.ctx(p, s, r), q);
  }

  @Post()
  @RequireInstitutionPermissions('campuses.manage')
  create(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(createPortalCampusSchema)) body: CreatePortalCampusInput,
  ) {
    return this.svc.create(this.ctx(p, s, r), body);
  }

  @Patch(':id')
  @RequireInstitutionPermissions('campuses.manage')
  update(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(updatePortalCampusSchema)) body: UpdatePortalCampusInput,
  ) {
    return this.svc.update(this.ctx(p, s, r), id, body);
  }

  @Delete(':id')
  @RequireInstitutionPermissions('campuses.manage')
  remove(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(versionedDeleteSchema)) body: VersionedDeleteInput,
  ) {
    return this.svc.remove(this.ctx(p, s, r), id, body.version);
  }
}
