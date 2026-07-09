import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { ApiTags } from '@nestjs/swagger';
import {
  assignmentAudiencePreviewSchema,
  assignmentQuestionSchema,
  assignmentsListQuerySchema,
  createAssignmentSchema,
  gradeAnswerSchema,
  gradeSubmissionsSchema,
  updateAssignmentQuestionSchema,
  updateAssignmentSchema,
  versionedDeleteSchema,
  type AssignmentAudiencePreviewInput,
  type AssignmentQuestionInput,
  type AssignmentsListQuery,
  type CreateAssignmentInput,
  type GradeAnswerInput,
  type GradeSubmissionsInput,
  type UpdateAssignmentInput,
  type UpdateAssignmentQuestionInput,
  type VersionedDeleteInput,
} from '@edrion/schemas';
import type { ApiEnv } from '@edrion/config';
import type { InstitutionPrincipal, InstitutionScope } from '@edrion/auth';
import { Public } from '../../common/guards/auth.guard';
import { ReqContext, SkipRateLimit } from '../../common/decorators';
import type { EdrionRequestContext } from '../../common/request-context';
import { zodBody } from '../../common/zod-validation.pipe';
import { API_ENV } from '../../common/tokens';
import { InstitutionAuthGuard } from './portal-auth.guard';
import { InstitutionPermissionsGuard } from './portal-permissions.guard';
import {
  CurrentInstitutionPrincipal,
  CurrentScope,
  RequireInstitutionPermissions,
} from './portal.decorators';
import { AssignmentsService } from './assignments.service';
import { PortalAudienceService } from './portal-audience.service';
import type { PortalActionContext } from './portal-action-context';
import { LocalDiskDriver } from '../student/storage/drivers/local-disk.driver';

/**
 * Institution-portal Assignments API (Phase 6) — assignments + per-student submissions. Same
 * boundary as the rest of the portal. Reads need assignments.view; mutations need assignments.manage.
 * Submissions are nested under an assignment.
 */
@ApiTags('portal-assignments')
@Controller('portal/assignments')
@Public()
@SkipRateLimit()
@UseGuards(InstitutionAuthGuard, InstitutionPermissionsGuard)
export class AssignmentsController {
  private readonly driver: LocalDiskDriver;

  constructor(
    private readonly service: AssignmentsService,
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
  @RequireInstitutionPermissions('assignments.view')
  list(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Query(zodBody(assignmentsListQuerySchema)) q: AssignmentsListQuery,
  ) {
    return this.service.list(this.ctx(p, s, r), q);
  }

  @Post()
  @RequireInstitutionPermissions('assignments.manage')
  create(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(createAssignmentSchema)) body: CreateAssignmentInput,
  ) {
    return this.service.create(this.ctx(p, s, r), body);
  }

  @Patch(':id')
  @RequireInstitutionPermissions('assignments.manage')
  update(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(updateAssignmentSchema)) body: UpdateAssignmentInput,
  ) {
    return this.service.update(this.ctx(p, s, r), id, body);
  }

  @Delete(':id')
  @RequireInstitutionPermissions('assignments.manage')
  delete(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(versionedDeleteSchema)) body: VersionedDeleteInput,
  ) {
    return this.service.delete(this.ctx(p, s, r), id, body.version);
  }

  // --- submissions -----------------------------------------------------------

  @Get(':id/submissions')
  @RequireInstitutionPermissions('assignments.view')
  listSubmissions(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
  ) {
    return this.service.listSubmissions(this.ctx(p, s, r), id);
  }

  @Post(':id/submissions')
  @RequireInstitutionPermissions('assignments.manage')
  grade(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(gradeSubmissionsSchema)) body: GradeSubmissionsInput,
  ) {
    return this.service.grade(this.ctx(p, s, r), id, body);
  }

  @Delete(':id/submissions/:submissionId')
  @RequireInstitutionPermissions('assignments.manage')
  removeSubmission(
    @Param('id') id: string,
    @Param('submissionId') submissionId: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
  ) {
    return this.service.removeSubmission(this.ctx(p, s, r), id, submissionId);
  }

  // --- audience preview ------------------------------------------------------

  @Post('audience/preview')
  @RequireInstitutionPermissions('assignments.manage')
  previewAudience(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(assignmentAudiencePreviewSchema)) body: AssignmentAudiencePreviewInput,
  ) {
    return this.service.previewAudience(this.ctx(p, s, r), body);
  }

  // --- uploads ---------------------------------------------------------------

  @Post('uploads')
  @RequireInstitutionPermissions('assignments.manage')
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
      'assignment_question',
    );
  }

  // --- questions -------------------------------------------------------------

  @Get(':id/questions')
  @RequireInstitutionPermissions('assignments.view')
  listQuestions(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
  ) {
    return this.service.listQuestions(this.ctx(p, s, r), id);
  }

  @Post(':id/questions')
  @RequireInstitutionPermissions('assignments.manage')
  createQuestion(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(assignmentQuestionSchema)) body: AssignmentQuestionInput,
  ) {
    return this.service.createQuestion(this.ctx(p, s, r), id, body);
  }

  @Patch(':id/questions/:questionId')
  @RequireInstitutionPermissions('assignments.manage')
  updateQuestion(
    @Param('id') id: string,
    @Param('questionId') questionId: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(updateAssignmentQuestionSchema)) body: UpdateAssignmentQuestionInput,
  ) {
    return this.service.updateQuestion(this.ctx(p, s, r), id, questionId, body);
  }

  @Delete(':id/questions/:questionId')
  @RequireInstitutionPermissions('assignments.manage')
  deleteQuestion(
    @Param('id') id: string,
    @Param('questionId') questionId: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(versionedDeleteSchema)) body: VersionedDeleteInput,
  ) {
    return this.service.deleteQuestion(this.ctx(p, s, r), id, questionId, body.version);
  }

  // --- quiz attempts (grading) -----------------------------------------------

  @Get(':id/attempts')
  @RequireInstitutionPermissions('assignments.view')
  listAttempts(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
  ) {
    return this.service.listAttempts(this.ctx(p, s, r), id);
  }

  @Get(':id/attempts/:attemptId')
  @RequireInstitutionPermissions('assignments.view')
  getAttemptDetail(
    @Param('id') id: string,
    @Param('attemptId') attemptId: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
  ) {
    return this.service.getAttemptDetail(this.ctx(p, s, r), id, attemptId);
  }

  @Patch(':id/attempts/:attemptId/answers/:answerId')
  @RequireInstitutionPermissions('assignments.manage')
  gradeAnswer(
    @Param('id') id: string,
    @Param('attemptId') attemptId: string,
    @Param('answerId') answerId: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(gradeAnswerSchema)) body: GradeAnswerInput,
  ) {
    return this.service.gradeAnswer(this.ctx(p, s, r), id, attemptId, answerId, body);
  }
}
