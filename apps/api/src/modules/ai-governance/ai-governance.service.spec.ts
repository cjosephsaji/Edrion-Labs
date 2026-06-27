import { describe, expect, it, vi } from 'vitest';
import { AiCapability, AiMode, FeatureScope, RiskLevel } from '@edrion/shared-types';
import { AiGovernanceService } from './ai-governance.service';
import type { ActionContext } from '../../common/action-context';

function makeCtx(keys: string[]): ActionContext {
  return {
    principalContext: {
      principal: {
        employeeId: 'emp-1',
        email: 'owner@edrion.dev',
        fullName: 'Owner',
        roleKeys: [],
        permissions: { keys: new Set(keys), hasWildcard: keys.includes('*') },
        mfaEnrolled: true,
        lastAuthAt: new Date(),
      },
    },
    request: { requestId: 'r', correlationId: 'c', ip: '127.0.0.1', userAgent: 'vitest', apiEndpoint: 'POST /ai-governance' },
  } as ActionContext;
}

const policyRow = (over: Record<string, unknown> = {}) => ({
  id: 'pol-1',
  scope: FeatureScope.Institution,
  scopeId: 'inst-1',
  enabled: true,
  mode: AiMode.ReadOnly,
  capabilities: {},
  maxFinancialImpactMinor: null,
  maxAffectedUsers: null,
  twoPersonThresholdMinor: null,
  secondApproverCapabilities: [],
  killSwitch: false,
  version: 2,
  setByName: 'Owner',
  updatedAt: new Date(),
  ...over,
});

function makeService(repoOverrides: Record<string, unknown> = {}) {
  const repo = {
    allPolicies: vi.fn(async () => []),
    listRules: vi.fn(async () => []),
    findPolicy: vi.fn(async () => undefined),
    findPolicyById: vi.fn(async () => undefined),
    insertPolicy: vi.fn(async (v: Record<string, unknown>) => policyRow(v)),
    updatePolicyWithVersion: vi.fn(async () => policyRow()),
    deletePolicy: vi.fn(async () => undefined),
    ...repoOverrides,
  };
  const audit = { logAudit: vi.fn().mockResolvedValue(undefined) };
  const service = new AiGovernanceService(repo as never, audit as never);
  return { service, repo, audit };
}

describe('AiGovernanceService — permission asserts', () => {
  it('rejects upsertPolicy without ai.configure', async () => {
    const { service } = makeService();
    await expect(
      service.upsertPolicy({ scope: FeatureScope.Global, mode: AiMode.Full, reason: 'x' } as never, makeCtx([])),
    ).rejects.toMatchObject({ response: { code: 'FORBIDDEN' } });
  });

  it('rejects setKillSwitch without ai.disable', async () => {
    const { service } = makeService();
    await expect(
      service.setKillSwitch({ scope: FeatureScope.Global, enabled: true, reason: 'stop' } as never, makeCtx(['ai.configure'])),
    ).rejects.toMatchObject({ response: { code: 'FORBIDDEN' } });
  });

  it('protects the global policy from removal', async () => {
    const { service } = makeService({ findPolicyById: vi.fn(async () => policyRow({ scope: FeatureScope.Global, scopeId: null })) });
    await expect(
      service.removePolicy('pol-1', { reason: 'remove it' } as never, makeCtx(['ai.configure'])),
    ).rejects.toMatchObject({ response: { code: 'GLOBAL_POLICY_PROTECTED' } });
  });
});

describe('AiGovernanceService — optimistic concurrency', () => {
  it('throws VERSION_CONFLICT when the supplied version is stale', async () => {
    const { service } = makeService({ findPolicy: vi.fn(async () => policyRow({ version: 5 })) });
    await expect(
      service.upsertPolicy(
        { scope: FeatureScope.Institution, scopeId: 'inst-1', mode: AiMode.ReadOnly, reason: 'edit', version: 1 } as never,
        makeCtx(['ai.configure']),
      ),
    ).rejects.toMatchObject({ response: { code: 'VERSION_CONFLICT' } });
  });

  it('inserts a new global policy and audits ai.policy_set', async () => {
    const { service, repo, audit } = makeService();
    await service.upsertPolicy({ scope: FeatureScope.Global, mode: AiMode.Full, reason: 'set up' } as never, makeCtx(['ai.configure']));
    expect(repo.insertPolicy).toHaveBeenCalledOnce();
    expect(audit.logAudit.mock.calls.at(-1)?.[0].action).toBe('ai.policy_set');
  });
});

describe('AiGovernanceService — guardrail evaluation (load-once)', () => {
  it('loads policies + rules once and evaluates purely', async () => {
    const { service, repo } = makeService();
    const loaded = await service.loadEvaluationContext();
    expect(repo.allPolicies).toHaveBeenCalledOnce();
    expect(repo.listRules).toHaveBeenCalledOnce();

    const result = service.evaluateWith(loaded, {
      proposed: { capability: AiCapability.InstitutionAccess, action: 'institutions.suspend', riskLevel: RiskLevel.High },
      context: {},
    } as never);
    expect(result).toHaveProperty('decision');
    expect(result).toHaveProperty('reason');
    // evaluateWith must not hit the repo again.
    expect(repo.allPolicies).toHaveBeenCalledOnce();
  });
});
