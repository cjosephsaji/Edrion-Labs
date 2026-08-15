import {
  PETROS_CONFIDENCE_VALUES,
  PETROS_ERROR_CATEGORIES,
  type PetrosNormalizedLearningEvidence,
} from '@edrion/schemas';

export type EvidenceRow = PetrosNormalizedLearningEvidence & { id: string };

export interface DerivedLearnerModel {
  mastery: Array<{
    conceptId: string;
    topicId: string;
    prerequisiteConceptIds: string[];
    masteryBasisPoints: number;
    recallBasisPoints: number;
    applicationBasisPoints: number;
    confidenceBasisPoints: number;
    uncertaintyBasisPoints: number;
    evidenceCount: number;
    evidenceSources: Record<string, number>;
    lastTouchedAt: Date;
    decayAnchorAt: Date;
    nextReviewAt: Date;
    lastUpdateEventId: string;
  }>;
  moveOutcomes: Array<{
    moveType: string;
    topicId: string;
    profileDimension: string;
    successes: number;
    failures: number;
    skips: number;
    sampleSize: number;
    meanPreBasisPoints: number;
    meanPostBasisPoints: number;
    meanResponseTimeMs: number;
    hintUses: number;
    confidenceChangeBasisPoints: number;
    effectivenessBasisPoints: number;
    confidenceBasisPoints: number;
    uncertaintyBasisPoints: number;
    recencyWeightBasisPoints: number;
    lastEvidenceAt: Date;
  }>;
  preference: {
    pace: 'neutral' | 'deliberate' | 'balanced' | 'fast';
    depth: 'neutral' | 'concise' | 'balanced' | 'deep';
    skipCount: number;
    expandCount: number;
    readCount: number;
    responseCount: number;
    meanResponseTimeMs: number;
    evidenceCount: number;
    confidenceBasisPoints: number;
    minimumEvidenceMet: boolean;
  };
  errors: Array<{
    category: string;
    topicId: string;
    count: number;
    contexts: string[];
    confidenceBasisPoints: number;
    evidenceEventIds: string[];
    lastEvidenceAt: Date;
    evaluatorVersion: string | null;
  }>;
  calibration: {
    buckets: Array<{ confidence: string; outcome: 'correct' | 'partial' | 'wrong'; count: number }>;
    scoreBasisPoints: number;
    uncertaintyBasisPoints: number;
    evidenceCount: number;
  };
}

const MIN_PREFERENCE_EVIDENCE = 3;
const DAY_MS = 86_400_000;

/**
 * Stage 6 deterministic model.
 *
 * - All scores use integer basis points in [0, 10,000].
 * - Evidence has a 90-day half-life for estimates, while raw counts remain exact.
 * - Confidence grows slowly (eight comparable events for full confidence), preventing one event
 *   from creating a durable teaching preference.
 */
export function deriveLearnerModel(
  rawEvents: EvidenceRow[],
  now = new Date(),
): DerivedLearnerModel {
  const events = rawEvents
    .filter((event) => event.environment === 'production' && !event.synthetic)
    .sort(
      (a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt) || a.id.localeCompare(b.id),
    );
  return {
    mastery: deriveMastery(events, now),
    moveOutcomes: deriveMoves(events, now),
    preference: derivePreference(events),
    errors: deriveErrors(events),
    calibration: deriveCalibration(events),
  };
}

function deriveMastery(events: EvidenceRow[], now: Date): DerivedLearnerModel['mastery'] {
  const groups = groupBy(
    events.filter((event) => event.evidenceKind !== 'engagement'),
    (event) => event.conceptId,
  );
  return [...groups.values()].map((items) => {
    const latest = items.at(-1)!;
    const weighted = weightedAverage(items, (item) => item.creditBasisPoints, now);
    const recall = items.filter(
      (item) => item.evidenceKind === 'recall' || item.evidenceKind === 'prerequisite',
    );
    const application = items.filter(
      (item) => item.evidenceKind === 'application' || item.evidenceKind === 'procedure',
    );
    const confidence = sampleConfidence(items.length);
    const mastery = clamp(Math.round(5_000 + (weighted - 5_000) * (0.35 + confidence / 15_385)));
    const sources: Record<string, number> = {};
    for (const item of items) sources[item.source] = (sources[item.source] ?? 0) + 1;
    const lastTouched = new Date(latest.occurredAt);
    const reviewDays = Math.max(
      1,
      Math.min(30, Math.round(1 + (mastery / 10_000) * 14 * (confidence / 10_000))),
    );
    return {
      conceptId: latest.conceptId,
      topicId: latest.topicId,
      prerequisiteConceptIds: [
        ...new Set(items.flatMap((item) => item.prerequisiteConceptIds)),
      ].slice(0, 12),
      masteryBasisPoints: mastery,
      recallBasisPoints: recall.length
        ? weightedAverage(recall, (item) => item.creditBasisPoints, now)
        : 5_000,
      applicationBasisPoints: application.length
        ? weightedAverage(application, (item) => item.creditBasisPoints, now)
        : 5_000,
      confidenceBasisPoints: confidence,
      uncertaintyBasisPoints: 10_000 - confidence,
      evidenceCount: items.length,
      evidenceSources: sources,
      lastTouchedAt: lastTouched,
      decayAnchorAt: lastTouched,
      nextReviewAt: new Date(lastTouched.getTime() + reviewDays * DAY_MS),
      lastUpdateEventId: latest.id,
    };
  });
}

