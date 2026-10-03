import { describe, expect, it } from 'vitest';
import { petrosComposerQuestionSchema } from './petros-learning';
import {
  petrosKnowledgeAnswerSchema,
  petrosAdmissionDenialSchema,
  petrosKnowledgePolicySchema,
} from './petros-knowledge-policy';

describe('document knowledge contracts', () => {
  const id = '11111111-1111-4111-8111-111111111111';
  it('accepts old questions and only the three explicit preference modes', () => {
    const input = { idempotencyKey: id, question: 'Why?', expectedSessionVersion: 1 };
    expect(petrosComposerQuestionSchema.parse(input)).toEqual(input);
    for (const knowledgeMode of ['source_bound', 'source_primary', 'general_learning'])
      expect(petrosComposerQuestionSchema.safeParse({ ...input, knowledgeMode }).success).toBe(
        true,
      );
    for (const patch of [
      { knowledgeMode: 'web' },
      { policy: {} },
      { allowExternalSources: true },
      { assignmentUnrelated: true },
    ])
      expect(petrosComposerQuestionSchema.safeParse({ ...input, ...patch }).success).toBe(false);
  });
  it('does not permit generated text or invented locators in material-supported units', () => {
    expect(
      petrosKnowledgeAnswerSchema.safeParse({
        units: [{ basis: 'material_supported', spanId: 'a'.repeat(64) }],
      }).success,
    ).toBe(true);
    for (const unit of [
      { basis: 'material_supported', spanId: 'a'.repeat(64), text: 'Invented' },
      { basis: 'supplemental_retrieved', text: 'Internet result' },
      { basis: 'general_knowledge', text: 'Claim', page: 1 },
    ])
      expect(petrosKnowledgeAnswerSchema.safeParse({ units: [unit] }).success).toBe(false);
  });
  it('bounds answer units and distinguishes all admission categories', () => {
    expect(
      petrosKnowledgeAnswerSchema.safeParse({
        units: Array(5).fill({ basis: 'uncertain', text: 'Unknown' }),
      }).success,
    ).toBe(false);
    for (const category of [
      'safety_resource_limit',
      'product_plan_allowance',
      'abuse_control',
      'pedagogical_attempt_policy',
    ])
      expect(
        petrosAdmissionDenialSchema.safeParse({
          category,
          code: 'DENIED',
          correlationId: id,
          retry: 'refresh',
          message: 'Refresh.',
        }).success,
      ).toBe(true);
    expect(petrosAdmissionDenialSchema.safeParse({ category: 'misconduct' }).success).toBe(false);
  });
  it('pins a bounded source scope without granting external retrieval', () => {
    const policy = {
      schemaVersion: 'petros.knowledge-policy.v1',
      mode: 'source_bound',
      requestedMode: null,
      policyVersionIds: [],
      authorityHash: 'a'.repeat(64),
      sourceId: id,
      sourceFingerprint: 'b'.repeat(64),
      pages: [1],
      subjectId: null,
      maximumDepth: 3,
      assignmentRestrictions: [],
      retrieval: { designatedSource: true, external: false },
      authority: 'designated_material_with_institution_restrictions',
      explanation: 'Only designated material.',
    };
    expect(petrosKnowledgePolicySchema.parse(policy)).toEqual(policy);
    expect(
      petrosKnowledgePolicySchema.safeParse({
        ...policy,
        retrieval: { designatedSource: true, external: true },
      }).success,
    ).toBe(false);
  });
});
