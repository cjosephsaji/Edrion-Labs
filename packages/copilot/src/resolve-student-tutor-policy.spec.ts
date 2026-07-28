import { describe, expect, it } from 'vitest';
import { AiCapability, FeatureScope } from '@edrion/shared-types';
import { resolveStudentTutorPolicy } from './resolve-student-tutor-policy';

describe('resolveStudentTutorPolicy', () => {
  it('returns permissive P1 defaults from capabilities (DEC-16)', () => {
    const policy = resolveStudentTutorPolicy(
      [
        {
          scope: FeatureScope.Global,
          scopeId: null,
          enabled: true,
          mode: 'full' as never,
          policyDomain: 'student_tutor',
          capabilities: {
            [AiCapability.CurriculumBounds]: 'open',
            [AiCapability.AnswerDirectness]: 'default',
            [AiCapability.SessionVisibility]: 'none',
          },
        },
      ],
      {},
    );
    expect(policy.curriculum_bounds).toBe('open');
    expect(policy.session_visibility).toBe('none');
    expect(policy.effective_mode).toBe('enabled');
  });

  it('falls back to legacy domain_config when capabilities omit Learn keys', () => {
    const policy = resolveStudentTutorPolicy(
      [
        {
          scope: FeatureScope.Global,
          scopeId: null,
          enabled: true,
          mode: 'full' as never,
          policyDomain: 'student_tutor',
          domainConfig: {
            curriculum_bounds: 'institution_curriculum',
            answer_directness: 'guided',
            session_visibility: 'aggregate',
          },
        },
      ],
      {},
    );
    expect(policy.curriculum_bounds).toBe('institution_curriculum');
    expect(policy.answer_directness).toBe('guided');
    expect(policy.session_visibility).toBe('aggregate');
  });

  it('disables when kill switch fires', () => {
    const policy = resolveStudentTutorPolicy(
      [
        {
          scope: FeatureScope.Global,
          scopeId: null,
          enabled: true,
          mode: 'full' as never,
          killSwitch: true,
          policyDomain: 'student_tutor',
          capabilities: { [AiCapability.CurriculumBounds]: 'open' },
        },
      ],
      {},
    );
    expect(policy.effective_mode).toBe('disabled');
    expect(policy.kill_switch).toBe(true);
  });

  it('lets institution capabilities override global via the same merge grammar', () => {
    const policy = resolveStudentTutorPolicy(
      [
        {
          scope: FeatureScope.Global,
          scopeId: null,
          enabled: true,
          mode: 'full' as never,
          policyDomain: 'student_tutor',
          capabilities: {
            [AiCapability.CurriculumBounds]: 'open',
            [AiCapability.AnswerDirectness]: 'default',
            [AiCapability.SessionVisibility]: 'none',
          },
        },
        {
          scope: FeatureScope.Institution,
          scopeId: 'inst-1',
          enabled: true,
          mode: 'full' as never,
          policyDomain: 'student_tutor',
          capabilities: {
            [AiCapability.CurriculumBounds]: 'institution_curriculum',
            [AiCapability.AnswerDirectness]: 'never_direct_on_assignment',
          },
        },
      ],
      { institutionId: 'inst-1' },
    );
    expect(policy.curriculum_bounds).toBe('institution_curriculum');
    expect(policy.answer_directness).toBe('never_direct_on_assignment');
    expect(policy.session_visibility).toBe('none');
  });
});
