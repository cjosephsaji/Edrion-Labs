import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PlansService } from './plans.service';
import type { ActionContext } from '../../common/action-context';

const PLAN_ID = '11111111-1111-1111-1111-111111111111';
const V1_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const V2_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
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
    request: {
      requestId: 'req-1',
      correlationId: 'corr-1',
      ip: '127.0.0.1',
      userAgent: 'vitest',
      apiEndpoint: 'POST /plans',
    },
  } as ActionContext;
}

const PRICING = {
  currency: 'USD' as const,
  monthlyPriceMinor: 49900,
  annualPriceMinor: 499000,
  baseCampusAllowance: 2,
  perCampusPriceMinor: 9900,
  usageLimits: {},
  featureEntitlements: {},
  trialDays: 30,
  supportTier: 'standard' as const,
};

function basePlan(overrides: Record<string, unknown> = {}) {
  const now = new Date();
  return {
    id: PLAN_ID,
    key: 'institution_standard',
    name: 'Institution Standard',
    description: null,
    audience: 'institution',
    status: 'draft',
    version: 0,
    createdBy: EMPLOYEE_ID,
    updatedBy: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function baseVersion(overrides: Record<string, unknown> = {}) {
  const now = new Date();
  return {
    id: V1_ID,
    planId: PLAN_ID,
    version: 1,
    status: 'draft',
    currency: 'USD',
    monthlyPriceMinor: 49900,
    annualPriceMinor: 499000,
    baseCampusAllowance: 2,
    perCampusPriceMinor: 9900,
    usageLimits: {},
    featureEntitlements: {},
    trialDays: 30,
    supportTier: 'standard',
    metadata: {},
    publishedAt: null,
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makeService() {
  const repo = {
    list: vi.fn(),
    summaryByStatus: vi.fn(),
    latestVersionByPlan: vi.fn(),
    findPlanById: vi.fn().mockResolvedValue(basePlan()),
    findPlanByKey: vi.fn().mockResolvedValue(undefined),
    versionsForPlan: vi.fn().mockResolvedValue([baseVersion()]),
    findVersionById: vi.fn(),
    maxVersion: vi.fn().mockResolvedValue(1),
    insertPlan: vi.fn().mockImplementation(async (v: Record<string, unknown>) => basePlan(v)),
    insertVersion: vi.fn().mockImplementation(async (v: Record<string, unknown>) => baseVersion(v)),
    updatePlanWithVersion: vi.fn(),
    stampPlan: vi.fn().mockResolvedValue(basePlan({ status: 'published', version: 1 })),
    publishVersionRow: vi.fn(),
    archiveOtherPublishedVersions: vi.fn().mockResolvedValue(undefined),
    liveSubscriptionCount: vi.fn().mockResolvedValue(0),
  };
  const audit = { logAudit: vi.fn().mockResolvedValue(undefined) };
  const service = new PlansService(repo as never, audit as never);
  return { service, repo, audit };
}

describe('PlansService.createDraft', () => {
  let h: ReturnType<typeof makeService>;
  beforeEach(() => {
    h = makeService();
  });

  it('creates a draft plan plus version 1 and audits plan.create_draft', async () => {
    await h.service.createDraft(
      { key: 'institution_pro', name: 'Pro', audience: 'institution', pricing: PRICING },
      makeCtx(),
    );
    expect(h.repo.insertPlan).toHaveBeenCalled();
    const versionInsert = h.repo.insertVersion.mock.calls.at(-1)?.[0];
    expect(versionInsert.version).toBe(1);
    expect(versionInsert.status).toBe('draft');
    expect(h.audit.logAudit.mock.calls.at(-1)?.[0].action).toBe('plan.create_draft');
  });

  it('rejects a duplicate plan key', async () => {
    h.repo.findPlanByKey.mockResolvedValue(basePlan());
    await expect(
      h.service.createDraft({ key: 'institution_standard', name: 'Dup', audience: 'institution', pricing: PRICING }, makeCtx()),
    ).rejects.toMatchObject({ response: { code: 'PLAN_KEY_IN_USE' } });
    expect(h.repo.insertPlan).not.toHaveBeenCalled();
  });
});

describe('PlansService.newVersion', () => {
  it('IMMUTABLE: inserts maxVersion+1 as a new draft and never mutates an existing version', async () => {
    const h = makeService();
    h.repo.findPlanById.mockResolvedValue(basePlan({ status: 'published' }));
    h.repo.maxVersion.mockResolvedValue(1);
    await h.service.newVersion(PLAN_ID, { pricing: { ...PRICING, monthlyPriceMinor: 59900 } }, makeCtx());
    const inserted = h.repo.insertVersion.mock.calls.at(-1)?.[0];
    expect(inserted.version).toBe(2);
    expect(inserted.status).toBe('draft');
    expect(inserted.monthlyPriceMinor).toBe(59900);
    expect(h.audit.logAudit.mock.calls.at(-1)?.[0].action).toBe('plan.new_version');
  });

  it('refuses to add a version to an archived plan', async () => {
    const h = makeService();
    h.repo.findPlanById.mockResolvedValue(basePlan({ status: 'archived' }));
    await expect(
      h.service.newVersion(PLAN_ID, { pricing: PRICING }, makeCtx()),
    ).rejects.toMatchObject({ response: { code: 'PLAN_ARCHIVED' } });
    expect(h.repo.insertVersion).not.toHaveBeenCalled();
  });
});

describe('PlansService.publish', () => {
  let h: ReturnType<typeof makeService>;
  beforeEach(() => {
    h = makeService();
    h.repo.findPlanById.mockResolvedValue(basePlan({ status: 'draft' }));
    h.repo.findVersionById.mockResolvedValue(baseVersion({ id: V2_ID, version: 2, status: 'draft' }));
    h.repo.publishVersionRow.mockResolvedValue(baseVersion({ id: V2_ID, version: 2, status: 'published' }));
  });

  it('publishes a draft version, supersedes others and flips the plan to published', async () => {
    await h.service.publish(PLAN_ID, V2_ID, { reason: 'go live with new pricing' }, makeCtx());
    expect(h.repo.publishVersionRow).toHaveBeenCalledWith(V2_ID, EMPLOYEE_ID);
    expect(h.repo.archiveOtherPublishedVersions).toHaveBeenCalledWith(PLAN_ID, V2_ID);
    const planPatch = h.repo.stampPlan.mock.calls.at(-1)?.[1];
    expect(planPatch.status).toBe('published');
    expect(h.audit.logAudit.mock.calls.at(-1)?.[0].action).toBe('plan.publish');
  });

  it('rejects publishing a non-draft version', async () => {
    h.repo.findVersionById.mockResolvedValue(baseVersion({ id: V2_ID, version: 2, status: 'published' }));
    await expect(
      h.service.publish(PLAN_ID, V2_ID, { reason: 'already live' }, makeCtx()),
    ).rejects.toMatchObject({ response: { code: 'NOT_DRAFT' } });
    expect(h.repo.publishVersionRow).not.toHaveBeenCalled();
  });

  it('refuses to publish a version of an archived plan', async () => {
    h.repo.findPlanById.mockResolvedValue(basePlan({ status: 'archived' }));
    await expect(
      h.service.publish(PLAN_ID, V2_ID, { reason: 'resurrect archived plan' }, makeCtx()),
    ).rejects.toMatchObject({ response: { code: 'PLAN_ARCHIVED' } });
    expect(h.repo.publishVersionRow).not.toHaveBeenCalled();
  });

  it('surfaces a 409 when another publisher won the race', async () => {
    h.repo.publishVersionRow.mockResolvedValue(undefined);
    await expect(
      h.service.publish(PLAN_ID, V2_ID, { reason: 'go live' }, makeCtx()),
    ).rejects.toMatchObject({ response: { code: 'VERSION_CONFLICT' } });
  });
});

describe('PlansService.archive', () => {
  it('archives with optimistic concurrency and audits plan.archive', async () => {
    const h = makeService();
    h.repo.findPlanById.mockResolvedValue(basePlan({ status: 'published', version: 2 }));
    h.repo.updatePlanWithVersion.mockResolvedValue(basePlan({ status: 'archived', version: 3 }));
    await h.service.archive(PLAN_ID, { reason: 'sunset this plan', version: 2 }, makeCtx());
    expect(h.repo.updatePlanWithVersion).toHaveBeenCalledWith(PLAN_ID, 2, expect.objectContaining({ status: 'archived' }));
    expect(h.audit.logAudit.mock.calls.at(-1)?.[0].action).toBe('plan.archive');
  });

  it('surfaces a 409 on a version mismatch', async () => {
    const h = makeService();
    h.repo.findPlanById.mockResolvedValue(basePlan({ status: 'published', version: 5 }));
    h.repo.updatePlanWithVersion.mockResolvedValue(undefined);
    await expect(
      h.service.archive(PLAN_ID, { reason: 'sunset this plan', version: 2 }, makeCtx()),
    ).rejects.toMatchObject({ response: { code: 'VERSION_CONFLICT' } });
  });
});
