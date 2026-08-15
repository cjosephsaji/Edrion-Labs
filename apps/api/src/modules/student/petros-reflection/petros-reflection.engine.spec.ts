import { describe, expect, it } from 'vitest';
import {
  deriveCalibration,
  deriveGapCandidates,
  deriveKnowledgeMap,
  deriveSessionRecap,
  isReflectionStale,
  type ReflectionCurriculumTopic,
  type ReflectionEvidence,
  type ReflectionMastery,
} from './petros-reflection.engine';

const now = new Date('2026-08-13T12:00:00.000Z');
const DAY = 86_400_000;

function evidence(
  id: string,
  conceptId: string,
  topicId: string,
  patch: Partial<ReflectionEvidence> = {},
): ReflectionEvidence {
  return {
    id: uuid(id), sourceEventId: `source-${id}`, conceptId, topicId,
    prerequisiteConceptIds: [], outcome: 'correct', creditBasisPoints: 9_000,
    confidenceAfter: 'sure', errorCategory: 'none', occurredAt: new Date(now.getTime() - DAY),
    ...patch,
  };
}

const topics: ReflectionCurriculumTopic[] = [
  { conceptId: 'vectors', topicId: 'topic-vectors', title: 'Vectors', subjectLabel: 'Physics', curriculumLabel: 'Mechanics', prerequisiteConceptIds: [], syllabusLinked: true },
  { conceptId: 'forces', topicId: 'topic-forces', title: 'Forces', subjectLabel: 'Physics', curriculumLabel: 'Mechanics', prerequisiteConceptIds: ['vectors'], learnerGoal: true, syllabusLinked: true },
  { conceptId: 'momentum', topicId: 'topic-momentum', title: 'Momentum', subjectLabel: 'Physics', curriculumLabel: 'Mechanics', prerequisiteConceptIds: ['vectors'], syllabusLinked: true },
  { conceptId: 'energy', topicId: 'topic-energy', title: 'Energy', subjectLabel: 'Physics', curriculumLabel: 'Mechanics', prerequisiteConceptIds: [], syllabusLinked: true },
];

