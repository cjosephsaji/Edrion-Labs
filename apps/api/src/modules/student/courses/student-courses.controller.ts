import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../../../common/guards/auth.guard';
import { SkipRateLimit } from '../../../common/decorators';
import { StudentAuthGuard } from '../core/student-auth.guard';
import { StudentPermissionsGuard } from '../core/student-permissions.guard';
import { CurrentStudent, RequireStudentPermissions } from '../core/student.decorators';
import type { StudentPrincipal } from '../student.types';
import { requireInstitutional } from '../surfaces/surface-gate.service';
import { StudentCoursesService } from './student-courses.service';

@ApiTags('student-courses')
@Controller('student/courses')
@Public()
@SkipRateLimit()
@UseGuards(StudentAuthGuard, StudentPermissionsGuard)
export class StudentCoursesController {
  constructor(private readonly service: StudentCoursesService) {}

  @Get()
  @RequireStudentPermissions('student.courses.view')
  list(@CurrentStudent() principal: StudentPrincipal) {
    requireInstitutional(principal);
    return this.service.list(principal);
  }

  @Get(':id/announcements')
  @RequireStudentPermissions('student.courses.view')
  announcements(@CurrentStudent() principal: StudentPrincipal, @Param('id') id: string) {
    requireInstitutional(principal);
    return this.service.announcements(principal, id);
  }

  @Get(':id/syllabus')
  @RequireStudentPermissions('student.courses.view')
  syllabus(@CurrentStudent() principal: StudentPrincipal, @Param('id') id: string) {
    requireInstitutional(principal);
    return this.service.syllabus(principal, id);
  }

  @Get(':id/materials')
  @RequireStudentPermissions('student.courses.view')
  materials(@CurrentStudent() principal: StudentPrincipal, @Param('id') id: string) {
    requireInstitutional(principal);
    return this.service.materials(principal, id);
  }

  @Get(':id/projects')
  @RequireStudentPermissions('student.courses.view')
  projects(@CurrentStudent() principal: StudentPrincipal, @Param('id') id: string) {
    requireInstitutional(principal);
    return this.service.projects(principal, id);
  }

  @Get(':id/about')
  @RequireStudentPermissions('student.courses.view')
  about(@CurrentStudent() principal: StudentPrincipal, @Param('id') id: string) {
    requireInstitutional(principal);
    return this.service.about(principal, id);
  }
}
