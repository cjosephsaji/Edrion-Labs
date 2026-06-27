import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  approveRunSchema,
  confirmRunSchema,
  createRunSchema,
  listRunsQuerySchema,
  rejectRunSchema,
  type ApproveRunInput,
  type ConfirmRunInput,
  type CreateRunInput,
  type ListRunsQuery,
  type RejectRunInput,
} from '@edrion/schemas';
import type { PrincipalContext } from '@edrion/auth';
import {
  PrincipalCtx,
  ReqContext,
  RequirePermissions,
  RequireRecentAuth,
} from '../../common/decorators';
import { zodBody } from '../../common/zod-validation.pipe';
import type { EdrionRequestContext } from '../../common/request-context';
import type { ActionContext } from '../../common/action-context';
import { CopilotService } from './copilot.service';

@ApiTags('copilot')
@Controller('copilot')
export class CopilotController {
  constructor(private readonly service: CopilotService) {}

  private ctx(pc: PrincipalContext, request: EdrionRequestContext): ActionContext {
    return { principalContext: pc, request };
  }

  /** AI audit surface — searchable run log (cursor). Read-gated on ai.view. */
  @Get('runs')
  @RequirePermissions('ai.view')
  listRuns(@Query(zodBody(listRunsQuerySchema)) query: ListRunsQuery) {
    return this.service.listRuns(query);
  }

  @Get('runs/:id')
  @RequirePermissions('platform.dashboard.view')
  getRun(@Param('id') id: string) {
    return this.service.getRunDetail(id);
  }

  /** Start a run: prepare action(s) + show exact impact. Executes NOTHING (state changes need confirm). */
  @Post('runs')
  @RequirePermissions('platform.dashboard.view')
  create(
    @Body(zodBody(createRunSchema)) body: CreateRunInput,
    @PrincipalCtx() pc: PrincipalContext,
    @ReqContext() request: EdrionRequestContext,
  ) {
    return this.service.createRun(body, this.ctx(pc, request));
  }

  /**
   * Confirm a prepared run → re-evaluate guardrails → dispatch via the real audited service.
   * Recent auth is always required to execute an AI-prepared action; per-tool permissions are
   * asserted in the service.
   */
  @Post('runs/:id/confirm')
  @RequirePermissions('platform.dashboard.view')
  @RequireRecentAuth()
  confirm(
    @Param('id') id: string,
    @Body(zodBody(confirmRunSchema)) body: ConfirmRunInput,
    @PrincipalCtx() pc: PrincipalContext,
    @ReqContext() request: EdrionRequestContext,
  ) {
    return this.service.confirm(id, body, this.ctx(pc, request));
  }

  @Post('runs/:id/reject')
  @RequirePermissions('platform.dashboard.view')
  reject(
    @Param('id') id: string,
    @Body(zodBody(rejectRunSchema)) body: RejectRunInput,
    @PrincipalCtx() pc: PrincipalContext,
    @ReqContext() request: EdrionRequestContext,
  ) {
    return this.service.reject(id, body, this.ctx(pc, request));
  }

  /** Second-approver sign-off for a high-risk run. */
  @Post('runs/:id/approve')
  @RequirePermissions('ai.approve_sensitive_action')
  @RequireRecentAuth()
  approve(
    @Param('id') id: string,
    @Body(zodBody(approveRunSchema)) body: ApproveRunInput,
    @PrincipalCtx() pc: PrincipalContext,
    @ReqContext() request: EdrionRequestContext,
  ) {
    return this.service.approve(id, body, this.ctx(pc, request));
  }
}
