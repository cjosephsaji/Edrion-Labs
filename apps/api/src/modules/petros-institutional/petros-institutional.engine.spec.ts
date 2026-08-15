import { describe, expect, it } from 'vitest';
import {
  buildClassSignal,
  decideHomework,
  decideSyllabus,
  defaultInstitutionPolicy,
  resolveInstitutionPolicy,
  sanitizeParentDigest,
  sanitizeTeacherSummary,
  type PolicyVersionRecord,
} from './petros-institutional.engine';

const INSTITUTION = '11111111-1111-4111-8111-111111111111';
const CAMPUS = '22222222-2222-4222-8222-222222222222';
const SUBJECT = '33333333-3333-4333-8333-333333333333';
const ASSIGNMENT = '44444444-4444-4444-8444-444444444444';

function row(id: string, patch: Partial<PolicyVersionRecord> = {}): PolicyVersionRecord {
  return {
    id,
    institutionId: INSTITUTION,
    campusId: null,
    programmeId: null,
    gradeId: null,
    subjectId: null,
    scopeLevel: 'institution',
    version: 1,
    status: 'published',
    effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
    effectiveUntil: null,
    config: defaultInstitutionPolicy(),
    ...patch,
  };
}

function resolve(versions: PolicyVersionRecord[], now = new Date('2026-08-13T10:00:00.000Z')) {
  return resolveInstitutionPolicy({
    institutionId: INSTITUTION,
    versions,
    fixture: { campusId: CAMPUS, programmeId: null, gradeId: null, subjectId: SUBJECT, studentId: null, language: 'en', accessibility: [] },
    now,
  });
}

