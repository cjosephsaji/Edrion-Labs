import { describe, expect, it, vi, beforeEach } from 'vitest';
import { FeatureScope, AiMode } from '@edrion/shared-types';
import { StudentTutorPolicyService } from './student-tutor-policy.service';
import type { AiGovernanceRepository } from '../../ai-governance/ai-governance.repository';

describe('StudentTutorPolicyService', () => {
  let service: StudentTutorPolicyService;
  let allPolicies: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    allPolicies = vi.fn();
    service = new StudentTutorPolicyService({ allPolicies } as unknown as AiGovernanceRepository);
  });

  it('resolves permissive policy for independent principal', async () => {
    allPolicies.mockResolvedValue([
      {
        scope: FeatureScope.Global,
        scopeId: null,
        enabled: true,
        mode: AiMode.Full,
        policyDomain: 'student_tutor',
        domainConfig: {
          v: 1,
          curriculum_bounds: 'open',
          answer_directness: 'default',
          session_visibility: 'none',
        },
        capabilities: {},
        secondApproverCapabilities: [],
        killSwitch: false,
        updatedAt: new Date(),
      },
    ]);

    const snapshot = await service.resolveForPrincipal({
      kind: 'independent',
      independentUserId: '00000000-0000-4000-8000-000000000001',
    });

    expect(snapshot.curriculum_bounds).toBe('open');
    expect(snapshot.effective_kill).toBe(false);
    expect(allPolicies).toHaveBeenCalledOnce();
  });
});
