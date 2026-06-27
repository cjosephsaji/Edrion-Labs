import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { CampusBillingStatus, type Currency } from '@edrion/shared-types';
import {
  calculateCampusCharge,
  type CampusChargeBreakdown,
  type CampusChargePreviewInput,
  type CampusPricingContext,
  type CreateCampusInput,
  type ListCampusesQuery,
} from '@edrion/schemas';
import type { AuditWriter } from '@edrion/audit';
import type { Campus } from '@edrion/database';
import { AUDIT_WRITER } from '../../common/tokens';
import { baseAudit, type ActionContext } from '../../common/action-context';
import { CampusesRepository } from './campuses.repository';

const MODULE = 'campuses';

@Injectable()
export class CampusesService {
  constructor(
    private readonly repo: CampusesRepository,
    @Inject(AUDIT_WRITER) private readonly audit: AuditWriter,
  ) {}

  list(q: ListCampusesQuery) {
    return this.repo.list(q);
  }

  /**
   * Build the pricing context from the institution's active subscription and compute the
   * charge for adding one campus. Pure calc lives in @edrion/schemas; this just feeds it.
   */
  async previewCharge(input: CampusChargePreviewInput): Promise<CampusChargeBreakdown> {
    const ctx = await this.buildPricingContext(input.institutionId);
    return calculateCampusCharge(ctx, {
      effectiveDate: input.effectiveDate,
      forcePaidAddon: input.forcePaidAddon,
      customDiscountBps: input.customDiscountBps,
    });
  }

  async create(input: CreateCampusInput, ctx: ActionContext): Promise<{ campus: Campus; charge: CampusChargeBreakdown }> {
    const pricing = await this.buildPricingContext(input.institutionId);
    const charge = calculateCampusCharge(pricing, {
      effectiveDate: input.effectiveBillingDate,
      forcePaidAddon: input.forcePaidAddon,
      customDiscountBps: input.customDiscountBps,
    });

    const campus = await this.repo.insert({
      institutionId: input.institutionId,
      name: input.name,
      code: input.code,
      address: input.address ?? null,
      contact: input.contact ?? null,
      timezoneOverride: input.timezoneOverride ?? null,
      studentCapacity: input.studentCapacity ?? null,
      openingDate: input.openingDate ? new Date(input.openingDate) : null,
      effectiveBillingDate: input.effectiveBillingDate ? new Date(input.effectiveBillingDate) : null,
      billingStatus: charge.includedInBase ? CampusBillingStatus.Included : CampusBillingStatus.PaidAddon,
      addonPriceMinor: charge.includedInBase ? null : charge.listPriceMinor,
      customDiscountBps: input.customDiscountBps ?? null,
      createdBy: ctx.principalContext.principal.employeeId,
    });

    await this.audit.logAudit({
      ...baseAudit(ctx),
      action: 'campus.create',
      module: MODULE,
      entityType: 'campus',
      entityId: campus.id,
      institutionId: input.institutionId,
      newState: {
        name: campus.name,
        billingStatus: campus.billingStatus,
        chargeMinor: charge.totalMinor,
        currency: charge.currency,
      },
    } as Parameters<AuditWriter['logAudit']>[0]);

    return { campus, charge };
  }

  async suspend(id: string, version: number, reason: string, ctx: ActionContext): Promise<Campus> {
    const existing = await this.repo.findById(id);
    if (!existing) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Campus not found' });
    const updated = await this.repo.updateStatus(id, version, {
      isActive: false,
      billingStatus: CampusBillingStatus.Suspended,
      suspendedAt: new Date(),
      updatedBy: ctx.principalContext.principal.employeeId,
    });
    if (!updated) {
      throw new BadRequestException({ code: 'VERSION_CONFLICT', message: 'Reload and retry' });
    }
    await this.audit.logAudit({
      ...baseAudit(ctx),
      action: 'campus.suspend',
      module: MODULE,
      entityType: 'campus',
      entityId: id,
      institutionId: existing.institutionId,
      reason,
      previousState: { isActive: existing.isActive },
      newState: { isActive: false },
    } as Parameters<AuditWriter['logAudit']>[0]);
    return updated;
  }

  private async buildPricingContext(institutionId: string): Promise<CampusPricingContext> {
    const current = await this.repo.countForInstitution(institutionId);
    const subPlan = await this.repo.activeSubscriptionWithPlan(institutionId);
    if (!subPlan) {
      throw new BadRequestException({
        code: 'NO_SUBSCRIPTION',
        message: 'Institution has no active subscription to price a campus against',
      });
    }
    const { subscription, planVersion } = subPlan;
    return {
      baseCampusAllowance: planVersion.baseCampusAllowance,
      currentCampusCount: current,
      perCampusPriceMinor: planVersion.perCampusPriceMinor,
      currency: subscription.currency as Currency,
      institutionOverridePriceMinor: subscription.institutionPerCampusPriceMinor ?? undefined,
      periodStart: subscription.periodStart.toISOString(),
      periodEnd: subscription.periodEnd.toISOString(),
    };
  }
}
