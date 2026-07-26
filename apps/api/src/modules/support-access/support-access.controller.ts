import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  endSupportSessionSchema,
  extendSupportSessionSchema,
  listSupportSessionsQuerySchema,
  startSupportSessionSchema,
  type EndSupportSessionInput,
  type ExtendSupportSessionInput,
  type ListSupportSessionsQuery,
  type StartSupportSessionInput,
} from '@edrion/schemas';
import type { PrincipalContext } from '@edrion/auth';
import { PrincipalCtx, ReqContext, RequirePermissions } from '../../common/decorators';
import { zodBody } from '../../common/zod-validation.pipe';
import type { EdrionRequestContext } from '../../common/request-context';
import type { ActionContext } from '../../common/action-context';
import { SupportAccessService } from './support-access.service';

@ApiTags('support-access')
@Controller('support-access')
export class SupportAccessController {
  constructor(private readonly service: SupportAccessService) {}

  private ctx(pc: PrincipalContext, request: EdrionRequestContext): ActionContext {
    return { principalContext: pc, request };
  }

  @Get()
  @RequirePermissions('support.view')
  async list(@Query(zodBody(listSupportSessionsQuerySchema)) query: ListSupportSessionsQuery) {
    const { items, total } = await this.service.list(query);
    return {
      items,
      total,
      page: query.page,
      pageSize: query.pageSize,
      hasMore: query.page * query.pageSize < total,
    };
  }

  @Get(':id')
  @RequirePermissions('support.view')
  get(@Param('id') id: string) {
    return this.service.get(id);
  }

  /** Enter an institution portal — sensitive, so recent auth is enforced by the guard. */
  @Post('start')
  @RequirePermissions('institutions.access_portal')
  start(
    @Body(zodBody(startSupportSessionSchema)) body: StartSupportSessionInput,
    @PrincipalCtx() pc: PrincipalContext,
    @ReqContext() request: EdrionRequestContext,
  ) {
    return this.service.start(body, this.ctx(pc, request));
  }

  @Post(':id/portal-entered')
  @RequirePermissions('support.view')
  portalEntered(
    @Param('id') id: string,
    @PrincipalCtx() pc: PrincipalContext,
    @ReqContext() request: EdrionRequestContext,
  ) {
    return this.service.portalEntered(id, this.ctx(pc, request));
  }

  @Post(':id/extend')
  @RequirePermissions('institutions.access_portal')
  extend(
    @Param('id') id: string,
    @Body(zodBody(extendSupportSessionSchema)) body: ExtendSupportSessionInput,
    @PrincipalCtx() pc: PrincipalContext,
    @ReqContext() request: EdrionRequestContext,
  ) {
    return this.service.extend(id, body, this.ctx(pc, request));
  }

  @Post(':id/end')
  @RequirePermissions('support.view')
  end(
    @Param('id') id: string,
    @Body(zodBody(endSupportSessionSchema)) body: EndSupportSessionInput,
    @PrincipalCtx() pc: PrincipalContext,
    @ReqContext() request: EdrionRequestContext,
  ) {
    return this.service.end(id, body, this.ctx(pc, request));
  }
}
