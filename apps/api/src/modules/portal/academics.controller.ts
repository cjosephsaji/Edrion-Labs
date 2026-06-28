import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  academicsListQuerySchema,
  assignClassSubjectSchema,
  createAcademicYearSchema,
  createClassSchema,
  createDepartmentSchema,
  createGradeLevelSchema,
  createSubjectSchema,
  updateAcademicYearSchema,
  updateClassSchema,
  updateDepartmentSchema,
  updateGradeLevelSchema,
  updateSubjectSchema,
  versionedDeleteSchema,
  type AcademicsListQuery,
  type AssignClassSubjectInput,
  type CreateAcademicYearInput,
  type CreateClassInput,
  type CreateDepartmentInput,
  type CreateGradeLevelInput,
  type CreateSubjectInput,
  type UpdateAcademicYearInput,
  type UpdateClassInput,
  type UpdateDepartmentInput,
  type UpdateGradeLevelInput,
  type UpdateSubjectInput,
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
import { AcademicsService } from './academics.service';
import type { PortalActionContext } from './portal-action-context';

/**
 * Institution-portal Academics API (Phase 2) — academic years, departments, grade levels,
 * subjects, classes/sections + class↔subject↔teacher assignments. Same boundary as the rest of
 * the portal: @Public (skips the platform AuthGuard) then InstitutionAuthGuard (identity + scope)
 * → InstitutionPermissionsGuard (academics.view to read, academics.manage to mutate). The active
 * campus scope rides on every request and narrows every query in the service.
 */
@ApiTags('portal-academics')
@Controller('portal/academics')
@Public()
@SkipRateLimit()
@UseGuards(InstitutionAuthGuard, InstitutionPermissionsGuard)
export class AcademicsController {
  constructor(private readonly service: AcademicsService) {}

  private ctx(
    principal: InstitutionPrincipal,
    scope: InstitutionScope,
    request: EdrionRequestContext,
  ): PortalActionContext {
    return { principal, scope, request };
  }

  // === academic years ========================================================

  @Get('academic-years')
  @RequireInstitutionPermissions('academics.view')
  listAcademicYears(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Query(zodBody(academicsListQuerySchema)) q: AcademicsListQuery,
  ) {
    return this.service.listAcademicYears(this.ctx(p, s, r), q);
  }

