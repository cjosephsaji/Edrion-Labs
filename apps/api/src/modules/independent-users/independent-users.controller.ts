import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  independentUserStatusActionSchema,
  listIndependentUsersQuerySchema,
  updateIndependentUserSchema,
  type IndependentUserStatusActionInput,
  type ListIndependentUsersQuery,
  type UpdateIndependentUserInput,
} from '@edrion/schemas';
import type { PrincipalContext } from '@edrion/auth';
import { PrincipalCtx, ReqContext, RequirePermissions } from '../../common/decorators';
import { zodBody } from '../../common/zod-validation.pipe';
import type { EdrionRequestContext } from '../../common/request-context';
import type { ActionContext } from '../../common/action-context';
import { IndependentUsersService } from './independent-users.service';

@ApiTags('independent-users')
@Controller('independent-users')
export class IndependentUsersController {
  constructor(private readonly service: IndependentUsersService) {}

  private ctx(pc: PrincipalContext, request: EdrionRequestContext): ActionContext {
    return { principalContext: pc, request };
  }

  @Get()
  @RequirePermissions('independent_users.view')
  async list(@Query(zodBody(listIndependentUsersQuerySchema)) query: ListIndependentUsersQuery) {
    const { items, total } = await this.service.list(query);
    return { items, total, page: query.page, pageSize: query.pageSize, hasMore: query.page * query.pageSize < total };
  }

  @Get('summary')
  @RequirePermissions('independent_users.view')
  summary() {
    return this.service.summary();
  }

  @Get(':id')
  @RequirePermissions('independent_users.view')
  get(@Param('id') id: string) {
    return this.service.get(id);
  }

  @Patch(':id')
  @RequirePermissions('independent_users.update')
  update(
    @Param('id') id: string,
    @Body(zodBody(updateIndependentUserSchema)) body: UpdateIndependentUserInput,
    @PrincipalCtx() pc: PrincipalContext,
    @ReqContext() request: EdrionRequestContext,
  ) {
    return this.service.update(id, body, this.ctx(pc, request));
  }

  @Post(':id/disable')
  @RequirePermissions('independent_users.disable')
  disable(
    @Param('id') id: string,
    @Body(zodBody(independentUserStatusActionSchema)) body: IndependentUserStatusActionInput,
    @PrincipalCtx() pc: PrincipalContext,
    @ReqContext() request: EdrionRequestContext,
  ) {
    return this.service.disable(id, body, this.ctx(pc, request));
  }

  @Post(':id/restore')
  @RequirePermissions('independent_users.disable')
  restore(
    @Param('id') id: string,
    @Body(zodBody(independentUserStatusActionSchema)) body: IndependentUserStatusActionInput,
    @PrincipalCtx() pc: PrincipalContext,
    @ReqContext() request: EdrionRequestContext,
  ) {
    return this.service.restore(id, body, this.ctx(pc, request));
  }
}
