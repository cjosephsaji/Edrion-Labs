import { describe, expect, it } from 'vitest';
import {
  PETROS_LEARNER_EVIDENCE_SCHEMA_VERSION,
  PETROS_LEARNER_MODEL_ALGORITHM_VERSION,
  PETROS_LEARNER_SNAPSHOT_SCHEMA_VERSION,
  PETROS_PLAN_PROMPT_VERSION,
  PETROS_PLAN_SCHEMA_VERSION,
  PETROS_SESSION_STATE_VERSION,
  petrosLearnerSnapshotSchema,
  petrosSessionStateSchema,
  type PetrosNormalizedLearningEvidence,
} from '@edrion/schemas';
import { deterministicPlan } from '../student/petros-loop/petros-loop.policy';
import { stage4ProfileFixture } from '../student/petros-loop/petros-stage4.fixture';
import { deriveLearnerModel, errorRemedy, type EvidenceRow } from './petros-learner-model.engine';
import {
  normalizeAssignmentAnswer,
  normalizeExamAnswer,
  normalizeHomeworkAnswer,
  normalizeLibraryQuizAnswer,
  normalizeMockExamAnswer,
} from './petros-learning-source-normalizers';

const NOW = new Date('2026-08-10T00:00:00.000Z');

describe('Petros Stage 6 deterministic learner model', () => {
  it('updates mastery with recency, separate recall/application, uncertainty, and reproducible output', () => {
    const events = [
      evidence('old-recall', {
        evidenceKind: 'recall',
        creditBasisPoints: 0,
        outcome: 'wrong',
        occurredAt: '2025-08-10T00:00:00.000Z',
      }),
      evidence('recent-application', {
        evidenceKind: 'application',
        creditBasisPoints: 10_000,
        outcome: 'correct',
        occurredAt: '2026-08-09T00:00:00.000Z',
      }),
    ];
    const first = deriveLearnerModel(events, NOW);
    const replay = deriveLearnerModel([...events].reverse(), NOW);
    expect(first).toEqual(replay);
    expect(first.mastery[0]).toMatchObject({
      evidenceCount: 2,
      recallBasisPoints: 0,
      applicationBasisPoints: 10_000,
    });
    expect(first.mastery[0]!.masteryBasisPoints).toBeGreaterThan(5_000);
    expect(first.mastery[0]!.uncertaintyBasisPoints).toBe(7_500);
  });

  it('requires minimum evidence before durable pace/depth or move personalization', () => {
    const one = deriveLearnerModel(
      [
        evidence('only', {
          moveType: 'diagram',
          responseTimeMs: 1_000,
          metadata: { action: 'expand' },
        }),
      ],
      NOW,
    );
    expect(one.preference).toMatchObject({
      pace: 'neutral',
      depth: 'neutral',
      minimumEvidenceMet: false,
    });
    expect(one.moveOutcomes[0]).toMatchObject({ sampleSize: 1, confidenceBasisPoints: 1_250 });
  });

  it('keeps move outcomes distinct by topic/profile context and gives different error remedies', () => {
    const events = [
      evidence('visual-1', {
        moveType: 'diagram',
        topicId: 'calculus',
        profileDimension: 'representation:visual',
        outcome: 'correct',
        creditBasisPoints: 10_000,
      }),
      evidence('visual-2', {
        moveType: 'diagram',
        topicId: 'calculus',
        profileDimension: 'representation:visual',
        outcome: 'correct',
        creditBasisPoints: 10_000,
      }),
      evidence('visual-biology', {
        moveType: 'diagram',
        topicId: 'biology',
        profileDimension: 'representation:visual',
        outcome: 'wrong',
        creditBasisPoints: 0,
      }),
    ];
    const model = deriveLearnerModel(events, NOW);
    expect(model.moveOutcomes).toHaveLength(2);
    expect(model.moveOutcomes.find((item) => item.topicId === 'calculus')).toMatchObject({
      successes: 2,
      failures: 0,
    });
    expect(errorRemedy('arithmetic_slip')).not.toEqual(errorRemedy('concept_gap'));
    expect(errorRemedy('procedural_method')).toMatch(/worked example|contrast/i);
  });

  it('records all sure/think-so/guessing × correct/partial/wrong calibration buckets', () => {
    const confidence = ['sure', 'think_so', 'guessing'] as const;
    const outcomes = ['correct', 'partial', 'wrong'] as const;
    const events = confidence.flatMap((level) =>
      outcomes.map((outcome) =>
        evidence(`${level}-${outcome}`, {
          confidenceAfter: level,
          outcome,
          creditBasisPoints: outcome === 'correct' ? 10_000 : outcome === 'partial' ? 5_000 : 0,
        }),
      ),
    );
    const calibration = deriveLearnerModel(events, NOW).calibration;
    expect(calibration.buckets).toHaveLength(9);
    expect(calibration.buckets.every((bucket) => bucket.count === 1)).toBe(true);
    expect(calibration.evidenceCount).toBe(9);
  });

  it('cannot contaminate production summaries with synthetic/evaluation evidence', () => {
    const model = deriveLearnerModel(
      [
        evidence('synthetic', {
          environment: 'evaluation',
          synthetic: true,
          creditBasisPoints: 10_000,
        }),
      ],
      NOW,
    );
    expect(model.mastery).toEqual([]);
    expect(model.moveOutcomes).toEqual([]);
    expect(model.calibration.evidenceCount).toBe(0);
  });

  it('normalizes quiz, mock, exam, assignment, and homework source records', () => {
    const source = {
      id: 'source-answer-1',
      parentAttemptId: 'attempt-1',
      conceptId: 'integration-by-parts',
      topicId: 'calculus',
      correct: true,
      occurredAt: NOW.toISOString(),
    };
    const normalized = [
      normalizeLibraryQuizAnswer(source),
      normalizeMockExamAnswer(source),
      normalizeExamAnswer(source),
      normalizeAssignmentAnswer(source),
      normalizeHomeworkAnswer(source),
    ];
    expect(normalized.map((item) => item.source)).toEqual([
      'library_quiz',
      'mock_exam',
      'exam',
      'assignment',
      'homework',
    ]);
    expect(
      normalized.every(
        (item) => item.sourceEventId === source.id && item.creditBasisPoints === 10_000,
      ),
    ).toBe(true);
  });

  it('gives two seeded learners measurably different same-topic PLAN moves with traceable reasons', () => {
    const visual = planState(snapshot('diagram', 'concept_gap'));
    const procedural = planState(snapshot('worked_example', 'procedural_method'));
    const visualDecision = deterministicPlan(visual);
    const proceduralDecision = deterministicPlan(procedural);
    expect(visualDecision.selectedMoveType).toBe('diagram');
    expect(proceduralDecision.selectedMoveType).toBe('worked_example');
    expect(visualDecision.decisionFactors.join(' ')).toMatch(/diagram outcomes are stronger/i);
    expect(proceduralDecision.studentSafeReason).toMatch(/worked example outcomes are stronger/i);
  });

  it('lets a current-session concise override beat an inferred deep preference', () => {
    const learner = snapshot('derivation', 'procedural_method', {
      pace: null,
      depth: 'concise',
      source: 'student_current_session',
      updatedAt: NOW.toISOString(),
    });
    learner.preference.depth = 'deep';
    const decision = deterministicPlan(planState(learner));
    expect(decision.selectedMoveType).not.toBe('derivation');
  });
});

