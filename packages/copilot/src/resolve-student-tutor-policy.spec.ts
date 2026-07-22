import { describe, expect, it } from 'vitest';
import { FeatureScope } from '@edrion/shared-types';
import { resolveStudentTutorPolicy } from './resolve-student-tutor-policy';

describe('resolveStudentTutorPolicy', () => {
  it('returns permissive P1 defaults from global student_tutor seed', () => {
    const policy = resolveStudentTutorPolicy(
      [
        {
          scope: FeatureScope.Global,
          scopeId: null,
          enabled: true,
          mode: 'full' as never,
          policyDomain: 'student_tutor',
          domainConfig: {
            curriculum_bounds: 'open',
            answer_directness: 'default',
            session_visibility: 'none',
          },
        },
      ],
      {},
    );
    expect(policy.curriculum_bounds).toBe('open');
    expect(policy.session_visibility).toBe('none');
    expect(policy.effective_mode).toBe('enabled');
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
          domainConfig: { curriculum_bounds: 'open' },
        },
      ],
      {},
    );
    expect(policy.effective_mode).toBe('disabled');
    expect(policy.kill_switch).toBe(true);
  });
});
