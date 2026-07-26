import { Injectable } from '@nestjs/common';
import { resolveStudentTutorPolicy, type AiPolicyInput, type AiResolutionContext, type LearnPolicyV1Resolved } from '@edrion/copilot';
import { FeatureScope, AiMode } from '@edrion/shared-types';
import type { AiPolicy } from '@edrion/database';
import { AiGovernanceRepository } from '../../ai-governance/ai-governance.repository';
import type { StudentPrincipal } from '../student.types';

@Injectable()
export class StudentTutorPolicyService {
  constructor(private readonly aiPolicies: AiGovernanceRepository) {}

  async resolveForPrincipal(principal: StudentPrincipal): Promise<LearnPolicyV1Resolved> {
    const rows = await this.aiPolicies.allPolicies();
    return resolveStudentTutorPolicy(rows.map(toPolicyInput), contextFromPrincipal(principal));
  }
}

function contextFromPrincipal(principal: StudentPrincipal): AiResolutionContext {
  if (principal.kind === 'independent') {
    return { independentUserId: principal.independentUserId };
  }
  return {
    institutionId: principal.institutionId,
    campusId: principal.campusId ?? undefined,
    institutionUserId: principal.institutionUserId,
  };
}

function toPolicyInput(p: AiPolicy): AiPolicyInput {
  return {
    scope: p.scope as FeatureScope,
    scopeId: p.scopeId,
    enabled: p.enabled,
    mode: p.mode as AiMode,
    capabilities: (p.capabilities ?? {}) as AiPolicyInput['capabilities'],
    maxFinancialImpactMinor: p.maxFinancialImpactMinor,
    maxAffectedUsers: p.maxAffectedUsers,
    twoPersonThresholdMinor: p.twoPersonThresholdMinor,
    maxRunsPerDay: p.maxRunsPerDay,
    maxRunsPerEmployeePerDay: p.maxRunsPerEmployeePerDay,
    secondApproverCapabilities: (p.secondApproverCapabilities ??
      []) as AiPolicyInput['secondApproverCapabilities'],
    killSwitch: p.killSwitch,
    policyDomain: (p.policyDomain ?? 'copilot') as AiPolicyInput['policyDomain'],
    domainConfig: (p.domainConfig ?? {}) as Record<string, unknown>,
    setByName: p.setByName,
    setAt: p.updatedAt,
  };
}
