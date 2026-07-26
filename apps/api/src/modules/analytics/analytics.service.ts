import { Injectable } from '@nestjs/common';
import { PendingActionPriority } from '@edrion/shared-types';
import { AnalyticsRepository, type PendingInstitutionRow } from './analytics.repository';

export interface PendingActionItem {
  id: string;
  priority: PendingActionPriority;
  category: string;
  title: string;
  description: string;
  href: string;
}

export type PendingActionsGrouped = Record<PendingActionPriority, PendingActionItem[]>;

const DAY = 86_400_000;

@Injectable()
export class AnalyticsService {
  constructor(private readonly repo: AnalyticsRepository) {}

  dashboard() {
    return this.repo.dashboard();
  }

  async pendingActions(): Promise<{ groups: PendingActionsGrouped; total: number }> {
    const [institutions, overdue] = await Promise.all([
      this.repo.institutionsForPendingActions(),
      this.repo.overdueInvoices(),
    ]);

    const items: PendingActionItem[] = [];
    const now = Date.now();

    for (const inst of institutions) {
      items.push(...this.classifyInstitution(inst, now));
    }

    for (const inv of overdue) {
      items.push({
        id: `invoice-${inv.id}`,
        priority: PendingActionPriority.Critical,
        category: 'billing',
        title: `Overdue invoice ${inv.number ?? ''}`.trim(),
        description: `Invoice past due — $${(inv.amountDueMinor / 100).toFixed(2)} outstanding.`,
        href: `/institutions/${inv.institutionId}`,
      });
    }

    const groups: PendingActionsGrouped = {
      [PendingActionPriority.Critical]: [],
      [PendingActionPriority.Today]: [],
      [PendingActionPriority.Upcoming]: [],
      [PendingActionPriority.Informational]: [],
    };
    for (const item of items) groups[item.priority].push(item);

    return { groups, total: items.length };
  }

  private classifyInstitution(inst: PendingInstitutionRow, now: number): PendingActionItem[] {
    const out: PendingActionItem[] = [];
    const href = `/institutions/${inst.id}`;

    if (inst.status === 'past_due') {
      out.push({
        id: `inst-pastdue-${inst.id}`,
        priority: PendingActionPriority.Critical,
        category: 'billing',
        title: `${inst.displayName} is past due`,
        description: 'Payment has failed or lapsed. Review billing and dunning.',
        href,
      });
    }
    if (inst.status === 'suspended') {
      out.push({
        id: `inst-suspended-${inst.id}`,
        priority: PendingActionPriority.Critical,
        category: 'account',
        title: `${inst.displayName} is suspended`,
        description: 'Account access is suspended. Resolve and reactivate if appropriate.',
        href,
      });
    }
    if ((inst.riskFlags?.length ?? 0) > 0) {
      out.push({
        id: `inst-risk-${inst.id}`,
        priority: PendingActionPriority.Critical,
        category: 'risk',
        title: `${inst.displayName} has risk flags`,
        description: `Flags: ${(inst.riskFlags ?? []).join(', ')}.`,
        href,
      });
    }

    if (inst.trialEndsAt) {
      const ms = new Date(inst.trialEndsAt).getTime() - now;
      if (ms >= 0 && ms <= 2 * DAY) {
        out.push({
          id: `inst-trial-today-${inst.id}`,
          priority: PendingActionPriority.Today,
          category: 'trial',
          title: `${inst.displayName} trial ends soon`,
          description: 'Trial ends within 48 hours — confirm conversion or extension.',
          href,
        });
      } else if (ms > 2 * DAY && ms <= 7 * DAY) {
        out.push({
          id: `inst-trial-upcoming-${inst.id}`,
          priority: PendingActionPriority.Upcoming,
          category: 'trial',
          title: `${inst.displayName} trial ending this week`,
          description: 'Trial ends within 7 days.',
          href,
        });
      }
    }

    if (inst.onboardingStatus === 'in_progress' || inst.onboardingStatus === 'awaiting_customer') {
      out.push({
        id: `inst-onboarding-${inst.id}`,
        priority: PendingActionPriority.Informational,
        category: 'onboarding',
        title: `${inst.displayName} onboarding ${inst.onboardingStatus.replace('_', ' ')}`,
        description: 'Onboarding is not yet complete.',
        href,
      });
    }

    return out;
  }
}
