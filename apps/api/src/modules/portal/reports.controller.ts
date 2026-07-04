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
import { PortalReportQueriesService } from './portal-report-queries.service';
import type { PortalActionContext } from './portal-action-context';
import { z } from 'zod';

const reportPeriodQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});
type ReportPeriodQuery = z.infer<typeof reportPeriodQuerySchema>;
const toPeriod = (q: ReportPeriodQuery) => ({ from: q.from, to: q.to });
const gradeDistributionQuerySchema = z.object({ examId: z.string().uuid().optional() });

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
  constructor(
    private readonly service: ReportsService,
    private readonly queries: PortalReportQueriesService,
  ) {}

  private ctx(p: InstitutionPrincipal, s: InstitutionScope, r: EdrionRequestContext): PortalActionContext {
    return { principal: p, scope: s, request: r };
  }

  // --- typed aggregates (Petros Phase 5; same data the report tools use) ------

  @Get('aggregates/attendance-summary')
  @RequireInstitutionPermissions('reports.view', 'attendance.view')
  attendanceSummary(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Query(zodBody(reportPeriodQuerySchema)) q: ReportPeriodQuery,
  ) {
    return this.queries.attendanceSummary(this.ctx(p, s, r), toPeriod(q));
  }

  @Get('aggregates/fee-collection')
  @RequireInstitutionPermissions('reports.view', 'fees.view')
  feeCollection(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Query(zodBody(reportPeriodQuerySchema)) q: ReportPeriodQuery,
  ) {
    return this.queries.feeCollection(this.ctx(p, s, r), toPeriod(q));
  }

  @Get('aggregates/grade-distribution')
  @RequireInstitutionPermissions('reports.view', 'gradebook.view')
  gradeDistribution(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Query(zodBody(gradeDistributionQuerySchema)) q: { examId?: string },
  ) {
    return this.queries.gradeDistribution(this.ctx(p, s, r), q.examId);
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
