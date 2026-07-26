import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { InstitutionPrincipal, InstitutionScope } from '@edrion/auth';
import { Public } from '../../common/guards/auth.guard';
import { ReqContext, SkipRateLimit } from '../../common/decorators';
import type { EdrionRequestContext } from '../../common/request-context';
import { InstitutionAuthGuard } from './portal-auth.guard';
import { InstitutionPermissionsGuard } from './portal-permissions.guard';
import { CurrentInstitutionPrincipal, CurrentScope, RequireInstitutionPermissions } from './portal.decorators';
import { StudentProfileService } from './student-profile.service';

/**
 * Student-360 profile API. `students.view` opens the profile; each aggregated section is
 * additionally gated inside the service by the caller's own permissions.
 */
@ApiTags('portal-student-profile')
@Controller('portal/students')
@Public()
@SkipRateLimit()
@UseGuards(InstitutionAuthGuard, InstitutionPermissionsGuard)
export class StudentProfileController {
  constructor(private readonly svc: StudentProfileService) {}

  @Get(':id/profile')
  @RequireInstitutionPermissions('students.view')
  profile(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
  ) {
    return this.svc.profile({ principal: p, scope: s, request: r }, id);
  }
}
