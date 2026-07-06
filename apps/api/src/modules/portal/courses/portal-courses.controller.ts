import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  courseEnrollmentSchema,
  createCourseSchema,
  updateCourseSchema,
  upsertSyllabusSchema,
  type CreateCourseInput,
  type UpdateCourseInput,
  type UpsertSyllabusInput,
} from '@edrion/schemas';
import type { InstitutionPrincipal, InstitutionScope } from '@edrion/auth';
import { Public } from '../../../common/guards/auth.guard';
import { ReqContext, SkipRateLimit } from '../../../common/decorators';
import type { EdrionRequestContext } from '../../../common/request-context';
import { zodBody } from '../../../common/zod-validation.pipe';
import { InstitutionAuthGuard } from '../portal-auth.guard';
import { InstitutionPermissionsGuard } from '../portal-permissions.guard';
import { CurrentInstitutionPrincipal, CurrentScope, RequireInstitutionPermissions } from '../portal.decorators';
import type { CrudListQuery } from '../portal-crud.engine';
import type { PortalActionContext } from '../portal-action-context';
import { PortalCoursesService } from './portal-courses.service';

@ApiTags('portal-courses')
@Controller('portal/courses')
@Public()
@SkipRateLimit()
@UseGuards(InstitutionAuthGuard, InstitutionPermissionsGuard)
export class PortalCoursesController {
  constructor(private readonly svc: PortalCoursesService) {}

  private ctx(p: InstitutionPrincipal, s: InstitutionScope, r: EdrionRequestContext): PortalActionContext {
    return { principal: p, scope: s, request: r };
  }

  @Get()
  @RequireInstitutionPermissions('courses.manage')
  list(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Query() q: CrudListQuery,
  ) {
    return this.svc.list('courses', this.ctx(p, s, r), q);
  }

  @Post()
  @RequireInstitutionPermissions('courses.manage')
  create(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(createCourseSchema)) body: CreateCourseInput,
  ) {
    return this.svc.createCourse(this.ctx(p, s, r), body);
  }

  @Patch(':id')
  @RequireInstitutionPermissions('courses.manage')
  update(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(updateCourseSchema)) body: UpdateCourseInput,
  ) {
    return this.svc.updateCourse(this.ctx(p, s, r), id, body);
  }

  @Get(':id/syllabus')
  @RequireInstitutionPermissions('courses.manage', 'syllabus.manage')
  getSyllabus(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
  ) {
    return this.svc.getSyllabus(this.ctx(p, s, r), id);
  }

  @Post(':id/syllabus')
  @RequireInstitutionPermissions('syllabus.manage')
  syllabus(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(upsertSyllabusSchema)) body: UpsertSyllabusInput,
  ) {
    return this.svc.upsertSyllabus(this.ctx(p, s, r), id, body);
  }

  @Post(':id/enrollments')
  @RequireInstitutionPermissions('courses.manage')
  enroll(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(courseEnrollmentSchema)) body: { studentIds: string[] },
  ) {
    return this.svc.enroll(this.ctx(p, s, r), id, body.studentIds);
  }
}
