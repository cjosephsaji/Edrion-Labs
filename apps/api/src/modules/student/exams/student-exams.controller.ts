import { Body, Controller, Get, Param, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  attemptAnswerUpdateSchema,
  createExamGoalSchema,
  updateExamGoalSchema,
  type AttemptAnswerUpdateInput,
  type CreateExamGoalInput,
  type UpdateExamGoalInput,
} from '@edrion/schemas';
import { Public } from '../../../common/guards/auth.guard';
import { SkipRateLimit } from '../../../common/decorators';
import { zodBody } from '../../../common/zod-validation.pipe';
import { StudentAuthGuard } from '../core/student-auth.guard';
import { StudentPermissionsGuard } from '../core/student-permissions.guard';
import { CurrentStudent, RequireStudentPermissions } from '../core/student.decorators';
import type { StudentPrincipal } from '../student.types';
import { requireInstitutional } from '../surfaces/surface-gate.service';
import { StudentExamsService } from './student-exams.service';
import { StudentQuizAttemptService } from '../quiz-attempt.service';

@ApiTags('student-exams')
@Controller('student')
@Public()
@SkipRateLimit()
@UseGuards(StudentAuthGuard, StudentPermissionsGuard)
export class StudentExamsController {
  constructor(
    private readonly service: StudentExamsService,
    private readonly quiz: StudentQuizAttemptService,
  ) {}

  @Get('exams')
  @RequireStudentPermissions('student.exams.view')
  exams(@CurrentStudent() principal: StudentPrincipal) {
    requireInstitutional(principal);
    return this.service.listInstitutional(principal);
  }

  @Get('exam-goals')
  @RequireStudentPermissions('student.exams.view')
  goals(@CurrentStudent() principal: StudentPrincipal) {
    if (principal.kind !== 'independent') return { items: [] };
    return this.service.listGoals(principal);
  }

  @Post('exam-goals')
  @RequireStudentPermissions('student.exams.view')
  createGoal(@CurrentStudent() principal: StudentPrincipal, @Body(zodBody(createExamGoalSchema)) body: CreateExamGoalInput) {
    if (principal.kind !== 'independent') return { items: [] };
    return this.service.createGoal(principal, body);
  }

  @Patch('exam-goals/:id')
  @RequireStudentPermissions('student.exams.view')
  updateGoal(
    @CurrentStudent() principal: StudentPrincipal,
    @Param('id') id: string,
    @Body(zodBody(updateExamGoalSchema)) body: UpdateExamGoalInput,
  ) {
    if (principal.kind !== 'independent') return { items: [] };
    return this.service.updateGoal(principal, id, body);
  }

  // --- online exam attempts --------------------------------------------------

  @Get('exam-papers/:scheduleId')
  @RequireStudentPermissions('student.exams.view')
  getPaper(@CurrentStudent() principal: StudentPrincipal, @Param('scheduleId') scheduleId: string) {
    requireInstitutional(principal);
    return this.quiz.getExamPaper(principal, scheduleId);
  }

  @Post('exam-papers/:scheduleId/start')
  @RequireStudentPermissions('student.exams.view')
  startAttempt(@CurrentStudent() principal: StudentPrincipal, @Param('scheduleId') scheduleId: string) {
    requireInstitutional(principal);
    return this.quiz.startExamAttempt(principal, scheduleId);
  }

  @Put('exam-papers/:scheduleId/answers/:questionId')
  @RequireStudentPermissions('student.exams.view')
  saveAnswer(
    @CurrentStudent() principal: StudentPrincipal,
    @Param('scheduleId') scheduleId: string,
    @Param('questionId') questionId: string,
    @Body(zodBody(attemptAnswerUpdateSchema)) body: AttemptAnswerUpdateInput,
  ) {
    requireInstitutional(principal);
    return this.quiz.saveExamAnswer(principal, scheduleId, questionId, body);
  }

  @Post('exam-papers/:scheduleId/finish')
  @RequireStudentPermissions('student.exams.view')
  finishAttempt(@CurrentStudent() principal: StudentPrincipal, @Param('scheduleId') scheduleId: string) {
    requireInstitutional(principal);
    return this.quiz.finishExamAttempt(principal, scheduleId);
  }
}
