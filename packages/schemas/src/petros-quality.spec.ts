import { describe, expect, it } from 'vitest';
import { petrosQualityLiveSessionSchema } from './petros-quality';

const input = {
  source: 'evaluation',
  environment: 'evaluation',
  synthetic: true,
  runId: 'stage5-live-schema',
  case: { id: 'case-1' },
  personaId: 'repeated_struggle',
  personaPolicy: {
    id: 'repeated_struggle',
    description: 'Fails the same target three times and tests the complete struggle ladder.',
    accuracy: 0.05,
    confidence: 'guessing',
    responseTimeMs: 8_000,
    skips: false,
    prerequisiteAccuracy: 0.25,
    questionBehavior: 'none',
    recovery: 'persistent_struggle',
  },
  seed: 42,
  limits: { maxCostMicros: 100_000, maxTokens: 100_000, maxDurationMs: 60_000 },
};

describe('Petros quality live session contract', () => {
  it('accepts a bounded synthetic persona policy', () => {
    expect(petrosQualityLiveSessionSchema.safeParse(input).success).toBe(true);
  });

  it('rejects a persona policy that does not match the selected persona', () => {
    const parsed = petrosQualityLiveSessionSchema.safeParse({ ...input, personaPolicy: { ...input.personaPolicy, id: 'fast_confident' } });
    expect(parsed.success).toBe(false);
  });
});
