import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import type { InstitutionPrincipal, InstitutionScope } from '@edrion/auth';
import type { PutStudentPortalConfigInput } from '@edrion/schemas';
import { putStudentPortalConfigSchema } from '@edrion/schemas';
import { Public } from '../../common/guards/auth.guard';
import { ReqContext, SkipRateLimit } from '../../common/decorators';
import type { EdrionRequestContext } from '../../common/request-context';
import { zodBody } from '../../common/zod-validation.pipe';
import { InstitutionAuthGuard } from './portal-auth.guard';
import { InstitutionPermissionsGuard } from './portal-permissions.guard';
import { CurrentInstitutionPrincipal, CurrentScope, RequireInstitutionPermissions } from './portal.decorators';
import type { PortalActionContext } from './portal-action-context';
import { StudentPortalConfigService } from './student-portal-config.service';

@Controller('portal/settings/student-portal')
@Public()
@SkipRateLimit()
@UseGuards(InstitutionAuthGuard, InstitutionPermissionsGuard)
export class StudentPortalConfigController {
  constructor(private readonly config: StudentPortalConfigService) {}
  private ctx(p: InstitutionPrincipal, s: InstitutionScope, r: EdrionRequestContext): PortalActionContext { return { principal: p, scope: s, request: r }; }

  @Get()
  @RequireInstitutionPermissions('student_portal.manage')
  get(@CurrentInstitutionPrincipal() p: InstitutionPrincipal, @CurrentScope() s: InstitutionScope, @ReqContext() r: EdrionRequestContext) {
    return this.config.getAdmin(this.ctx(p, s, r));
  }

  @Get('preview-data')
  @RequireInstitutionPermissions('student_portal.manage')
  preview() {
    return { greeting: 'Good morning', due: [{ title: 'Physics assignment', meta: 'Due tomorrow' }], progress: 72 };
  }

  @Put()
  @RequireInstitutionPermissions('student_portal.manage')
  save(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal, @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(putStudentPortalConfigSchema)) body: PutStudentPortalConfigInput,
  ) { return this.config.save(this.ctx(p, s, r), body); }
}
