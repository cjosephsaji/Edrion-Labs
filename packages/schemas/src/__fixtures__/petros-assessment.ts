import {
  adaptLegacyLearningEvidence,
  petrosNormalizedLearningEvidenceSchema,
} from '../petros-learner-model';
import type { PetrosAssessmentResult } from '../petros-assessment';

export function assessmentEvidenceFixture() {
  const input = adaptLegacyLearningEvidence(
    petrosNormalizedLearningEvidenceSchema.parse({
      schemaVersion: 'petros.learner-evidence.v1',
      source: 'petros',
      sourceEventId: 'synthetic-assessment',
      conceptId: 'synthetic-length',
      topicId: 'synthetic-length',
      evidenceKind: 'application',
      outcome: 'correct',
      creditBasisPoints: 10_000,
      occurredAt: '2026-09-17T00:00:00.000Z',
    }),
  );
  input.assessment.origin = 'declared_assessment';
  return input;
}
export function criterionResultFixture(): Extract<
  PetrosAssessmentResult,
  { kind: 'criterion_profile' }
> {
  return {
    kind: 'criterion_profile',
    rubric: {
      id: 'synthetic-rubric',
      version: '1',
      aggregation: 'none',
      references: [],
      criteria: [
        {
          id: 'reasoning',
          descriptor: 'A claim supported by a reason.',
          scale: { kind: 'ordinal', levels: ['emerging', 'defensible', 'strong'] },
        },
      ],
    },
    criteria: [
      {
        criterionId: 'reasoning',
        observation: {
          status: 'observed',
          level: 'defensible',
          workSpans: [
            {
              workId: 'synthetic-work',
              revisionId: '1',
              contentHash: 'a'.repeat(64),
              start: 0,
              end: 20,
            },
          ],
        },
        feedback: 'The claim has a reason; inspect the supporting example.',
        uncertainty: 'medium',
        review: 'required',
      },
    ],
    provenance: {
      evaluator: 'educator',
      evaluatorVersion: 'synthetic-v1',
      evaluatedAt: '2026-09-17T00:00:00.000Z',
      uncertainty: 'medium',
      review: 'required',
    },
  };
}
