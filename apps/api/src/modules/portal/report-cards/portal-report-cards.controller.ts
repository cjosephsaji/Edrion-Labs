import { Body, Controller, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  createReportCardSchema,
  reportCardsListQuerySchema,
  upsertReportCardEntriesSchema,
  type CreateReportCardInput,
  type ReportCardsListQuery,
  type UpsertReportCardEntriesInput,
} from '@edrion/schemas';
import type { InstitutionPrincipal, InstitutionScope } from '@edrion/auth';
import { Public } from '../../../common/guards/auth.guard';
import { ReqContext, SkipRateLimit } from '../../../common/decorators';
import type { EdrionRequestContext } from '../../../common/request-context';
import { zodBody } from '../../../common/zod-validation.pipe';
import { InstitutionAuthGuard } from '../portal-auth.guard';
import { InstitutionPermissionsGuard } from '../portal-permissions.guard';
import { CurrentInstitutionPrincipal, CurrentScope, RequireInstitutionPermissions } from '../portal.decorators';
import type { PortalActionContext } from '../portal-action-context';
import { PortalReportCardsService } from './portal-report-cards.service';

@ApiTags('portal-report-cards')
@Controller('portal/report-cards')
@Public()
@SkipRateLimit()
@UseGuards(InstitutionAuthGuard, InstitutionPermissionsGuard)
export class PortalReportCardsController {
  constructor(private readonly service: PortalReportCardsService) {}

  private ctx(p: InstitutionPrincipal, s: InstitutionScope, r: EdrionRequestContext): PortalActionContext {
    return { principal: p, scope: s, request: r };
  }

  @Get()
  @RequireInstitutionPermissions('report_cards.view', 'report_cards.manage')
  list(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Query(zodBody(reportCardsListQuerySchema)) q: ReportCardsListQuery,
  ) {
    return this.service.list(this.ctx(p, s, r), q);
  }

  @Post()
  @RequireInstitutionPermissions('report_cards.manage')
  create(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(createReportCardSchema)) body: CreateReportCardInput,
  ) {
    return this.service.create(this.ctx(p, s, r), body);
  }

  @Get(':id/entries')
  @RequireInstitutionPermissions('report_cards.view', 'report_cards.manage')
  getEntries(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
  ) {
    return this.service.getEntries(this.ctx(p, s, r), id);
  }

  @Put(':id/entries')
  @RequireInstitutionPermissions('report_cards.manage')
  upsertEntries(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(upsertReportCardEntriesSchema)) body: UpsertReportCardEntriesInput,
  ) {
    return this.service.upsertEntries(this.ctx(p, s, r), id, body);
  }

  @Post(':id/submit-review')
  @RequireInstitutionPermissions('report_cards.manage')
  submitReview(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
  ) {
    return this.service.submitReview(this.ctx(p, s, r), id);
  }

  @Post(':id/publish')
  @RequireInstitutionPermissions('report_cards.publish')
  publish(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
  ) {
    return this.service.publish(this.ctx(p, s, r), id);
  }

  @Post(':id/supersede')
  @RequireInstitutionPermissions('report_cards.manage')
  supersede(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
  ) {
    return this.service.supersede(this.ctx(p, s, r), id);
  }
}
