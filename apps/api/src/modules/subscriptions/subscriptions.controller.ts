import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import {
  addCampusAddonSchema,
  cancelSubscriptionSchema,
  changeCycleSchema,
  changePlanSchema,
  creditSchema,
  cycleChangePreviewSchema,
  discountSchema,
  extendSubTrialSchema,
  graceSchema,
  listSubscriptionsQuerySchema,
  overageSchema,
  overridePricingSchema,
  planChangePreviewSchema,
  removeAddonSchema,
  schedulePlanChangeSchema,
  subscriptionStatusActionSchema,
  usageLimitsSchema,
  type AddCampusAddonInput,
  type CancelSubscriptionInput,
  type ChangeCycleInput,
  type ChangePlanInput,
  type CreditInput,
  type CycleChangePreviewInput,
  type DiscountInput,
  type ExtendSubTrialInput,
  type GraceInput,
  type ListSubscriptionsQuery,
  type OverageInput,
  type OverridePricingInput,
  type PlanChangePreviewInput,
  type RemoveAddonInput,
  type SchedulePlanChangeInput,
  type SubscriptionStatusActionInput,
  type UsageLimitsInput,
} from '@edrion/schemas';
import type { PrincipalContext } from '@edrion/auth';
import { PrincipalCtx, ReqContext, RequirePermissions } from '../../common/decorators';
import { zodBody } from '../../common/zod-validation.pipe';
import type { EdrionRequestContext } from '../../common/request-context';
import type { ActionContext } from '../../common/action-context';
import { SubscriptionsService } from './subscriptions.service';

const summaryQuerySchema = z.object({ institutionId: z.string().uuid().optional() });
const byInstitutionQuerySchema = z.object({ institutionId: z.string().uuid() });

@ApiTags('subscriptions')
@Controller('subscriptions')
export class SubscriptionsController {
  constructor(private readonly service: SubscriptionsService) {}

  private ctx(pc: PrincipalContext, request: EdrionRequestContext): ActionContext {
    return { principalContext: pc, request };
  }

  @Get()
  @RequirePermissions('subscriptions.view')
  async list(@Query(zodBody(listSubscriptionsQuerySchema)) query: ListSubscriptionsQuery) {
    const { items, total } = await this.service.list(query);
    return { items, total, page: query.page, pageSize: query.pageSize, hasMore: query.page * query.pageSize < total };
  }

  @Get('summary')
  @RequirePermissions('subscriptions.view')
  summary(@Query(zodBody(summaryQuerySchema)) query: { institutionId?: string }) {
    return this.service.summary(query.institutionId);
  }

  @Get('by-institution')
  @RequirePermissions('subscriptions.view')
  byInstitution(@Query(zodBody(byInstitutionQuerySchema)) query: { institutionId: string }) {
    return this.service.getByInstitution(query.institutionId);
  }

  @Get(':id')
  @RequirePermissions('subscriptions.view')
  get(@Param('id') id: string) {
    return this.service.get(id);
  }

  // --- Previews (read-only) ---------------------------------------------------

  @Post(':id/plan-change-preview')
  @RequirePermissions('subscriptions.view')
  previewPlanChange(
    @Param('id') id: string,
    @Body(zodBody(planChangePreviewSchema)) body: PlanChangePreviewInput,
  ) {
    return this.service.previewPlanChange(id, body);
  }

  @Post(':id/cycle-change-preview')
  @RequirePermissions('subscriptions.view')
  previewCycleChange(
    @Param('id') id: string,
    @Body(zodBody(cycleChangePreviewSchema)) body: CycleChangePreviewInput,
  ) {
    return this.service.previewCycleChange(id, body);
  }

  // --- Mutations --------------------------------------------------------------

  @Post(':id/change-plan')
  @RequirePermissions('subscriptions.update')
  changePlan(
    @Param('id') id: string,
    @Body(zodBody(changePlanSchema)) body: ChangePlanInput,
    @PrincipalCtx() pc: PrincipalContext,
    @ReqContext() request: EdrionRequestContext,
  ) {
    return this.service.changePlan(id, body, this.ctx(pc, request));
  }

  @Post(':id/schedule-plan-change')
  @RequirePermissions('subscriptions.update')
  schedulePlanChange(
    @Param('id') id: string,
    @Body(zodBody(schedulePlanChangeSchema)) body: SchedulePlanChangeInput,
    @PrincipalCtx() pc: PrincipalContext,
    @ReqContext() request: EdrionRequestContext,
  ) {
    return this.service.schedulePlanChange(id, body, this.ctx(pc, request));
  }

  @Post(':id/change-cycle')
  @RequirePermissions('subscriptions.update')
  changeCycle(
    @Param('id') id: string,
    @Body(zodBody(changeCycleSchema)) body: ChangeCycleInput,
    @PrincipalCtx() pc: PrincipalContext,
    @ReqContext() request: EdrionRequestContext,
  ) {
    return this.service.changeCycle(id, body, this.ctx(pc, request));
  }

