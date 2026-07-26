import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  archivePlanSchema,
  createPlanDraftSchema,
  listPlansQuerySchema,
  newPlanVersionSchema,
  publishPlanVersionSchema,
  type ArchivePlanInput,
  type CreatePlanDraftInput,
  type ListPlansQuery,
  type NewPlanVersionInput,
  type PublishPlanVersionInput,
} from '@edrion/schemas';
import type { PrincipalContext } from '@edrion/auth';
import { PrincipalCtx, ReqContext, RequirePermissions } from '../../common/decorators';
import { zodBody } from '../../common/zod-validation.pipe';
import type { EdrionRequestContext } from '../../common/request-context';
import type { ActionContext } from '../../common/action-context';
import { PlansService } from './plans.service';

@ApiTags('plans')
@Controller('plans')
export class PlansController {
  constructor(private readonly service: PlansService) {}

  private ctx(pc: PrincipalContext, request: EdrionRequestContext): ActionContext {
    return { principalContext: pc, request };
  }

  @Get()
  @RequirePermissions('plans.view')
  async list(@Query(zodBody(listPlansQuerySchema)) query: ListPlansQuery) {
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
  @RequirePermissions('plans.view')
  summary() {
    return this.service.summary();
  }

  @Get(':id')
  @RequirePermissions('plans.view')
  get(@Param('id') id: string) {
    return this.service.get(id);
  }

  @Post()
  @RequirePermissions('plans.create')
  create(
    @Body(zodBody(createPlanDraftSchema)) body: CreatePlanDraftInput,
    @PrincipalCtx() pc: PrincipalContext,
    @ReqContext() request: EdrionRequestContext,
  ) {
    return this.service.createDraft(body, this.ctx(pc, request));
  }

  /** Cut a new draft version — immutable: never mutates an existing version. */
  @Post(':id/versions')
  @RequirePermissions('plans.update')
  newVersion(
    @Param('id') id: string,
    @Body(zodBody(newPlanVersionSchema)) body: NewPlanVersionInput,
    @PrincipalCtx() pc: PrincipalContext,
    @ReqContext() request: EdrionRequestContext,
  ) {
    return this.service.newVersion(id, body, this.ctx(pc, request));
  }

  /** Publish a draft version (sensitive → recent auth enforced by the guard). */
  @Post(':id/versions/:versionId/publish')
  @RequirePermissions('plans.publish')
  publish(
    @Param('id') id: string,
    @Param('versionId') versionId: string,
    @Body(zodBody(publishPlanVersionSchema)) body: PublishPlanVersionInput,
    @PrincipalCtx() pc: PrincipalContext,
    @ReqContext() request: EdrionRequestContext,
  ) {
    return this.service.publish(id, versionId, body, this.ctx(pc, request));
  }

  @Post(':id/archive')
  @RequirePermissions('plans.archive')
  archive(
    @Param('id') id: string,
    @Body(zodBody(archivePlanSchema)) body: ArchivePlanInput,
    @PrincipalCtx() pc: PrincipalContext,
    @ReqContext() request: EdrionRequestContext,
  ) {
    return this.service.archive(id, body, this.ctx(pc, request));
  }
}
