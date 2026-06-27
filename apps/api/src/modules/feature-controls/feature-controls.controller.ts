import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  createFeatureDefinitionSchema,
  listFeaturesQuerySchema,
  removeFeatureAssignmentSchema,
  removeFeatureRolloutSchema,
  resolveFeatureQuerySchema,
  setFeatureStatusSchema,
  setKillSwitchSchema,
  updateFeatureDefinitionSchema,
  upsertFeatureAssignmentSchema,
  upsertFeatureRolloutSchema,
  type CreateFeatureDefinitionInput,
  type ListFeaturesQuery,
  type RemoveFeatureAssignmentInput,
  type RemoveFeatureRolloutInput,
  type ResolveFeatureQuery,
  type SetFeatureStatusInput,
  type SetKillSwitchInput,
  type UpdateFeatureDefinitionInput,
  type UpsertFeatureAssignmentInput,
  type UpsertFeatureRolloutInput,
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
import { FeatureControlsService } from './feature-controls.service';

@ApiTags('feature-controls')
@Controller('features')
export class FeatureControlsController {
  constructor(private readonly service: FeatureControlsService) {}

  private ctx(pc: PrincipalContext, request: EdrionRequestContext): ActionContext {
    return { principalContext: pc, request };
  }

  @Get()
  @RequirePermissions('features.view')
  async list(@Query(zodBody(listFeaturesQuerySchema)) query: ListFeaturesQuery) {
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
  @RequirePermissions('features.view')
  summary() {
    return this.service.summary();
  }

  @Get(':id')
  @RequirePermissions('features.view')
  get(@Param('id') id: string) {
    return this.service.getDetail(id);
  }

  /** Effective-Value preview: returns the winning layer + reason, not just a boolean. */
  @Get(':id/resolve')
  @RequirePermissions('features.view')
  resolve(
    @Param('id') id: string,
    @Query(zodBody(resolveFeatureQuerySchema)) query: ResolveFeatureQuery,
  ) {
    return this.service.resolve(id, query);
  }

  @Post()
  @RequirePermissions('features.manage_global')
  create(
    @Body(zodBody(createFeatureDefinitionSchema)) body: CreateFeatureDefinitionInput,
    @PrincipalCtx() pc: PrincipalContext,
    @ReqContext() request: EdrionRequestContext,
  ) {
    return this.service.create(body, this.ctx(pc, request));
  }

  @Patch(':id')
  @RequirePermissions('features.manage_global')
  update(
    @Param('id') id: string,
    @Body(zodBody(updateFeatureDefinitionSchema)) body: UpdateFeatureDefinitionInput,
    @PrincipalCtx() pc: PrincipalContext,
    @ReqContext() request: EdrionRequestContext,
  ) {
    return this.service.update(id, body, this.ctx(pc, request));
  }

  @Post(':id/status')
  @RequirePermissions('features.manage_global')
  setStatus(
    @Param('id') id: string,
    @Body(zodBody(setFeatureStatusSchema)) body: SetFeatureStatusInput,
    @PrincipalCtx() pc: PrincipalContext,
    @ReqContext() request: EdrionRequestContext,
  ) {
    return this.service.setStatus(id, body, this.ctx(pc, request));
  }

  /**
   * Scope assignment. The scope-specific manage permission (manage_plan/institution/campus/user)
   * is asserted in the service; the handler gates on `features.view` + recent auth.
   */
  @Put(':id/assignments')
  @RequirePermissions('features.view')
  @RequireRecentAuth()
  upsertAssignment(
    @Param('id') id: string,
    @Body(zodBody(upsertFeatureAssignmentSchema)) body: UpsertFeatureAssignmentInput,
    @PrincipalCtx() pc: PrincipalContext,
    @ReqContext() request: EdrionRequestContext,
  ) {
    return this.service.upsertAssignment(id, body, this.ctx(pc, request));
  }

  @Delete(':id/assignments/:assignmentId')
  @RequirePermissions('features.view')
  @RequireRecentAuth()
  removeAssignment(
    @Param('id') id: string,
    @Param('assignmentId') assignmentId: string,
    @Body(zodBody(removeFeatureAssignmentSchema)) body: RemoveFeatureAssignmentInput,
    @PrincipalCtx() pc: PrincipalContext,
    @ReqContext() request: EdrionRequestContext,
  ) {
    return this.service.removeAssignment(id, assignmentId, body, this.ctx(pc, request));
  }

  @Put(':id/rollouts')
  @RequirePermissions('features.manage_global')
  upsertRollout(
    @Param('id') id: string,
    @Body(zodBody(upsertFeatureRolloutSchema)) body: UpsertFeatureRolloutInput,
    @PrincipalCtx() pc: PrincipalContext,
    @ReqContext() request: EdrionRequestContext,
  ) {
    return this.service.upsertRollout(id, body, this.ctx(pc, request));
  }

  @Delete(':id/rollouts/:rolloutId')
  @RequirePermissions('features.manage_global')
  removeRollout(
    @Param('id') id: string,
    @Param('rolloutId') rolloutId: string,
    @Body(zodBody(removeFeatureRolloutSchema)) body: RemoveFeatureRolloutInput,
    @PrincipalCtx() pc: PrincipalContext,
    @ReqContext() request: EdrionRequestContext,
  ) {
    return this.service.removeRollout(id, rolloutId, body, this.ctx(pc, request));
  }

  /** Emergency kill switch. Sensitive (manage_global) → recent auth enforced. */
  @Post(':id/kill-switch')
  @RequirePermissions('features.manage_global')
  setKillSwitch(
    @Param('id') id: string,
    @Body(zodBody(setKillSwitchSchema)) body: SetKillSwitchInput,
    @PrincipalCtx() pc: PrincipalContext,
    @ReqContext() request: EdrionRequestContext,
  ) {
    return this.service.setKillSwitch(id, body, this.ctx(pc, request));
  }
}
