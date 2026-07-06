import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
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
import { StudentPortalInviteService } from './student-portal.service';
import { PortalLearningSummaryService } from './report-cards/portal-report-cards.service';

const studentPortalInviteSchema = z
  .object({
    targetEmail: z.string().email().optional(),
    guardianParentId: z.string().uuid().optional(),
  })
  .refine((v) => Boolean(v.targetEmail) !== Boolean(v.guardianParentId), {
    message: 'Provide exactly one of targetEmail or guardianParentId',
  });

const setSurfaceSchema = z.object({
  value: z.boolean(),
});

@ApiTags('portal-student-portal')
@Controller('portal/student-portal')
@Public()
@SkipRateLimit()
@UseGuards(InstitutionAuthGuard, InstitutionPermissionsGuard)
export class StudentPortalController {
  constructor(private readonly service: StudentPortalInviteService) {}

  @Get('surfaces')
  @RequireInstitutionPermissions('student_portal.manage')
  listSurfaces(@CurrentInstitutionPrincipal() p: InstitutionPrincipal) {
    return this.service.listSurfaces(p.institutionId);
  }

  @Patch('surfaces/:featureFlagKey')
  @RequireInstitutionPermissions('student_portal.manage')
  setSurface(
    @Param('featureFlagKey') featureFlagKey: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @Body(zodBody(setSurfaceSchema)) body: z.infer<typeof setSurfaceSchema>,
  ) {
    return this.service.setSurface(p.institutionId, featureFlagKey, body.value, p.fullName);
  }
}

@ApiTags('portal-student-portal')
@Controller('portal/students')
@Public()
@SkipRateLimit()
@UseGuards(InstitutionAuthGuard, InstitutionPermissionsGuard)
export class StudentPortalStudentsController {
  constructor(
    private readonly service: StudentPortalInviteService,
    private readonly learningSummaryService: PortalLearningSummaryService,
  ) {}

  private ctx(
    principal: InstitutionPrincipal,
    scope: InstitutionScope,
    request: EdrionRequestContext,
  ): PortalActionContext {
    return { principal, scope, request };
  }

  @Post(':id/portal-invite')
  @RequireInstitutionPermissions('student_portal.manage')
  invite(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(studentPortalInviteSchema)) body: z.infer<typeof studentPortalInviteSchema>,
  ) {
    return this.service.inviteStudent(this.ctx(p, s, r), id, body);
  }

  @Get(':id/learning-summary')
  @RequireInstitutionPermissions('students.view')
  getLearningSummary(@Param('id') id: string) {
    return this.learningSummaryService.getSummary(id);
  }
}
