import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { ApiTags } from '@nestjs/swagger';
import {
  createExamScheduleSchema,
  createExamSchema,
  examAudiencePreviewSchema,
  examQuestionSchema,
  examsListQuerySchema,
  gradeAnswerSchema,
  updateExamQuestionSchema,
  updateExamSchema,
  updateExamScheduleSchema,
  versionedDeleteSchema,
  type CreateExamInput,
  type CreateExamScheduleInput,
  type ExamAudiencePreviewInput,
  type ExamQuestionInput,
  type ExamsListQuery,
  type GradeAnswerInput,
  type UpdateExamInput,
  type UpdateExamQuestionInput,
  type UpdateExamScheduleInput,
  type VersionedDeleteInput,
} from '@edrion/schemas';
import type { InstitutionPrincipal, InstitutionScope } from '@edrion/auth';
import { Public } from '../../common/guards/auth.guard';
import { ReqContext, SkipRateLimit } from '../../common/decorators';
import type { EdrionRequestContext } from '../../common/request-context';
import { zodBody } from '../../common/zod-validation.pipe';
import { InstitutionAuthGuard } from './portal-auth.guard';
import { InstitutionPermissionsGuard } from './portal-permissions.guard';
import {
  CurrentInstitutionPrincipal,
  CurrentScope,
  RequireInstitutionPermissions,
} from './portal.decorators';
import { ExamsService } from './exams.service';
import { PortalAudienceService } from './portal-audience.service';
import type { PortalActionContext } from './portal-action-context';
import { LocalDiskDriver } from '../student/storage/drivers/local-disk.driver';
import { API_ENV } from '../../common/tokens';
import type { ApiEnv } from '@edrion/config';
import { Inject } from '@nestjs/common';

/**
 * Institution-portal Exams API (Phase 6) — exams + scheduled papers. Same boundary as the rest of
 * the portal. Reads need exams.view; mutations need exams.manage. Papers are nested under an exam.
 */
@ApiTags('portal-exams')
@Controller('portal/exams')
@Public()
@SkipRateLimit()
@UseGuards(InstitutionAuthGuard, InstitutionPermissionsGuard)
export class ExamsController {
  private readonly driver: LocalDiskDriver;

  constructor(
    private readonly service: ExamsService,
    private readonly audience: PortalAudienceService,
    @Inject(API_ENV) env: ApiEnv,
  ) {
    this.driver = new LocalDiskDriver(env);
  }

  private ctx(
    principal: InstitutionPrincipal,
    scope: InstitutionScope,
    request: EdrionRequestContext,
  ): PortalActionContext {
    return { principal, scope, request };
  }

  @Get()
  @RequireInstitutionPermissions('exams.view')
  list(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Query(zodBody(examsListQuerySchema)) q: ExamsListQuery,
  ) {
    return this.service.list(this.ctx(p, s, r), q);
  }

