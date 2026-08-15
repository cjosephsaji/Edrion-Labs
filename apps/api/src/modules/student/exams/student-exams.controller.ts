import { Body, Controller, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { attemptAnswerUpdateSchema, type AttemptAnswerUpdateInput } from '@edrion/schemas';
import { Public } from '../../../common/guards/auth.guard';
import { SkipRateLimit } from '../../../common/decorators';
import { zodBody } from '../../../common/zod-validation.pipe';
import { StudentAuthGuard } from '../core/student-auth.guard';
import { StudentPermissionsGuard } from '../core/student-permissions.guard';
import { StudentPortalGuard } from '../core/student-portal.guard';
import { CurrentStudent, RequireStudentPermissions } from '../core/student.decorators';
import type { StudentPrincipal } from '../student.types';
import { requireInstitutional } from '../surfaces/surface-gate.service';
import { StudentExamsService } from './student-exams.service';

@ApiTags('student-exams')
@Controller('student/exams')
@Public()
@SkipRateLimit()
@UseGuards(StudentAuthGuard, StudentPermissionsGuard, StudentPortalGuard)
@RequireStudentPermissions('student.exams.view')
export class StudentExamsController {
  constructor(private readonly service: StudentExamsService) {}

  @Get()
  list(@CurrentStudent() principal: StudentPrincipal) {
    requireInstitutional(principal);
    return this.service.list(principal);
  }

  @Get(':scheduleId/paper')
  paper(@CurrentStudent() principal: StudentPrincipal, @Param('scheduleId') scheduleId: string) {
    requireInstitutional(principal);
    return this.service.getPaper(principal, scheduleId);
  }

  @Post(':scheduleId/start')
  start(@CurrentStudent() principal: StudentPrincipal, @Param('scheduleId') scheduleId: string) {
    requireInstitutional(principal);
    return this.service.startAttempt(principal, scheduleId);
  }

  @Put(':scheduleId/answers/:questionId')
  answer(
    @CurrentStudent() principal: StudentPrincipal,
    @Param('scheduleId') scheduleId: string,
    @Param('questionId') questionId: string,
    @Body(zodBody(attemptAnswerUpdateSchema)) body: AttemptAnswerUpdateInput,
  ) {
    requireInstitutional(principal);
    return this.service.saveAnswer(principal, scheduleId, questionId, body);
  }

  @Post(':scheduleId/finish')
  finish(@CurrentStudent() principal: StudentPrincipal, @Param('scheduleId') scheduleId: string) {
    requireInstitutional(principal);
    return this.service.finishAttempt(principal, scheduleId);
  }
}
