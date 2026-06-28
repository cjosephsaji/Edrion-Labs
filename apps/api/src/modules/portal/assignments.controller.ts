import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  assignmentsListQuerySchema,
  createAssignmentSchema,
  gradeSubmissionsSchema,
  updateAssignmentSchema,
  versionedDeleteSchema,
  type AssignmentsListQuery,
  type CreateAssignmentInput,
  type GradeSubmissionsInput,
  type UpdateAssignmentInput,
  type VersionedDeleteInput,
} from '@edrion/schemas';
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
import { AssignmentsService } from './assignments.service';
import type { PortalActionContext } from './portal-action-context';

/**
 * Institution-portal Assignments API (Phase 6) — assignments + per-student submissions. Same
 * boundary as the rest of the portal. Reads need assignments.view; mutations need assignments.manage.
 * Submissions are nested under an assignment.
 */
@ApiTags('portal-assignments')
@Controller('portal/assignments')
@Public()
@SkipRateLimit()
@UseGuards(InstitutionAuthGuard, InstitutionPermissionsGuard)
export class AssignmentsController {
  constructor(private readonly service: AssignmentsService) {}

  private ctx(
    principal: InstitutionPrincipal,
    scope: InstitutionScope,
    request: EdrionRequestContext,
  ): PortalActionContext {
    return { principal, scope, request };
  }

  @Get()
  @RequireInstitutionPermissions('assignments.view')
  list(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Query(zodBody(assignmentsListQuerySchema)) q: AssignmentsListQuery,
  ) {
    return this.service.list(this.ctx(p, s, r), q);
  }

  @Post()
  @RequireInstitutionPermissions('assignments.manage')
  create(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(createAssignmentSchema)) body: CreateAssignmentInput,
  ) {
    return this.service.create(this.ctx(p, s, r), body);
  }

  @Patch(':id')
  @RequireInstitutionPermissions('assignments.manage')
  update(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(updateAssignmentSchema)) body: UpdateAssignmentInput,
  ) {
    return this.service.update(this.ctx(p, s, r), id, body);
  }

  @Delete(':id')
  @RequireInstitutionPermissions('assignments.manage')
  delete(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(versionedDeleteSchema)) body: VersionedDeleteInput,
  ) {
    return this.service.delete(this.ctx(p, s, r), id, body.version);
  }

  // --- submissions -----------------------------------------------------------

  @Get(':id/submissions')
  @RequireInstitutionPermissions('assignments.view')
  listSubmissions(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
  ) {
    return this.service.listSubmissions(this.ctx(p, s, r), id);
  }

  @Post(':id/submissions')
  @RequireInstitutionPermissions('assignments.manage')
  grade(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(gradeSubmissionsSchema)) body: GradeSubmissionsInput,
  ) {
    return this.service.grade(this.ctx(p, s, r), id, body);
  }

  @Delete(':id/submissions/:submissionId')
  @RequireInstitutionPermissions('assignments.manage')
  removeSubmission(
    @Param('id') id: string,
    @Param('submissionId') submissionId: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
  ) {
    return this.service.removeSubmission(this.ctx(p, s, r), id, submissionId);
  }
}
