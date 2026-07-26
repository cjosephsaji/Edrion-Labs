import { describe, expect, it } from 'vitest';
import { FeatureScope, AiMode } from '@edrion/shared-types';
import { resolveStudentTutorPolicy } from './resolve-student-tutor-policy';
import type { AiPolicyInput } from './types';

function tutorPolicy(overrides: Partial<AiPolicyInput>): AiPolicyInput {
  return {
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
    ...overrides,
  };
}

describe('resolveStudentTutorPolicy', () => {
  it('returns permissive default when no student_tutor rows exist', () => {
    const r = resolveStudentTutorPolicy([], {});
    expect(r.curriculum_bounds).toBe('open');
    expect(r.answer_directness).toBe('default');
    expect(r.session_visibility).toBe('none');
    expect(r.effective_kill).toBe(false);
  });

  it('uses global seeded student_tutor policy', () => {
    const r = resolveStudentTutorPolicy([tutorPolicy({})], {});
    expect(r.curriculum_bounds).toBe('open');
    expect(r.resolved_layers.length).toBeGreaterThan(0);
  });

  it('most specific institution layer overrides global bounds', () => {
    const r = resolveStudentTutorPolicy(
      [
        tutorPolicy({
          domainConfig: {
            v: 1,
            curriculum_bounds: 'open',
            answer_directness: 'default',
            session_visibility: 'none',
          },
        }),
        tutorPolicy({
          scope: FeatureScope.Institution,
          scopeId: 'inst-1',
          domainConfig: {
            v: 1,
            curriculum_bounds: 'institution_curriculum',
            answer_directness: 'guided',
            session_visibility: 'aggregate',
          },
        }),
      ],
      { institutionId: 'inst-1' },
    );
    expect(r.curriculum_bounds).toBe('institution_curriculum');
    expect(r.answer_directness).toBe('guided');
    expect(r.session_visibility).toBe('aggregate');
  });

  it('ORs kill switch from student_tutor layer', () => {
    const r = resolveStudentTutorPolicy(
      [tutorPolicy({ killSwitch: true })],
      {},
    );
    expect(r.effective_kill).toBe(true);
  });

  it('ORs copilot global kill into effective_kill', () => {
    const r = resolveStudentTutorPolicy(
      [
        tutorPolicy({}),
        {
          scope: FeatureScope.Global,
          scopeId: null,
          enabled: true,
          mode: AiMode.Full,
          policyDomain: 'copilot',
          killSwitch: true,
        },
      ],
      {},
    );
    expect(r.effective_kill).toBe(true);
  });

  it('ignores copilot domain_config for Learn fields', () => {
    const r = resolveStudentTutorPolicy(
      [
        {
          scope: FeatureScope.Global,
          scopeId: null,
          enabled: true,
          mode: AiMode.Full,
          policyDomain: 'copilot',
          domainConfig: {
            curriculum_bounds: 'assigned_material_only',
          },
        },
      ],
      {},
    );
    expect(r.curriculum_bounds).toBe('open');
  });
});
