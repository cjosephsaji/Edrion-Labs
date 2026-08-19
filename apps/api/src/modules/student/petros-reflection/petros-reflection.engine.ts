import { createHash } from 'node:crypto';
import {
  PETROS_REFLECTION_ALGORITHM_VERSION,
  PETROS_REFLECTION_FUNCTIONS,
  PETROS_REFLECTION_GAP_VERSION,
  PETROS_REFLECTION_RECAP_VERSION,
  PETROS_REFLECTION_THRESHOLDS,
  type PetrosCalibrationInsight,
  type PetrosGapAlarm,
  type PetrosGapAlarmContent,
  type PetrosKnowledgeMapTopic,
  type PetrosReflectionEvidenceLink,
  type PetrosReflectionRecommendation,
  type PetrosSessionRecap,
  type PetrosSessionRecapContent,
} from '@edrion/schemas';

const DAY_MS = 86_400_000;

export interface ReflectionCurriculumTopic {
  conceptId: string;
  topicId: string;
  title: string;
  subjectLabel: string;
  curriculumLabel: string;
  prerequisiteConceptIds: string[];
  examLabel?: string | null;
  examDate?: Date | null;
  learnerGoal?: boolean;
  syllabusLinked?: boolean;
}

export interface ReflectionMastery {
  conceptId: string;
  topicId: string;
  masteryBasisPoints: number;
  uncertaintyBasisPoints: number;
  evidenceCount: number;
  lastTouchedAt: Date;
  nextReviewAt: Date | null;
}

export interface ReflectionEvidence {
  id: string;
  sourceEventId: string;
  conceptId: string;
  topicId: string;
  prerequisiteConceptIds: string[];
  outcome: string;
  creditBasisPoints: number;
  confidenceAfter: 'sure' | 'think_so' | 'guessing' | null;
  errorCategory: string;
  occurredAt: Date;
}

export interface ReflectionSessionEvidence {
  sessionId: string;
  topic: string;
  closedAt: Date;
  moves: Array<{
    id: string;
    type: string;
    reason: string;
    createdAt: Date;
  }>;
  observations: Array<{
    id: string;
    type: string;
    confidence: string | null;
    correctness: string | null;
    errorClass: string | null;
    fragileSuccess: boolean;
    recovery: boolean;
    occurredAt: Date;
  }>;
}

