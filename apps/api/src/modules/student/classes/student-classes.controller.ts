import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../../../common/guards/auth.guard';
import { SkipRateLimit } from '../../../common/decorators';
import { StudentAuthGuard } from '../core/student-auth.guard';
import { StudentPermissionsGuard } from '../core/student-permissions.guard';
import { CurrentStudent, RequireStudentPermissions } from '../core/student.decorators';
import type { StudentPrincipal } from '../student.types';
import { requireInstitutional } from '../surfaces/surface-gate.service';
import { StudentClassesService } from './student-classes.service';

@ApiTags('student-classes')
@Controller('student/classes')
@Public()
@SkipRateLimit()
@UseGuards(StudentAuthGuard, StudentPermissionsGuard)
export class StudentClassesController {
  constructor(private readonly service: StudentClassesService) {}

  @Get()
  @RequireStudentPermissions('student.classes.view')
  list(@CurrentStudent() principal: StudentPrincipal) {
    requireInstitutional(principal);
    return this.service.list(principal);
  }

  @Get(':subjectClassId/stream')
  @RequireStudentPermissions('student.classes.view')
  stream(@CurrentStudent() principal: StudentPrincipal, @Param('subjectClassId') subjectClassId: string) {
    requireInstitutional(principal);
    return this.service.stream(principal, subjectClassId);
  }

  @Get(':subjectClassId/materials')
  @RequireStudentPermissions('student.classes.view')
  materials(@CurrentStudent() principal: StudentPrincipal, @Param('subjectClassId') subjectClassId: string) {
    requireInstitutional(principal);
    return this.service.materials(principal, subjectClassId);
  }

  @Get(':subjectClassId/homework')
  @RequireStudentPermissions('student.classes.view')
  homework(@CurrentStudent() principal: StudentPrincipal, @Param('subjectClassId') subjectClassId: string) {
    requireInstitutional(principal);
    return this.service.homework(principal, subjectClassId);
  }

  @Get(':subjectClassId/about')
  @RequireStudentPermissions('student.classes.view')
  about(@CurrentStudent() principal: StudentPrincipal, @Param('subjectClassId') subjectClassId: string) {
    requireInstitutional(principal);
    return this.service.about(principal, subjectClassId);
  }

  @Post('stream/:postId/ack')
  @RequireStudentPermissions('student.classes.view')
  ack(@CurrentStudent() principal: StudentPrincipal, @Param('postId') postId: string) {
    requireInstitutional(principal);
    return this.service.ack(principal, postId);
  }
}