  @Post(':id/extend-trial')
  @RequirePermissions('subscriptions.update')
  extendTrial(
    @Param('id') id: string,
    @Body(zodBody(extendSubTrialSchema)) body: ExtendSubTrialInput,
    @PrincipalCtx() pc: PrincipalContext,
    @ReqContext() request: EdrionRequestContext,
  ) {
    return this.service.extendTrial(id, body, this.ctx(pc, request));
  }

  @Post(':id/add-addon')
  @RequirePermissions('subscriptions.update')
  addAddon(
    @Param('id') id: string,
    @Body(zodBody(addCampusAddonSchema)) body: AddCampusAddonInput,
    @PrincipalCtx() pc: PrincipalContext,
    @ReqContext() request: EdrionRequestContext,
  ) {
    return this.service.addCampusAddon(id, body, this.ctx(pc, request));
  }

  @Post(':id/remove-addon')
  @RequirePermissions('subscriptions.update')
  removeAddon(
    @Param('id') id: string,
    @Body(zodBody(removeAddonSchema)) body: RemoveAddonInput,
    @PrincipalCtx() pc: PrincipalContext,
    @ReqContext() request: EdrionRequestContext,
  ) {
    return this.service.removeAddon(id, body, this.ctx(pc, request));
  }

  @Post(':id/override-pricing')
  @RequirePermissions('subscriptions.override_pricing')
  overridePricing(
    @Param('id') id: string,
    @Body(zodBody(overridePricingSchema)) body: OverridePricingInput,
    @PrincipalCtx() pc: PrincipalContext,
    @ReqContext() request: EdrionRequestContext,
  ) {
    return this.service.overridePricing(id, body, this.ctx(pc, request));
  }

  @Post(':id/discount')
  @RequirePermissions('subscriptions.update')
  discount(
    @Param('id') id: string,
    @Body(zodBody(discountSchema)) body: DiscountInput,
    @PrincipalCtx() pc: PrincipalContext,
    @ReqContext() request: EdrionRequestContext,
  ) {
    return this.service.setDiscount(id, body, this.ctx(pc, request));
  }

  @Post(':id/credit')
  @RequirePermissions('subscriptions.issue_credit')
  credit(
    @Param('id') id: string,
    @Body(zodBody(creditSchema)) body: CreditInput,
    @PrincipalCtx() pc: PrincipalContext,
    @ReqContext() request: EdrionRequestContext,
  ) {
    return this.service.adjustCredit(id, body, this.ctx(pc, request));
  }

  @Post(':id/usage-limits')
  @RequirePermissions('subscriptions.update')
  usageLimits(
    @Param('id') id: string,
    @Body(zodBody(usageLimitsSchema)) body: UsageLimitsInput,
    @PrincipalCtx() pc: PrincipalContext,
    @ReqContext() request: EdrionRequestContext,
  ) {
    return this.service.setUsageLimits(id, body, this.ctx(pc, request));
  }

  @Post(':id/overage')
  @RequirePermissions('subscriptions.update')
  overage(
    @Param('id') id: string,
    @Body(zodBody(overageSchema)) body: OverageInput,
    @PrincipalCtx() pc: PrincipalContext,
    @ReqContext() request: EdrionRequestContext,
  ) {
    return this.service.setOverage(id, body, this.ctx(pc, request));
  }

  @Post(':id/grace')
  @RequirePermissions('subscriptions.update')
  grace(
    @Param('id') id: string,
    @Body(zodBody(graceSchema)) body: GraceInput,
    @PrincipalCtx() pc: PrincipalContext,
    @ReqContext() request: EdrionRequestContext,
  ) {
    return this.service.setGrace(id, body, this.ctx(pc, request));
  }

  @Post(':id/pause')
  @RequirePermissions('subscriptions.update')
  pause(
    @Param('id') id: string,
    @Body(zodBody(subscriptionStatusActionSchema)) body: SubscriptionStatusActionInput,
    @PrincipalCtx() pc: PrincipalContext,
    @ReqContext() request: EdrionRequestContext,
  ) {
    return this.service.pause(id, body, this.ctx(pc, request));
  }

  @Post(':id/resume')
  @RequirePermissions('subscriptions.update')
  resume(
    @Param('id') id: string,
    @Body(zodBody(subscriptionStatusActionSchema)) body: SubscriptionStatusActionInput,
    @PrincipalCtx() pc: PrincipalContext,
    @ReqContext() request: EdrionRequestContext,
  ) {
    return this.service.resume(id, body, this.ctx(pc, request));
  }

  @Post(':id/cancel')
  @RequirePermissions('subscriptions.cancel')
  cancel(
    @Param('id') id: string,
    @Body(zodBody(cancelSubscriptionSchema)) body: CancelSubscriptionInput,
    @PrincipalCtx() pc: PrincipalContext,
    @ReqContext() request: EdrionRequestContext,
  ) {
    return this.service.cancel(id, body, this.ctx(pc, request));
  }
}
