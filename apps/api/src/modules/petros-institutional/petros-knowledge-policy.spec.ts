import { describe, expect, it } from 'vitest';
import {
  defaultInstitutionPolicy,
  resolveInstitutionPolicy,
  knowledgePolicyHash,
  type PolicyVersionRecord,
} from './petros-institutional.engine';
import { questionDenial } from './petros-admission';
const institutionId = '11111111-1111-4111-8111-111111111111';
const subjectId = '22222222-2222-4222-8222-222222222222';
const fixture = {
  campusId: null,
  programmeId: null,
  gradeId: null,
  subjectId,
  studentId: null,
  language: 'en',
  accessibility: [],
};
function row(
  id: string,
  external = false,
  mode?: 'source_bound' | 'source_primary' | 'general_learning',
): PolicyVersionRecord {
  return {
    id,
    institutionId,
    campusId: null,
    programmeId: null,
    gradeId: null,
    subjectId: null,
    scopeLevel: 'institution',
    version: 1,
    status: 'published',
    effectiveFrom: null,
    effectiveUntil: null,
    config: {
      ...defaultInstitutionPolicy(),
      syllabus: {
        ...defaultInstitutionPolicy().syllabus,
        allowExternalSources: external,
        ...(mode ? { knowledgeMode: mode } : {}),
      },
    },
  };
}
const resolve = (versions: PolicyVersionRecord[]) =>
  resolveInstitutionPolicy({ institutionId, fixture, versions, restrictKnowledge: true });
describe('existing institutional resolver / knowledge authority', () => {
  it('adapts legacy booleans conservatively and requires explicit general permission', () => {
    expect(resolve([row(institutionId)]).config.syllabus.knowledgeMode).toBe('source_bound');
    expect(resolve([row(institutionId, true)]).config.syllabus.knowledgeMode).toBe(
      'source_primary',
    );
    expect(
      resolve([row(institutionId, true, 'general_learning')]).config.syllabus.knowledgeMode,
    ).toBe('general_learning');
    expect(
      resolve([row(institutionId, false, 'general_learning')]).config.syllabus.knowledgeMode,
    ).toBe('source_bound');
  });
  it('never broadens institution restrictions through a subject override, inactive or foreign policy', () => {
    const subject = {
      ...row(subjectId, true, 'general_learning'),
      subjectId,
      scopeLevel: 'subject' as const,
    };
    expect(resolve([row(institutionId), subject]).config.syllabus.knowledgeMode).toBe(
      'source_bound',
    );
    expect(
      resolve([
        { ...row(institutionId, true, 'general_learning') },
        { ...subject, config: row(subjectId).config },
      ]).config.syllabus.knowledgeMode,
    ).toBe('source_bound');
    for (const patch of [
      { status: 'draft' },
      { institutionId: subjectId },
      { effectiveFrom: new Date('2099-01-01') },
    ])
      expect(
        resolve([row(institutionId, true, 'general_learning'), { ...row(subjectId), ...patch }])
          .config.syllabus.knowledgeMode,
      ).toBe('general_learning');
  });
  it('intersects binding source and topic scopes instead of clearing an empty intersection', () => {
    const parent = row(institutionId, true);
    parent.config.syllabus.approvedSourceIds = ['a'];
    const child = { ...row(subjectId, true), subjectId, scopeLevel: 'subject' as const };
    child.config.syllabus.approvedSourceIds = ['b'];
    expect(resolve([parent, child]).config.syllabus.approvedSourceIds).toEqual([
      '__no_permitted_scope__',
    ]);
  });
  it('hashes stored JSON consistently and keeps allowance, safety, abuse and academic denials distinct', () => {
    expect(knowledgePolicyHash({ b: 1, a: { y: 2, x: 1 } })).toBe(
      knowledgePolicyHash({ a: { x: 1, y: 2 }, b: 1 }),
    );
    expect(questionDenial('PETROS_FUNCTION_QUOTA_EXCEEDED').category).toBe(
      'product_plan_allowance',
    );
    expect(questionDenial('PETROS_GLOBAL_BUDGET_EXCEEDED').category).toBe('safety_resource_limit');
    expect(questionDenial('PETROS_QUESTION_IN_FLIGHT').category).toBe('safety_resource_limit');
    expect(questionDenial('PETROS_QUESTION_LIMIT').category).toBe('abuse_control');
    expect(questionDenial('PETROS_ASSIGNMENT_ANSWER_RESTRICTED').category).toBe(
      'pedagogical_attempt_policy',
    );
  });
});
