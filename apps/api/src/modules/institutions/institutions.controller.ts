import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  createInstitutionSchema,
  extendTrialSchema,
  institutionStatusActionSchema,
  listInstitutionsQuerySchema,
  updateInstitutionSchema,
  type CreateInstitutionInput,
  type ExtendTrialInput,
  type InstitutionStatusActionInput,
  type ListInstitutionsQuery,
  type UpdateInstitutionInput,
} from '@edrion/schemas';
import type { PrincipalContext } from '@edrion/auth';
import { PrincipalCtx, ReqContext, RequirePermissions } from '../../common/decorators';
import { zodBody } from '../../common/zod-validation.pipe';
import type { EdrionRequestContext } from '../../common/request-context';
import type { ActionContext } from '../../common/action-context';
import { InstitutionsService } from './institutions.service';

@ApiTags('institutions')
@Controller('institutions')
export class InstitutionsController {
  constructor(private readonly service: InstitutionsService) {}

  private ctx(pc: PrincipalContext, request: EdrionRequestContext): ActionContext {
    return { principalContext: pc, request };
  }

  @Get()
  @RequirePermissions('institutions.view')
  async list(@Query(zodBody(listInstitutionsQuerySchema)) query: ListInstitutionsQuery) {
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
  @RequirePermissions('institutions.view')
  summary() {
    return this.service.summary();
  }

  @Get(':id')
  @RequirePermissions('institutions.view')
  get(@Param('id') id: string) {
    return this.service.get(id);
  }

  @Post()
  @RequirePermissions('institutions.create')
  create(
    @Body(zodBody(createInstitutionSchema)) body: CreateInstitutionInput,
    @PrincipalCtx() pc: PrincipalContext,
    @ReqContext() request: EdrionRequestContext,
  ) {
    return this.service.create(body, this.ctx(pc, request));
  }

  @Patch(':id')
  @RequirePermissions('institutions.update')
  update(
    @Param('id') id: string,
    @Body(zodBody(updateInstitutionSchema)) body: UpdateInstitutionInput,
    @PrincipalCtx() pc: PrincipalContext,
    @ReqContext() request: EdrionRequestContext,
  ) {
    return this.service.update(id, body, this.ctx(pc, request));
  }

  @Post(':id/activate')
  @RequirePermissions('institutions.activate')
  activate(
    @Param('id') id: string,
    @Body(zodBody(institutionStatusActionSchema)) body: InstitutionStatusActionInput,
    @PrincipalCtx() pc: PrincipalContext,
    @ReqContext() request: EdrionRequestContext,
  ) {
    return this.service.activate(id, body, this.ctx(pc, request));
  }

  @Post(':id/restrict')
  @RequirePermissions('institutions.restrict')
  restrict(
    @Param('id') id: string,
    @Body(zodBody(institutionStatusActionSchema)) body: InstitutionStatusActionInput,
    @PrincipalCtx() pc: PrincipalContext,
    @ReqContext() request: EdrionRequestContext,
  ) {
    return this.service.restrict(id, body, this.ctx(pc, request));
  }

  @Post(':id/suspend')
  @RequirePermissions('institutions.suspend')
  suspend(
    @Param('id') id: string,
    @Body(zodBody(institutionStatusActionSchema)) body: InstitutionStatusActionInput,
    @PrincipalCtx() pc: PrincipalContext,
    @ReqContext() request: EdrionRequestContext,
  ) {
    return this.service.suspend(id, body, this.ctx(pc, request));
  }

  @Post(':id/archive')
  @RequirePermissions('institutions.archive')
  archive(
    @Param('id') id: string,
    @Body(zodBody(institutionStatusActionSchema)) body: InstitutionStatusActionInput,
    @PrincipalCtx() pc: PrincipalContext,
    @ReqContext() request: EdrionRequestContext,
  ) {
    return this.service.archive(id, body, this.ctx(pc, request));
  }

  @Post(':id/extend-trial')
  @RequirePermissions('institutions.update')
  extendTrial(
    @Param('id') id: string,
    @Body(zodBody(extendTrialSchema)) body: ExtendTrialInput,
    @PrincipalCtx() pc: PrincipalContext,
    @ReqContext() request: EdrionRequestContext,
  ) {
    return this.service.extendTrial(id, body, this.ctx(pc, request));
  }
}