export function deriveKnowledgeMap(input: {
  topics: ReflectionCurriculumTopic[];
  mastery: ReflectionMastery[];
  evidence: ReflectionEvidence[];
  now: Date;
}) {
  // A learner can be represented by both a published syllabus row and a
  // mastery-only row.  Both are valid sources, but the persisted map has one
  // state per concept, so normalize the graph before deriving any projections.
  const normalizedTopics = dedupeTopics(input.topics);
  const masteryByConcept = new Map(input.mastery.map((row) => [row.conceptId, row]));
  const evidenceByConcept = groupBy(input.evidence, (row) => row.conceptId);
  const dependents = new Map<string, string[]>();
  for (const topic of normalizedTopics) {
    for (const prerequisite of topic.prerequisiteConceptIds) {
      dependents.set(prerequisite, unique([...(dependents.get(prerequisite) ?? []), topic.conceptId]));
    }
  }

  const topics: PetrosKnowledgeMapTopic[] = normalizedTopics.map((topic) => {
    const mastery = masteryByConcept.get(topic.conceptId);
    const evidence = (evidenceByConcept.get(topic.conceptId) ?? []).sort(
      (left, right) => right.occurredAt.getTime() - left.occurredAt.getTime(),
    );
    const evidenceCount = Math.max(mastery?.evidenceCount ?? 0, evidence.length);
    const lastEvidenceAt = mastery?.lastTouchedAt ?? evidence[0]?.occurredAt ?? null;
    const evidenceAgeDays = lastEvidenceAt
      ? Math.max(0, Math.floor((input.now.getTime() - lastEvidenceAt.getTime()) / DAY_MS))
      : null;
    const freshness = evidenceAgeDays == null
      ? 'none' as const
      : evidenceAgeDays <= PETROS_REFLECTION_THRESHOLDS.freshDays
        ? 'fresh' as const
        : evidenceAgeDays <= PETROS_REFLECTION_THRESHOLDS.agingDays
          ? 'aging' as const
          : 'stale' as const;
    const state = knowledgeState({
      evidenceCount,
      masteryBasisPoints: mastery?.masteryBasisPoints ?? null,
      uncertaintyBasisPoints: mastery?.uncertaintyBasisPoints ?? 10_000,
      evidenceAgeDays,
    });
    return {
      conceptId: topic.conceptId,
      topicId: topic.topicId,
      title: topic.title,
      subjectLabel: topic.subjectLabel,
      curriculumLabel: topic.curriculumLabel,
      state,
      stateExplanation: explainState(state, evidenceCount, evidenceAgeDays),
      evidenceCount,
      masteryBasisPoints: mastery?.masteryBasisPoints ?? null,
      uncertaintyBasisPoints: mastery?.uncertaintyBasisPoints ?? 10_000,
      freshness,
      evidenceAgeDays,
      lastEvidenceAt: lastEvidenceAt?.toISOString() ?? null,
      prerequisiteConceptIds: topic.prerequisiteConceptIds,
      dependentConceptIds: dependents.get(topic.conceptId) ?? [],
      examRelevance: {
        known: Boolean(topic.examLabel || topic.examDate),
        label: topic.examLabel ?? null,
        examDate: topic.examDate?.toISOString() ?? null,
      },
      evidence: evidence.slice(0, 8).map((row) =>
        evidenceLink(row, input.now, `map:${topic.conceptId}`),
      ),
      recommendationId: null,
    };
  });

  const stateByConcept = new Map(topics.map((topic) => [topic.conceptId, topic]));
  const sourceByConcept = new Map(normalizedTopics.map((topic) => [topic.conceptId, topic]));
  const recommendations = topics
    // Concepts keyed by an internal identifier still count as evidence, but they cannot be
    // named for a student. Recommending "A step you practised" four times helps nobody, so
    // only nameable concepts become next actions.
    .filter((topic) => isNameableConcept(topic.conceptId))
    .map((topic) => recommendationFor(topic, sourceByConcept.get(topic.conceptId)!, stateByConcept, masteryByConcept, input.now))
    .filter((row): row is PetrosReflectionRecommendation => Boolean(row))
    .sort((left, right) => right.score - left.score || left.title.localeCompare(right.title))
    .slice(0, 12);
  const recommendationByConcept = new Map(recommendations.map((row) => [row.conceptId, row.id]));
  const linkedTopics = topics.map((topic) => ({
    ...topic,
    recommendationId: recommendationByConcept.get(topic.conceptId) ?? null,
  }));
  return {
    topics: linkedTopics,
    recommendations,
    relationships: normalizedTopics.flatMap((topic) =>
      topic.prerequisiteConceptIds.map((prerequisite) => ({
        fromConceptId: prerequisite,
        toConceptId: topic.conceptId,
      })),
    ),
    coverage: Object.fromEntries(
      ['solid', 'shaky', 'untouched', 'insufficient_evidence'].map((state) => [
        state,
        linkedTopics.filter((topic) => topic.state === state).length,
      ]),
    ),
    missingSyllabusLinks: normalizedTopics.filter((topic) => topic.syllabusLinked === false).length,
  };
}

function dedupeTopics(topics: ReflectionCurriculumTopic[]): ReflectionCurriculumTopic[] {
  const byConcept = new Map<string, ReflectionCurriculumTopic>();
  for (const topic of topics) {
    const existing = byConcept.get(topic.conceptId);
    if (!existing) {
      byConcept.set(topic.conceptId, {
        ...topic,
        prerequisiteConceptIds: unique(topic.prerequisiteConceptIds),
      });
      continue;
    }
    byConcept.set(topic.conceptId, {
      ...existing,
      prerequisiteConceptIds: unique([
        ...existing.prerequisiteConceptIds,
        ...topic.prerequisiteConceptIds,
      ]),
      learnerGoal: Boolean(existing.learnerGoal || topic.learnerGoal),
      syllabusLinked: Boolean(existing.syllabusLinked || topic.syllabusLinked),
      examLabel: existing.examLabel ?? topic.examLabel ?? null,
      examDate: existing.examDate ?? topic.examDate ?? null,
    });
  }
  return [...byConcept.values()];
}

