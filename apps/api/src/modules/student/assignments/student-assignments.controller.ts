import { Body, Controller, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  assignmentListFilterSchema,
  attemptAnswerUpdateSchema,
  submitAssignmentSchema,
  type AssignmentListFilter,
  type AttemptAnswerUpdateInput,
  type SubmitAssignmentInput,
} from '@edrion/schemas';
import { Public } from '../../../common/guards/auth.guard';
import { SkipRateLimit } from '../../../common/decorators';
import { zodBody } from '../../../common/zod-validation.pipe';
import { StudentAuthGuard } from '../core/student-auth.guard';
import { StudentPermissionsGuard } from '../core/student-permissions.guard';
import { CurrentStudent, RequireStudentPermissions } from '../core/student.decorators';
import type { StudentPrincipal } from '../student.types';
import { requireInstitutional } from '../surfaces/surface-gate.service';
import { StudentAssignmentsService } from './student-assignments.service';
import { StudentQuizAttemptService } from '../quiz-attempt.service';

@ApiTags('student-assignments')
@Controller('student/assignments')
@Public()
@SkipRateLimit()
@UseGuards(StudentAuthGuard, StudentPermissionsGuard)
export class StudentAssignmentsController {
  constructor(
    private readonly service: StudentAssignmentsService,
    private readonly quiz: StudentQuizAttemptService,
  ) {}

  @Get()
  @RequireStudentPermissions('student.assignments.view')
  list(@CurrentStudent() principal: StudentPrincipal, @Query('filter') filterRaw?: string) {
    requireInstitutional(principal);
    const filter = assignmentListFilterSchema.catch('all').parse(filterRaw ?? 'all') as AssignmentListFilter;
    return this.service.list(principal, filter);
  }

  @Get(':id')
  @RequireStudentPermissions('student.assignments.view')
  detail(@CurrentStudent() principal: StudentPrincipal, @Param('id') id: string) {
    requireInstitutional(principal);
    return this.service.detail(principal, id);
  }

  @Post(':id/submissions')
  @RequireStudentPermissions('student.assignments.submit')
  submit(
    @CurrentStudent() principal: StudentPrincipal,
    @Param('id') id: string,
    @Body(zodBody(submitAssignmentSchema)) body: SubmitAssignmentInput,
  ) {
    requireInstitutional(principal);
    return this.service.submit(principal, id, body);
  }

  // --- quiz-mode attempts ----------------------------------------------------

  @Get(':id/quiz')
  @RequireStudentPermissions('student.assignments.view')
  getQuiz(@CurrentStudent() principal: StudentPrincipal, @Param('id') id: string) {
    requireInstitutional(principal);
    return this.quiz.getAssignmentQuiz(principal, id);
  }

  @Post(':id/quiz/start')
  @RequireStudentPermissions('student.assignments.submit')
  startQuiz(@CurrentStudent() principal: StudentPrincipal, @Param('id') id: string) {
    requireInstitutional(principal);
    return this.quiz.startAssignmentAttempt(principal, id);
  }

  @Put(':id/quiz/answers/:questionId')
  @RequireStudentPermissions('student.assignments.submit')
  saveQuizAnswer(
    @CurrentStudent() principal: StudentPrincipal,
    @Param('id') id: string,
    @Param('questionId') questionId: string,
    @Body(zodBody(attemptAnswerUpdateSchema)) body: AttemptAnswerUpdateInput,
  ) {
    requireInstitutional(principal);
    return this.quiz.saveAssignmentAnswer(principal, id, questionId, body);
  }

  @Post(':id/quiz/finish')
  @RequireStudentPermissions('student.assignments.submit')
  finishQuiz(@CurrentStudent() principal: StudentPrincipal, @Param('id') id: string) {
    requireInstitutional(principal);
    return this.quiz.finishAssignmentAttempt(principal, id);
  }
}
