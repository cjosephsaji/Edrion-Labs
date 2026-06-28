import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  createTransportAssignmentSchema,
  createTransportRouteSchema,
  createTransportVehicleSchema,
  transportRoutesListQuerySchema,
  transportVehiclesListQuerySchema,
  updateTransportAssignmentSchema,
  updateTransportRouteSchema,
  updateTransportVehicleSchema,
  versionedDeleteSchema,
  type CreateTransportAssignmentInput,
  type CreateTransportRouteInput,
  type CreateTransportVehicleInput,
  type TransportRoutesListQuery,
  type TransportVehiclesListQuery,
  type UpdateTransportAssignmentInput,
  type UpdateTransportRouteInput,
  type UpdateTransportVehicleInput,
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
import { TransportService } from './transport.service';
import type { PortalActionContext } from './portal-action-context';

/**
 * Institution-portal Transport API (Phase 8) — routes + vehicles + per-student assignments. Same
 * boundary as the rest of the portal. Reads need transport.view; mutations need transport.manage.
 * Assignments are nested under a route.
 */
@ApiTags('portal-transport')
@Controller('portal/transport')
@Public()
@SkipRateLimit()
@UseGuards(InstitutionAuthGuard, InstitutionPermissionsGuard)
export class TransportController {
  constructor(private readonly service: TransportService) {}

  private ctx(p: InstitutionPrincipal, s: InstitutionScope, r: EdrionRequestContext): PortalActionContext {
    return { principal: p, scope: s, request: r };
  }

  // --- routes ----------------------------------------------------------------

  @Get('routes')
  @RequireInstitutionPermissions('transport.view')
  listRoutes(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Query(zodBody(transportRoutesListQuerySchema)) q: TransportRoutesListQuery,
  ) {
    return this.service.listRoutes(this.ctx(p, s, r), q);
  }

  @Post('routes')
  @RequireInstitutionPermissions('transport.manage')
  createRoute(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(createTransportRouteSchema)) body: CreateTransportRouteInput,
  ) {
    return this.service.createRoute(this.ctx(p, s, r), body);
  }

  @Patch('routes/:id')
  @RequireInstitutionPermissions('transport.manage')
  updateRoute(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(updateTransportRouteSchema)) body: UpdateTransportRouteInput,
  ) {
    return this.service.updateRoute(this.ctx(p, s, r), id, body);
  }

  @Delete('routes/:id')
  @RequireInstitutionPermissions('transport.manage')
  deleteRoute(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(versionedDeleteSchema)) body: VersionedDeleteInput,
  ) {
    return this.service.deleteRoute(this.ctx(p, s, r), id, body.version);
  }

  // --- vehicles --------------------------------------------------------------

  @Get('vehicles')
  @RequireInstitutionPermissions('transport.view')
  listVehicles(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Query(zodBody(transportVehiclesListQuerySchema)) q: TransportVehiclesListQuery,
  ) {
    return this.service.listVehicles(this.ctx(p, s, r), q);
  }

  @Post('vehicles')
  @RequireInstitutionPermissions('transport.manage')
  createVehicle(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(createTransportVehicleSchema)) body: CreateTransportVehicleInput,
  ) {
    return this.service.createVehicle(this.ctx(p, s, r), body);
  }

  @Patch('vehicles/:id')
  @RequireInstitutionPermissions('transport.manage')
  updateVehicle(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(updateTransportVehicleSchema)) body: UpdateTransportVehicleInput,
  ) {
    return this.service.updateVehicle(this.ctx(p, s, r), id, body);
  }

  @Delete('vehicles/:id')
  @RequireInstitutionPermissions('transport.manage')
  deleteVehicle(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(versionedDeleteSchema)) body: VersionedDeleteInput,
  ) {
    return this.service.deleteVehicle(this.ctx(p, s, r), id, body.version);
  }

  // --- assignments (against a route) -----------------------------------------

  @Get('routes/:id/assignments')
  @RequireInstitutionPermissions('transport.view')
  listAssignments(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
  ) {
    return this.service.listAssignments(this.ctx(p, s, r), id);
  }

  @Post('routes/:id/assignments')
  @RequireInstitutionPermissions('transport.manage')
  createAssignment(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(createTransportAssignmentSchema)) body: CreateTransportAssignmentInput,
  ) {
    return this.service.createAssignment(this.ctx(p, s, r), id, body);
  }

  @Patch('routes/:id/assignments/:assignmentId')
  @RequireInstitutionPermissions('transport.manage')
  updateAssignment(
    @Param('id') id: string,
    @Param('assignmentId') assignmentId: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(updateTransportAssignmentSchema)) body: UpdateTransportAssignmentInput,
  ) {
    return this.service.updateAssignment(this.ctx(p, s, r), id, assignmentId, body);
  }

  @Delete('routes/:id/assignments/:assignmentId')
  @RequireInstitutionPermissions('transport.manage')
  deleteAssignment(
    @Param('id') id: string,
    @Param('assignmentId') assignmentId: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(versionedDeleteSchema)) body: VersionedDeleteInput,
  ) {
    return this.service.deleteAssignment(this.ctx(p, s, r), id, assignmentId, body.version);
  }
}
