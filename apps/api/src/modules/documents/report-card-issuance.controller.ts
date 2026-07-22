import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  reportCardCreateBatchSchema,
  reportCardFlagSchema,
  reportCardReissueSchema,
  reportCardReviewCompleteSchema,
  reportCardValidateSchema,
  type ReportCardValidateInput,
} from '@edrion/schemas';
import type { InstitutionPrincipal, InstitutionScope } from '@edrion/auth';
import { Public } from '../../common/guards/auth.guard';
import { ReqContext, SkipRateLimit } from '../../common/decorators';
import type { EdrionRequestContext } from '../../common/request-context';
import { zodBody } from '../../common/zod-validation.pipe';
import { InstitutionAuthGuard } from '../portal/portal-auth.guard';
import { InstitutionPermissionsGuard } from '../portal/portal-permissions.guard';
import { CurrentInstitutionPrincipal, CurrentScope, RequireInstitutionPermissions } from '../portal/portal.decorators';
import type { PortalActionContext } from '../portal/portal-action-context';
import { ReportCardIssuanceService } from './report-card-issuance.service';
import { z } from 'zod';

@ApiTags('portal-report-cards-issuance')
@Controller('portal/report-cards')
@Public()
@SkipRateLimit()
@UseGuards(InstitutionAuthGuard, InstitutionPermissionsGuard)
export class ReportCardIssuanceController {
  constructor(private readonly svc: ReportCardIssuanceService) {}

  private ctx(p: InstitutionPrincipal, s: InstitutionScope, r: EdrionRequestContext): PortalActionContext {
    return { principal: p, scope: s, request: r };
  }

  @Post('validate')
  @RequireInstitutionPermissions('reports.generate')
  validate(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(reportCardValidateSchema)) body: ReportCardValidateInput,
  ) {
    return this.svc.validate(this.ctx(p, s, r), body);
  }

  @Get('teacher-reviews')
  @RequireInstitutionPermissions('documents.issue')
  teacherReviews(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
  ) {
    return this.svc.listTeacherReviews(this.ctx(p, s, r));
  }

  @Post('runs')
  @RequireInstitutionPermissions('reports.generate')
  createRun(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(reportCardCreateBatchSchema)) body: ReportCardValidateInput & { templateId: string },
  ) {
    return this.svc.createRun(this.ctx(p, s, r), body);
  }

  @Post('runs/:batchId/items/:itemId/flag')
  @RequireInstitutionPermissions('documents.issue')
  flag(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Param('batchId') batchId: string,
    @Param('itemId') itemId: string,
    @Body(zodBody(reportCardFlagSchema)) body: { note: string; version: number },
  ) {
    return this.svc.flagCard(this.ctx(p, s, r), batchId, itemId, body.note, body.version);
  }

  @Post('runs/:batchId/sections/:sectionId/review')
  @RequireInstitutionPermissions('documents.issue')
  reviewSection(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Param('batchId') batchId: string,
    @Param('sectionId') sectionId: string,
    @Body(zodBody(reportCardReviewCompleteSchema)) body: { version: number },
  ) {
    return this.svc.markSectionReviewed(this.ctx(p, s, r), batchId, sectionId, body.version);
  }

  @Post('runs/:batchId/regenerate-flagged')
  @RequireInstitutionPermissions('reports.generate')
  regenerate(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Param('batchId') batchId: string,
    @Body(zodBody(z.object({ version: z.number().int().nonnegative() }))) body: { version: number },
  ) {
    return this.svc.regenerateFlagged(this.ctx(p, s, r), batchId, body.version);
  }

  @Post('runs/:batchId/publish')
  @RequireInstitutionPermissions('reports.generate')
  publish(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Param('batchId') batchId: string,
    @Body(zodBody(z.object({ version: z.number().int().nonnegative() }))) body: { version: number },
  ) {
    return this.svc.publish(this.ctx(p, s, r), batchId, body.version);
  }

  @Post('runs/:batchId/items/:itemId/reissue')
  @RequireInstitutionPermissions('reports.generate')
  reissue(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Param('batchId') batchId: string,
    @Param('itemId') itemId: string,
    @Body(zodBody(reportCardReissueSchema)) body: { reason: string; version: number },
  ) {
    return this.svc.reissueCard(this.ctx(p, s, r), batchId, itemId, body.reason, body.version);
  }
}