function evidence(id: string, patch: Partial<PetrosNormalizedLearningEvidence> = {}): EvidenceRow {
  return {
    id,
    schemaVersion: PETROS_LEARNER_EVIDENCE_SCHEMA_VERSION,
    source: 'petros',
    sourceEventId: id,
    sourceRecordId: id,
    conceptId: 'integration-by-parts',
    topicId: 'calculus',
    prerequisiteConceptIds: ['integration'],
    evidenceKind: 'application',
    outcome: 'correct',
    creditBasisPoints: 8_000,
    moveType: 'worked_example',
    profileDimension: 'representation:symbolic',
    preEvidenceBasisPoints: 4_000,
    postEvidenceBasisPoints: 8_000,
    responseTimeMs: 5_000,
    hintCount: 0,
    confidenceBefore: 'think_so',
    confidenceAfter: 'sure',
    errorCategory: 'none',
    errorConfidenceBasisPoints: 9_000,
    evaluatorVersion: 'deterministic-v1',
    algorithmVersion: PETROS_LEARNER_MODEL_ALGORITHM_VERSION,
    environment: 'production',
    synthetic: false,
    occurredAt: '2026-08-09T00:00:00.000Z',
    metadata: {},
    ...patch,
  };
}

function snapshot(
  moveType: 'diagram' | 'worked_example' | 'derivation',
  errorCategory: 'concept_gap' | 'procedural_method',
  sessionOverride: null | {
    pace: null;
    depth: 'concise';
    source: 'student_current_session';
    updatedAt: string;
  } = null,
) {
  return petrosLearnerSnapshotSchema.parse({
    schemaVersion: PETROS_LEARNER_SNAPSHOT_SCHEMA_VERSION,
    algorithmVersion: PETROS_LEARNER_MODEL_ALGORITHM_VERSION,
    generatedAt: NOW.toISOString(),
    topicId: 'integration-by-parts',
    neutral: false,
    stale: false,
    mastery: [],
    moveOutcomes: [
      {
        moveType,
        topicId: 'integration-by-parts',
        profileDimension: 'representation:symbolic',
        successes: 8,
        failures: 1,
        skips: 0,
        meanPreBasisPoints: 4_000,
        meanPostBasisPoints: 8_500,
        meanResponseTimeMs: 4_000,
        hintUses: 1,
        confidenceChangeBasisPoints: 1_000,
        weightAdjustmentBasisPoints: 3_000,
        evidenceCount: 9,
        confidenceBasisPoints: 10_000,
        uncertaintyBasisPoints: 0,
        lastEvidenceAt: NOW.toISOString(),
        evidenceAgeDays: 0,
      },
    ],
    preference: {
      pace: 'balanced',
      depth: 'balanced',
      observed: { skips: 0, expands: 4, reads: 3, responses: 8, meanResponseTimeMs: 4_000 },
      evidenceCount: 8,
      confidenceBasisPoints: 10_000,
      minimumEvidenceMet: true,
    },
    sessionOverride,
    errors: [
      {
        category: errorCategory,
        count: 4,
        contexts: ['representation:symbolic'],
        confidenceBasisPoints: 8_000,
        lastEvidenceAt: NOW.toISOString(),
        evidenceAgeDays: 0,
        remedy: errorRemedy(errorCategory),
      },
    ],
    calibration: {
      buckets: ['sure', 'think_so', 'guessing'].flatMap((confidence) =>
        ['correct', 'partial', 'wrong'].map((outcome) => ({ confidence, outcome, count: 0 })),
      ),
      scoreBasisPoints: 8_000,
      uncertaintyBasisPoints: 1_000,
      fragileConfidence: false,
      evidenceCount: 9,
    },
    causalFactors: [
      `${moveType.replace(/_/g, ' ')} outcomes are stronger across 9 comparable moves.`,
    ],
    evidenceEventIds: [],
  });
}

