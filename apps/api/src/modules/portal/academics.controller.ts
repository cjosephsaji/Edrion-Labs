import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  academicsListQuerySchema,
  applyCurriculumSchema,
  assignClassSubjectSchema,
  createAcademicYearSchema,
  createAcademicTermSchema,
  createClassSchema,
  createDepartmentSchema,
  createDepartmentGradeLevelSchema,
  createGradeLevelSchema,
  createProgrammeSubjectSchema,
  createSubjectSchema,
  rosterCandidateQuerySchema,
  updateAcademicYearSchema,
  updateAcademicTermSchema,
  updateClassSchema,
  updateClassRosterSchema,
  updateDepartmentSchema,
  updateDepartmentGradeLevelSchema,
  updateGradeLevelSchema,
  updateProgrammeSubjectSchema,
  programmeStructureQuerySchema,
  updateSubjectSchema,
  versionedDeleteSchema,
  type AcademicsListQuery,
  type ApplyCurriculumInput,
  type AssignClassSubjectInput,
  type CreateAcademicYearInput,
  type CreateAcademicTermInput,
  type CreateClassInput,
  type CreateDepartmentInput,
  type CreateDepartmentGradeLevelInput,
  type CreateGradeLevelInput,
  type CreateProgrammeSubjectInput,
  type CreateSubjectInput,
  type RosterCandidateQuery,
  type UpdateAcademicYearInput,
  type UpdateAcademicTermInput,
  type UpdateClassInput,
  type UpdateClassRosterInput,
  type UpdateDepartmentInput,
  type UpdateDepartmentGradeLevelInput,
  type UpdateGradeLevelInput,
  type UpdateProgrammeSubjectInput,
  type ProgrammeStructureQuery,
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

  // === academic terms ========================================================

  @Get('academic-terms')
  @RequireInstitutionPermissions('academics.view')
  listAcademicTerms(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Query(zodBody(academicsListQuerySchema)) q: AcademicsListQuery,
  ) {
    return this.service.listAcademicTerms(this.ctx(p, s, r), q);
  }

  @Post('academic-terms')
  @RequireInstitutionPermissions('academics.manage')
  createAcademicTerm(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(createAcademicTermSchema)) body: CreateAcademicTermInput,
  ) {
    return this.service.createAcademicTerm(this.ctx(p, s, r), body);
  }

  @Patch('academic-terms/:id')
  @RequireInstitutionPermissions('academics.manage')
  updateAcademicTerm(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(updateAcademicTermSchema)) body: UpdateAcademicTermInput,
  ) {
    return this.service.updateAcademicTerm(this.ctx(p, s, r), id, body);
  }

  @Delete('academic-terms/:id')
  @RequireInstitutionPermissions('academics.manage')
  deleteAcademicTerm(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(versionedDeleteSchema)) body: VersionedDeleteInput,
  ) {
    return this.service.deleteAcademicTerm(this.ctx(p, s, r), id, body.version);
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

  // === department grade levels (programme ↔ year) =============================

  @Get('department-grade-levels')
  @RequireInstitutionPermissions('academics.view')
  listDepartmentGradeLevels(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Query(zodBody(academicsListQuerySchema)) q: AcademicsListQuery,
  ) {
    return this.service.listDepartmentGradeLevels(this.ctx(p, s, r), q);
  }

  @Post('department-grade-levels')
  @RequireInstitutionPermissions('academics.manage')
  createDepartmentGradeLevel(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(createDepartmentGradeLevelSchema)) body: CreateDepartmentGradeLevelInput,
  ) {
    return this.service.createDepartmentGradeLevel(this.ctx(p, s, r), body);
  }

  @Patch('department-grade-levels/:id')
  @RequireInstitutionPermissions('academics.manage')
  updateDepartmentGradeLevel(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(updateDepartmentGradeLevelSchema)) body: UpdateDepartmentGradeLevelInput,
  ) {
    return this.service.updateDepartmentGradeLevel(this.ctx(p, s, r), id, body);
  }

  @Delete('department-grade-levels/:id')
  @RequireInstitutionPermissions('academics.manage')
  deleteDepartmentGradeLevel(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(versionedDeleteSchema)) body: VersionedDeleteInput,
  ) {
    return this.service.deleteDepartmentGradeLevel(this.ctx(p, s, r), id, body.version);
  }

  @Get('programme-structure')
  @RequireInstitutionPermissions('academics.view')
  getProgrammeStructure(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Query(zodBody(programmeStructureQuerySchema)) q: ProgrammeStructureQuery,
  ) {
    return this.service.getProgrammeStructure(this.ctx(p, s, r), q.departmentId);
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

  // === programme subjects (curriculum) =======================================

  @Get('programme-subjects')
  @RequireInstitutionPermissions('academics.view')
  listProgrammeSubjects(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Query(zodBody(academicsListQuerySchema)) q: AcademicsListQuery,
  ) {
    return this.service.listProgrammeSubjects(this.ctx(p, s, r), q);
  }

  @Post('programme-subjects')
  @RequireInstitutionPermissions('academics.manage')
  createProgrammeSubject(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(createProgrammeSubjectSchema)) body: CreateProgrammeSubjectInput,
  ) {
    return this.service.createProgrammeSubject(this.ctx(p, s, r), body);
  }

  @Patch('programme-subjects/:id')
  @RequireInstitutionPermissions('academics.manage')
  updateProgrammeSubject(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(updateProgrammeSubjectSchema)) body: UpdateProgrammeSubjectInput,
  ) {
    return this.service.updateProgrammeSubject(this.ctx(p, s, r), id, body);
  }

  @Delete('programme-subjects/:id')
  @RequireInstitutionPermissions('academics.manage')
  deleteProgrammeSubject(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(versionedDeleteSchema)) body: VersionedDeleteInput,
  ) {
    return this.service.deleteProgrammeSubject(this.ctx(p, s, r), id, body.version);
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

  @Get('classes/:id/roster')
  @RequireInstitutionPermissions('academics.view')
  listClassRoster(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
  ) {
    return this.service.listClassRoster(this.ctx(p, s, r), id);
  }

  @Get('classes/:id/roster/candidates')
  @RequireInstitutionPermissions('academics.manage')
  listRosterCandidates(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Query(zodBody(rosterCandidateQuerySchema)) q: RosterCandidateQuery,
  ) {
    return this.service.listRosterCandidates(this.ctx(p, s, r), id, q);
  }

  @Patch('classes/:id/roster')
  @RequireInstitutionPermissions('academics.manage')
  updateClassRoster(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(updateClassRosterSchema)) body: UpdateClassRosterInput,
  ) {
    return this.service.updateClassRoster(this.ctx(p, s, r), id, body);
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

  @Get('classes/:id/curriculum')
  @RequireInstitutionPermissions('academics.view')
  listClassCurriculum(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
  ) {
    return this.service.listClassCurriculum(this.ctx(p, s, r), id);
  }

  @Post('classes/:id/curriculum/apply')
  @RequireInstitutionPermissions('academics.manage')
  applyCurriculum(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(applyCurriculumSchema)) body: ApplyCurriculumInput,
  ) {
    return this.service.applyCurriculum(this.ctx(p, s, r), id, body);
  }
}
