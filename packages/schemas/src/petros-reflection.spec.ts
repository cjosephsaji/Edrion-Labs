import { describe, expect, it } from 'vitest';
import {
  PETROS_REFLECTION_ALGORITHM_VERSION,
  PETROS_REFLECTION_FUNCTIONS,
  PETROS_REFLECTION_GAP_VERSION,
  PETROS_REFLECTION_RECAP_VERSION,
  PETROS_REFLECTION_SCHEMA_VERSION,
  PETROS_REFLECTION_THRESHOLDS,
  petrosGapAlarmContentSchema,
  petrosRecapFeedbackSchema,
  petrosReflectionSurfaceSchema,
  petrosReflectionRecommendationLifecycleSchema,
  petrosSessionRecapContentSchema,
} from './petros-reflection';
import { PETROS_FUNCTION_CATALOG } from './petros-ai-routing';

const id = '11111111-1111-4111-8111-111111111111';

describe('Petros Stage 11 reflection contracts', () => {
  it('registers recap and gap explanation as independent provider-neutral functions', () => {
    for (const key of Object.values(PETROS_REFLECTION_FUNCTIONS)) {
      expect(PETROS_FUNCTION_CATALOG.find((row) => row.key === key)).toMatchObject({
        responseFormat: 'json',
        category: 'Reflection',
      });
    }
  });

  it('requires recaps to separate facts from tentative inference and forbid durable claims', () => {
    const base = {
      schemaVersion: PETROS_REFLECTION_RECAP_VERSION,
      sessionId: id,
      headline: 'You changed strategy and recovered',
      observedFacts: [{ text: 'A hint was requested.', evidenceLinkIds: [id] }],
      tentativeInferences: [{ text: 'The diagram may have helped in this session.', label: 'Tentative', evidenceLinkIds: [id] }],
      nextTry: 'Try a small sketch again and check the result.',
      durablePreferenceClaimed: false,
      abilityLabelUsed: false,
    };
    expect(petrosSessionRecapContentSchema.safeParse(base).success).toBe(true);
    expect(petrosSessionRecapContentSchema.safeParse({ ...base, durablePreferenceClaimed: true }).success).toBe(false);
    expect(petrosSessionRecapContentSchema.safeParse({ ...base, tentativeInferences: [{ ...base.tentativeInferences[0], label: 'Fact' }] }).success).toBe(false);
  });

  it('requires a minimum independent sample and explicit hypothesis label for gap alarms', () => {
    const base = {
      schemaVersion: PETROS_REFLECTION_GAP_VERSION,
      prerequisiteConceptId: 'partial-derivatives',
      prerequisiteLabel: 'Partial derivatives',
      affectedTopics: [{ topicId: 'entropy', label: 'Entropy' }, { topicId: 'thermo-identities', label: 'Thermodynamic identities' }],
      independentEvidenceCount: PETROS_REFLECTION_THRESHOLDS.gapMinimumIndependentEvidence,
      confidenceBasisPoints: 7_000,
      hypothesis: 'Partial derivatives may be the shared prerequisite.',
      explanation: 'Three independent errors across two topics share this prerequisite.',
      practicalMinutes: 16,
      uncertaintyLabel: 'Prerequisite hypothesis',
    };
    expect(petrosGapAlarmContentSchema.safeParse(base).success).toBe(true);
    expect(petrosGapAlarmContentSchema.safeParse({ ...base, independentEvidenceCount: 2 }).success).toBe(false);
    expect(petrosGapAlarmContentSchema.safeParse({ ...base, affectedTopics: base.affectedTopics.slice(0, 1) }).success).toBe(false);
  });

  it('keeps optional voice and production readiness explicitly false on the surface', () => {
    const parsed = petrosReflectionSurfaceSchema.parse({
      schemaVersion: PETROS_REFLECTION_SCHEMA_VERSION,
      algorithmVersion: PETROS_REFLECTION_ALGORITHM_VERSION,
      rebuiltAt: null,
      sourceThroughAt: null,
      stale: false,
      jobLagSeconds: 0,
      thresholds: PETROS_REFLECTION_THRESHOLDS,
      map: { topics: [], relationships: [], coverage: {}, missingSyllabusLinks: 0 },
      recommendations: [],
      calibration: null,
      recaps: [],
      alarms: [],
      voiceRequired: false,
      productionReady: false,
    });
    expect(parsed).toMatchObject({ voiceRequired: false, productionReady: false });
    expect(() => petrosReflectionSurfaceSchema.parse({ ...parsed, productionReady: true })).toThrow();
  });

  it('requires actual correction text without blocking dismissal', () => {
    expect(petrosRecapFeedbackSchema.safeParse({ action: 'dismiss', idempotencyKey: id }).success).toBe(true);
    expect(petrosRecapFeedbackSchema.safeParse({ action: 'correct', idempotencyKey: id }).success).toBe(false);
  });

  it('keeps recommendation lifecycle learner-controlled and bounded to dismissal', () => {
    expect(petrosReflectionRecommendationLifecycleSchema.safeParse({ action: 'dismiss', idempotencyKey: id }).success).toBe(true);
    expect(petrosReflectionRecommendationLifecycleSchema.safeParse({ action: 'complete', idempotencyKey: id }).success).toBe(false);
  });
});
