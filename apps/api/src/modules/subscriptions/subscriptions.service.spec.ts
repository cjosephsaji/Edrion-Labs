import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SubscriptionsService } from './subscriptions.service';
import type { ActionContext } from '../../common/action-context';

const SUB_ID = '11111111-1111-1111-1111-111111111111';
const INSTITUTION_ID = '22222222-2222-2222-2222-222222222222';
const PV_CURRENT = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const PV_TARGET = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const ADDON_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const EMPLOYEE_ID = '33333333-3333-3333-3333-333333333333';

function makeCtx(): ActionContext {
  return {
    principalContext: {
      principal: {
        employeeId: EMPLOYEE_ID,
        email: 'owner@edrion.dev',
        fullName: 'Owner',
        roleKeys: ['super_administrator'],
        permissions: { keys: new Set<string>(), hasWildcard: false },
        mfaEnrolled: true,
        lastAuthAt: new Date(),
      },
    },
    request: { requestId: 'r', correlationId: 'c', ip: '127.0.0.1', userAgent: 'vitest', apiEndpoint: 'POST /subscriptions' },
  } as ActionContext;
}

function baseSub(overrides: Record<string, unknown> = {}) {
  const now = new Date('2026-06-01T00:00:00.000Z');
  return {
    id: SUB_ID,
    institutionId: INSTITUTION_ID,
    independentUserId: null,
    planVersionId: PV_CURRENT,
    status: 'active',
    billingCycle: 'monthly',
    currency: 'USD',
    overridePriceMinor: null,
    institutionPerCampusPriceMinor: null,
    discountBps: 0,
    creditBalanceMinor: 0,
    overagePolicy: 'block',
    usageLimitsOverride: {},
    scheduledPlanVersionId: null,
    scheduledBillingCycle: null,
    scheduledChangeAt: null,
    periodStart: now,
    periodEnd: new Date('2026-07-01T00:00:00.000Z'),
    trialEndsAt: null,
    pausedAt: null,
    cancelAt: null,
    cancelledAt: null,
    cancelReason: null,
    gracePeriodEndsAt: null,
    version: 2,
    createdBy: EMPLOYEE_ID,
    updatedBy: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function baseJoined(subOverrides: Record<string, unknown> = {}) {
  return {
    subscription: baseSub(subOverrides),
    institutionName: 'Riverside School',
    planId: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
    planKey: 'institution_standard',
    planName: 'Institution Standard',
    planAudience: 'institution',
    planVersionNumber: 1,
    planMonthlyPriceMinor: 49_900,
    planAnnualPriceMinor: 499_000,
    planPerCampusPriceMinor: 9_900,
    planBaseCampusAllowance: 2,
    planUsageLimits: {},
  };
}

function targetPlanVersion(monthly: number, status = 'published') {
  return {
    planVersion: {
      id: PV_TARGET,
      planId: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
      status,
      monthlyPriceMinor: monthly,
      annualPriceMinor: monthly * 10,
    },
    plan: { id: 'dddddddd-dddd-dddd-dddd-dddddddddddd', key: 'institution_pro', name: 'Pro', audience: 'institution' },
  };
}

function makeService() {
  const repo = {
    list: vi.fn(),
    summaryByStatus: vi.fn(),
    findById: vi.fn().mockResolvedValue(baseSub()),
    findJoined: vi.fn().mockResolvedValue(baseJoined()),
    findJoinedByInstitution: vi.fn(),
    planVersionWithPlan: vi.fn(),
    updateWithVersion: vi.fn().mockImplementation(async (_id, v, patch) => baseSub({ ...patch, version: v + 1 })),
    addonsForSub: vi.fn().mockResolvedValue([]),
    insertAddon: vi.fn().mockImplementation(async (v: Record<string, unknown>) => ({ id: ADDON_ID, ...v })),
    findAddon: vi.fn(),
    deactivateAddon: vi.fn().mockResolvedValue(undefined),
    campusCountForInstitution: vi.fn().mockResolvedValue(3),
  };
  const audit = { logAudit: vi.fn().mockResolvedValue(undefined) };
  const service = new SubscriptionsService(repo as never, audit as never);
  return { service, repo, audit };
}

describe('SubscriptionsService.changePlan', () => {
  let h: ReturnType<typeof makeService>;
  beforeEach(() => {
    h = makeService();
  });

  it('an upgrade charges (no credit added) and audits change_plan', async () => {
    h.repo.planVersionWithPlan.mockResolvedValue(targetPlanVersion(99_900));
    await h.service.changePlan(SUB_ID, { planVersionId: PV_TARGET, reason: 'upgrade to pro', version: 2 }, makeCtx());
    const patch = h.repo.updateWithVersion.mock.calls.at(-1)?.[2];
    expect(patch.planVersionId).toBe(PV_TARGET);
    expect(patch.creditBalanceMinor).toBe(0); // upgrade nets a charge, no credit
    expect(h.audit.logAudit.mock.calls.at(-1)?.[0].action).toBe('subscription.change_plan');
  });

  it('a downgrade nets a credit added to the balance', async () => {
    h.repo.planVersionWithPlan.mockResolvedValue(targetPlanVersion(9_900));
    await h.service.changePlan(SUB_ID, { planVersionId: PV_TARGET, reason: 'downgrade plan', version: 2 }, makeCtx());
    const patch = h.repo.updateWithVersion.mock.calls.at(-1)?.[2];
    // 49900 → 9900 at period start = 40000 credit
    expect(patch.creditBalanceMinor).toBe(40_000);
  });

  it('rejects moving to a non-published plan version', async () => {
    h.repo.planVersionWithPlan.mockResolvedValue(targetPlanVersion(99_900, 'draft'));
    await expect(
      h.service.changePlan(SUB_ID, { planVersionId: PV_TARGET, reason: 'bad target', version: 2 }, makeCtx()),
    ).rejects.toMatchObject({ response: { code: 'PLAN_VERSION_NOT_PUBLISHED' } });
    expect(h.repo.updateWithVersion).not.toHaveBeenCalled();
  });

  it('surfaces a 409 on a version mismatch', async () => {
    h.repo.planVersionWithPlan.mockResolvedValue(targetPlanVersion(99_900));
    h.repo.updateWithVersion.mockResolvedValue(undefined);
    await expect(
      h.service.changePlan(SUB_ID, { planVersionId: PV_TARGET, reason: 'race', version: 1 }, makeCtx()),
    ).rejects.toMatchObject({ response: { code: 'VERSION_CONFLICT' } });
  });
});

describe('SubscriptionsService.changeCycle', () => {
  it('rejects switching to the same cycle', async () => {
    const h = makeService();
    await expect(
      h.service.changeCycle(SUB_ID, { billingCycle: 'monthly', reason: 'noop', version: 2 }, makeCtx()),
    ).rejects.toMatchObject({ response: { code: 'SAME_CYCLE' } });
  });

  it('switching monthly → annual prorates and audits change_cycle', async () => {
    const h = makeService();
    await h.service.changeCycle(SUB_ID, { billingCycle: 'annual', reason: 'switch to annual', version: 2 }, makeCtx());
    expect(h.repo.updateWithVersion.mock.calls.at(-1)?.[2].billingCycle).toBe('annual');
    expect(h.audit.logAudit.mock.calls.at(-1)?.[0].action).toBe('subscription.change_cycle');
  });
});

describe('SubscriptionsService.addCampusAddon', () => {
  it('falls back to the plan per-campus price when no override is given', async () => {
    const h = makeService();
    await h.service.addCampusAddon(SUB_ID, { quantity: 1, reason: 'extra campus', version: 2 }, makeCtx());
    expect(h.repo.insertAddon.mock.calls.at(-1)?.[0].unitPriceMinor).toBe(9_900);
  });
});

describe('SubscriptionsService.adjustCredit', () => {
  it('rejects a debit that would drive the balance negative', async () => {
    const h = makeService();
    h.repo.findById.mockResolvedValue(baseSub({ creditBalanceMinor: 1_000 }));
    await expect(
      h.service.adjustCredit(SUB_ID, { amountMinor: -5_000, reason: 'consume credit', version: 2 }, makeCtx()),
    ).rejects.toMatchObject({ response: { code: 'INSUFFICIENT_CREDIT' } });
  });

  it('grants credit and audits adjust_credit', async () => {
    const h = makeService();
    await h.service.adjustCredit(SUB_ID, { amountMinor: 2_500, reason: 'goodwill', version: 2 }, makeCtx());
    expect(h.repo.updateWithVersion.mock.calls.at(-1)?.[2].creditBalanceMinor).toBe(2_500);
    expect(h.audit.logAudit.mock.calls.at(-1)?.[0].action).toBe('subscription.adjust_credit');
  });
});

describe('SubscriptionsService.cancel', () => {
  it('immediate cancel sets status cancelled', async () => {
    const h = makeService();
    await h.service.cancel(SUB_ID, { reason: 'customer left', version: 2, immediate: true }, makeCtx());
    expect(h.repo.updateWithVersion.mock.calls.at(-1)?.[2].status).toBe('cancelled');
  });

  it('scheduled cancel sets cancelAt without changing status', async () => {
    const h = makeService();
    await h.service.cancel(SUB_ID, { reason: 'end of term', version: 2, immediate: false }, makeCtx());
    const patch = h.repo.updateWithVersion.mock.calls.at(-1)?.[2];
    expect(patch.status).toBeUndefined();
    expect(patch.cancelAt).toBeInstanceOf(Date);
  });
});