export function isReflectionStale(input: {
  snapshotSourceThroughAt: Date | null;
  snapshotGraphUpdatedAt: Date | null;
  latestSourceAt: Date | null;
  latestGraphAt: Date | null;
}) {
  return Boolean(
    (input.latestSourceAt &&
      (!input.snapshotSourceThroughAt || input.latestSourceAt > input.snapshotSourceThroughAt)) ||
    (input.latestGraphAt &&
      (!input.snapshotGraphUpdatedAt || input.latestGraphAt > input.snapshotGraphUpdatedAt)),
  );
}

export function deriveCalibration(
  evidence: ReflectionEvidence[],
  now: Date,
  actionRecommendationId: string | null,
): PetrosCalibrationInsight {
  const calibrated = evidence
    .filter(
      (row) =>
        row.confidenceAfter != null &&
        ['correct', 'partial', 'wrong'].includes(row.outcome),
    )
    .sort((left, right) => left.occurredAt.getTime() - right.occurredAt.getTime());
  const eligible = calibrated.length >= PETROS_REFLECTION_THRESHOLDS.calibrationMinimumEvidence;
  const id = stableUuid(`calibration:${calibrated.map((row) => row.id).join(':') || 'empty'}`);
  if (!eligible) {
    return {
      id,
      eligible: false,
      evidenceCount: calibrated.length,
      minimumEvidence: PETROS_REFLECTION_THRESHOLDS.calibrationMinimumEvidence,
      direction: 'hidden',
      trend: 'insufficient_history',
      meanConfidenceBasisPoints: null,
      meanOutcomeBasisPoints: null,
      gapBasisPoints: null,
      uncertaintyBasisPoints: 10_000,
      headline: 'More predictions are needed',
      explanation: `This mirror stays hidden until there are at least ${PETROS_REFLECTION_THRESHOLDS.calibrationMinimumEvidence} confidence-and-outcome pairs. Nothing is inferred from a small sample.`,
      actionRecommendationId: null,
      quietUntil: null,
      status: 'hidden',
      evidence: calibrated
        .map((row) => evidenceLink(row, now, `calibration:${id}`))
        .slice(0, 24),
    };
  }
  const confidence = mean(calibrated.map((row) => confidenceValue(row.confidenceAfter!)));
  const outcome = mean(calibrated.map((row) => outcomeValue(row)));
  const gap = confidence - outcome;
  const direction = gap > 800 ? 'over' as const : gap < -800 ? 'under' as const : 'aligned' as const;
  const midpoint = Math.floor(calibrated.length / 2);
  const earlier = calibrated.slice(0, midpoint);
  const recent = calibrated.slice(midpoint);
  const enoughWindows =
    earlier.length >= PETROS_REFLECTION_THRESHOLDS.calibrationMinimumWindowEvidence &&
    recent.length >= PETROS_REFLECTION_THRESHOLDS.calibrationMinimumWindowEvidence;
  const earlierGap = enoughWindows ? absoluteCalibrationGap(earlier) : 0;
  const recentGap = enoughWindows ? absoluteCalibrationGap(recent) : 0;
  const trend = !enoughWindows
    ? 'insufficient_history' as const
    : recentGap <= earlierGap - 400
      ? 'narrowing' as const
      : recentGap >= earlierGap + 400
        ? 'widening' as const
        : 'steady' as const;
  const headline = trend === 'narrowing'
    ? 'The gap is narrowing'
    : direction === 'aligned'
      ? 'Your predictions and outcomes are close'
      : 'Confidence is a skill you can tune';
  const directionText = direction === 'over'
    ? 'Recent confidence has tended to run ahead of outcomes.'
    : direction === 'under'
      ? 'Recent outcomes have tended to be stronger than your predictions.'
      : 'Recent confidence and outcomes have been broadly aligned.';
  const trendText = trend === 'narrowing'
    ? 'The recent gap is smaller than the earlier gap.'
    : trend === 'widening'
      ? 'The recent sample is less aligned, so use this as a prompt to pause and predict carefully—not as a trait.'
      : trend === 'steady'
        ? 'The gap is broadly steady across the two available windows.'
        : 'There is enough total evidence to show a direction, but not enough in both windows for a trend.';
  return {
    id,
    eligible: true,
    evidenceCount: calibrated.length,
    minimumEvidence: PETROS_REFLECTION_THRESHOLDS.calibrationMinimumEvidence,
    direction,
    trend,
    meanConfidenceBasisPoints: confidence,
    meanOutcomeBasisPoints: outcome,
    gapBasisPoints: gap,
    uncertaintyBasisPoints: Math.max(1_000, 10_000 - Math.min(9_000, calibrated.length * 600)),
    headline,
    explanation: `${directionText} ${trendText}`,
    actionRecommendationId,
    quietUntil: null,
    status: 'active',
    evidence: calibrated
      .slice(-24)
      .map((row) => evidenceLink(row, now, `calibration:${id}`)),
  };
}

