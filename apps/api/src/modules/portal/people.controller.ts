import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  assignGuardianSchema,
  createParentSchema,
  createStaffSchema,
  createStudentSchema,
  createTeacherSchema,
  peopleListQuerySchema,
  updateParentSchema,
  updateStaffSchema,
  updateStudentSchema,
  updateTeacherSchema,
  versionedDeleteSchema,
  type AssignGuardianInput,
  type CreateParentInput,
  type CreateStaffInput,
  type CreateStudentInput,
  type CreateTeacherInput,
  type PeopleListQuery,
  type UpdateParentInput,
  type UpdateStaffInput,
  type UpdateStudentInput,
  type UpdateTeacherInput,
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
import { PeopleService } from './people.service';
import type { PortalActionContext } from './portal-action-context';

/**
 * Institution-portal People API (Phase 4) — students, teachers, staff (non-teaching), parents +
 * the student↔guardian links. Same boundary as the rest of the portal: @Public (skips the platform
 * AuthGuard) then InstitutionAuthGuard (identity + scope) → InstitutionPermissionsGuard. Each
 * resource uses its own permission keys: students.{view,create,update,delete}; teachers/staff/parents
 * use {view, manage}. Guardian links are nested under a student and gated by students.{view,update}.
 */
@ApiTags('portal-people')
@Controller('portal/people')
@Public()
@SkipRateLimit()
@UseGuards(InstitutionAuthGuard, InstitutionPermissionsGuard)
export class PeopleController {
  constructor(private readonly service: PeopleService) {}

  private ctx(
    principal: InstitutionPrincipal,
    scope: InstitutionScope,
    request: EdrionRequestContext,
  ): PortalActionContext {
    return { principal, scope, request };
  }

  // === students ==============================================================

  @Get('students')
  @RequireInstitutionPermissions('students.view')
  listStudents(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Query(zodBody(peopleListQuerySchema)) q: PeopleListQuery,
  ) {
    return this.service.listStudents(this.ctx(p, s, r), q);
  }

  @Post('students')
  @RequireInstitutionPermissions('students.create')
  createStudent(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(createStudentSchema)) body: CreateStudentInput,
  ) {
    return this.service.createStudent(this.ctx(p, s, r), body);
  }

  @Patch('students/:id')
  @RequireInstitutionPermissions('students.update')
  updateStudent(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(updateStudentSchema)) body: UpdateStudentInput,
  ) {
    return this.service.updateStudent(this.ctx(p, s, r), id, body);
  }

  @Delete('students/:id')
  @RequireInstitutionPermissions('students.delete')
  deleteStudent(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(versionedDeleteSchema)) body: VersionedDeleteInput,
  ) {
    return this.service.deleteStudent(this.ctx(p, s, r), id, body.version);
  }

  // --- student ↔ guardian links ----------------------------------------------

  @Get('students/:id/guardians')
  @RequireInstitutionPermissions('students.view')
  listGuardians(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
  ) {
    return this.service.listGuardians(this.ctx(p, s, r), id);
  }

  @Post('students/:id/guardians')
  @RequireInstitutionPermissions('students.update')
  assignGuardian(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(assignGuardianSchema)) body: AssignGuardianInput,
  ) {
    return this.service.assignGuardian(this.ctx(p, s, r), id, body);
  }

  @Delete('students/:id/guardians/:linkId')
  @RequireInstitutionPermissions('students.update')
  removeGuardian(
    @Param('id') id: string,
    @Param('linkId') linkId: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
  ) {
    return this.service.removeGuardian(this.ctx(p, s, r), id, linkId);
  }

  // === teachers ==============================================================

  @Get('teachers')
  @RequireInstitutionPermissions('teachers.view')
  listTeachers(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Query(zodBody(peopleListQuerySchema)) q: PeopleListQuery,
  ) {
    return this.service.listTeachers(this.ctx(p, s, r), q);
  }

  @Post('teachers')
  @RequireInstitutionPermissions('teachers.manage')
  createTeacher(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(createTeacherSchema)) body: CreateTeacherInput,
  ) {
    return this.service.createTeacher(this.ctx(p, s, r), body);
  }

  @Patch('teachers/:id')
  @RequireInstitutionPermissions('teachers.manage')
  updateTeacher(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(updateTeacherSchema)) body: UpdateTeacherInput,
  ) {
    return this.service.updateTeacher(this.ctx(p, s, r), id, body);
  }

  @Delete('teachers/:id')
  @RequireInstitutionPermissions('teachers.manage')
  deleteTeacher(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(versionedDeleteSchema)) body: VersionedDeleteInput,
  ) {
    return this.service.deleteTeacher(this.ctx(p, s, r), id, body.version);
  }

  // === staff =================================================================

  @Get('staff')
  @RequireInstitutionPermissions('staff.view')
  listStaff(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Query(zodBody(peopleListQuerySchema)) q: PeopleListQuery,
  ) {
    return this.service.listStaff(this.ctx(p, s, r), q);
  }

  @Post('staff')
  @RequireInstitutionPermissions('staff.manage')
  createStaff(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(createStaffSchema)) body: CreateStaffInput,
  ) {
    return this.service.createStaff(this.ctx(p, s, r), body);
  }

  @Patch('staff/:id')
  @RequireInstitutionPermissions('staff.manage')
  updateStaff(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(updateStaffSchema)) body: UpdateStaffInput,
  ) {
    return this.service.updateStaff(this.ctx(p, s, r), id, body);
  }

  @Delete('staff/:id')
  @RequireInstitutionPermissions('staff.manage')
  deleteStaff(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(versionedDeleteSchema)) body: VersionedDeleteInput,
  ) {
    return this.service.deleteStaff(this.ctx(p, s, r), id, body.version);
  }

  // === parents ===============================================================

  @Get('parents')
  @RequireInstitutionPermissions('parents.view')
  listParents(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Query(zodBody(peopleListQuerySchema)) q: PeopleListQuery,
  ) {
    return this.service.listParents(this.ctx(p, s, r), q);
  }

  @Post('parents')
  @RequireInstitutionPermissions('parents.manage')
  createParent(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(createParentSchema)) body: CreateParentInput,
  ) {
    return this.service.createParent(this.ctx(p, s, r), body);
  }

  @Patch('parents/:id')
  @RequireInstitutionPermissions('parents.manage')
  updateParent(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(updateParentSchema)) body: UpdateParentInput,
  ) {
    return this.service.updateParent(this.ctx(p, s, r), id, body);
  }

  @Delete('parents/:id')
  @RequireInstitutionPermissions('parents.manage')
  deleteParent(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(versionedDeleteSchema)) body: VersionedDeleteInput,
  ) {
    return this.service.deleteParent(this.ctx(p, s, r), id, body.version);
  }
}
