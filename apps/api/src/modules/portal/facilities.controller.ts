import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  createFacilityAssetSchema,
  createFacilitySchema,
  createMaintenanceTaskSchema,
  createWorkOrderSchema,
  facilitiesListQuerySchema,
  reportFacilityIssueSchema,
  type ReportFacilityIssueInput,
  facilityAssetsListQuerySchema,
  maintenanceTasksListQuerySchema,
  updateFacilityAssetSchema,
  updateFacilitySchema,
  updateMaintenanceTaskSchema,
  updateWorkOrderSchema,
  versionedDeleteSchema,
  workOrdersListQuerySchema,
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
import { FacilitiesService } from './facilities.service';
import type { CrudListQuery } from './portal-crud.engine';
import type { PortalActionContext } from './portal-action-context';

/**
 * Institution-portal Facilities API (Phase 13 — Maintenance Staff). facilities gated by
 * facilities.view; work orders by work_orders.manage; maintenance tasks by maintenance_tasks.manage;
 * assets read with assets.view and changed via inventory.request.
 */
@ApiTags('portal-facilities')
@Controller('portal/facilities')
@Public()
@SkipRateLimit()
@UseGuards(InstitutionAuthGuard, InstitutionPermissionsGuard)
export class FacilitiesController {
  constructor(private readonly svc: FacilitiesService) {}

  private ctx(p: InstitutionPrincipal, s: InstitutionScope, r: EdrionRequestContext): PortalActionContext {
    return { principal: p, scope: s, request: r };
  }

  // --- facilities ------------------------------------------------------------
  @Get()
  @RequireInstitutionPermissions('facilities.view')
  listFacilities(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Query(zodBody(facilitiesListQuerySchema)) q: CrudListQuery,
  ) {
    return this.svc.list('facilities', this.ctx(p, s, r), q);
  }

  @Post()
  @RequireInstitutionPermissions('facilities.view')
  createFacility(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(createFacilitySchema)) body: Record<string, unknown>,
  ) {
    return this.svc.create('facilities', this.ctx(p, s, r), body);
  }

  @Patch(':id')
  @RequireInstitutionPermissions('facilities.view')
  updateFacility(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(updateFacilitySchema)) body: Record<string, unknown>,
  ) {
    return this.svc.update('facilities', this.ctx(p, s, r), id, body);
  }

  @Delete(':id')
  @RequireInstitutionPermissions('facilities.view')
  removeFacility(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(versionedDeleteSchema)) body: VersionedDeleteInput,
  ) {
    return this.svc.remove('facilities', this.ctx(p, s, r), id, body.version);
  }

  // --- work orders -----------------------------------------------------------
  @Get('work-orders')
  @RequireInstitutionPermissions('work_orders.manage')
  listWorkOrders(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Query(zodBody(workOrdersListQuerySchema)) q: CrudListQuery,
  ) {
    return this.svc.list('work-orders', this.ctx(p, s, r), q);
  }

  @Post('work-orders')
  @RequireInstitutionPermissions('work_orders.manage')
  createWorkOrder(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(createWorkOrderSchema)) body: Record<string, unknown>,
  ) {
    return this.svc.create('work-orders', this.ctx(p, s, r), body);
  }

  @Patch('work-orders/:id')
  @RequireInstitutionPermissions('work_orders.manage')
  updateWorkOrder(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(updateWorkOrderSchema)) body: Record<string, unknown>,
  ) {
    return this.svc.update('work-orders', this.ctx(p, s, r), id, body);
  }

  @Delete('work-orders/:id')
  @RequireInstitutionPermissions('work_orders.manage')
  removeWorkOrder(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(versionedDeleteSchema)) body: VersionedDeleteInput,
  ) {
    return this.svc.remove('work-orders', this.ctx(p, s, r), id, body.version);
  }

  // --- maintenance tasks -----------------------------------------------------
  @Get('maintenance-tasks')
  @RequireInstitutionPermissions('maintenance_tasks.manage')
  listMaintenanceTasks(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Query(zodBody(maintenanceTasksListQuerySchema)) q: CrudListQuery,
  ) {
    return this.svc.list('maintenance-tasks', this.ctx(p, s, r), q);
  }

  @Post('maintenance-tasks')
  @RequireInstitutionPermissions('maintenance_tasks.manage')
  createMaintenanceTask(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(createMaintenanceTaskSchema)) body: Record<string, unknown>,
  ) {
    return this.svc.create('maintenance-tasks', this.ctx(p, s, r), body);
  }

  @Patch('maintenance-tasks/:id')
  @RequireInstitutionPermissions('maintenance_tasks.manage')
  updateMaintenanceTask(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(updateMaintenanceTaskSchema)) body: Record<string, unknown>,
  ) {
    return this.svc.update('maintenance-tasks', this.ctx(p, s, r), id, body);
  }

  @Delete('maintenance-tasks/:id')
  @RequireInstitutionPermissions('maintenance_tasks.manage')
  removeMaintenanceTask(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(versionedDeleteSchema)) body: VersionedDeleteInput,
  ) {
    return this.svc.remove('maintenance-tasks', this.ctx(p, s, r), id, body.version);
  }

  // --- facility assets (read: assets.view, write: inventory.request) ---------
  @Get('assets')
  @RequireInstitutionPermissions('assets.view')
  listAssets(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Query(zodBody(facilityAssetsListQuerySchema)) q: CrudListQuery,
  ) {
    return this.svc.list('assets', this.ctx(p, s, r), q);
  }

  @Post('assets')
  @RequireInstitutionPermissions('inventory.request')
  createAsset(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(createFacilityAssetSchema)) body: Record<string, unknown>,
  ) {
    return this.svc.create('assets', this.ctx(p, s, r), body);
  }

  @Patch('assets/:id')
  @RequireInstitutionPermissions('inventory.request')
  updateAsset(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(updateFacilityAssetSchema)) body: Record<string, unknown>,
  ) {
    return this.svc.update('assets', this.ctx(p, s, r), id, body);
  }

  @Delete('assets/:id')
  @RequireInstitutionPermissions('inventory.request')
  removeAsset(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(versionedDeleteSchema)) body: VersionedDeleteInput,
  ) {
    return this.svc.remove('assets', this.ctx(p, s, r), id, body.version);
  }

  /**
   * Cross-role issue report (`facilities.report_issue`): raises a triage work order in `open`
   * status without granting work-order management. Same audited path Petros uses.
   */
  @Post('issue-reports')
  @RequireInstitutionPermissions('facilities.report_issue')
  reportIssue(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(reportFacilityIssueSchema)) body: ReportFacilityIssueInput,
  ) {
    return this.svc.create('work-orders', this.ctx(p, s, r), { ...body, status: 'open' });
  }
}
