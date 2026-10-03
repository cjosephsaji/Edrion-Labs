import { describe, expect, it } from 'vitest';
import {
  assessmentAdmission,
  petrosAssessmentConditionsSchema,
  petrosAssessmentResultSchema,
  petrosAssessmentSchema,
} from './petros-assessment';
import {
  adaptLegacyLearningEvidence,
  petrosAssessmentEvidenceSchema,
  petrosNormalizedLearningEvidenceSchema,
} from './petros-learner-model';
import {
  assessmentEvidenceFixture,
  criterionResultFixture,
} from './__fixtures__/petros-assessment';

describe('assessment contracts and admission', () => {
  it('adapts a strict legacy objective without fabricating known conditions or independence', () => {
    const v2 = assessmentEvidenceFixture();
    expect(petrosAssessmentEvidenceSchema.parse(v2)).toEqual(v2);
    expect(v2.assessment.conditions).toMatchObject({
      supervision: [],
      timing: [],
      externalAssistance: [],
      petrosAssistance: [],
      policyVersion: null,
    });
    expect(assessmentAdmission(v2.assessment)).toBeNull();
    expect(petrosNormalizedLearningEvidenceSchema.safeParse(v2).success).toBe(false);
    const v1 = petrosNormalizedLearningEvidenceSchema.parse({
      schemaVersion: 'petros.learner-evidence.v1',
      source: 'exam',
      sourceEventId: 'old',
      conceptId: 'c',
      topicId: 't',
      evidenceKind: 'recall',
      outcome: 'partial',
      creditBasisPoints: 3500,
      occurredAt: v2.occurredAt,
    });
    expect(adaptLegacyLearningEvidence(v1).assessment.result).toMatchObject({
      judgment: { outcome: 'partial', creditBasisPoints: 3500 },
      provenance: { evaluator: 'legacy', uncertainty: 'unknown' },
    });
    expect(petrosNormalizedLearningEvidenceSchema.parse(v1)).toEqual(v1);
  });
  it('supports ordinal and narrative criteria without correctness, numeric credit or implicit aggregation', () => {
    const profile = criterionResultFixture();
    expect(petrosAssessmentResultSchema.parse(profile)).toEqual(profile);
    expect(profile).not.toHaveProperty('creditBasisPoints');
    profile.rubric.criteria[0]!.scale = { kind: 'narrative' };
    if (profile.criteria[0]!.observation.status === 'observed')
      profile.criteria[0]!.observation.level = null;
    expect(petrosAssessmentResultSchema.safeParse(profile).success).toBe(true);
    profile.criteria[0]!.observation = { status: 'not_observed' };
    expect(petrosAssessmentResultSchema.safeParse(profile).success).toBe(true);
  });
  it('keeps mixed result components distinct and explicitly gates qualitative admission', () => {
    const input = assessmentEvidenceFixture();
    const objective = input.assessment.result;
    if (objective.kind !== 'objective') throw new Error('fixture');
    for (const result of [
      criterionResultFixture(),
      { kind: 'mixed' as const, objective, criteria: criterionResultFixture() },
    ]) {
      const parsed = petrosAssessmentEvidenceSchema.parse({
        ...input,
        assessment: { ...input.assessment, result },
      });
      expect(parsed).not.toHaveProperty('creditBasisPoints');
      expect(assessmentAdmission(parsed.assessment)).toBe('qualitative_assessment_disabled');
    }
  });
  it.each([
    'reference',
    'duplicate',
    'level',
    'ordinal_weight',
    'span',
    'nonfinite',
    'extra_score',
  ])('rejects invalid criterion %s', (kind) => {
    const p = criterionResultFixture();
    if (kind === 'reference') p.criteria[0]!.criterionId = 'unknown';
    if (kind === 'duplicate') p.criteria.push(structuredClone(p.criteria[0]!));
    if (kind === 'level' && p.criteria[0]!.observation.status === 'observed')
      p.criteria[0]!.observation.level = 80;
    if (kind === 'ordinal_weight') {
      p.rubric.aggregation = 'weighted_sum';
      p.rubric.criteria[0]!.weight = 1;
    }
    if (kind === 'span' && p.criteria[0]!.observation.status === 'observed')
      p.criteria[0]!.observation.workSpans[0]!.end = 0;
    if (kind === 'nonfinite')
      p.rubric.criteria[0]!.scale = { kind: 'numeric', min: 0, max: Infinity };
    expect(
      petrosAssessmentResultSchema.safeParse(
        kind === 'extra_score' ? { ...p, masteryProbability: 0.8 } : p,
      ).success,
    ).toBe(false);
  });
  it('separates requirements, self report, system observations and verified conditions', () => {
    const c = assessmentEvidenceFixture().assessment.conditions;
    c.supervision = [
      {
        value: 'supervised',
        basis: 'required',
        actor: { kind: 'system', id: 'policy' },
        method: 'assignment-policy',
        recordedAt: c.collectedAt,
      },
      {
        value: 'unsupervised',
        basis: 'self_reported',
        actor: { kind: 'learner', id: 'synthetic' },
        method: 'declaration',
        recordedAt: c.collectedAt,
      },
      {
        value: 'unsupervised',
        basis: 'independently_verified',
        actor: { kind: 'educator', id: 'synthetic-reviewer' },
        method: 'observation',
        recordedAt: c.collectedAt,
      },
    ];
    expect(petrosAssessmentConditionsSchema.parse(c).supervision).toHaveLength(3);
    c.supervision[2]!.actor.kind = 'learner';
    expect(petrosAssessmentConditionsSchema.safeParse(c).success).toBe(false);
  });
  it('rejects future collection facts and unbounded contracts', () => {
    const a = assessmentEvidenceFixture().assessment;
    a.conditions.modality = [
      {
        value: 'written',
        basis: 'system_observed',
        actor: { kind: 'system', id: 'petros' },
        method: 'input',
        recordedAt: '2027-01-01T00:00:00.000Z',
      },
    ];
    expect(petrosAssessmentSchema.safeParse(a).success).toBe(false);
    expect(petrosAssessmentSchema.safeParse({ ...a, extra: 'x'.repeat(100_000) }).success).toBe(
      false,
    );
    let deep: unknown = 1;
    for (let n = 0; n < 20; n++) deep = { deep };
    expect(petrosAssessmentSchema.safeParse(deep).success).toBe(false);
  });
  it('does not invent a half score when evaluation is unavailable', () => {
    const a = assessmentEvidenceFixture().assessment;
    if (a.result.kind !== 'objective') throw new Error('fixture');
    a.result.judgment = { status: 'not_evaluated', reason: 'evaluator_unavailable' };
    a.result.provenance.evaluator = 'unavailable';
    expect(assessmentAdmission(a)).toBe('assessment_not_evaluated');
    expect(a.result.judgment).not.toHaveProperty('creditBasisPoints');
    a.result.judgment = { status: 'evaluated', outcome: 'partial', creditBasisPoints: 5000 };
    expect(petrosAssessmentSchema.safeParse(a).success).toBe(false);
  });
});
