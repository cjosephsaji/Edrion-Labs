import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { InstitutionPrincipal, InstitutionScope } from '@edrion/auth';
import { attendancePolicyUpsertSchema, type AttendancePolicyUpsertInput } from '@edrion/schemas';
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
import { AttendancePolicyService } from './attendance-policy.service';

@ApiTags('portal-attendance-policy')
@Controller('portal/settings/attendance-policy')
@Public()
@SkipRateLimit()
@UseGuards(InstitutionAuthGuard, InstitutionPermissionsGuard)
export class AttendancePolicyController {
  constructor(private readonly service: AttendancePolicyService) {}

  private ctx(
    principal: InstitutionPrincipal,
    scope: InstitutionScope,
    request: EdrionRequestContext,
  ): PortalActionContext {
    return { principal, scope, request };
  }

  @Get()
  @RequireInstitutionPermissions('institution_settings.view')
  get(
    @CurrentInstitutionPrincipal() principal: InstitutionPrincipal,
    @CurrentScope() scope: InstitutionScope,
    @ReqContext() request: EdrionRequestContext,
  ) {
    return this.service.get(this.ctx(principal, scope, request));
  }

  @Put()
  @RequireInstitutionPermissions('institution_settings.manage')
  put(
    @CurrentInstitutionPrincipal() principal: InstitutionPrincipal,
    @CurrentScope() scope: InstitutionScope,
    @ReqContext() request: EdrionRequestContext,
    @Body(zodBody(attendancePolicyUpsertSchema)) body: AttendancePolicyUpsertInput,
  ) {
    return this.service.put(this.ctx(principal, scope, request), body);
  }
}
