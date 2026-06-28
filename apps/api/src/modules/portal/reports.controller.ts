import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  createReportDefinitionSchema,
  createReportRunSchema,
  reportDefinitionsListQuerySchema,
  updateReportDefinitionSchema,
  versionedDeleteSchema,
  type CreateReportDefinitionInput,
  type CreateReportRunInput,
  type ReportDefinitionsListQuery,
  type UpdateReportDefinitionInput,
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
import { ReportsService } from './reports.service';
import type { PortalActionContext } from './portal-action-context';

/**
 * Institution-portal Reports API (Phase 9) — saved report definitions + their generated runs (the export
 * bridge). Reads need reports.view; defining + exporting need the sensitive reports.export key. Runs are
 * nested under a definition the caller can see.
 */
@ApiTags('portal-reports')
@Controller('portal/reports')
@Public()
@SkipRateLimit()
@UseGuards(InstitutionAuthGuard, InstitutionPermissionsGuard)
export class ReportsController {
  constructor(private readonly service: ReportsService) {}

  private ctx(p: InstitutionPrincipal, s: InstitutionScope, r: EdrionRequestContext): PortalActionContext {
    return { principal: p, scope: s, request: r };
  }

  // --- definitions -----------------------------------------------------------

  @Get()
  @RequireInstitutionPermissions('reports.view')
  list(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Query(zodBody(reportDefinitionsListQuerySchema)) q: ReportDefinitionsListQuery,
  ) {
    return this.service.listDefinitions(this.ctx(p, s, r), q);
  }

  @Post()
  @RequireInstitutionPermissions('reports.export')
  create(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(createReportDefinitionSchema)) body: CreateReportDefinitionInput,
  ) {
    return this.service.createDefinition(this.ctx(p, s, r), body);
  }

  @Patch(':id')
  @RequireInstitutionPermissions('reports.export')
  update(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(updateReportDefinitionSchema)) body: UpdateReportDefinitionInput,
  ) {
    return this.service.updateDefinition(this.ctx(p, s, r), id, body);
  }

  @Delete(':id')
  @RequireInstitutionPermissions('reports.export')
  remove(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(versionedDeleteSchema)) body: VersionedDeleteInput,
  ) {
    return this.service.deleteDefinition(this.ctx(p, s, r), id, body.version);
  }

  // --- runs (exports of a definition) ----------------------------------------

  @Get(':id/runs')
  @RequireInstitutionPermissions('reports.view')
  listRuns(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
  ) {
    return this.service.listRuns(this.ctx(p, s, r), id);
  }

  @Post(':id/runs')
  @RequireInstitutionPermissions('reports.export')
  createRun(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(createReportRunSchema)) body: CreateReportRunInput,
  ) {
    return this.service.createRun(this.ctx(p, s, r), id, body);
  }

  @Delete(':id/runs/:runId')
  @RequireInstitutionPermissions('reports.export')
  removeRun(
    @Param('id') id: string,
    @Param('runId') runId: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
  ) {
    return this.service.removeRun(this.ctx(p, s, r), id, runId);
  }
}