describe('Petros Stage 12 institutional policy engine', () => {
  it('applies effective platform/institution/campus/subject precedence and leaves future schedules inactive', () => {
    const base = row('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', { config: { ...defaultInstitutionPolicy(), syllabus: { ...defaultInstitutionPolicy().syllabus, maxDepth: 2 } } });
    const campus = row('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', { campusId: CAMPUS, scopeLevel: 'campus', version: 2, config: { ...defaultInstitutionPolicy(), syllabus: { ...defaultInstitutionPolicy().syllabus, maxDepth: 3 } } });
    const subject = row('cccccccc-cccc-4ccc-8ccc-cccccccccccc', { subjectId: SUBJECT, scopeLevel: 'subject', version: 3, config: { ...defaultInstitutionPolicy(), syllabus: { ...defaultInstitutionPolicy().syllabus, maxDepth: 4 } } });
    const future = row('dddddddd-dddd-4ddd-8ddd-dddddddddddd', { status: 'scheduled', version: 4, effectiveFrom: new Date('2026-08-14T00:00:00.000Z'), config: { ...defaultInstitutionPolicy(), syllabus: { ...defaultInstitutionPolicy().syllabus, maxDepth: 9 } } });
    const policy = resolve([base, campus, subject, future]);
    expect(policy.config.syllabus.maxDepth).toBe(4);
    expect(policy.policyVersionIds).toEqual([base.id, campus.id, subject.id]);
    expect(policy.disclosure.plainLanguage.at(-1)).toMatch(/next session/i);
  });

  it('keeps a superseded version effective until its scheduled cutoff', () => {
    const old = row('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', { status: 'superseded', effectiveUntil: new Date('2026-08-14T00:00:00.000Z') });
    expect(resolve([old]).policyVersionIds).toEqual([old.id]);
    expect(() => resolve([old], new Date('2026-08-14T00:00:00.000Z'))).toThrow(/No effective/);
  });

  it('enforces in-bound, depth-limited and out-of-bound syllabus paths without an empty refusal', () => {
    const config = defaultInstitutionPolicy();
    config.syllabus.topicKeys = ['algebra.quadratics'];
    config.syllabus.maxDepth = 2;
    config.syllabus.approvedSourceIds = ['cbse-2026'];
    const policy = resolve([row('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', { config })]);
    expect(decideSyllabus({ policy, topicKey: 'algebra.quadratics', requestedTopic: 'Quadratics', requestedDepth: 2 }).decision).toBe('within_bounds');
    expect(decideSyllabus({ policy, topicKey: 'algebra.quadratics', requestedTopic: 'Quadratics', requestedDepth: 4 })).toMatchObject({ decision: 'depth_limited', teachingShape: 'bounded_explanation' });
    const outside = decideSyllabus({ policy, topicKey: 'quantum.field', requestedTopic: 'Quantum field theory', requestedDepth: 1 });
    expect(outside).toMatchObject({ decision: 'outside_bounds', teachingShape: 'legitimate_path' });
    expect(outside.studentMessage).toMatch(/fastest allowed next step/i);
    expect(outside.sourceBoundary).toEqual({ approvedSourceIds: ['cbse-2026'], externalSourcesAllowed: false });
  });

  it('changes teaching shape only for a related covered assignment in its authoritative window', () => {
    const config = defaultInstitutionPolicy(); config.homework.graceMinutes = 30;
    const policy = resolve([row('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', { config })]);
    const base = {
      assignmentId: ASSIGNMENT, topic: 'Quadratics', subjectId: SUBJECT, relationBasisPoints: 9_000,
      status: 'assigned' as const, opensAt: '2026-08-13T09:00:00.000Z', dueAt: '2026-08-13T11:00:00.000Z',
      deadlineDate: null, extendedUntil: null, teacherOverride: 'inherit' as const, now: '2026-08-13T10:00:00.000Z',
    };
    expect(decideHomework(policy, base)).toMatchObject({ active: true, mode: 'guided_homework', finalAnswerAllowed: false });
    expect(decideHomework(policy, { ...base, now: '2026-08-13T08:59:59.000Z' })).toMatchObject({ active: false, reasonCode: 'BEFORE_WINDOW' });
    expect(decideHomework(policy, { ...base, now: '2026-08-13T11:31:00.000Z' })).toMatchObject({ active: false, reasonCode: 'AFTER_WINDOW' });
    expect(decideHomework(policy, { ...base, relationBasisPoints: 1_000 })).toMatchObject({ active: false, reasonCode: 'UNRELATED' });
    expect(decideHomework(policy, { ...base, status: 'submitted' })).toMatchObject({ active: false, reasonCode: 'STATUS_SUBMITTED' });
    expect(decideHomework(policy, { ...base, teacherOverride: 'allow_solution' })).toMatchObject({ active: false, reasonCode: 'TEACHER_OVERRIDE_ALLOW_SOLUTION' });
    expect(decideHomework(policy, { ...base, teacherOverride: 'force_guidance' })).toMatchObject({ active: true, reasonCode: 'TEACHER_OVERRIDE_FORCE_GUIDANCE' });
    expect(decideHomework(policy, { ...base, status: 'extended', extendedUntil: '2026-08-14T11:00:00.000Z', now: '2026-08-14T10:00:00.000Z' })).toMatchObject({ active: true });
  });

  it('suppresses small cohorts without a concept, identifiers, evidence or rankings', () => {
    const policy = resolve([row('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')]);
    const suppressed = buildClassSignal({ concept: 'division by zero', curriculumArea: 'Algebra', learnerHashes: ['a', 'b'], evidenceCount: 2, uncertaintyBasisPoints: 4_000, freshestAt: '2026-08-13T10:00:00.000Z', suggestedNextStep: 'Re-teach', policy });
    expect(suppressed).toMatchObject({ concept: 'Suppressed until cohort threshold', cohortSize: null, evidenceCount: 0, uncertaintyBasisPoints: 10_000, suppressed: true, rankingIncluded: false, rawAnswersIncluded: false, learnerIdentifiersIncluded: false });
    const shown = buildClassSignal({ concept: 'sign errors', curriculumArea: 'Algebra', learnerHashes: Array.from({ length: 8 }, (_, i) => `h${i}`), evidenceCount: 8, uncertaintyBasisPoints: 2_000, freshestAt: '2026-08-13T10:00:00.000Z', suggestedNextStep: 'Use a contrast case', policy });
    expect(shown).toMatchObject({ concept: 'sign errors', cohortSize: 8, suppressed: false });
  });

  it('scrubs forbidden keys and values from handoffs and parent digests', () => {
    expect(sanitizeTeacherSummary({ concept: 'Algebra', privateNote: 'secret', goal: 'Use model provider X', evidence: [{ label: 'voice recording', sourceEventId: 'e1' }] })).toEqual({ concept: 'Algebra', goal: 'Excluded by privacy policy.', evidence: [{ label: 'Excluded by privacy policy.', sourceEventId: 'e1' }] });
    expect(sanitizeParentDigest({ body: 'A fixed ability label', privacyNotice: 'Ability labels are excluded.', rawTranscript: 'secret' })).toEqual({ body: 'Excluded by privacy policy.', privacyNotice: 'Ability labels are excluded.' });
  });
});
