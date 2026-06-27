import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { type Currency } from '@edrion/shared-types';
import {
  calculatePlanChangeProration,
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
  type PlanChangeProrationBreakdown,
  type RemoveAddonInput,
  type SchedulePlanChangeInput,
  type SubscriptionStatusActionInput,
  type UsageLimitsInput,
} from '@edrion/schemas';
import type { AuditWriter, AuditEventInput } from '@edrion/audit';
import type { Subscription } from '@edrion/database';
import { AUDIT_WRITER } from '../../common/tokens';
import { baseAudit, type ActionContext } from '../../common/action-context';
import { SubscriptionsRepository, type SubscriptionJoined } from './subscriptions.repository';

const MODULE = 'subscriptions';
const ENTITY = 'subscription';

export interface SubscriptionAddonDto {
  id: string;
  kind: string;
  campusId: string | null;
  quantity: number;
  unitPriceMinor: number;
  active: boolean;
  effectiveDate: string;
}

export interface SubscriptionListItem {
  id: string;
  institutionId: string | null;
  institutionName: string | null;
  planName: string | null;
  planKey: string | null;
  status: string;
  billingCycle: string;
  currency: string;
  basePriceMinor: number;
  periodEnd: string;
  trialEndsAt: string | null;
  version: number;
}

export interface SubscriptionDetail extends SubscriptionListItem {
  planId: string | null;
  planVersionId: string;
  planVersionNumber: number | null;
  listPriceMinor: number;
  overridePriceMinor: number | null;
  perCampusPriceMinor: number;
  institutionPerCampusPriceMinor: number | null;
  discountBps: number;
  creditBalanceMinor: number;
  overagePolicy: string;
  baseCampusAllowance: number | null;
  campusCount: number;
  usageLimits: Record<string, number>;
  periodStart: string;
  pausedAt: string | null;
  cancelAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  gracePeriodEndsAt: string | null;
  scheduledPlanVersionId: string | null;
  scheduledBillingCycle: string | null;
  scheduledChangeAt: string | null;
  addons: SubscriptionAddonDto[];
  createdAt: string;
  updatedAt: string;
}

@Injectable()
export class SubscriptionsService {
  constructor(
    private readonly repo: SubscriptionsRepository,
    @Inject(AUDIT_WRITER) private readonly audit: AuditWriter,
  ) {}

  // --- Reads -------------------------------------------------------------------

  async list(q: ListSubscriptionsQuery): Promise<{ items: SubscriptionListItem[]; total: number }> {
    const { items, total } = await this.repo.list(q);
    return { items: items.map((j) => this.toListItem(j)), total };
  }

  summary(institutionId?: string) {
    return this.repo.summaryByStatus(institutionId);
  }

  async get(id: string): Promise<SubscriptionDetail> {
    const joined = await this.requireJoined(id);
    return this.toDetail(joined);
  }

  /** Latest subscription for an institution, for the detail-page Subscription tab. */
  async getByInstitution(institutionId: string): Promise<SubscriptionDetail | null> {
    const joined = await this.repo.findJoinedByInstitution(institutionId);
    return joined ? this.toDetail(joined) : null;
  }

  // --- Plan change (immediate / scheduled) + previews --------------------------

  async previewPlanChange(id: string, input: PlanChangePreviewInput): Promise<PlanChangeProrationBreakdown> {
    const joined = await this.requireJoined(id);
    const target = await this.requireTargetPlanVersion(input.planVersionId);
    const cycle = input.billingCycle ?? joined.subscription.billingCycle;
    return this.prorate(joined, this.planPriceForCycle(target.planVersion, cycle), input.effectiveDate);
  }

