import { Body, Controller, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { gradingSchemeUpsertSchema, subjectWeightMapUpsertSchema, termRecomputeDecisionSchema, termRecomputeProposeSchema, type GradingSchemeUpsertInput, type SubjectWeightMapUpsertInput, type TermRecomputeDecisionInput, type TermRecomputeProposeInput } from '@edrion/schemas';
import type { InstitutionPrincipal, InstitutionScope } from '@edrion/auth';
import { Public } from '../../common/guards/auth.guard';
import { ReqContext, SkipRateLimit } from '../../common/decorators';
import type { EdrionRequestContext } from '../../common/request-context';
import { zodBody } from '../../common/zod-validation.pipe';
import { InstitutionAuthGuard } from './portal-auth.guard';
import { InstitutionPermissionsGuard } from './portal-permissions.guard';
import {
  CurrentInstitutionPrincipal,
  CurrentScope,
  RequireInstitutionPermissions,
} from './portal.decorators';
import type { PortalActionContext } from './portal-action-context';
import { GradingSchemesService } from './grading-schemes.service';
import { SubjectWeightMapsService } from './subject-weight-maps.service';
import { TermRecomputeService } from './term-recompute.service';

@ApiTags('portal-grading-schemes')
@Controller('portal/grading')
@Public()
@SkipRateLimit()
@UseGuards(InstitutionAuthGuard, InstitutionPermissionsGuard)
export class GradingPortalController {
  constructor(
    private readonly schemes: GradingSchemesService,
    private readonly weightMaps: SubjectWeightMapsService,
    private readonly termRecompute: TermRecomputeService,
  ) {}

  private ctx(
    principal: InstitutionPrincipal,
    scope: InstitutionScope,
    request: EdrionRequestContext,
  ): PortalActionContext {
    return { principal, scope, request };
  }

  @Get('schemes')
  @RequireInstitutionPermissions('academics.view')
  listSchemes(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
  ) {
    return this.schemes.list(this.ctx(p, s, r));
  }

  @Get('schemes/presets')
  @RequireInstitutionPermissions('academics.view')
  presets() {
    return this.schemes.presets();
  }

  @Post('schemes/presets/:kind')
  @RequireInstitutionPermissions('academics.manage')
  createPreset(
    @Param('kind') kind: 'points_10' | 'cbse' | 'us_4' | 'percentage',
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
  ) {
    return this.schemes.createFromPreset(this.ctx(p, s, r), kind);
  }

  @Post('schemes')
  @RequireInstitutionPermissions('academics.manage')
  createScheme(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(gradingSchemeUpsertSchema)) body: GradingSchemeUpsertInput,
  ) {
    return this.schemes.upsert(this.ctx(p, s, r), null, body);
  }

  @Put('schemes/:id')
  @RequireInstitutionPermissions('academics.manage')
  updateScheme(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(gradingSchemeUpsertSchema)) body: GradingSchemeUpsertInput,
  ) {
    return this.schemes.upsert(this.ctx(p, s, r), id, body);
  }

  @Get('weight-maps')
  @RequireInstitutionPermissions('gradebook.view')
  getWeightMap(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Query('subject_id') subjectId: string,
    @Query('term_id') termId: string,
    @Query('class_id') classId?: string,
  ) {
    return this.weightMaps.get(this.ctx(p, s, r), subjectId, termId, classId ?? null);
  }

  @Put('weight-maps')
  @RequireInstitutionPermissions('gradebook.manage')
  upsertWeightMap(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(subjectWeightMapUpsertSchema)) body: SubjectWeightMapUpsertInput,
  ) {
    return this.weightMaps.upsert(this.ctx(p, s, r), body);
  }

  @Get('term-recompute')
  @RequireInstitutionPermissions('gradebook.view')
  listTermRecompute(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Query('status') status?: string,
  ) {
    return this.termRecompute.list(this.ctx(p, s, r), status);
  }

  @Post('term-recompute')
  @RequireInstitutionPermissions('academics.manage')
  proposeTermRecompute(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(termRecomputeProposeSchema)) body: TermRecomputeProposeInput,
  ) {
    return this.termRecompute.propose(this.ctx(p, s, r), body);
  }

  @Post('term-recompute/:id/approve')
  @RequireInstitutionPermissions('results.recompute_approval')
  approveTermRecompute(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(termRecomputeDecisionSchema)) body: TermRecomputeDecisionInput,
  ) {
    return this.termRecompute.approve(this.ctx(p, s, r), id, body);
  }

  @Post('term-recompute/:id/reject')
  @RequireInstitutionPermissions('results.recompute_approval')
  rejectTermRecompute(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(termRecomputeDecisionSchema)) body: TermRecomputeDecisionInput,
  ) {
    return this.termRecompute.reject(this.ctx(p, s, r), id, body);
  }
}