  @Post('academic-years')
  @RequireInstitutionPermissions('academics.manage')
  createAcademicYear(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(createAcademicYearSchema)) body: CreateAcademicYearInput,
  ) {
    return this.service.createAcademicYear(this.ctx(p, s, r), body);
  }

  @Patch('academic-years/:id')
  @RequireInstitutionPermissions('academics.manage')
  updateAcademicYear(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(updateAcademicYearSchema)) body: UpdateAcademicYearInput,
  ) {
    return this.service.updateAcademicYear(this.ctx(p, s, r), id, body);
  }

  @Delete('academic-years/:id')
  @RequireInstitutionPermissions('academics.manage')
  deleteAcademicYear(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(versionedDeleteSchema)) body: VersionedDeleteInput,
  ) {
    return this.service.deleteAcademicYear(this.ctx(p, s, r), id, body.version);
  }

  // === departments ===========================================================

  @Get('departments')
  @RequireInstitutionPermissions('academics.view')
  listDepartments(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Query(zodBody(academicsListQuerySchema)) q: AcademicsListQuery,
  ) {
    return this.service.listDepartments(this.ctx(p, s, r), q);
  }

  @Post('departments')
  @RequireInstitutionPermissions('academics.manage')
  createDepartment(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(createDepartmentSchema)) body: CreateDepartmentInput,
  ) {
    return this.service.createDepartment(this.ctx(p, s, r), body);
  }

  @Patch('departments/:id')
  @RequireInstitutionPermissions('academics.manage')
  updateDepartment(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(updateDepartmentSchema)) body: UpdateDepartmentInput,
  ) {
    return this.service.updateDepartment(this.ctx(p, s, r), id, body);
  }

  @Delete('departments/:id')
  @RequireInstitutionPermissions('academics.manage')
  deleteDepartment(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(versionedDeleteSchema)) body: VersionedDeleteInput,
  ) {
    return this.service.deleteDepartment(this.ctx(p, s, r), id, body.version);
  }

  // === grade levels ==========================================================

  @Get('grade-levels')
  @RequireInstitutionPermissions('academics.view')
  listGradeLevels(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Query(zodBody(academicsListQuerySchema)) q: AcademicsListQuery,
  ) {
    return this.service.listGradeLevels(this.ctx(p, s, r), q);
  }

  @Post('grade-levels')
  @RequireInstitutionPermissions('academics.manage')
  createGradeLevel(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(createGradeLevelSchema)) body: CreateGradeLevelInput,
  ) {
    return this.service.createGradeLevel(this.ctx(p, s, r), body);
  }

  @Patch('grade-levels/:id')
  @RequireInstitutionPermissions('academics.manage')
  updateGradeLevel(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(updateGradeLevelSchema)) body: UpdateGradeLevelInput,
  ) {
    return this.service.updateGradeLevel(this.ctx(p, s, r), id, body);
  }

  @Delete('grade-levels/:id')
  @RequireInstitutionPermissions('academics.manage')
  deleteGradeLevel(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(versionedDeleteSchema)) body: VersionedDeleteInput,
  ) {
    return this.service.deleteGradeLevel(this.ctx(p, s, r), id, body.version);
  }

  // === subjects ==============================================================

  @Get('subjects')
  @RequireInstitutionPermissions('academics.view')
  listSubjects(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Query(zodBody(academicsListQuerySchema)) q: AcademicsListQuery,
  ) {
    return this.service.listSubjects(this.ctx(p, s, r), q);
  }

  @Post('subjects')
  @RequireInstitutionPermissions('academics.manage')
  createSubject(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(createSubjectSchema)) body: CreateSubjectInput,
  ) {
    return this.service.createSubject(this.ctx(p, s, r), body);
  }

  @Patch('subjects/:id')
  @RequireInstitutionPermissions('academics.manage')
  updateSubject(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(updateSubjectSchema)) body: UpdateSubjectInput,
  ) {
    return this.service.updateSubject(this.ctx(p, s, r), id, body);
  }

  @Delete('subjects/:id')
  @RequireInstitutionPermissions('academics.manage')
  deleteSubject(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(versionedDeleteSchema)) body: VersionedDeleteInput,
  ) {
    return this.service.deleteSubject(this.ctx(p, s, r), id, body.version);
  }

  // === classes / sections ====================================================

  @Get('classes')
  @RequireInstitutionPermissions('academics.view')
  listClasses(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Query(zodBody(academicsListQuerySchema)) q: AcademicsListQuery,
  ) {
    return this.service.listClasses(this.ctx(p, s, r), q);
  }

  @Post('classes')
  @RequireInstitutionPermissions('academics.manage')
  createClass(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(createClassSchema)) body: CreateClassInput,
  ) {
    return this.service.createClass(this.ctx(p, s, r), body);
  }

  @Patch('classes/:id')
  @RequireInstitutionPermissions('academics.manage')
  updateClass(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(updateClassSchema)) body: UpdateClassInput,
  ) {
    return this.service.updateClass(this.ctx(p, s, r), id, body);
  }

  @Delete('classes/:id')
  @RequireInstitutionPermissions('academics.manage')
  deleteClass(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(versionedDeleteSchema)) body: VersionedDeleteInput,
  ) {
    return this.service.deleteClass(this.ctx(p, s, r), id, body.version);
  }

  // --- class ↔ subject ↔ teacher --------------------------------------------

  @Get('classes/:id/subjects')
  @RequireInstitutionPermissions('academics.view')
  listClassSubjects(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
  ) {
    return this.service.listClassSubjects(this.ctx(p, s, r), id);
  }

  @Post('classes/:id/subjects')
  @RequireInstitutionPermissions('academics.manage')
  assignClassSubject(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(assignClassSubjectSchema)) body: AssignClassSubjectInput,
  ) {
    return this.service.assignClassSubject(this.ctx(p, s, r), id, body);
  }

  @Delete('classes/:id/subjects/:assignmentId')
  @RequireInstitutionPermissions('academics.manage')
  removeClassSubject(
    @Param('id') id: string,
    @Param('assignmentId') assignmentId: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
  ) {
    return this.service.removeClassSubject(this.ctx(p, s, r), id, assignmentId);
  }
}
