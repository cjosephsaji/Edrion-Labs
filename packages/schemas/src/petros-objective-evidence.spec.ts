import { describe, expect, it } from 'vitest';
import { objectiveEvidenceFixture } from './__fixtures__/petros-objective-evidence';
import {
  classifyPetrosObjectiveEvidence,
  petrosObjectiveEvidenceAppendCommandSchema,
  petrosObjectiveEvidenceSchema,
} from './petros-objective-evidence';

describe('objective evidence boundary', () => {
  it('classifies only independently observed first-attempt no-assistance work as eligible', () => {
    const evidence = petrosObjectiveEvidenceSchema.parse(objectiveEvidenceFixture());
    expect(classifyPetrosObjectiveEvidence(evidence)).toMatchObject({
      observation: 'petros_unassisted', petrosAssistance: 'none_observed', projectionEligible: true,
    });
  });

  it.each([
    [{ hintCount: 1, suppliedAnswer: false }, 'hinted'],
    [{ hintCount: 0, suppliedAnswer: true }, 'solution_exposed'],
  ] as const)('preserves assistance distinction for %j', (value, expected) => {
    const evidence = structuredClone(objectiveEvidenceFixture());
    evidence.assessment.conditions.petrosAssistance[0]!.value = value;
    expect(classifyPetrosObjectiveEvidence(evidence)).toMatchObject({
      observation: 'assisted', petrosAssistance: expected, projectionEligible: false,
    });
  });

  it('accepts references only and rejects browser-supplied scores, hashes or assistance', () => {
    const command = { schemaVersion: 'petros.objective-evidence.v1',
      commandId: '20000000-0000-4000-8000-000000000003',
      evaluationId: '20000000-0000-4000-8000-000000000004',
      pack: { id: '10000000-0000-4000-8000-000000000004', version: 1 },
      task: { id: 'practice', variant: 'a' }, correction: null };
    expect(petrosObjectiveEvidenceAppendCommandSchema.safeParse(command).success).toBe(true);
    expect(petrosObjectiveEvidenceAppendCommandSchema.safeParse({ ...command,
      score: 1, assistance: 'none', contentHash: 'a'.repeat(64) }).success).toBe(false);
  });
});
