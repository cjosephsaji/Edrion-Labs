import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  accessRequestsListQuerySchema,
  createAccessRequestSchema,
  createDeviceSchema,
  devicesListQuerySchema,
  updateAccessRequestSchema,
  updateDeviceSchema,
  versionedDeleteSchema,
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
import { ItService } from './it.service';
import type { CrudListQuery } from './portal-crud.engine';
import type { PortalActionContext } from './portal-action-context';

/**
 * Institution-portal IT API (Phase 13 — IT Staff). Devices gated by devices.manage; access requests
 * by access_requests.manage. User security resets/session revocation live on /portal/users.
 */
@ApiTags('portal-it')
@Controller('portal/it')
@Public()
@SkipRateLimit()
@UseGuards(InstitutionAuthGuard, InstitutionPermissionsGuard)
export class ItController {
  constructor(private readonly svc: ItService) {}

  private ctx(p: InstitutionPrincipal, s: InstitutionScope, r: EdrionRequestContext): PortalActionContext {
    return { principal: p, scope: s, request: r };
  }

  // --- devices ---------------------------------------------------------------
  @Get('devices')
  @RequireInstitutionPermissions('devices.manage')
  listDevices(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Query(zodBody(devicesListQuerySchema)) q: CrudListQuery,
  ) {
    return this.svc.list('devices', this.ctx(p, s, r), q);
  }

  @Post('devices')
  @RequireInstitutionPermissions('devices.manage')
  createDevice(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(createDeviceSchema)) body: Record<string, unknown>,
  ) {
    return this.svc.create('devices', this.ctx(p, s, r), body);
  }

  @Patch('devices/:id')
  @RequireInstitutionPermissions('devices.manage')
  updateDevice(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(updateDeviceSchema)) body: Record<string, unknown>,
  ) {
    return this.svc.update('devices', this.ctx(p, s, r), id, body);
  }

  @Delete('devices/:id')
  @RequireInstitutionPermissions('devices.manage')
  removeDevice(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(versionedDeleteSchema)) body: VersionedDeleteInput,
  ) {
    return this.svc.remove('devices', this.ctx(p, s, r), id, body.version);
  }

  // --- access requests -------------------------------------------------------
  @Get('access-requests')
  @RequireInstitutionPermissions('access_requests.manage')
  listAccessRequests(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Query(zodBody(accessRequestsListQuerySchema)) q: CrudListQuery,
  ) {
    return this.svc.list('access-requests', this.ctx(p, s, r), q);
  }

  @Post('access-requests')
  @RequireInstitutionPermissions('access_requests.manage')
  createAccessRequest(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(createAccessRequestSchema)) body: Record<string, unknown>,
  ) {
    return this.svc.create('access-requests', this.ctx(p, s, r), body);
  }

  @Patch('access-requests/:id')
  @RequireInstitutionPermissions('access_requests.manage')
  updateAccessRequest(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(updateAccessRequestSchema)) body: Record<string, unknown>,
  ) {
    return this.svc.update('access-requests', this.ctx(p, s, r), id, body);
  }

  @Delete('access-requests/:id')
  @RequireInstitutionPermissions('access_requests.manage')
  removeAccessRequest(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(versionedDeleteSchema)) body: VersionedDeleteInput,
  ) {
    return this.svc.remove('access-requests', this.ctx(p, s, r), id, body.version);
  }
}