  async changePlan(id: string, input: ChangePlanInput, ctx: ActionContext): Promise<SubscriptionDetail> {
    const joined = await this.requireJoined(id);
    const target = await this.requireTargetPlanVersion(input.planVersionId);
    const cycle = input.billingCycle ?? joined.subscription.billingCycle;
    const proration = this.prorate(joined, this.planPriceForCycle(target.planVersion, cycle), input.effectiveDate);

    const creditDelta = proration.isCredit ? -proration.totalMinor : 0;
    const updated = await this.repo.updateWithVersion(id, input.version, {
      planVersionId: input.planVersionId,
      billingCycle: cycle,
      creditBalanceMinor: joined.subscription.creditBalanceMinor + creditDelta,
      // a future-dated plan change clears any previously scheduled one
      scheduledPlanVersionId: null,
      scheduledBillingCycle: null,
      scheduledChangeAt: null,
      updatedBy: ctx.principalContext.principal.employeeId,
    });
    if (!updated) throw this.versionConflict();

    await this.writeAudit(ctx, updated, 'subscription.change_plan', {
      reason: input.reason,
      previousState: { planVersionId: joined.subscription.planVersionId, billingCycle: joined.subscription.billingCycle },
      newState: { planVersionId: input.planVersionId, billingCycle: cycle, prorationImpactMinor: proration.totalMinor },
    });
    return this.get(id);
  }

  async schedulePlanChange(id: string, input: SchedulePlanChangeInput, ctx: ActionContext): Promise<SubscriptionDetail> {
    await this.requireSub(id);
    await this.requireTargetPlanVersion(input.planVersionId);
    const updated = await this.repo.updateWithVersion(id, input.version, {
      scheduledPlanVersionId: input.planVersionId,
      scheduledBillingCycle: input.billingCycle ?? null,
      scheduledChangeAt: new Date(input.scheduledChangeAt),
      updatedBy: ctx.principalContext.principal.employeeId,
    });
    if (!updated) throw this.versionConflict();
    await this.writeAudit(ctx, updated, 'subscription.schedule_plan_change', {
      reason: input.reason,
      newState: { planVersionId: input.planVersionId, scheduledChangeAt: input.scheduledChangeAt },
    });
    return this.get(id);
  }

  // --- Cycle change ------------------------------------------------------------

  async previewCycleChange(id: string, input: CycleChangePreviewInput): Promise<PlanChangeProrationBreakdown> {
    const joined = await this.requireJoined(id);
    const newPrice = this.currentPlanPriceForCycle(joined, input.billingCycle);
    return this.prorate(joined, newPrice, input.effectiveDate);
  }

  async changeCycle(id: string, input: ChangeCycleInput, ctx: ActionContext): Promise<SubscriptionDetail> {
    const joined = await this.requireJoined(id);
    if (input.billingCycle === joined.subscription.billingCycle) {
      throw new BadRequestException({ code: 'SAME_CYCLE', message: 'Subscription is already on this billing cycle' });
    }
    const newPrice = this.currentPlanPriceForCycle(joined, input.billingCycle);
    const proration = this.prorate(joined, newPrice, input.effectiveDate);
    const creditDelta = proration.isCredit ? -proration.totalMinor : 0;

    const updated = await this.repo.updateWithVersion(id, input.version, {
      billingCycle: input.billingCycle,
      creditBalanceMinor: joined.subscription.creditBalanceMinor + creditDelta,
      updatedBy: ctx.principalContext.principal.employeeId,
    });
    if (!updated) throw this.versionConflict();
    await this.writeAudit(ctx, updated, 'subscription.change_cycle', {
      reason: input.reason,
      previousState: { billingCycle: joined.subscription.billingCycle },
      newState: { billingCycle: input.billingCycle, prorationImpactMinor: proration.totalMinor },
    });
    return this.get(id);
  }

  // --- Trial / add-ons / pricing / discount / credit / usage / grace -----------

