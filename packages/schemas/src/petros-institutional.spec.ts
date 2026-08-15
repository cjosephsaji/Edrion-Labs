import { describe, expect, it } from 'vitest';
import {
  PETROS_INSTITUTIONAL_FUNCTIONS,
  petrosHomeworkMatchInputSchema,
  petrosInstitutionPolicyConfigSchema,
  petrosInstitutionalReleaseGateSchema,
  petrosPolicyDraftInputSchema,
  petrosPolicyScopeSchema,
  petrosTeacherHandoffDraftSchema,
} from './petros-institutional';

describe('Petros Stage 12 institutional contracts', () => {
  it('defaults to minimum necessary visibility, optional voice, and provider-neutral function keys', () => {
    const policy = petrosInstitutionPolicyConfigSchema.parse({});
    expect(policy.visibility.teacher.categories).not.toContain('raw_transcript');
    expect(policy.visibility.teacher.categories).not.toContain('voice_recording');
    expect(policy.visibility.parent.categories).toEqual(['session_metadata', 'concept_and_goal']);
    expect(policy.digest.enabled).toBe(false);
    expect(Object.values(PETROS_INSTITUTIONAL_FUNCTIONS)).toEqual([
      'institution.teacher_escalation_summary.generate',
      'institution.parent_digest.generate',
    ]);
  });

  it('rejects inverted effective dates and cannot represent a passed release gate', () => {
    const config = petrosInstitutionPolicyConfigSchema.parse({});
    expect(petrosPolicyDraftInputSchema.safeParse({
      scope: { level: 'institution', campusId: null, programmeId: null, gradeId: null, subjectId: null },
      config,
      reason: 'Fixture',
      effectiveFrom: '2026-08-14T00:00:00.000Z',
      effectiveUntil: '2026-08-13T00:00:00.000Z',
    }).success).toBe(false);
    expect(petrosInstitutionalReleaseGateSchema.safeParse({
      stage9PhysicalDeviceAcceptancePassed: true,
      stage10HumanRepeatUsePassed: false,
      stage11HumanReflectionAcceptancePassed: false,
      stage12CrossRoleHumanAcceptancePassed: false,
      voiceRequired: false,
      productionReady: false,
    }).success).toBe(false);
  });

  it('requires the identifier named by a non-institution policy scope', () => {
    expect(petrosPolicyScopeSchema.safeParse({ level: 'campus', campusId: null, programmeId: null, gradeId: null, subjectId: null }).success).toBe(false);
    expect(petrosPolicyScopeSchema.safeParse({ level: 'subject', campusId: null, programmeId: null, gradeId: null, subjectId: '11111111-1111-4111-8111-111111111111' }).success).toBe(true);
    expect(petrosPolicyScopeSchema.safeParse({ level: 'institution', campusId: '11111111-1111-4111-8111-111111111111', programmeId: null, gradeId: null, subjectId: null }).success).toBe(false);
  });

  it('validates authoritative homework windows and evidence-bounded teacher summaries', () => {
    expect(petrosHomeworkMatchInputSchema.parse({
      assignmentId: '11111111-1111-4111-8111-111111111111',
      topic: 'Quadratic equations',
      subjectId: null,
      relationBasisPoints: 8_000,
      status: 'extended',
      opensAt: '2026-08-13T08:00:00.000Z',
      dueAt: '2026-08-13T10:00:00.000Z',
      extendedUntil: '2026-08-14T10:00:00.000Z',
      teacherOverride: 'inherit',
      now: '2026-08-13T09:00:00.000Z',
    }).status).toBe('extended');
    expect(petrosTeacherHandoffDraftSchema.safeParse({
      concept: 'Quadratics', goal: 'Factor reliably', whatWasTried: [], observedBreakPoint: 'At sign choice', evidence: [], usefulTeacherNextStep: 'Contrast two examples',
    }).success).toBe(false);
  });
});