function planState(learnerSnapshot: ReturnType<typeof snapshot>) {
  const profile = stage4ProfileFixture(
    'integration by parts',
    '33333333-3333-4333-8333-333333333333',
  );
  profile.profile.dimensions.prerequisiteDensity = 0;
  profile.profile.dimensions.prerequisites = [];
  profile.profile.dimensions.moves.required = [];
  profile.profile.dimensions.moves.openingPattern = ['diagram', 'worked_example'];
  profile.profile.dimensions.moves.weights.diagram = 7_000;
  profile.profile.dimensions.moves.weights.worked_example = 7_000;
  profile.profile.dimensions.moves.weights.derivation = 7_000;
  return petrosSessionStateSchema.parse({
    stateVersion: PETROS_SESSION_STATE_VERSION,
    sessionId: '11111111-1111-4111-8111-111111111111',
    studentId: '22222222-2222-4222-8222-222222222222',
    institutionId: '33333333-3333-4333-8333-333333333333',
    sessionType: 'learn',
    topic: 'integration by parts',
    currentGoal: 'Choose and apply integration by parts.',
    time: { budgetSeconds: 900, elapsedSeconds: 0, remainingSeconds: 900 },
    moves: { maximum: 6, used: 0, remaining: 6 },
    checkpointPlan: [{ id: 'one', label: 'Choose a method', status: 'current' }],
    currentCheckpointId: 'one',
    priorMoves: [],
    learnerContext: {},
    learnerSnapshot,
    topicContext: {},
    resolvedTopicProfile: profile,
    sourceContext: null,
    observations: {
      recent: [],
      summarizedOutcomes: {
        answered: 0,
        correct: 0,
        incorrect: 0,
        partial: 0,
        highValueMisconceptions: 0,
        fragileSuccesses: 0,
        openDetours: 0,
        activeStruggleLevel: 0,
      },
    },
    promptVersion: PETROS_PLAN_PROMPT_VERSION,
    outputSchemaVersion: PETROS_PLAN_SCHEMA_VERSION,
  });
}
