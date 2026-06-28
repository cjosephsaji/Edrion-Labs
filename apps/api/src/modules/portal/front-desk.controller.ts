import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  appointmentsListQuerySchema,
  createAppointmentSchema,
  createVisitorSchema,
  updateAppointmentSchema,
  updateVisitorSchema,
  versionedDeleteSchema,
  visitorsListQuerySchema,
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
import { FrontDeskService } from './front-desk.service';
import type { CrudListQuery } from './portal-crud.engine';
import type { PortalActionContext } from './portal-action-context';

/**
 * Institution-portal Front Desk API (Phase 13 — Receptionist). Visitor log read with visitors.view
 * (Security can read too), managed with visitors.manage; appointments gated by appointments.manage.
 */
@ApiTags('portal-front-desk')
@Controller('portal/front-desk')
@Public()
@SkipRateLimit()
@UseGuards(InstitutionAuthGuard, InstitutionPermissionsGuard)
export class FrontDeskController {
  constructor(private readonly svc: FrontDeskService) {}

  private ctx(p: InstitutionPrincipal, s: InstitutionScope, r: EdrionRequestContext): PortalActionContext {
    return { principal: p, scope: s, request: r };
  }

  // --- visitors --------------------------------------------------------------
  @Get('visitors')
  @RequireInstitutionPermissions('visitors.view')
  listVisitors(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Query(zodBody(visitorsListQuerySchema)) q: CrudListQuery,
  ) {
    return this.svc.list('visitors', this.ctx(p, s, r), q);
  }

  @Post('visitors')
  @RequireInstitutionPermissions('visitors.manage')
  createVisitor(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(createVisitorSchema)) body: Record<string, unknown>,
  ) {
    return this.svc.create('visitors', this.ctx(p, s, r), body);
  }

  @Patch('visitors/:id')
  @RequireInstitutionPermissions('visitors.manage')
  updateVisitor(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(updateVisitorSchema)) body: Record<string, unknown>,
  ) {
    return this.svc.update('visitors', this.ctx(p, s, r), id, body);
  }

  @Delete('visitors/:id')
  @RequireInstitutionPermissions('visitors.manage')
  removeVisitor(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(versionedDeleteSchema)) body: VersionedDeleteInput,
  ) {
    return this.svc.remove('visitors', this.ctx(p, s, r), id, body.version);
  }

  // --- appointments ----------------------------------------------------------
  @Get('appointments')
  @RequireInstitutionPermissions('appointments.manage')
  listAppointments(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Query(zodBody(appointmentsListQuerySchema)) q: CrudListQuery,
  ) {
    return this.svc.list('appointments', this.ctx(p, s, r), q);
  }

  @Post('appointments')
  @RequireInstitutionPermissions('appointments.manage')
  createAppointment(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(createAppointmentSchema)) body: Record<string, unknown>,
  ) {
    return this.svc.create('appointments', this.ctx(p, s, r), body);
  }

  @Patch('appointments/:id')
  @RequireInstitutionPermissions('appointments.manage')
  updateAppointment(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(updateAppointmentSchema)) body: Record<string, unknown>,
  ) {
    return this.svc.update('appointments', this.ctx(p, s, r), id, body);
  }

  @Delete('appointments/:id')
  @RequireInstitutionPermissions('appointments.manage')
  removeAppointment(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(versionedDeleteSchema)) body: VersionedDeleteInput,
  ) {
    return this.svc.remove('appointments', this.ctx(p, s, r), id, body.version);
  }
}