  async extendTrial(id: string, input: ExtendSubTrialInput, ctx: ActionContext): Promise<SubscriptionDetail> {
    const sub = await this.requireSub(id);
    const updated = await this.repo.updateWithVersion(id, input.version, {
      trialEndsAt: new Date(input.trialEndsAt),
      updatedBy: ctx.principalContext.principal.employeeId,
    });
    if (!updated) throw this.versionConflict();
    await this.writeAudit(ctx, updated, 'subscription.extend_trial', {
      reason: input.reason,
      previousState: { trialEndsAt: iso(sub.trialEndsAt) },
      newState: { trialEndsAt: input.trialEndsAt },
    });
    return this.get(id);
  }

  async addCampusAddon(id: string, input: AddCampusAddonInput, ctx: ActionContext): Promise<SubscriptionDetail> {
    const joined = await this.requireJoined(id);
    const sub = joined.subscription;
    const unitPriceMinor =
      input.unitPriceMinor ??
      sub.institutionPerCampusPriceMinor ??
      joined.planPerCampusPriceMinor ??
      0;
    const claimed = await this.repo.updateWithVersion(id, input.version, {
      updatedBy: ctx.principalContext.principal.employeeId,
    });
    if (!claimed) throw this.versionConflict();
    const addon = await this.repo.insertAddon({
      subscriptionId: id,
      kind: 'campus',
      campusId: input.campusId ?? null,
      quantity: input.quantity,
      unitPriceMinor,
      active: true,
      effectiveDate: input.effectiveDate ? new Date(input.effectiveDate) : new Date(),
    });
    await this.writeAudit(ctx, claimed, 'subscription.add_addon', {
      reason: input.reason,
      newState: { addonId: addon.id, quantity: addon.quantity, unitPriceMinor: addon.unitPriceMinor },
    });
    return this.get(id);
  }