export function deriveGapCandidates(input: {
  topics: ReflectionCurriculumTopic[];
  evidence: ReflectionEvidence[];
  recommendations: PetrosReflectionRecommendation[];
  now: Date;
}): PetrosGapAlarm[] {
  const recent = input.evidence.filter(
    (row) =>
      input.now.getTime() - row.occurredAt.getTime() <= 60 * DAY_MS &&
      ['wrong', 'partial'].includes(row.outcome) &&
      ['concept_gap', 'prerequisite_gap'].includes(row.errorCategory),
  );
  const byPrerequisite = new Map<string, ReflectionEvidence[]>();
  for (const row of recent) {
    for (const prerequisite of unique(row.prerequisiteConceptIds)) {
      byPrerequisite.set(prerequisite, [...(byPrerequisite.get(prerequisite) ?? []), row]);
    }
  }
  const topicById = new Map(input.topics.map((topic) => [topic.topicId, topic]));
  const topicByConcept = new Map(input.topics.map((topic) => [topic.conceptId, topic]));
  const alarms: PetrosGapAlarm[] = [];
  for (const [prerequisite, rows] of byPrerequisite.entries()) {
      const independent = [...new Map(rows.map((row) => [row.sourceEventId, row])).values()];
      const affected = unique(independent.map((row) => row.topicId));
      if (
        independent.length < PETROS_REFLECTION_THRESHOLDS.gapMinimumIndependentEvidence ||
        affected.length < PETROS_REFLECTION_THRESHOLDS.gapMinimumAffectedTopics
      ) continue;
      const confidence = Math.min(
        9_000,
        3_000 + Math.min(3_500, independent.length * 1_000) + Math.min(2_000, affected.length * 500),
      );
      if (confidence < PETROS_REFLECTION_THRESHOLDS.gapMinimumConfidenceBasisPoints) continue;
      const prerequisiteTopic = topicByConcept.get(prerequisite);
      const label = prerequisiteTopic?.title ?? humanize(prerequisite);
      const affectedTopics = affected.map((topicId) => ({
        topicId,
        label: topicById.get(topicId)?.title ?? humanize(topicId),
      }));
      const fingerprint = digest({ prerequisite, affected: affected.sort() });
      const id = stableUuid(`gap:${fingerprint}`);
      const content: PetrosGapAlarmContent = {
        schemaVersion: PETROS_REFLECTION_GAP_VERSION,
        prerequisiteConceptId: prerequisite,
        prerequisiteLabel: label,
        affectedTopics,
        independentEvidenceCount: independent.length,
        confidenceBasisPoints: confidence,
        hypothesis: `${label} may be the shared prerequisite behind these recent difficulties.`,
        explanation: `${independent.length} independent pieces of recent evidence across ${affected.length} topics point to the same prerequisite. This is a hypothesis, not a fact.`,
        practicalMinutes: Math.min(90, 8 + affected.length * 4),
        uncertaintyLabel: 'Prerequisite hypothesis',
      };
      const recommendationId =
        input.recommendations.find((row) => row.conceptId === prerequisite)?.id ?? null;
      alarms.push({
        id,
        fingerprint,
        content,
        evidence: independent
          .slice(0, 36)
          .map((row) => evidenceLink(row, input.now, `alarm:${id}`)),
        recommendationId,
        status: 'active' as const,
        snoozedUntil: null,
        generation: {
          source: 'deterministic' as const,
          functionKey: PETROS_REFLECTION_FUNCTIONS.gapExplanation,
          validationPassed: true,
        },
      });
  }
  return alarms.sort((left, right) =>
      right.content.confidenceBasisPoints - left.content.confidenceBasisPoints,
    )
    .slice(0, 12);
}

