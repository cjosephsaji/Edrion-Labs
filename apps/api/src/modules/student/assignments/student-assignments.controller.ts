import { Body, Controller, Get, Inject, Param, ParseUUIDPipe, Post, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import type { ApiEnv } from '@edrion/config';
import { API_ENV } from '../../../common/tokens';
import { LocalDiskDriver } from '../storage/drivers/local-disk.driver';
import { ApiTags } from '@nestjs/swagger';
import {
  assignmentListFilterSchema,
  submitAssignmentSchema,
  type AssignmentListFilter,
  type SubmitAssignmentInput,
} from '@edrion/schemas';
import { Public } from '../../../common/guards/auth.guard';
import { SkipRateLimit } from '../../../common/decorators';
import { zodBody } from '../../../common/zod-validation.pipe';
import { StudentAuthGuard } from '../core/student-auth.guard';
import { StudentPermissionsGuard } from '../core/student-permissions.guard';
import { StudentPortalGuard } from '../core/student-portal.guard';
import { CurrentStudent, RequireStudentPermissions } from '../core/student.decorators';
import type { StudentPrincipal } from '../student.types';
import { requireInstitutional } from '../surfaces/surface-gate.service';
import { StudentAssignmentsService } from './student-assignments.service';

@ApiTags('student-assignments')
@Controller('student/assignments')
@Public()
@SkipRateLimit()
@UseGuards(StudentAuthGuard, StudentPermissionsGuard, StudentPortalGuard)
export class StudentAssignmentsController {
  private readonly driver: LocalDiskDriver;
  constructor(private readonly service: StudentAssignmentsService, @Inject(API_ENV) env: ApiEnv) {
    this.driver = new LocalDiskDriver(env);
  }

  @Get('learning-goals/:id/files/:objectId')
  @RequireStudentPermissions('student.learn.use')
  async learningGoalFile(@CurrentStudent() principal: StudentPrincipal,
    @Param('id', ParseUUIDPipe) id: string, @Param('objectId', ParseUUIDPipe) objectId: string, @Res() res: Response) {
    requireInstitutional(principal);
    const file = await this.service.learningGoalFile(principal, id, objectId);
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, no-store');
    res.attachment(file.filename ?? 'Teacher file');
    const stream = this.driver.stream(file.storageKey);
    stream.on('error', () => { if (!res.headersSent) res.status(404).end(); else res.destroy(); });
    stream.pipe(res);
  }

  @Get('learning-goals')
  @RequireStudentPermissions('student.learn.use')
  learningGoals(@CurrentStudent() principal: StudentPrincipal) {
    requireInstitutional(principal);
    return this.service.list(principal, 'progress', true);
  }

  @Get('learning-goals/:id')
  @RequireStudentPermissions('student.learn.use')
  learningGoal(@CurrentStudent() principal: StudentPrincipal, @Param('id') id: string) {
    requireInstitutional(principal);
    return this.service.learningGoal(principal, id);
  }

  @Post('learning-goals/:id/completion')
  @RequireStudentPermissions('student.learn.use')
  reportLearningGoal(@CurrentStudent() principal: StudentPrincipal, @Param('id') id: string,
    @Body(zodBody(submitAssignmentSchema)) body: SubmitAssignmentInput) {
    requireInstitutional(principal);
    return this.service.reportLearningGoal(principal, id, body);
  }

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
}
