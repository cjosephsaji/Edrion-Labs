import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  createLabAssetSchema,
  createLabIncidentSchema,
  createLabScheduleSchema,
  labAssetsListQuerySchema,
  labIncidentsListQuerySchema,
  labSchedulesListQuerySchema,
  updateLabAssetSchema,
  updateLabIncidentSchema,
  updateLabScheduleSchema,
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
import { LabsService } from './labs.service';
import type { CrudListQuery } from './portal-crud.engine';
import type { PortalActionContext } from './portal-action-context';

/**
 * Institution-portal Labs API (Phase 13 — Lab Staff). Assets read with labs.view + managed with
 * labs.manage_inventory; schedules with labs.view_schedule; incidents read with labs.view + reported
 * with labs.report_incidents.
 */
@ApiTags('portal-labs')
@Controller('portal/labs')
@Public()
@SkipRateLimit()
@UseGuards(InstitutionAuthGuard, InstitutionPermissionsGuard)
export class LabsController {
  constructor(private readonly svc: LabsService) {}

  private ctx(p: InstitutionPrincipal, s: InstitutionScope, r: EdrionRequestContext): PortalActionContext {
    return { principal: p, scope: s, request: r };
  }

  // --- lab assets ------------------------------------------------------------
  @Get('assets')
  @RequireInstitutionPermissions('labs.view')
  listAssets(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Query(zodBody(labAssetsListQuerySchema)) q: CrudListQuery,
  ) {
    return this.svc.list('assets', this.ctx(p, s, r), q);
  }

  @Post('assets')
  @RequireInstitutionPermissions('labs.manage_inventory')
  createAsset(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(createLabAssetSchema)) body: Record<string, unknown>,
  ) {
    return this.svc.create('assets', this.ctx(p, s, r), body);
  }

  @Patch('assets/:id')
  @RequireInstitutionPermissions('labs.manage_inventory')
  updateAsset(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(updateLabAssetSchema)) body: Record<string, unknown>,
  ) {
    return this.svc.update('assets', this.ctx(p, s, r), id, body);
  }

  @Delete('assets/:id')
  @RequireInstitutionPermissions('labs.manage_inventory')
  removeAsset(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(versionedDeleteSchema)) body: VersionedDeleteInput,
  ) {
    return this.svc.remove('assets', this.ctx(p, s, r), id, body.version);
  }

  // --- lab schedules ---------------------------------------------------------
  @Get('schedules')
  @RequireInstitutionPermissions('labs.view_schedule')
  listSchedules(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Query(zodBody(labSchedulesListQuerySchema)) q: CrudListQuery,
  ) {
    return this.svc.list('schedules', this.ctx(p, s, r), q);
  }

  @Post('schedules')
  @RequireInstitutionPermissions('labs.view_schedule')
  createSchedule(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(createLabScheduleSchema)) body: Record<string, unknown>,
  ) {
    return this.svc.create('schedules', this.ctx(p, s, r), body);
  }

  @Patch('schedules/:id')
  @RequireInstitutionPermissions('labs.view_schedule')
  updateSchedule(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(updateLabScheduleSchema)) body: Record<string, unknown>,
  ) {
    return this.svc.update('schedules', this.ctx(p, s, r), id, body);
  }

  @Delete('schedules/:id')
  @RequireInstitutionPermissions('labs.view_schedule')
  removeSchedule(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(versionedDeleteSchema)) body: VersionedDeleteInput,
  ) {
    return this.svc.remove('schedules', this.ctx(p, s, r), id, body.version);
  }

  // --- lab incidents ---------------------------------------------------------
  @Get('incidents')
  @RequireInstitutionPermissions('labs.view')
  listIncidents(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Query(zodBody(labIncidentsListQuerySchema)) q: CrudListQuery,
  ) {
    return this.svc.list('incidents', this.ctx(p, s, r), q);
  }

  @Post('incidents')
  @RequireInstitutionPermissions('labs.report_incidents')
  createIncident(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(createLabIncidentSchema)) body: Record<string, unknown>,
  ) {
    return this.svc.create('incidents', this.ctx(p, s, r), body);
  }

  @Patch('incidents/:id')
  @RequireInstitutionPermissions('labs.report_incidents')
  updateIncident(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(updateLabIncidentSchema)) body: Record<string, unknown>,
  ) {
    return this.svc.update('incidents', this.ctx(p, s, r), id, body);
  }

  @Delete('incidents/:id')
  @RequireInstitutionPermissions('labs.report_incidents')
  removeIncident(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(versionedDeleteSchema)) body: VersionedDeleteInput,
  ) {
    return this.svc.remove('incidents', this.ctx(p, s, r), id, body.version);
  }
}
