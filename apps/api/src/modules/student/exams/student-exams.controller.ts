import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { createExamGoalSchema, updateExamGoalSchema, type CreateExamGoalInput, type UpdateExamGoalInput } from '@edrion/schemas';
import { Public } from '../../../common/guards/auth.guard';
import { SkipRateLimit } from '../../../common/decorators';
import { zodBody } from '../../../common/zod-validation.pipe';
import { StudentAuthGuard } from '../core/student-auth.guard';
import { StudentPermissionsGuard } from '../core/student-permissions.guard';
import { CurrentStudent, RequireStudentPermissions } from '../core/student.decorators';
import type { StudentPrincipal } from '../student.types';
import { requireInstitutional } from '../surfaces/surface-gate.service';
import { StudentExamsService } from './student-exams.service';

@ApiTags('student-exams')
@Controller('student')
@Public()
@SkipRateLimit()
@UseGuards(StudentAuthGuard, StudentPermissionsGuard)
export class StudentExamsController {
  constructor(private readonly service: StudentExamsService) {}

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
}
