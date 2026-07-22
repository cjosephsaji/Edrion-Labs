import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';
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
import { PortalLearnPolicyService } from './portal-learn-policy.service';
import { PortalLearnVisibilityService } from './portal-learn-visibility.service';

@ApiTags('portal-learn-policy')
@Controller('portal/learn-policy')
@Public()
@SkipRateLimit()
@UseGuards(InstitutionAuthGuard, InstitutionPermissionsGuard)
export class PortalLearnPolicyController {
  constructor(
    private readonly policy: PortalLearnPolicyService,
    private readonly visibility: PortalLearnVisibilityService,
  ) {}

  private ctx(p: InstitutionPrincipal, s: InstitutionScope, r: EdrionRequestContext): PortalActionContext {
    return { principal: p, scope: s, request: r };
  }

  @Get()
  @RequireInstitutionPermissions('ai.configure')
  get(@CurrentInstitutionPrincipal() principal: InstitutionPrincipal) {
    return this.policy.get(principal.institutionId);
  }

  @Put()
  @RequireInstitutionPermissions('ai.configure')
  upsert(
    @CurrentInstitutionPrincipal() principal: InstitutionPrincipal,
    @CurrentScope() scope: InstitutionScope,
    @ReqContext() request: EdrionRequestContext,
    @Body() body: unknown,
  ) {
    return this.policy.upsert(this.ctx(principal, scope, request), body);
  }

  @Get('students/:studentId/sessions/aggregate')
  @RequireInstitutionPermissions('students.view')
  aggregate(
    @CurrentInstitutionPrincipal() principal: InstitutionPrincipal,
    @Param('studentId') studentId: string,
  ) {
    return this.visibility.getAggregate(studentId, principal.institutionId);
  }

  @Get('students/:studentId/sessions')
  @RequireInstitutionPermissions('students.view')
  listSessions(
    @CurrentInstitutionPrincipal() principal: InstitutionPrincipal,
    @Param('studentId') studentId: string,
  ) {
    return this.visibility.listSessionIds(studentId, principal.institutionId);
  }

  @Get('students/:studentId/sessions/:sessionId/transcript')
  @RequireInstitutionPermissions('students.view')
  transcript(
    @CurrentInstitutionPrincipal() principal: InstitutionPrincipal,
    @CurrentScope() scope: InstitutionScope,
    @ReqContext() request: EdrionRequestContext,
    @Param('studentId') studentId: string,
    @Param('sessionId') sessionId: string,
  ) {
    return this.visibility.getTranscript(this.ctx(principal, scope, request), studentId, sessionId);
  }
}
