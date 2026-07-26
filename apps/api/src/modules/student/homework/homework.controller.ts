import { Body, Controller, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  homeworkListFilterSchema,
  upsertHomeworkAnswerSchema,
  type HomeworkListFilter,
  type UpsertHomeworkAnswerInput,
} from '@edrion/schemas';
import { Public } from '../../../common/guards/auth.guard';
import { SkipRateLimit } from '../../../common/decorators';
import { zodBody } from '../../../common/zod-validation.pipe';
import { StudentAuthGuard } from '../core/student-auth.guard';
import { StudentPermissionsGuard } from '../core/student-permissions.guard';
import { CurrentStudent, RequireStudentPermissions } from '../core/student.decorators';
import type { InstitutionalStudentPrincipal, StudentPrincipal } from '../student.types';
import { requireInstitutional } from '../surfaces/surface-gate.service';
import { StudentHomeworkService } from './homework.service';

@ApiTags('student-homework')
@Controller('student/homework')
@Public()
@SkipRateLimit()
@UseGuards(StudentAuthGuard, StudentPermissionsGuard)
export class StudentHomeworkController {
  constructor(private readonly service: StudentHomeworkService) {}

  @Get()
  @RequireStudentPermissions('student.homework.view')
  list(
    @CurrentStudent() principal: StudentPrincipal,
    @Query('filter') filterRaw?: string,
  ) {
    requireInstitutional(principal);
    const filter = homeworkListFilterSchema.catch('all').parse(filterRaw ?? 'all') as HomeworkListFilter;
    return this.service.list(principal, filter);
  }

  @Get(':id')
  @RequireStudentPermissions('student.homework.view')
  detail(@CurrentStudent() principal: StudentPrincipal, @Param('id') id: string) {
    requireInstitutional(principal);
    return this.service.detail(principal, id);
  }

  @Put(':id/answers/:questionId')
  @RequireStudentPermissions('student.homework.submit')
  upsertAnswer(
    @CurrentStudent() principal: StudentPrincipal,
    @Param('id') id: string,
    @Param('questionId') questionId: string,
    @Body(zodBody(upsertHomeworkAnswerSchema)) body: UpsertHomeworkAnswerInput,
  ) {
    requireInstitutional(principal);
    return this.service.upsertAnswer(principal, id, questionId, body);
  }

  @Post(':id/submit')
  @RequireStudentPermissions('student.homework.submit')
  submit(@CurrentStudent() principal: StudentPrincipal, @Param('id') id: string) {
    requireInstitutional(principal);
    return this.service.submit(principal, id);
  }

  @Get(':id/ai-policy')
  @RequireStudentPermissions('student.homework.view')
  aiPolicy(@CurrentStudent() principal: StudentPrincipal, @Param('id') id: string) {
    requireInstitutional(principal);
    return this.service.aiPolicy(principal as InstitutionalStudentPrincipal, id);
  }
}