export function deriveSessionRecap(session: ReflectionSessionEvidence): PetrosSessionRecap {
  const evidence: PetrosReflectionEvidenceLink[] = [
    ...session.moves.map((move) => ({
      id: stableUuid(`decision:${move.id}`),
      sourceType: 'planning_decision' as const,
      sourceId: move.id,
      label: `${humanize(move.type)} — ${move.reason}`.slice(0, 600),
      observedAt: move.createdAt.toISOString(),
      ageDays: Math.max(0, Math.floor((session.closedAt.getTime() - move.createdAt.getTime()) / DAY_MS)),
    })),
    ...session.observations.map((observation) => ({
      id: stableUuid(`observation:${observation.id}`),
      sourceType: 'session_observation' as const,
      sourceId: observation.id,
      label: observationLabel(observation),
      observedAt: observation.occurredAt.toISOString(),
      ageDays: Math.max(0, Math.floor((session.closedAt.getTime() - observation.occurredAt.getTime()) / DAY_MS)),
    })),
  ].slice(0, 24);
  const facts: PetrosSessionRecapContent['observedFacts'] = [];
  const diagram = session.moves.find((move) => move.type === 'diagram');
  if (diagram) {
    facts.push({
      text: 'A diagram was used during this session.',
      evidenceLinkIds: [stableUuid(`decision:${diagram.id}`)],
    });
  }
  const notation = session.observations.find((row) => row.errorClass === 'notation');
  if (notation) {
    facts.push({
      text: 'Notation caused a delay in one checked response; this does not by itself show a concept gap.',
      evidenceLinkIds: [stableUuid(`observation:${notation.id}`)],
    });
  }
  const recovery = session.observations.find((row) => row.recovery);
  if (recovery) {
    facts.push({
      text: 'You recovered after revising an earlier attempt.',
      evidenceLinkIds: [stableUuid(`observation:${recovery.id}`)],
    });
  }
  const hint = session.observations.find((row) => row.type === 'hint_requested');
  if (hint) {
    facts.push({
      text: 'You used a hint and continued the attempt.',
      evidenceLinkIds: [stableUuid(`observation:${hint.id}`)],
    });
  }
  if (!facts.length) {
    const first = evidence[0] ?? {
      id: stableUuid(`session:${session.sessionId}`),
      sourceType: 'planning_decision' as const,
      sourceId: session.sessionId,
      label: 'Session completed with bounded process evidence.',
      observedAt: session.closedAt.toISOString(),
      ageDays: 0,
    };
    if (!evidence.length) evidence.push(first);
    facts.push({
      text: `You completed a finite ${session.topic} session with ${session.moves.length} teaching moves.`,
      evidenceLinkIds: [first.id],
    });
  }
  const inference: PetrosSessionRecapContent['tentativeInferences'] = [];
  const correctAfterDiagram = diagram && session.observations.find(
    (row) => row.occurredAt >= diagram.createdAt && row.correctness === 'correct',
  );
  if (diagram && correctAfterDiagram) {
    inference.push({
      text: 'In this session, the diagram may have helped make the next successful check easier to approach.',
      label: 'Tentative',
      evidenceLinkIds: [
        stableUuid(`decision:${diagram.id}`),
        stableUuid(`observation:${correctAfterDiagram.id}`),
      ],
    });
  }
  const content: PetrosSessionRecapContent = {
    schemaVersion: PETROS_REFLECTION_RECAP_VERSION,
    sessionId: session.sessionId,
    headline: recovery
      ? 'You changed strategy and recovered'
      : notation
        ? 'The notation, not necessarily the idea, slowed this session'
        : 'What happened in this session',
    observedFacts: facts.slice(0, 6),
    tentativeInferences: inference,
    nextTry: notation
      ? 'Try one short notation check before the next related problem.'
      : diagram
        ? 'Try beginning the next related problem with a small sketch, then check whether it helps again.'
        : 'Use the first quick attempt as evidence, then choose the smallest useful next move.',
    durablePreferenceClaimed: false,
    abilityLabelUsed: false,
  };
  return {
    id: stableUuid(`recap:${session.sessionId}:${PETROS_REFLECTION_ALGORITHM_VERSION}`),
    sessionId: session.sessionId,
    topic: session.topic,
    closedAt: session.closedAt.toISOString(),
    content,
    evidence,
    status: 'active',
    correctedText: null,
    generation: {
      source: 'deterministic',
      functionKey: PETROS_REFLECTION_FUNCTIONS.recap,
      validationPassed: true,
    },
  };
}