function deriveMoves(events: EvidenceRow[], now: Date): DerivedLearnerModel['moveOutcomes'] {
  const withMoves = events.filter((event) => event.moveType);
  const groups = groupBy(
    withMoves,
    (event) => `${event.moveType}|${event.topicId}|${event.profileDimension ?? '*'}`,
  );
  return [...groups.values()].map((items) => {
    const latest = items.at(-1)!;
    const pre = items.filter((item) => item.preEvidenceBasisPoints != null);
    const post = items.filter((item) => item.postEvidenceBasisPoints != null);
    const timed = items.filter((item) => item.responseTimeMs != null);
    const confidence = sampleConfidence(items.length);
    const effectivenessSamples = items.map((item) =>
      item.postEvidenceBasisPoints != null && item.preEvidenceBasisPoints != null
        ? item.postEvidenceBasisPoints - item.preEvidenceBasisPoints
        : item.creditBasisPoints - 5_000,
    );
    return {
      moveType: latest.moveType!,
      topicId: latest.topicId,
      profileDimension: latest.profileDimension ?? '*',
      successes: items.filter((item) => item.outcome === 'correct').length,
      failures: items.filter((item) => item.outcome === 'wrong' || item.outcome === 'invalid')
        .length,
      skips: items.filter((item) => item.outcome === 'skipped').length,
      sampleSize: items.length,
      meanPreBasisPoints: pre.length
        ? mean(pre.map((item) => item.preEvidenceBasisPoints!))
        : 5_000,
      meanPostBasisPoints: post.length
        ? mean(post.map((item) => item.postEvidenceBasisPoints!))
        : mean(items.map((item) => item.creditBasisPoints)),
      meanResponseTimeMs: timed.length ? mean(timed.map((item) => item.responseTimeMs!)) : 0,
      hintUses: items.reduce((sum, item) => sum + item.hintCount, 0),
      confidenceChangeBasisPoints: mean(
        items.map(
          (item) => confidenceValue(item.confidenceAfter) - confidenceValue(item.confidenceBefore),
        ),
      ),
      effectivenessBasisPoints: clampSigned(mean(effectivenessSamples), -10_000, 10_000),
      confidenceBasisPoints: confidence,
      uncertaintyBasisPoints: 10_000 - confidence,
      recencyWeightBasisPoints: Math.round(recencyWeight(latest.occurredAt, now) * 10_000),
      lastEvidenceAt: new Date(latest.occurredAt),
    };
  });
}

function derivePreference(events: EvidenceRow[]): DerivedLearnerModel['preference'] {
  const actions = events.filter((event) => event.evidenceKind === 'engagement');
  const skipCount = actions.filter((event) => event.metadata.action === 'skip').length;
  const expandCount = actions.filter((event) => event.metadata.action === 'expand').length;
  const readCount = actions.filter((event) => event.metadata.action === 'read').length;
  const responses = events.filter((event) => event.responseTimeMs != null);
  const evidenceCount = actions.length + responses.length;
  const minimumEvidenceMet = evidenceCount >= MIN_PREFERENCE_EVIDENCE;
  const responseTime = responses.length ? mean(responses.map((event) => event.responseTimeMs!)) : 0;
  return {
    pace: !minimumEvidenceMet
      ? 'neutral'
      : responseTime > 12_000
        ? 'deliberate'
        : responseTime < 4_000
          ? 'fast'
          : 'balanced',
    depth: !minimumEvidenceMet
      ? 'neutral'
      : expandCount >= Math.max(2, skipCount * 2)
        ? 'deep'
        : skipCount >= Math.max(2, expandCount * 2)
          ? 'concise'
          : 'balanced',
    skipCount,
    expandCount,
    readCount,
    responseCount: responses.length,
    meanResponseTimeMs: responseTime,
    evidenceCount,
    confidenceBasisPoints: minimumEvidenceMet ? sampleConfidence(evidenceCount) : 0,
    minimumEvidenceMet,
  };
}

