import { Injectable, NotFoundException } from '@nestjs/common';
import { EntitlementsRepository } from './entitlements.repository';

export interface ResolvedEntitlements {
  institutionId: string;
  subscriptionId: string;
  status: string;
  planName: string | null;
  planVersion: number;
  supportTier: string;
  baseCampusAllowance: number;
  campusCount: number;
  /** Feature key → entitled. Plan-version entitlements (institution overrides land here later). */
  features: Record<string, boolean>;
  /** Effective usage limits: plan-version limits merged with subscription overrides. */
  usageLimits: Record<string, number>;
}

@Injectable()
export class EntitlementsService {
  constructor(private readonly repo: EntitlementsRepository) {}

  /** Resolve the effective entitlements for an institution from its current subscription. */
  async forInstitution(institutionId: string): Promise<ResolvedEntitlements> {
    const src = await this.repo.resolve(institutionId);
    if (!src) {
      throw new NotFoundException({
        code: 'NO_SUBSCRIPTION',
        message: 'Institution has no subscription to resolve entitlements from',
      });
    }
    const { subscription: sub, planVersion: pv } = src;
    return {
      institutionId,
      subscriptionId: sub.id,
      status: sub.status,
      planName: src.planName,
      planVersion: pv.version,
      supportTier: pv.supportTier,
      baseCampusAllowance: pv.baseCampusAllowance,
      campusCount: src.campusCount,
      features: (pv.featureEntitlements ?? {}) as Record<string, boolean>,
      usageLimits: { ...((pv.usageLimits ?? {}) as Record<string, number>), ...((sub.usageLimitsOverride ?? {}) as Record<string, number>) },
    };
  }
}