function recommendationFor(
  topic: PetrosKnowledgeMapTopic,
  source: ReflectionCurriculumTopic,
  states: Map<string, PetrosKnowledgeMapTopic>,
  mastery: Map<string, ReflectionMastery>,
  now: Date,
): PetrosReflectionRecommendation | null {
  if (topic.state === 'solid' && topic.freshness === 'fresh' && !source.learnerGoal) return null;
  const reasons: PetrosReflectionRecommendation['reasons'] = [];
  const blockedDependents = topic.dependentConceptIds.filter((id) => {
    const state = states.get(id)?.state;
    return state === 'shaky' || state === 'insufficient_evidence';
  });
  if (blockedDependents.length) {
    reasons.push({
      code: 'prerequisite_gap',
      label: `This is a prerequisite for ${blockedDependents.length} affected topic${blockedDependents.length === 1 ? '' : 's'}.`,
      points: 5_000,
      evidenceLinkIds: topic.evidence.map((row) => row.id).slice(0, 12),
    });
  }
  if (topic.state === 'shaky') {
    reasons.push({ code: 'fragile_knowledge', label: 'Current evidence is fragile or old.', points: 3_500, evidenceLinkIds: topic.evidence.map((row) => row.id).slice(0, 12) });
  } else if (topic.state === 'insufficient_evidence') {
    reasons.push({ code: 'fragile_knowledge', label: 'There is not yet enough evidence for a mastery claim.', points: 1_800, evidenceLinkIds: topic.evidence.map((row) => row.id).slice(0, 12) });
  } else if (topic.state === 'untouched') {
    reasons.push({ code: 'first_attempt', label: 'This syllabus topic has not been attempted yet.', points: 900, evidenceLinkIds: [] });
  }
  if (source.examDate) {
    const days = Math.ceil((source.examDate.getTime() - now.getTime()) / DAY_MS);
    if (days >= 0 && days <= 60) reasons.push({ code: 'exam_proximity', label: `A published exam is ${days} day${days === 1 ? '' : 's'} away.`, points: Math.max(600, 3_000 - days * 40), evidenceLinkIds: [] });
  }
  const nextReview = mastery.get(topic.conceptId)?.nextReviewAt;
  if (nextReview && nextReview <= now) reasons.push({ code: 'review_due', label: 'The evidence-based review date has arrived.', points: 2_500, evidenceLinkIds: topic.evidence.map((row) => row.id).slice(0, 12) });
  if (source.learnerGoal) reasons.push({ code: 'learner_goal', label: 'This topic is part of your current learning goal.', points: 1_600, evidenceLinkIds: [] });
  if (!reasons.length) return null;
  const score = reasons.reduce((sum, row) => sum + row.points, 0);
  const id = stableUuid(`recommendation:${topic.conceptId}:${reasons.map((row) => row.code).join(':')}`);
  const sessionType = reasons.some((row) => row.code === 'prerequisite_gap' || row.code === 'fragile_knowledge')
    ? 'repair' as const
    : reasons.some((row) => row.code === 'exam_proximity')
      ? 'revise' as const
      : 'learn' as const;
  return {
    id,
    conceptId: topic.conceptId,
    topicId: topic.topicId,
    title: topic.title,
    actionLabel: sessionType === 'repair' ? `Repair ${topic.title}` : sessionType === 'revise' ? `Review ${topic.title}` : `Learn ${topic.title}`,
    sessionType,
    score,
    reasons,
    whyThis: reasons.map((row) => row.label).join(' '),
    evidenceAgeDays: topic.evidenceAgeDays,
    status: 'active',
  };
}

function knowledgeState(input: {
  evidenceCount: number;
  masteryBasisPoints: number | null;
  uncertaintyBasisPoints: number;
  evidenceAgeDays: number | null;
}): PetrosKnowledgeMapTopic['state'] {
  if (input.evidenceCount === 0) return 'untouched';
  if (input.evidenceCount < PETROS_REFLECTION_THRESHOLDS.mapMinimumEvidence) return 'insufficient_evidence';
  if (
    (input.masteryBasisPoints ?? 0) >= PETROS_REFLECTION_THRESHOLDS.solidMasteryBasisPoints &&
    input.uncertaintyBasisPoints <= PETROS_REFLECTION_THRESHOLDS.maximumSolidUncertaintyBasisPoints &&
    (input.evidenceAgeDays ?? Number.POSITIVE_INFINITY) <= PETROS_REFLECTION_THRESHOLDS.staleDays
  ) return 'solid';
  return 'shaky';
}