function deriveErrors(events: EvidenceRow[]): DerivedLearnerModel['errors'] {
  const errors = events.filter(
    (event) =>
      !['none', 'unclassified'].includes(event.errorCategory) && event.outcome !== 'correct',
  );
  const groups = groupBy(errors, (event) => `${event.errorCategory}|${event.topicId}`);
  return [...groups.values()].map((items) => {
    const latest = items.at(-1)!;
    return {
      category: latest.errorCategory,
      topicId: latest.topicId,
      count: items.length,
      contexts: [...new Set(items.map((item) => item.profileDimension ?? item.evidenceKind))].slice(
        0,
        6,
      ),
      confidenceBasisPoints: Math.min(
        sampleConfidence(items.length),
        mean(items.map((item) => item.errorConfidenceBasisPoints)),
      ),
      evidenceEventIds: items.slice(-24).map((item) => item.id),
      lastEvidenceAt: new Date(latest.occurredAt),
      evaluatorVersion: latest.evaluatorVersion,
    };
  });
}

function deriveCalibration(events: EvidenceRow[]): DerivedLearnerModel['calibration'] {
  const outcomes = ['correct', 'partial', 'wrong'] as const;
  const buckets = PETROS_CONFIDENCE_VALUES.flatMap((confidence) =>
    outcomes.map((outcome) => ({
      confidence,
      outcome,
      count: events.filter(
        (event) =>
          event.confidenceAfter === confidence && normalizeOutcome(event.outcome) === outcome,
      ).length,
    })),
  );
  const calibrated = events.filter(
    (event) =>
      event.confidenceAfter &&
      ['correct', 'partial', 'wrong'].includes(normalizeOutcome(event.outcome)),
  );
  const error = calibrated.length
    ? mean(
        calibrated.map((event) =>
          Math.abs(confidenceValue(event.confidenceAfter) - outcomeValue(event.outcome)),
        ),
      )
    : 10_000;
  return {
    buckets,
    scoreBasisPoints: calibrated.length ? clamp(10_000 - error) : 5_000,
    uncertaintyBasisPoints: 10_000 - sampleConfidence(calibrated.length),
    evidenceCount: calibrated.length,
  };
}

function groupBy<T>(items: T[], key: (item: T) => string) {
  const groups = new Map<string, T[]>();
  for (const item of items) groups.set(key(item), [...(groups.get(key(item)) ?? []), item]);
  return groups;
}

function weightedAverage<T>(items: T[], value: (item: T) => number, now: Date) {
  let weighted = 0;
  let total = 0;
  for (const item of items) {
    const weight = recencyWeight((item as EvidenceRow).occurredAt, now);
    weighted += value(item) * weight;
    total += weight;
  }
  return clamp(Math.round(weighted / Math.max(total, 0.0001)));
}

function recencyWeight(occurredAt: string, now: Date) {
  const ageDays = Math.max(0, (now.getTime() - Date.parse(occurredAt)) / DAY_MS);
  return 0.5 ** (ageDays / 90);
}

function sampleConfidence(count: number) {
  return clamp(Math.round(Math.min(1, count / 8) * 10_000));
}

function mean(values: number[]) {
  return values.length
    ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)
    : 0;
}

function confidenceValue(value: string | null) {
  return value === 'sure'
    ? 9_000
    : value === 'think_so'
      ? 6_500
      : value === 'guessing'
        ? 3_500
        : 5_000;
}

function normalizeOutcome(outcome: string): 'correct' | 'partial' | 'wrong' {
  return outcome === 'correct' ? 'correct' : outcome === 'partial' ? 'partial' : 'wrong';
}

function outcomeValue(outcome: string) {
  return outcome === 'correct' ? 10_000 : outcome === 'partial' ? 5_000 : 0;
}

function clamp(value: number) {
  return Math.max(0, Math.min(10_000, value));
}

function clampSigned(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function errorRemedy(category: string) {
  const remedies: Record<string, string> = {
    concept_gap:
      'Rebuild the central relationship with a short layered explanation, then recheck it.',
    prerequisite_gap:
      'Check and repair the named prerequisite before returning to the current concept.',
    procedural_method: 'Use a worked example or contrast case focused on choosing the method.',
    arithmetic_slip:
      'Keep the concept route and add a compact calculation check instead of reteaching everything.',
    misreading: 'Mark the command and controlling clues before choosing a method.',
    time_pressure: 'Shorten the next action and separate recall from timed application.',
    notation:
      'Translate the notation explicitly, then repeat the same idea in the original symbols.',
    other: 'Use a targeted check and collect more evidence before selecting a durable remedy.',
  };
  return remedies[category] ?? 'Collect more evidence before changing the teaching route.';
}

export function mapLegacyErrorCategory(value: string) {
  const mapped: Record<string, (typeof PETROS_ERROR_CATEGORIES)[number]> = {
    none: 'none',
    concept_gap: 'concept_gap',
    procedure_gap: 'procedural_method',
    calculation_slip: 'arithmetic_slip',
    misread: 'misreading',
    incomplete: 'other',
    invalid_input: 'other',
    unknown: 'unclassified',
  };
  return mapped[value] ?? 'unclassified';
}