  async removeAddon(id: string, input: RemoveAddonInput, ctx: ActionContext): Promise<SubscriptionDetail> {
    await this.requireSub(id);
    const addon = await this.repo.findAddon(input.addonId);
    if (!addon || addon.subscriptionId !== id) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Add-on not found on this subscription' });
    }
    const claimed = await this.repo.updateWithVersion(id, input.version, {
      updatedBy: ctx.principalContext.principal.employeeId,
    });
    if (!claimed) throw this.versionConflict();
    await this.repo.deactivateAddon(input.addonId);
    await this.writeAudit(ctx, claimed, 'subscription.remove_addon', {
      reason: input.reason,
      previousState: { addonId: addon.id, active: true },
      newState: { addonId: addon.id, active: false },
    });
    return this.get(id);
  }

  async overridePricing(id: string, input: OverridePricingInput, ctx: ActionContext): Promise<SubscriptionDetail> {
    const sub = await this.requireSub(id);
    const patch: Partial<Subscription> = { updatedBy: ctx.principalContext.principal.employeeId };
    if (input.overridePriceMinor !== undefined) patch.overridePriceMinor = input.overridePriceMinor;
    if (input.institutionPerCampusPriceMinor !== undefined) {
      patch.institutionPerCampusPriceMinor = input.institutionPerCampusPriceMinor;
    }
    const updated = await this.repo.updateWithVersion(id, input.version, patch);
    if (!updated) throw this.versionConflict();
    await this.writeAudit(ctx, updated, 'subscription.override_pricing', {
      reason: input.reason,
      previousState: { overridePriceMinor: sub.overridePriceMinor, institutionPerCampusPriceMinor: sub.institutionPerCampusPriceMinor },
      newState: { overridePriceMinor: updated.overridePriceMinor, institutionPerCampusPriceMinor: updated.institutionPerCampusPriceMinor },
    });
    return this.get(id);
  }

  async setDiscount(id: string, input: DiscountInput, ctx: ActionContext): Promise<SubscriptionDetail> {
    const sub = await this.requireSub(id);
    const updated = await this.repo.updateWithVersion(id, input.version, {
      discountBps: input.discountBps,
      updatedBy: ctx.principalContext.principal.employeeId,
    });
    if (!updated) throw this.versionConflict();
    await this.writeAudit(ctx, updated, 'subscription.set_discount', {
      reason: input.reason,
      previousState: { discountBps: sub.discountBps },
      newState: { discountBps: updated.discountBps },
    });
    return this.get(id);
  }

  async adjustCredit(id: string, input: CreditInput, ctx: ActionContext): Promise<SubscriptionDetail> {
    const sub = await this.requireSub(id);
    const next = sub.creditBalanceMinor + input.amountMinor;
    if (next < 0) {
      throw new BadRequestException({ code: 'INSUFFICIENT_CREDIT', message: 'Credit balance cannot go negative' });
    }
    const updated = await this.repo.updateWithVersion(id, input.version, {
      creditBalanceMinor: next,
      updatedBy: ctx.principalContext.principal.employeeId,
    });
    if (!updated) throw this.versionConflict();
    await this.writeAudit(ctx, updated, 'subscription.adjust_credit', {
      reason: input.reason,
      previousState: { creditBalanceMinor: sub.creditBalanceMinor },
      newState: { creditBalanceMinor: next, deltaMinor: input.amountMinor },
    });
    return this.get(id);
  }

  async setUsageLimits(id: string, input: UsageLimitsInput, ctx: ActionContext): Promise<SubscriptionDetail> {
    const sub = await this.requireSub(id);
    const updated = await this.repo.updateWithVersion(id, input.version, {
      usageLimitsOverride: input.usageLimitsOverride,
      updatedBy: ctx.principalContext.principal.employeeId,
    });
    if (!updated) throw this.versionConflict();
    await this.writeAudit(ctx, updated, 'subscription.set_usage_limits', {
      reason: input.reason,
      previousState: { usageLimitsOverride: sub.usageLimitsOverride },
      newState: { usageLimitsOverride: input.usageLimitsOverride },
    });
    return this.get(id);
  }

  async setOverage(id: string, input: OverageInput, ctx: ActionContext): Promise<SubscriptionDetail> {
    const sub = await this.requireSub(id);
    const updated = await this.repo.updateWithVersion(id, input.version, {
      overagePolicy: input.overagePolicy,
      updatedBy: ctx.principalContext.principal.employeeId,
    });
    if (!updated) throw this.versionConflict();
    await this.writeAudit(ctx, updated, 'subscription.set_overage', {
      reason: input.reason,
      previousState: { overagePolicy: sub.overagePolicy },
      newState: { overagePolicy: input.overagePolicy },
    });
    return this.get(id);
  }

  async setGrace(id: string, input: GraceInput, ctx: ActionContext): Promise<SubscriptionDetail> {
    const sub = await this.requireSub(id);
    const updated = await this.repo.updateWithVersion(id, input.version, {
      status: 'grace',
      gracePeriodEndsAt: new Date(input.gracePeriodEndsAt),
      updatedBy: ctx.principalContext.principal.employeeId,
    });
    if (!updated) throw this.versionConflict();
    await this.writeAudit(ctx, updated, 'subscription.set_grace', {
      reason: input.reason,
      previousState: { status: sub.status, gracePeriodEndsAt: iso(sub.gracePeriodEndsAt) },
      newState: { status: 'grace', gracePeriodEndsAt: input.gracePeriodEndsAt },
    });
    return this.get(id);
  }

  // --- Lifecycle ---------------------------------------------------------------

  async pause(id: string, input: SubscriptionStatusActionInput, ctx: ActionContext): Promise<SubscriptionDetail> {
    const sub = await this.requireSub(id);
    if (sub.status === 'cancelled' || sub.status === 'expired') {
      throw new BadRequestException({ code: 'NOT_PAUSABLE', message: 'A cancelled or expired subscription cannot be paused' });
    }
    const updated = await this.repo.updateWithVersion(id, input.version, {
      status: 'paused',
      pausedAt: new Date(),
      updatedBy: ctx.principalContext.principal.employeeId,
    });
    if (!updated) throw this.versionConflict();
    await this.writeAudit(ctx, updated, 'subscription.pause', {
      reason: input.reason,
      previousState: { status: sub.status },
      newState: { status: 'paused' },
    });
    return this.get(id);
  }

  async resume(id: string, input: SubscriptionStatusActionInput, ctx: ActionContext): Promise<SubscriptionDetail> {
    const sub = await this.requireSub(id);
    if (sub.status !== 'paused') {
      throw new BadRequestException({ code: 'NOT_PAUSED', message: 'Only a paused subscription can be resumed' });
    }
    const updated = await this.repo.updateWithVersion(id, input.version, {
      status: 'active',
      pausedAt: null,
      updatedBy: ctx.principalContext.principal.employeeId,
    });
    if (!updated) throw this.versionConflict();
    await this.writeAudit(ctx, updated, 'subscription.resume', {
      reason: input.reason,
      previousState: { status: sub.status },
      newState: { status: 'active' },
    });
    return this.get(id);
  }

  async cancel(id: string, input: CancelSubscriptionInput, ctx: ActionContext): Promise<SubscriptionDetail> {
    const sub = await this.requireSub(id);
    if (sub.status === 'cancelled') {
      throw new BadRequestException({ code: 'ALREADY_CANCELLED', message: 'Subscription is already cancelled' });
    }
    const now = new Date();
    const patch: Partial<Subscription> = input.immediate
      ? { status: 'cancelled', cancelledAt: now, cancelReason: input.reason, cancelAt: now }
      : { cancelAt: input.cancelAt ? new Date(input.cancelAt) : sub.periodEnd, cancelReason: input.reason };
    const updated = await this.repo.updateWithVersion(id, input.version, {
      ...patch,
      updatedBy: ctx.principalContext.principal.employeeId,
    });
    if (!updated) throw this.versionConflict();
    await this.writeAudit(ctx, updated, 'subscription.cancel', {
      reason: input.reason,
      previousState: { status: sub.status },
      newState: { status: updated.status, immediate: input.immediate, cancelAt: iso(updated.cancelAt) },
    });
    return this.get(id);
  }

  // --- Helpers -----------------------------------------------------------------

  private prorate(
    joined: SubscriptionJoined,
    newPeriodPriceMinor: number,
    effectiveDate?: string,
  ): PlanChangeProrationBreakdown {
    const sub = joined.subscription;
    const currentPeriodPriceMinor = sub.overridePriceMinor ?? this.currentPlanPriceForCycle(joined, sub.billingCycle);
    return calculatePlanChangeProration(
      {
        currency: sub.currency as Currency,
        currentPeriodPriceMinor,
        newPeriodPriceMinor,
        periodStart: sub.periodStart.toISOString(),
        periodEnd: sub.periodEnd.toISOString(),
      },
      { effectiveDate },
    );
  }

  private currentPlanPriceForCycle(joined: SubscriptionJoined, cycle: string): number {
    return cycle === 'annual'
      ? joined.planAnnualPriceMinor ?? 0
      : joined.planMonthlyPriceMinor ?? 0;
  }

  private planPriceForCycle(pv: { monthlyPriceMinor: number; annualPriceMinor: number }, cycle: string): number {
    return cycle === 'annual' ? pv.annualPriceMinor : pv.monthlyPriceMinor;
  }

  private async requireTargetPlanVersion(planVersionId: string) {
    const target = await this.repo.planVersionWithPlan(planVersionId);
    if (!target) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Target plan version not found' });
    if (target.planVersion.status !== 'published') {
      throw new BadRequestException({
        code: 'PLAN_VERSION_NOT_PUBLISHED',
        message: 'A subscription can only move to a published plan version',
      });
    }
    return target;
  }

  private async requireSub(id: string): Promise<Subscription> {
    const sub = await this.repo.findById(id);
    if (!sub) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Subscription not found' });
    return sub;
  }

  private async requireJoined(id: string): Promise<SubscriptionJoined> {
    const joined = await this.repo.findJoined(id);
    if (!joined) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Subscription not found' });
    return joined;
  }

  private toListItem(j: SubscriptionJoined): SubscriptionListItem {
    const sub = j.subscription;
    const basePriceMinor = sub.overridePriceMinor ?? this.currentPlanPriceForCycle(j, sub.billingCycle);
    return {
      id: sub.id,
      institutionId: sub.institutionId,
      institutionName: j.institutionName,
      planName: j.planName,
      planKey: j.planKey,
      status: sub.status,
      billingCycle: sub.billingCycle,
      currency: sub.currency,
      basePriceMinor,
      periodEnd: sub.periodEnd.toISOString(),
      trialEndsAt: iso(sub.trialEndsAt),
      version: sub.version,
    };
  }

  private async toDetail(j: SubscriptionJoined): Promise<SubscriptionDetail> {
    const sub = j.subscription;
    const addons = await this.repo.addonsForSub(sub.id);
    const campusCount = sub.institutionId ? await this.repo.campusCountForInstitution(sub.institutionId) : 0;
    const usageLimits = { ...(j.planUsageLimits ?? {}), ...(sub.usageLimitsOverride ?? {}) };
    return {
      ...this.toListItem(j),
      planId: j.planId,
      planVersionId: sub.planVersionId,
      planVersionNumber: j.planVersionNumber,
      listPriceMinor: this.currentPlanPriceForCycle(j, sub.billingCycle),
      overridePriceMinor: sub.overridePriceMinor,
      perCampusPriceMinor: sub.institutionPerCampusPriceMinor ?? j.planPerCampusPriceMinor ?? 0,
      institutionPerCampusPriceMinor: sub.institutionPerCampusPriceMinor,
      discountBps: sub.discountBps,
      creditBalanceMinor: sub.creditBalanceMinor,
      overagePolicy: sub.overagePolicy,
      baseCampusAllowance: j.planBaseCampusAllowance,
      campusCount,
      usageLimits,
      periodStart: sub.periodStart.toISOString(),
      pausedAt: iso(sub.pausedAt),
      cancelAt: iso(sub.cancelAt),
      cancelledAt: iso(sub.cancelledAt),
      cancelReason: sub.cancelReason,
      gracePeriodEndsAt: iso(sub.gracePeriodEndsAt),
      scheduledPlanVersionId: sub.scheduledPlanVersionId,
      scheduledBillingCycle: sub.scheduledBillingCycle,
      scheduledChangeAt: iso(sub.scheduledChangeAt),
      addons: addons.map((a) => ({
        id: a.id,
        kind: a.kind,
        campusId: a.campusId,
        quantity: a.quantity,
        unitPriceMinor: a.unitPriceMinor,
        active: a.active,
        effectiveDate: a.effectiveDate.toISOString(),
      })),
      createdAt: sub.createdAt.toISOString(),
      updatedAt: sub.updatedAt.toISOString(),
    };
  }

  private async writeAudit(
    ctx: ActionContext,
    sub: Subscription,
    action: string,
    extra: Partial<AuditEventInput> = {},
  ): Promise<void> {
    await this.audit.logAudit({
      ...baseAudit(ctx),
      action,
      module: MODULE,
      entityType: ENTITY,
      entityId: sub.id,
      institutionId: sub.institutionId ?? undefined,
      ...extra,
    } as AuditEventInput);
  }

  private versionConflict() {
    return new ConflictException({
      code: 'VERSION_CONFLICT',
      message: 'This subscription changed since you loaded it. Reload and try again.',
    });
  }
}

function iso(d: Date | null): string | null {
  return d ? d.toISOString() : null;
}
