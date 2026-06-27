import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  addSupportMessageSchema,
  assignSupportCaseSchema,
  changeSupportCaseStatusSchema,
  createSupportCaseSchema,
  listSupportCasesQuerySchema,
  type AddSupportMessageInput,
  type AssignSupportCaseInput,
  type ChangeSupportCaseStatusInput,
  type CreateSupportCaseInput,
  type ListSupportCasesQuery,
} from '@edrion/schemas';
import type { PrincipalContext } from '@edrion/auth';
import { PrincipalCtx, ReqContext, RequirePermissions } from '../../common/decorators';
import { zodBody } from '../../common/zod-validation.pipe';
import type { EdrionRequestContext } from '../../common/request-context';
import type { ActionContext } from '../../common/action-context';
import { SupportCasesService } from './support-cases.service';

@ApiTags('support-cases')
@Controller('support-cases')
export class SupportCasesController {
  constructor(private readonly service: SupportCasesService) {}

  private ctx(pc: PrincipalContext, request: EdrionRequestContext): ActionContext {
    return { principalContext: pc, request };
  }

  @Get()
  @RequirePermissions('support.view')
  async list(@Query(zodBody(listSupportCasesQuerySchema)) query: ListSupportCasesQuery) {
    const { items, total } = await this.service.list(query);
    return { items, total, page: query.page, pageSize: query.pageSize, hasMore: query.page * query.pageSize < total };
  }

  @Get('summary')
  @RequirePermissions('support.view')
  summary() {
    return this.service.summary();
  }

  @Get(':id')
  @RequirePermissions('support.view')
  get(@Param('id') id: string) {
    return this.service.get(id);
  }

  @Post()
  @RequirePermissions('support.manage')
  create(
    @Body(zodBody(createSupportCaseSchema)) body: CreateSupportCaseInput,
    @PrincipalCtx() pc: PrincipalContext,
    @ReqContext() request: EdrionRequestContext,
  ) {
    return this.service.create(body, this.ctx(pc, request));
  }

  @Post(':id/messages')
  @RequirePermissions('support.manage')
  addMessage(
    @Param('id') id: string,
    @Body(zodBody(addSupportMessageSchema)) body: AddSupportMessageInput,
    @PrincipalCtx() pc: PrincipalContext,
    @ReqContext() request: EdrionRequestContext,
  ) {
    return this.service.addMessage(id, body, this.ctx(pc, request));
  }

  @Post(':id/status')
  @RequirePermissions('support.manage')
  changeStatus(
    @Param('id') id: string,
    @Body(zodBody(changeSupportCaseStatusSchema)) body: ChangeSupportCaseStatusInput,
    @PrincipalCtx() pc: PrincipalContext,
    @ReqContext() request: EdrionRequestContext,
  ) {
    return this.service.changeStatus(id, body, this.ctx(pc, request));
  }

  @Post(':id/assign')
  @RequirePermissions('support.manage')
  assign(
    @Param('id') id: string,
    @Body(zodBody(assignSupportCaseSchema)) body: AssignSupportCaseInput,
    @PrincipalCtx() pc: PrincipalContext,
    @ReqContext() request: EdrionRequestContext,
  ) {
    return this.service.assign(id, body, this.ctx(pc, request));
  }
}
