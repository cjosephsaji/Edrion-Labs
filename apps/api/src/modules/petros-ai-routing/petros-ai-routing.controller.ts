import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { PrincipalContext } from '@edrion/auth';
import {
  configurePetrosFunctionSchema,
  createPetrosFunctionVersionSchema,
  petrosMutationReasonSchema,
  petrosRouteContextSchema,
  petrosUsageQuerySchema,
  updatePetrosBudgetPolicySchema,
  upsertPetrosModelSchema,
  upsertPetrosProviderSchema,
  upsertPetrosRoutingRuleSchema,
  type ConfigurePetrosFunctionInput,
  type CreatePetrosFunctionVersionInput,
  type PetrosRouteContext,
  type PetrosUsageQuery,
  type UpdatePetrosBudgetPolicyInput,
  type UpsertPetrosModelInput,
  type UpsertPetrosProviderInput,
  type UpsertPetrosRoutingRuleInput,
} from '@edrion/schemas';
import { PrincipalCtx, ReqContext, RequirePermissions } from '../../common/decorators';
import type { EdrionRequestContext } from '../../common/request-context';
import type { ActionContext } from '../../common/action-context';
import { zodBody } from '../../common/zod-validation.pipe';
import { PetrosAiRoutingService } from './petros-ai-routing.service';

@ApiTags('petros-ai-routing')
@Controller('petros-ai-routing')
export class PetrosAiRoutingController {
  constructor(private readonly service: PetrosAiRoutingService) {}

  private ctx(pc: PrincipalContext, request: EdrionRequestContext): ActionContext {
    return { principalContext: pc, request };
  }

  @Get('overview')
  @RequirePermissions('ai.view')
  overview() {
    return this.service.overview();
  }

  @Get('providers')
  @RequirePermissions('ai.view')
  providers() {
    return this.service.providers();
  }

  @Post('providers')
  @RequirePermissions('ai.configure')
  createProvider(
    @Body(zodBody(upsertPetrosProviderSchema)) body: UpsertPetrosProviderInput,
    @PrincipalCtx() pc: PrincipalContext,
    @ReqContext() request: EdrionRequestContext,
  ) {
    return this.service.createProvider(body, this.ctx(pc, request));
  }

  @Put('providers/:id')
  @RequirePermissions('ai.configure')
  updateProvider(
    @Param('id') id: string,
    @Body(zodBody(upsertPetrosProviderSchema)) body: UpsertPetrosProviderInput,
    @PrincipalCtx() pc: PrincipalContext,
    @ReqContext() request: EdrionRequestContext,
  ) {
    return this.service.updateProvider(id, body, this.ctx(pc, request));
  }

  @Post('providers/:id/test')
  @RequirePermissions('ai.configure')
  testProvider(@Param('id') id: string) {
    return this.service.testProvider(id);
  }

  @Post('models')
  @RequirePermissions('ai.configure')
  createModel(
    @Body(zodBody(upsertPetrosModelSchema)) body: UpsertPetrosModelInput,
    @PrincipalCtx() pc: PrincipalContext,
    @ReqContext() request: EdrionRequestContext,
  ) {
    return this.service.createModel(body, this.ctx(pc, request));
  }

  @Put('models/:id')
  @RequirePermissions('ai.configure')
  updateModel(
    @Param('id') id: string,
    @Body(zodBody(upsertPetrosModelSchema)) body: UpsertPetrosModelInput,
    @PrincipalCtx() pc: PrincipalContext,
    @ReqContext() request: EdrionRequestContext,
  ) {
    return this.service.updateModel(id, body, this.ctx(pc, request));
  }

  @Get('functions')
  @RequirePermissions('ai.view')
  functions() {
    return this.service.functions();
  }

  @Put('functions/:id/config')
  @RequirePermissions('ai.configure')
  configureFunction(
    @Param('id') id: string,
    @Body(zodBody(configurePetrosFunctionSchema)) body: ConfigurePetrosFunctionInput,
    @PrincipalCtx() pc: PrincipalContext,
    @ReqContext() request: EdrionRequestContext,
  ) {
    return this.service.configureFunction(id, body, this.ctx(pc, request));
  }

  @Get('functions/:id/versions')
  @RequirePermissions('ai.view')
  versions(@Param('id') id: string) {
    return this.service.functionVersions(id);
  }

  @Post('functions/:id/versions')
  @RequirePermissions('ai.configure')
  createVersion(
    @Param('id') id: string,
    @Body(zodBody(createPetrosFunctionVersionSchema)) body: CreatePetrosFunctionVersionInput,
    @PrincipalCtx() pc: PrincipalContext,
    @ReqContext() request: EdrionRequestContext,
  ) {
    return this.service.createFunctionVersion(id, body, this.ctx(pc, request));
  }

  @Post('functions/:functionId/versions/:versionId/activate')
  @RequirePermissions('ai.configure')
  activateVersion(
    @Param('functionId') functionId: string,
    @Param('versionId') versionId: string,
    @Body(zodBody(petrosMutationReasonSchema)) body: { reason: string },
    @PrincipalCtx() pc: PrincipalContext,
    @ReqContext() request: EdrionRequestContext,
  ) {
    return this.service.activateFunctionVersion(functionId, versionId, body.reason, this.ctx(pc, request));
  }

  @Get('rules')
  @RequirePermissions('ai.view')
  rules() {
    return this.service.rules();
  }

  @Post('rules')
  @RequirePermissions('ai.configure')
  createRule(
    @Body(zodBody(upsertPetrosRoutingRuleSchema)) body: UpsertPetrosRoutingRuleInput,
    @PrincipalCtx() pc: PrincipalContext,
    @ReqContext() request: EdrionRequestContext,
  ) {
    return this.service.createRule(body, this.ctx(pc, request));
  }

  @Put('rules/:id')
  @RequirePermissions('ai.configure')
  updateRule(
    @Param('id') id: string,
    @Body(zodBody(upsertPetrosRoutingRuleSchema)) body: UpsertPetrosRoutingRuleInput,
    @PrincipalCtx() pc: PrincipalContext,
    @ReqContext() request: EdrionRequestContext,
  ) {
    return this.service.updateRule(id, body, this.ctx(pc, request));
  }

  @Delete('rules/:id')
  @RequirePermissions('ai.configure')
  removeRule(
    @Param('id') id: string,
    @Body(zodBody(petrosMutationReasonSchema)) body: { reason: string },
    @PrincipalCtx() pc: PrincipalContext,
    @ReqContext() request: EdrionRequestContext,
  ) {
    return this.service.removeRule(id, body.reason, this.ctx(pc, request));
  }

  @Get('usage')
  @RequirePermissions('ai.view')
  usage(@Query(zodBody(petrosUsageQuerySchema)) query: PetrosUsageQuery) {
    return this.service.usage(query);
  }

  @Get('budget')
  @RequirePermissions('ai.view')
  budget() {
    return this.service.budget();
  }

  @Put('budget')
  @RequirePermissions('ai.configure')
  updateBudget(
    @Body(zodBody(updatePetrosBudgetPolicySchema)) body: UpdatePetrosBudgetPolicyInput,
    @PrincipalCtx() pc: PrincipalContext,
    @ReqContext() request: EdrionRequestContext,
  ) {
    return this.service.updateBudget(body, this.ctx(pc, request));
  }

  @Post('route-preview')
  @RequirePermissions('ai.view')
  preview(@Body(zodBody(petrosRouteContextSchema)) body: PetrosRouteContext) {
    return this.service.previewRoute(body);
  }
}
