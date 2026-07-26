import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  createEndpointSchema,
  listEndpointsQuerySchema,
  rotateSecretSchema,
  testDeliverySchema,
  updateEndpointSchema,
  type CreateEndpointInput,
  type ListEndpointsQuery,
  type RotateSecretInput,
  type TestDeliveryInput,
  type UpdateEndpointInput,
} from '@edrion/schemas';
import type { PrincipalContext } from '@edrion/auth';
import { PrincipalCtx, ReqContext, RequirePermissions } from '../../common/decorators';
import { zodBody } from '../../common/zod-validation.pipe';
import type { EdrionRequestContext } from '../../common/request-context';
import type { ActionContext } from '../../common/action-context';
import { IntegrationsService } from './integrations.service';

@ApiTags('integrations')
@Controller('integrations')
export class IntegrationsController {
  constructor(private readonly service: IntegrationsService) {}

  private ctx(pc: PrincipalContext, request: EdrionRequestContext): ActionContext {
    return { principalContext: pc, request };
  }

  @Get()
  @RequirePermissions('integrations.view')
  async list(@Query(zodBody(listEndpointsQuerySchema)) query: ListEndpointsQuery) {
    const { items, total } = await this.service.list(query);
    return { items, total, page: query.page, pageSize: query.pageSize, hasMore: query.page * query.pageSize < total };
  }

  @Get(':id')
  @RequirePermissions('integrations.view')
  get(@Param('id') id: string) {
    return this.service.get(id);
  }

  @Post()
  @RequirePermissions('integrations.manage')
  create(
    @Body(zodBody(createEndpointSchema)) body: CreateEndpointInput,
    @PrincipalCtx() pc: PrincipalContext,
    @ReqContext() request: EdrionRequestContext,
  ) {
    return this.service.create(body, this.ctx(pc, request));
  }

  @Patch(':id')
  @RequirePermissions('integrations.manage')
  update(
    @Param('id') id: string,
    @Body(zodBody(updateEndpointSchema)) body: UpdateEndpointInput,
    @PrincipalCtx() pc: PrincipalContext,
    @ReqContext() request: EdrionRequestContext,
  ) {
    return this.service.update(id, body, this.ctx(pc, request));
  }

  @Post(':id/rotate-secret')
  @RequirePermissions('integrations.manage')
  rotateSecret(
    @Param('id') id: string,
    @Body(zodBody(rotateSecretSchema)) body: RotateSecretInput,
    @PrincipalCtx() pc: PrincipalContext,
    @ReqContext() request: EdrionRequestContext,
  ) {
    return this.service.rotateSecret(id, body, this.ctx(pc, request));
  }

  @Post(':id/test')
  @RequirePermissions('integrations.manage')
  test(
    @Param('id') id: string,
    @Body(zodBody(testDeliverySchema)) body: TestDeliveryInput,
    @PrincipalCtx() pc: PrincipalContext,
    @ReqContext() request: EdrionRequestContext,
  ) {
    return this.service.testDelivery(id, body, this.ctx(pc, request));
  }
}
