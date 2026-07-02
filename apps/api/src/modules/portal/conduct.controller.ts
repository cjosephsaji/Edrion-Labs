import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  conductListQuerySchema,
  createStudentIncidentSchema,
  updateStudentIncidentSchema,
  versionedDeleteSchema,
  type ConductListQuery,
  type CreateStudentIncidentInput,
  type UpdateStudentIncidentInput,
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
import { ConductService } from './conduct.service';
import type { PortalActionContext } from './portal-action-context';

/**
 * Institution-portal student conduct API (behaviour incidents + complaints). Reads need
 * `student_conduct.view`; create/update/delete the sensitive `student_conduct.manage`.
 */
@ApiTags('portal-conduct')
@Controller('portal/conduct')
@Public()
@SkipRateLimit()
@UseGuards(InstitutionAuthGuard, InstitutionPermissionsGuard)
export class ConductController {
  constructor(private readonly svc: ConductService) {}

  private ctx(p: InstitutionPrincipal, s: InstitutionScope, r: EdrionRequestContext): PortalActionContext {
    return { principal: p, scope: s, request: r };
  }

  @Get()
  @RequireInstitutionPermissions('student_conduct.view')
  list(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Query(zodBody(conductListQuerySchema)) q: ConductListQuery,
  ) {
    return this.svc.list(this.ctx(p, s, r), q);
  }

  @Post()
  @RequireInstitutionPermissions('student_conduct.manage')
  create(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(createStudentIncidentSchema)) body: CreateStudentIncidentInput,
  ) {
    return this.svc.create(this.ctx(p, s, r), body);
  }

  @Patch(':id')
  @RequireInstitutionPermissions('student_conduct.manage')
  update(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(updateStudentIncidentSchema)) body: UpdateStudentIncidentInput,
  ) {
    return this.svc.update(this.ctx(p, s, r), id, body);
  }

  @Delete(':id')
  @RequireInstitutionPermissions('student_conduct.manage')
  remove(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(versionedDeleteSchema)) body: VersionedDeleteInput,
  ) {
    return this.svc.remove(this.ctx(p, s, r), id, body.version);
  }
}
