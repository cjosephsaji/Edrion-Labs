import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  addRegistrationNoteSchema,
  approveRegistrationSchema,
  assignReviewerSchema,
  listRegistrationsQuerySchema,
  rejectRegistrationSchema,
  startReviewSchema,
  type AddRegistrationNoteInput,
  type ApproveRegistrationInput,
  type AssignReviewerInput,
  type ListRegistrationsQuery,
  type RejectRegistrationInput,
  type StartReviewInput,
} from '@edrion/schemas';
import type { PrincipalContext } from '@edrion/auth';
import { PrincipalCtx, ReqContext, RequirePermissions } from '../../common/decorators';
import { zodBody } from '../../common/zod-validation.pipe';
import type { EdrionRequestContext } from '../../common/request-context';
import type { ActionContext } from '../../common/action-context';
import { RegistrationService } from './registration.service';
import { RegistrationApprovalService } from './registration-approval.service';

/**
 * Reviewer workspace for institution registration requests. Every action is permission-gated;
 * approve/reject are sensitive (recent-auth enforced by the PermissionsGuard). Internal notes and
 * reviewer identity live only on these authenticated payloads — never on the public funnel.
 */
@ApiTags('registration-requests')
@Controller('registration-requests')
export class RegistrationRequestsController {
  constructor(
    private readonly service: RegistrationService,
    private readonly approval: RegistrationApprovalService,
  ) {}

  private ctx(pc: PrincipalContext, request: EdrionRequestContext): ActionContext {
    return { principalContext: pc, request };
  }

  @Get()
  @RequirePermissions('registration.view')
  async list(@Query(zodBody(listRegistrationsQuerySchema)) query: ListRegistrationsQuery) {
    const { items, total } = await this.service.list(query);
    return {
      items,
      total,
      page: query.page,
      pageSize: query.pageSize,
      hasMore: query.page * query.pageSize < total,
    };
  }

  @Get('summary')
  @RequirePermissions('registration.view')
  summary() {
    return this.service.summary();
  }

  @Get(':id')
  @RequirePermissions('registration.view')
  get(@Param('id') id: string) {
    return this.service.getDetail(id);
  }

  @Post(':id/start-review')
  @RequirePermissions('registration.review')
  startReview(
    @Param('id') id: string,
    @Body(zodBody(startReviewSchema)) body: StartReviewInput,
    @PrincipalCtx() pc: PrincipalContext,
    @ReqContext() request: EdrionRequestContext,
  ) {
    return this.service.startReview(id, body, this.ctx(pc, request));
  }

  @Post(':id/assign')
  @RequirePermissions('registration.review')
  assign(
    @Param('id') id: string,
    @Body(zodBody(assignReviewerSchema)) body: AssignReviewerInput,
    @PrincipalCtx() pc: PrincipalContext,
    @ReqContext() request: EdrionRequestContext,
  ) {
    return this.service.assign(id, body, this.ctx(pc, request));
  }

  @Post(':id/notes')
  @RequirePermissions('registration.review')
  addNote(
    @Param('id') id: string,
    @Body(zodBody(addRegistrationNoteSchema)) body: AddRegistrationNoteInput,
    @PrincipalCtx() pc: PrincipalContext,
    @ReqContext() request: EdrionRequestContext,
  ) {
    return this.service.addNote(id, body, this.ctx(pc, request));
  }

  @Post(':id/approve')
  @RequirePermissions('registration.approve')
  approve(
    @Param('id') id: string,
    @Body(zodBody(approveRegistrationSchema)) body: ApproveRegistrationInput,
    @PrincipalCtx() pc: PrincipalContext,
    @ReqContext() request: EdrionRequestContext,
  ) {
    return this.approval.approve(id, body, this.ctx(pc, request));
  }

  @Post(':id/reject')
  @RequirePermissions('registration.reject')
  reject(
    @Param('id') id: string,
    @Body(zodBody(rejectRegistrationSchema)) body: RejectRegistrationInput,
    @PrincipalCtx() pc: PrincipalContext,
    @ReqContext() request: EdrionRequestContext,
  ) {
    return this.service.reject(id, body, this.ctx(pc, request));
  }
}
