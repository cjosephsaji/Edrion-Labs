import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { InstitutionPrincipal, InstitutionScope } from '@edrion/auth';
import { Public } from '../../../common/guards/auth.guard';
import { ReqContext, SkipRateLimit } from '../../../common/decorators';
import type { EdrionRequestContext } from '../../../common/request-context';
import {
  CurrentInstitutionPrincipal,
  CurrentScope,
  RequireInstitutionPermissions,
} from '../portal.decorators';
import { InstitutionAuthGuard } from '../portal-auth.guard';
import { InstitutionPermissionsGuard } from '../portal-permissions.guard';
import type { PortalActionContext } from '../portal-action-context';
import { PortalMockBlueprintsService } from './portal-mock-blueprints.service';
import { PortalMockBanksService } from './portal-mock-banks.service';

@ApiTags('portal-mock-exams')
@Controller('portal/lab')
@Public()
@SkipRateLimit()
@UseGuards(InstitutionAuthGuard, InstitutionPermissionsGuard)
export class PortalMockExamsController {
  constructor(
    private readonly blueprints: PortalMockBlueprintsService,
    private readonly banks: PortalMockBanksService,
  ) {}

  private ctx(p: InstitutionPrincipal, s: InstitutionScope, r: EdrionRequestContext): PortalActionContext {
    return { principal: p, scope: s, request: r };
  }

  @Get('blueprints')
  @RequireInstitutionPermissions('academics.view')
  listBlueprints(@CurrentInstitutionPrincipal() principal: InstitutionPrincipal) {
    return this.blueprints.list(principal.institutionId);
  }

  @Post('blueprints')
  @RequireInstitutionPermissions('academics.manage')
  createBlueprint(
    @CurrentInstitutionPrincipal() principal: InstitutionPrincipal,
    @CurrentScope() scope: InstitutionScope,
    @ReqContext() request: EdrionRequestContext,
    @Body() body: unknown,
  ) {
    return this.blueprints.create(this.ctx(principal, scope, request), body);
  }

  @Patch('blueprints/:id')
  @RequireInstitutionPermissions('academics.manage')
  updateBlueprint(
    @CurrentInstitutionPrincipal() principal: InstitutionPrincipal,
    @CurrentScope() scope: InstitutionScope,
    @ReqContext() request: EdrionRequestContext,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.blueprints.update(this.ctx(principal, scope, request), id, body);
  }

  @Post('blueprints/:id/publish')
  @RequireInstitutionPermissions('academics.manage')
  publish(
    @CurrentInstitutionPrincipal() principal: InstitutionPrincipal,
    @CurrentScope() scope: InstitutionScope,
    @ReqContext() request: EdrionRequestContext,
    @Param('id') id: string,
  ) {
    return this.blueprints.publish(this.ctx(principal, scope, request), id, true);
  }

  @Post('blueprints/:id/unpublish')
  @RequireInstitutionPermissions('academics.manage')
  unpublish(
    @CurrentInstitutionPrincipal() principal: InstitutionPrincipal,
    @CurrentScope() scope: InstitutionScope,
    @ReqContext() request: EdrionRequestContext,
    @Param('id') id: string,
  ) {
    return this.blueprints.publish(this.ctx(principal, scope, request), id, false);
  }

  @Post('blueprints/:id/archive')
  @RequireInstitutionPermissions('academics.manage')
  archive(
    @CurrentInstitutionPrincipal() principal: InstitutionPrincipal,
    @CurrentScope() scope: InstitutionScope,
    @ReqContext() request: EdrionRequestContext,
    @Param('id') id: string,
  ) {
    return this.blueprints.archive(this.ctx(principal, scope, request), id);
  }

  @Get('banks')
  @RequireInstitutionPermissions('academics.view')
  listBanks(@CurrentInstitutionPrincipal() principal: InstitutionPrincipal) {
    return this.banks.list(principal.institutionId);
  }

  @Get('banks/review-queue')
  @RequireInstitutionPermissions('academics.manage')
  reviewQueue(@CurrentInstitutionPrincipal() principal: InstitutionPrincipal) {
    return this.banks.reviewQueue(principal.institutionId);
  }

  @Post('banks/approve')
  @RequireInstitutionPermissions('academics.manage')
  approve(
    @CurrentInstitutionPrincipal() principal: InstitutionPrincipal,
    @Body() body: { ids: string[] },
  ) {
    return this.banks.bulkReview(
      principal.institutionId,
      body.ids ?? [],
      'approved',
      principal.institutionUserId,
    );
  }

  @Post('banks/reject')
  @RequireInstitutionPermissions('academics.manage')
  reject(
    @CurrentInstitutionPrincipal() principal: InstitutionPrincipal,
    @Body() body: { ids: string[] },
  ) {
    return this.banks.bulkReview(
      principal.institutionId,
      body.ids ?? [],
      'rejected',
      principal.institutionUserId,
    );
  }

  @Get('mocks/aggregates')
  @RequireInstitutionPermissions('academics.view')
  aggregates(@CurrentInstitutionPrincipal() principal: InstitutionPrincipal) {
    return this.banks.aggregates(principal.institutionId);
  }
}