function explainState(
  state: PetrosKnowledgeMapTopic['state'],
  count: number,
  age: number | null,
) {
  if (state === 'untouched') return 'Not attempted: there is no learner evidence for this topic yet.';
  if (state === 'insufficient_evidence') return `${count} evidence item${count === 1 ? '' : 's'} is not enough to say mastered or not mastered.`;
  if (state === 'solid') return `At least ${PETROS_REFLECTION_THRESHOLDS.mapMinimumEvidence} consistent evidence items meet the solid threshold${age == null ? '' : `; latest evidence is ${age} days old`}.`;
  return `There is enough evidence to review this topic, but mastery, uncertainty, or freshness does not meet the solid threshold${age == null ? '' : `; latest evidence is ${age} days old`}.`;
}

function evidenceLink(
  row: ReflectionEvidence,
  now: Date,
  entitySeed: string,
): PetrosReflectionEvidenceLink {
  return {
    id: stableUuid(`${entitySeed}:evidence:${row.id}`),
    sourceType: 'learner_evidence',
    sourceId: row.id,
    label: `${humanize(row.outcome)} ${humanize(row.errorCategory)} evidence for ${humanize(row.conceptId)}`.slice(0, 600),
    observedAt: row.occurredAt.toISOString(),
    ageDays: Math.max(0, Math.floor((now.getTime() - row.occurredAt.getTime()) / DAY_MS)),
  };
}

function absoluteCalibrationGap(rows: ReflectionEvidence[]) {
  return Math.abs(
    mean(rows.map((row) => confidenceValue(row.confidenceAfter!))) -
      mean(rows.map(outcomeValue)),
  );
}

function confidenceValue(value: NonNullable<ReflectionEvidence['confidenceAfter']>) {
  return value === 'sure' ? 9_000 : value === 'think_so' ? 6_500 : 3_500;
}

function outcomeValue(row: ReflectionEvidence) {
  return row.outcome === 'correct' ? Math.max(8_000, row.creditBasisPoints) : row.outcome === 'partial' ? Math.min(7_500, Math.max(3_000, row.creditBasisPoints)) : Math.min(2_000, row.creditBasisPoints);
}

function observationLabel(observation: ReflectionSessionEvidence['observations'][number]) {
  if (observation.recovery) return 'A later attempt recovered after difficulty.';
  if (observation.errorClass === 'notation') return 'A checked response recorded a notation error.';
  if (observation.type === 'hint_requested') return 'A hint was requested.';
  return `${humanize(observation.type)}${observation.correctness ? ` — ${humanize(observation.correctness)}` : ''}`;
}

function stableUuid(value: string) {
  const hex = createHash('sha256').update(value).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export function digest(value: unknown) {
  return createHash('sha256').update(stableJson(value)).digest('hex');
}

function stableJson(value: unknown): string {
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, nested]) => `${JSON.stringify(key)}:${stableJson(nested)}`).join(',')}}`;
  return JSON.stringify(value);
}

function groupBy<T>(values: T[], key: (value: T) => string) {
  const result = new Map<string, T[]>();
  for (const value of values) result.set(key(value), [...(result.get(key(value)) ?? []), value]);
  return result;
}

function unique<T>(values: T[]) {
  return [...new Set(values)];
}

function mean(values: number[]) {
  return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : 0;
}

/**
 * True when a concept key names something a student would recognise. Evidence keys such as
 * `checkpoint:2:mathematics:contrast_case` or `assignment:<uuid>` do not, and the repository
 * gives those a generic title; they should not be offered as study targets.
 */
function isNameableConcept(conceptId: string) {
  // `assignment:<uuid>` and friends.
  if (conceptId.includes(':')) return false;
  // Teaching-move keys the loop writes per checkpoint, e.g.
  // "checkpoint-2-mathematics-recall-check-key-idea".
  if (/^checkpoint-\d/i.test(conceptId)) return false;
  return !/^[0-9a-f-]{36}$/i.test(conceptId);
}

function humanize(value: string) {
  return value.replace(/[_:-]+/g, ' ').replace(/\s+/g, ' ').trim();
}
