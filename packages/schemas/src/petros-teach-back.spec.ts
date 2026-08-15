import { describe, expect, it } from 'vitest';
import {
  PETROS_TEACH_BACK_ANALYSIS_VERSION,
  PETROS_TEACH_BACK_FOLLOW_UP_VERSION,
  PETROS_TEACH_BACK_VERDICT_VERSION,
  createPetrosTeachBackSessionSchema,
  petrosTeachBackAnalysisSchema,
  petrosTeachBackFollowUpSchema,
  petrosTeachBackVerdictSchema,
  submitPetrosTeachBackSegmentSchema,
} from './petros-teach-back';

const segmentId = '11111111-1111-4111-8111-111111111111';
const mediaId = '22222222-2222-4222-8222-222222222222';
const idempotencyKey = '33333333-3333-4333-8333-333333333333';
const evidence = {
  segmentId,
  excerpt: 'Heat gives the particles more kinetic energy.',
};

function analysis(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: PETROS_TEACH_BACK_ANALYSIS_VERSION,
    coverage: [
      {
        key: 'mechanism',
        label: 'Explain the mechanism',
        status: 'partial',
        evidence: [evidence],
      },
    ],
    claims: [{ claim: evidence.excerpt, status: 'supported', evidence }],
    examples: [],
    primaryGap: {
      type: 'missing_causal_link',
      description: 'The result is named, but the link to particle motion is missing.',
      evidence,
      confidence: 0.92,
    },
    completeEnough: false,
    needsFollowUp: true,
    speechRecognitionUncertain: false,
    uncertaintyDisclosure: null,
    ...overrides,
  };
}

function verdict(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: PETROS_TEACH_BACK_VERDICT_VERSION,
    oneLine: 'Clear mechanism, with one exception still worth adding.',
    clear: [{ detail: 'You linked energy to particle motion.', evidence }],
    mostImportantGap: {
      type: 'unhandled_exception',
      detail: 'The explanation did not cover a change of state.',
      evidence,
    },
    suggestedImprovement: 'Add a melting example and explain where the energy goes.',
    audienceFit: 'helpful_after_revision',
    audienceReason: 'A junior could follow the mechanism after that exception is made explicit.',
    uncertaintyDisclosure: null,
    recapProposal: {
      kind: 'note',
      title: 'Particle explanation',
      body: 'Heat changes particle motion.',
    },
    officialAssessmentChanged: false,
    ...overrides,
  };
}

describe('Petros Teach-it-back contracts', () => {
  it('creates a first-class finite text or optional-voice session with voluntary-repeat lineage', () => {
    const parsed = createPetrosTeachBackSessionSchema.parse({
      topic: 'particle model',
      mode: 'voice',
      repeatedFromSessionId: segmentId,
      idempotencyKey,
    });
    expect(parsed).toMatchObject({
      mode: 'voice',
      maxMoves: 8,
      timeBudgetSeconds: 720,
      repeatedFromSessionId: segmentId,
    });
  });

  it('requires owner-scoped media for voice while keeping text fully independent', () => {
    const common = {
      text: 'My explanation.',
      expectedVersion: 0,
      idempotencyKey,
    };
    expect(
      submitPetrosTeachBackSegmentSchema.safeParse({
        ...common,
        source: 'text',
      }).success,
    ).toBe(true);
    expect(
      submitPetrosTeachBackSegmentSchema.safeParse({
        ...common,
        source: 'voice',
      }).success,
    ).toBe(false);
    expect(
      submitPetrosTeachBackSegmentSchema.safeParse({
        ...common,
        source: 'voice',
        mediaId,
      }).success,
    ).toBe(true);
  });

  it('never converts speech-recognition uncertainty into a conceptual gap', () => {
    expect(
      petrosTeachBackAnalysisSchema.safeParse(analysis({ speechRecognitionUncertain: true }))
        .success,
    ).toBe(false);
    expect(
      petrosTeachBackAnalysisSchema.safeParse(
        analysis({
          speechRecognitionUncertain: true,
          primaryGap: null,
          needsFollowUp: false,
        }),
      ).success,
    ).toBe(true);
  });

  it('requires exactly one grounded question and immediate help at the second-probe cap', () => {
    const base = {
      schemaVersion: PETROS_TEACH_BACK_FOLLOW_UP_VERSION,
      gapType: 'missing_causal_link',
      question: 'What makes the particles move faster?',
      groundedIn: evidence,
      probeNumber: 1,
      juniorTransition: 'I follow the result, but I lost the middle step.',
      helpAfterCap: null,
      tone: 'curious',
    };
    expect(petrosTeachBackFollowUpSchema.safeParse(base).success).toBe(true);
    expect(
      petrosTeachBackFollowUpSchema.safeParse({
        ...base,
        question: 'Why? And what happens next?',
      }).success,
    ).toBe(false);
    expect(petrosTeachBackFollowUpSchema.safeParse({ ...base, probeNumber: 2 }).success).toBe(
      false,
    );
    expect(
      petrosTeachBackFollowUpSchema.safeParse({
        ...base,
        probeNumber: 2,
        helpAfterCap: 'Heat transfers energy, increasing average particle motion.',
      }).success,
    ).toBe(true);
  });

  it('accepts an evidence-linked verdict but rejects every numeric grading form and official-mark mutation', () => {
    expect(petrosTeachBackVerdictSchema.safeParse(verdict()).success).toBe(true);
    for (const oneLine of ['Score 8', 'Grade A', 'You earned 75%', 'Rating 4/5', 'Three marks']) {
      expect(petrosTeachBackVerdictSchema.safeParse(verdict({ oneLine })).success).toBe(false);
    }
    expect(
      petrosTeachBackVerdictSchema.safeParse(verdict({ officialAssessmentChanged: true })).success,
    ).toBe(false);
  });
});
