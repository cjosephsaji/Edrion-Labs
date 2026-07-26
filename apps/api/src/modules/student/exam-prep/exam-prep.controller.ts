import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../../../common/guards/auth.guard';
import { SkipRateLimit } from '../../../common/decorators';
import { StudentAuthGuard } from '../core/student-auth.guard';
import { StudentPermissionsGuard } from '../core/student-permissions.guard';
import { CurrentStudent, RequireStudentPermissions } from '../core/student.decorators';
import type { StudentPrincipal } from '../student.types';
import { ExamPrepService } from './exam-prep.service';
import { ExamPrepDiagnosticService } from './exam-prep-diagnostic.service';
import { ExamPrepExamDayService, ExamPrepMockSeasonService } from './exam-prep-phase.service';
import { ExamPrepAdaptiveService } from './exam-prep-adaptive.service';

@ApiTags('student-prep')
@Controller('student/prep')
@Public()
@SkipRateLimit()
@UseGuards(StudentAuthGuard, StudentPermissionsGuard)
@RequireStudentPermissions('student.lab.use')
export class ExamPrepController {
  constructor(
    private readonly prep: ExamPrepService,
    private readonly diagnostic: ExamPrepDiagnosticService,
    private readonly examDay: ExamPrepExamDayService,
    private readonly mockSeason: ExamPrepMockSeasonService,
    private readonly adaptive: ExamPrepAdaptiveService,
  ) {}

  @Get('profiles')
  profiles(@CurrentStudent() p: StudentPrincipal) {
    return this.prep.listProfiles(p);
  }

  @Post('enrollments')
  enroll(@CurrentStudent() p: StudentPrincipal, @Body() body: unknown) {
    return this.prep.enroll(p, body);
  }

  @Get('plan')
  plan(@CurrentStudent() p: StudentPrincipal) {
    return this.prep.currentPlan(p);
  }

  @Post('plan/replan')
  replan(@CurrentStudent() p: StudentPrincipal) {
    return this.prep.replan(p);
  }

  @Get('error-notebook')
  errorNotebook(@CurrentStudent() p: StudentPrincipal) {
    return this.prep.errorNotebook(p);
  }

  @Post('diagnostic/:profileKey/start')
  startDiagnostic(@CurrentStudent() p: StudentPrincipal, @Param('profileKey') profileKey: string) {
    return this.diagnostic.startDiagnostic(p, profileKey);
  }

  @Post('error-notebook/project-from-mocks')
  projectMocks(@CurrentStudent() p: StudentPrincipal) {
    return this.diagnostic.projectWrongAnswers(p);
  }

  @Get('exam-day')
  examDay(@CurrentStudent() p: StudentPrincipal) {
    return this.examDay.examDayCard(p);
  }

  @Post('mock-season/schedule')
  mockSeason(@CurrentStudent() p: StudentPrincipal) {
    return this.mockSeason.scheduleMockSeason(p);
  }

  @Post('plan/blocks/:id/complete')
  completeBlock(@CurrentStudent() p: StudentPrincipal, @Param('id') id: string) {
    return this.prep.completePlanBlock(p, id);
  }

  @Patch('exam-day/checklist')
  examDayChecklist(@CurrentStudent() p: StudentPrincipal, @Body() body: unknown) {
    return this.examDay.updateExamDayChecklist(p, body as { checklist: Array<{ id: string; label: string; done: boolean }> });
  }

  @Post('error-notebook/:id/reattempt')
  reattempt(@CurrentStudent() p: StudentPrincipal, @Param('id') id: string) {
    return this.prep.reattemptNotebookEntry(p, id);
  }

  @Post('mock-season/module-submit')
  moduleSubmit(@CurrentStudent() p: StudentPrincipal, @Body() body: unknown) {
    return this.adaptive.routeSatModule(p, body);
  }
}