describe('Petros Stage 11 deterministic reflection engine', () => {
  it('distinguishes solid, shaky, untouched, and insufficient evidence with freshness', () => {
    const mastery: ReflectionMastery[] = [
      { conceptId: 'vectors', topicId: 'topic-vectors', masteryBasisPoints: 8_200, uncertaintyBasisPoints: 2_000, evidenceCount: 4, lastTouchedAt: new Date(now.getTime() - 2 * DAY), nextReviewAt: null },
      { conceptId: 'forces', topicId: 'topic-forces', masteryBasisPoints: 5_500, uncertaintyBasisPoints: 3_000, evidenceCount: 4, lastTouchedAt: new Date(now.getTime() - 100 * DAY), nextReviewAt: new Date(now.getTime() - DAY) },
      { conceptId: 'momentum', topicId: 'topic-momentum', masteryBasisPoints: 9_000, uncertaintyBasisPoints: 7_500, evidenceCount: 1, lastTouchedAt: new Date(now.getTime() - DAY), nextReviewAt: null },
    ];
    const result = deriveKnowledgeMap({ topics, mastery, evidence: [evidence('1','vectors','topic-vectors'), evidence('2','forces','topic-forces'), evidence('3','momentum','topic-momentum')], now });
    expect(Object.fromEntries(result.topics.map((row) => [row.conceptId, row.state]))).toEqual({ vectors: 'solid', forces: 'shaky', momentum: 'insufficient_evidence', energy: 'untouched' });
    expect(result.topics.find((row) => row.conceptId === 'energy')?.stateExplanation).toMatch(/Not attempted/i);
    expect(result.topics.find((row) => row.conceptId === 'forces')?.freshness).toBe('stale');
    expect(result.relationships).toContainEqual({ fromConceptId: 'vectors', toConceptId: 'forces' });
  });

  it('deduplicates concepts when syllabus and learner evidence provide the same topic', () => {
    const forces = topics.find((topic) => topic.conceptId === 'forces')!;
    const duplicate = {
      ...forces,
      topicId: 'mastery-only-forces',
      prerequisiteConceptIds: ['vectors', 'vectors'],
      syllabusLinked: false,
    };
    const result = deriveKnowledgeMap({
      topics: [...topics, duplicate],
      mastery: [],
      evidence: [],
      now,
    });

    expect(result.topics.filter((row) => row.conceptId === 'forces')).toHaveLength(1);
    expect(result.topics.find((row) => row.conceptId === 'forces')?.prerequisiteConceptIds).toEqual(['vectors']);
    expect(result.relationships.filter((row) => row.toConceptId === 'forces')).toEqual([
      { fromConceptId: 'vectors', toConceptId: 'forces' },
    ]);
  });

  it('ranks prerequisite gaps ahead of fragile, due, goal, and first-attempt actions transparently', () => {
    const mastery: ReflectionMastery[] = [
      { conceptId: 'vectors', topicId: 'topic-vectors', masteryBasisPoints: 4_000, uncertaintyBasisPoints: 2_000, evidenceCount: 5, lastTouchedAt: new Date(now.getTime() - DAY), nextReviewAt: new Date(now.getTime() - DAY) },
      { conceptId: 'forces', topicId: 'topic-forces', masteryBasisPoints: 4_500, uncertaintyBasisPoints: 2_000, evidenceCount: 5, lastTouchedAt: new Date(now.getTime() - DAY), nextReviewAt: null },
      { conceptId: 'momentum', topicId: 'topic-momentum', masteryBasisPoints: 4_500, uncertaintyBasisPoints: 2_000, evidenceCount: 5, lastTouchedAt: new Date(now.getTime() - DAY), nextReviewAt: null },
    ];
    const result = deriveKnowledgeMap({ topics, mastery, evidence: [], now });
    expect(result.recommendations[0]?.conceptId).toBe('vectors');
    expect(result.recommendations[0]?.reasons.map((row) => row.code)).toContain('prerequisite_gap');
    expect(result.recommendations[0]?.score).toBe(result.recommendations[0]?.reasons.reduce((sum, row) => sum + row.points, 0));
  });

  it('hides calibration below eight pairs and derives gentle direction/trend without false precision', () => {
    const low = Array.from({ length: 7 }, (_, index) => evidence(`${index + 10}`, 'vectors', 'topic-vectors'));
    expect(deriveCalibration(low, now, null)).toMatchObject({ eligible: false, direction: 'hidden', status: 'hidden' });
    const narrowing = [
      ...Array.from({ length: 4 }, (_, index) => evidence(`${index + 30}`, 'vectors', 'topic-vectors', { outcome: 'wrong', creditBasisPoints: 0, confidenceAfter: 'sure', occurredAt: new Date(now.getTime() - (20 - index) * DAY) })),
      ...Array.from({ length: 4 }, (_, index) => evidence(`${index + 40}`, 'vectors', 'topic-vectors', { outcome: 'correct', creditBasisPoints: 9_000, confidenceAfter: 'sure', occurredAt: new Date(now.getTime() - (4 - index) * DAY) })),
    ];
    const insight = deriveCalibration(narrowing, now, uuid('90'));
    expect(insight).toMatchObject({ eligible: true, trend: 'narrowing', headline: 'The gap is narrowing' });
    expect(insight.explanation).toMatch(/skill|gap|confidence/i);
  });

  it('creates one deduplicated uncertainty-labelled alarm only for independent cross-topic evidence', () => {
    const clustered = [
      evidence('51','forces','topic-forces',{ sourceEventId:'a', outcome:'wrong', creditBasisPoints:0, errorCategory:'prerequisite_gap', prerequisiteConceptIds:['vectors'] }),
      evidence('52','forces','topic-forces',{ sourceEventId:'b', outcome:'partial', creditBasisPoints:4_000, errorCategory:'concept_gap', prerequisiteConceptIds:['vectors'] }),
      evidence('53','momentum','topic-momentum',{ sourceEventId:'c', outcome:'wrong', creditBasisPoints:0, errorCategory:'prerequisite_gap', prerequisiteConceptIds:['vectors'] }),
      evidence('54','momentum','topic-momentum',{ sourceEventId:'c', outcome:'wrong', creditBasisPoints:0, errorCategory:'prerequisite_gap', prerequisiteConceptIds:['vectors'] }),
    ];
    const alarms = deriveGapCandidates({ topics, evidence: clustered, recommendations: [], now });
    expect(alarms).toHaveLength(1);
    expect(alarms[0]).toMatchObject({ content: { prerequisiteConceptId: 'vectors', independentEvidenceCount: 3, uncertaintyLabel: 'Prerequisite hypothesis' } });
    expect(alarms[0]?.content.affectedTopics).toHaveLength(2);
    const unrelated = clustered.map((row, index) => ({ ...row, prerequisiteConceptIds: [`p-${index}`] }));
    expect(deriveGapCandidates({ topics, evidence: unrelated, recommendations: [], now })).toEqual([]);
  });

  it('recaps observed facts, labels inference, notices recovery, and never claims a durable preference', () => {
    const recap = deriveSessionRecap({
      sessionId: uuid('70'), topic: 'Vectors', closedAt: now,
      moves: [{ id: uuid('71'), type: 'diagram', reason: 'The topic is spatial.', createdAt: new Date(now.getTime() - 10_000) }],
      observations: [
        { id: uuid('72'), type: 'answer_submitted', confidence: 'think_so', correctness: 'wrong', errorClass: 'notation', fragileSuccess: false, recovery: false, occurredAt: new Date(now.getTime() - 8_000) },
        { id: uuid('73'), type: 'answer_submitted', confidence: 'sure', correctness: 'correct', errorClass: 'none', fragileSuccess: false, recovery: true, occurredAt: new Date(now.getTime() - 4_000) },
      ],
    });
    expect(recap.content.observedFacts.join(' ')).not.toMatch(/smart|talent|ability/i);
    expect(recap.content.observedFacts.map((row) => row.text).join(' ')).toMatch(/notation|recovered/i);
    expect(recap.content.tentativeInferences[0]?.label).toBe('Tentative');
    expect(recap.content).toMatchObject({ durablePreferenceClaimed: false, abilityLabelUsed: false });
    expect(recap.evidence.every((row) => row.observedAt)).toBe(true);
  });

  it('marks a derivation stale when learner evidence or the published graph advances', () => {
    expect(isReflectionStale({
      snapshotSourceThroughAt: new Date('2026-08-12T10:00:00.000Z'),
      snapshotGraphUpdatedAt: new Date('2026-08-12T10:00:00.000Z'),
      latestSourceAt: new Date('2026-08-13T10:00:00.000Z'),
      latestGraphAt: new Date('2026-08-12T10:00:00.000Z'),
    })).toBe(true);
    expect(isReflectionStale({
      snapshotSourceThroughAt: new Date('2026-08-13T10:00:00.000Z'),
      snapshotGraphUpdatedAt: new Date('2026-08-13T10:00:00.000Z'),
      latestSourceAt: new Date('2026-08-13T10:00:00.000Z'),
      latestGraphAt: new Date('2026-08-13T10:00:00.000Z'),
    })).toBe(false);
  });
});

function uuid(seed: string) {
  const digits = seed.padStart(12, '0').slice(-12);
  return `11111111-1111-4111-8111-${digits}`;
}