  @Post()
  @RequireInstitutionPermissions('exams.manage')
  create(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(createExamSchema)) body: CreateExamInput,
  ) {
    return this.service.create(this.ctx(p, s, r), body);
  }

  @Patch(':id')
  @RequireInstitutionPermissions('exams.manage')
  update(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(updateExamSchema)) body: UpdateExamInput,
  ) {
    return this.service.update(this.ctx(p, s, r), id, body);
  }

  @Delete(':id')
  @RequireInstitutionPermissions('exams.manage')
  delete(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(versionedDeleteSchema)) body: VersionedDeleteInput,
  ) {
    return this.service.delete(this.ctx(p, s, r), id, body.version);
  }

  // --- schedules (papers) ----------------------------------------------------

  @Get(':id/schedules')
  @RequireInstitutionPermissions('exams.view')
  listSchedules(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
  ) {
    return this.service.listSchedules(this.ctx(p, s, r), id);
  }

  @Post(':id/schedules')
  @RequireInstitutionPermissions('exams.manage')
  createSchedule(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(createExamScheduleSchema)) body: CreateExamScheduleInput,
  ) {
    return this.service.createSchedule(this.ctx(p, s, r), id, body);
  }

  @Patch(':id/schedules/:scheduleId')
  @RequireInstitutionPermissions('exams.manage')
  updateSchedule(
    @Param('id') id: string,
    @Param('scheduleId') scheduleId: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(updateExamScheduleSchema)) body: UpdateExamScheduleInput,
  ) {
    return this.service.updateSchedule(this.ctx(p, s, r), id, scheduleId, body);
  }

  @Delete(':id/schedules/:scheduleId')
  @RequireInstitutionPermissions('exams.manage')
  deleteSchedule(
    @Param('id') id: string,
    @Param('scheduleId') scheduleId: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(versionedDeleteSchema)) body: VersionedDeleteInput,
  ) {
    return this.service.deleteSchedule(this.ctx(p, s, r), id, scheduleId, body.version);
  }

  // --- audience preview ------------------------------------------------------

  @Post('audience/preview')
  @RequireInstitutionPermissions('exams.manage')
  previewAudience(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(examAudiencePreviewSchema)) body: ExamAudiencePreviewInput,
  ) {
    return this.service.previewAudience(this.ctx(p, s, r), body);
  }

  // --- uploads ---------------------------------------------------------------

  @Post('uploads')
  @RequireInstitutionPermissions('exams.manage')
  async upload(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Req() req: Request,
    @Query('filename') filename: string,
  ) {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const buffer = Buffer.concat(chunks);
    const mimeType = (req.headers['content-type'] as string) || 'application/octet-stream';
    return this.audience.uploadQuestionImage(
      this.ctx(p, s, r),
      this.driver,
      filename || 'upload',
      mimeType,
      buffer,
      'exam_question',
    );
  }

  // --- paper questions -------------------------------------------------------

  @Get(':id/schedules/:scheduleId/questions')
  @RequireInstitutionPermissions('exams.view')
  listQuestions(
    @Param('id') id: string,
    @Param('scheduleId') scheduleId: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
  ) {
    return this.service.listQuestions(this.ctx(p, s, r), id, scheduleId);
  }

  @Post(':id/schedules/:scheduleId/questions')
  @RequireInstitutionPermissions('exams.manage')
  createQuestion(
    @Param('id') id: string,
    @Param('scheduleId') scheduleId: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(examQuestionSchema)) body: ExamQuestionInput,
  ) {
    return this.service.createQuestion(this.ctx(p, s, r), id, scheduleId, body);
  }

  @Patch(':id/schedules/:scheduleId/questions/:questionId')
  @RequireInstitutionPermissions('exams.manage')
  updateQuestion(
    @Param('id') id: string,
    @Param('scheduleId') scheduleId: string,
    @Param('questionId') questionId: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(updateExamQuestionSchema)) body: UpdateExamQuestionInput,
  ) {
    return this.service.updateQuestion(this.ctx(p, s, r), id, scheduleId, questionId, body);
  }

  @Delete(':id/schedules/:scheduleId/questions/:questionId')
  @RequireInstitutionPermissions('exams.manage')
  deleteQuestion(
    @Param('id') id: string,
    @Param('scheduleId') scheduleId: string,
    @Param('questionId') questionId: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(versionedDeleteSchema)) body: VersionedDeleteInput,
  ) {
    return this.service.deleteQuestion(this.ctx(p, s, r), id, scheduleId, questionId, body.version);
  }

  // --- attempts (grading) ----------------------------------------------------

  @Get(':id/schedules/:scheduleId/attempts')
  @RequireInstitutionPermissions('exams.view')
  listAttempts(
    @Param('id') id: string,
    @Param('scheduleId') scheduleId: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
  ) {
    return this.service.listAttempts(this.ctx(p, s, r), id, scheduleId);
  }

  @Get(':id/schedules/:scheduleId/attempts/:attemptId')
  @RequireInstitutionPermissions('exams.view')
  getAttemptDetail(
    @Param('id') id: string,
    @Param('scheduleId') scheduleId: string,
    @Param('attemptId') attemptId: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
  ) {
    return this.service.getAttemptDetail(this.ctx(p, s, r), id, scheduleId, attemptId);
  }

  @Patch(':id/schedules/:scheduleId/attempts/:attemptId/answers/:answerId')
  @RequireInstitutionPermissions('exams.manage')
  gradeAnswer(
    @Param('id') id: string,
    @Param('scheduleId') scheduleId: string,
    @Param('attemptId') attemptId: string,
    @Param('answerId') answerId: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(gradeAnswerSchema)) body: GradeAnswerInput,
  ) {
    return this.service.gradeAnswer(this.ctx(p, s, r), id, scheduleId, attemptId, answerId, body);
  }
}
