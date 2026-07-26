import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  effectivePolicyQuerySchema,
  evaluateGuardrailSchema,
  listAiPoliciesQuerySchema,
  removeAiActionRuleSchema,
  removeAiPolicySchema,
  setAiKillSwitchSchema,
  upsertAiActionRuleSchema,
  upsertAiPolicySchema,
  type EffectivePolicyQuery,
  type EvaluateGuardrailRequest,
  type ListAiPoliciesQuery,
  type RemoveAiActionRuleInput,
  type RemoveAiPolicyInput,
  type SetAiKillSwitchInput,
  type UpsertAiActionRuleInput,
  type UpsertAiPolicyInput,
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
import { AiGovernanceService } from './ai-governance.service';

@ApiTags('ai-governance')
@Controller('ai-governance')
export class AiGovernanceController {
  constructor(private readonly service: AiGovernanceService) {}

  private ctx(pc: PrincipalContext, request: EdrionRequestContext): ActionContext {
    return { principalContext: pc, request };
  }

  // --- Reads --------------------------------------------------------------------------------

  @Get('overview')
  @RequirePermissions('ai.view')
  overview() {
    return this.service.overview();
  }

  @Get('policies')
  @RequirePermissions('ai.view')
  async listPolicies(@Query(zodBody(listAiPoliciesQuerySchema)) query: ListAiPoliciesQuery) {
    const { items, total } = await this.service.listPolicies(query);
    return {
      items,
      total,
      page: query.page,
      pageSize: query.pageSize,
      hasMore: query.page * query.pageSize < total,
    };
  }

  @Get('rules')
  @RequirePermissions('ai.view')
  listRules() {
    return this.service.listRules();
  }

  /** Effective-policy explainer — resolves the layered policy for a context. */
  @Get('effective-policy')
  @RequirePermissions('ai.view')
  effectivePolicy(@Query(zodBody(effectivePolicyQuerySchema)) query: EffectivePolicyQuery) {
    return this.service.effectivePolicy(query);
  }

  /** Guardrail preview — the SAME evaluation the confirmation lifecycle runs before dispatch. */
  @Post('evaluate')
  @RequirePermissions('ai.view')
  evaluate(@Body(zodBody(evaluateGuardrailSchema)) body: EvaluateGuardrailRequest) {
    return this.service.evaluate(body);
  }

  // --- Policy mutations (ai.configure → sensitive → recent auth) -----------------------------

  @Post('policies')
  @RequirePermissions('ai.configure')
  upsertPolicy(
    @Body(zodBody(upsertAiPolicySchema)) body: UpsertAiPolicyInput,
    @PrincipalCtx() pc: PrincipalContext,
    @ReqContext() request: EdrionRequestContext,
  ) {
    return this.service.upsertPolicy(body, this.ctx(pc, request));
  }

  @Delete('policies/:id')
  @RequirePermissions('ai.configure')
  removePolicy(
    @Param('id') id: string,
    @Body(zodBody(removeAiPolicySchema)) body: RemoveAiPolicyInput,
    @PrincipalCtx() pc: PrincipalContext,
    @ReqContext() request: EdrionRequestContext,
  ) {
    return this.service.removePolicy(id, body, this.ctx(pc, request));
  }

  /** Emergency kill switch. Sensitive (ai.disable) → recent auth enforced by the guard. */
  @Post('kill-switch')
  @RequirePermissions('ai.disable')
  @RequireRecentAuth()
  setKillSwitch(
    @Body(zodBody(setAiKillSwitchSchema)) body: SetAiKillSwitchInput,
    @PrincipalCtx() pc: PrincipalContext,
    @ReqContext() request: EdrionRequestContext,
  ) {
    return this.service.setKillSwitch(body, this.ctx(pc, request));
  }

  // --- Action-rule mutations ----------------------------------------------------------------

  @Post('rules')
  @RequirePermissions('ai.configure')
  upsertRule(
    @Body(zodBody(upsertAiActionRuleSchema)) body: UpsertAiActionRuleInput,
    @PrincipalCtx() pc: PrincipalContext,
    @ReqContext() request: EdrionRequestContext,
  ) {
    return this.service.upsertRule(body, this.ctx(pc, request));
  }

  @Delete('rules/:id')
  @RequirePermissions('ai.configure')
  removeRule(
    @Param('id') id: string,
    @Body(zodBody(removeAiActionRuleSchema)) body: RemoveAiActionRuleInput,
    @PrincipalCtx() pc: PrincipalContext,
    @ReqContext() request: EdrionRequestContext,
  ) {
    return this.service.removeRule(id, body, this.ctx(pc, request));
  }
}
