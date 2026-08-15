import {
  PETROS_LEARNER_EVIDENCE_SCHEMA_VERSION,
  PETROS_LEARNER_MODEL_ALGORITHM_VERSION,
  petrosNormalizedLearningEvidenceSchema,
  type PetrosNormalizedLearningEvidence,
} from '@edrion/schemas';

interface SourceAnswer {
  id: string;
  parentAttemptId: string;
  conceptId: string;
  topicId: string;
  correct?: boolean | null;
  awardedMarks?: number | null;
  maxMarks?: number | null;
  responseTimeMs?: number | null;
  occurredAt: string;
  errorCategory?: PetrosNormalizedLearningEvidence['errorCategory'];
  evaluatorVersion?: string | null;
  sourceVersion?: string | number | null;
}

interface LibraryQuizAnswer extends SourceAnswer {
  hintCount?: number;
  difficulty?: number;
}

/** Adapters keep feature storage out of the learner model while preserving exact source linkage. */
export function normalizeLibraryQuizAnswer(input: LibraryQuizAnswer) {
  return normalize('library_quiz', input, {
    evidenceKind: 'recall',
    hintCount: input.hintCount ?? 0,
    metadata: { difficulty: input.difficulty ?? null },
  });
}

export function normalizeMockExamAnswer(input: SourceAnswer) {
  return normalize('mock_exam', input, { evidenceKind: 'application' });
}

export function normalizeExamAnswer(input: SourceAnswer) {
  return normalize('exam', input, { evidenceKind: 'application' });
}

export function normalizeAssignmentAnswer(input: SourceAnswer) {
  return normalize('assignment', input, { evidenceKind: 'application' });
}

export function normalizeHomeworkAnswer(input: SourceAnswer) {
  return normalize('homework', input, { evidenceKind: 'application' });
}

function normalize(
  source: PetrosNormalizedLearningEvidence['source'],
  input: SourceAnswer,
  options: {
    evidenceKind: PetrosNormalizedLearningEvidence['evidenceKind'];
    hintCount?: number;
    metadata?: Record<string, unknown>;
  },
) {
  const credit = creditBasisPoints(input);
  return petrosNormalizedLearningEvidenceSchema.parse({
    schemaVersion: PETROS_LEARNER_EVIDENCE_SCHEMA_VERSION,
    source,
    sourceEventId: input.id,
    sourceRecordId: input.parentAttemptId,
    conceptId: input.conceptId,
    topicId: input.topicId,
    prerequisiteConceptIds: [],
    evidenceKind: options.evidenceKind,
    outcome: credit === 10_000 ? 'correct' : credit === 0 ? 'wrong' : 'partial',
    creditBasisPoints: credit,
    moveType: null,
    profileDimension: null,
    preEvidenceBasisPoints: null,
    postEvidenceBasisPoints: credit,
    responseTimeMs: input.responseTimeMs ?? null,
    hintCount: options.hintCount ?? 0,
    confidenceBefore: null,
    confidenceAfter: null,
    errorCategory: input.errorCategory ?? (credit === 10_000 ? 'none' : 'unclassified'),
    errorConfidenceBasisPoints: input.errorCategory ? 8_000 : 0,
    evaluatorVersion: input.evaluatorVersion ?? null,
    algorithmVersion: PETROS_LEARNER_MODEL_ALGORITHM_VERSION,
    environment: 'production',
    synthetic: false,
    occurredAt: input.occurredAt,
    metadata: {
      sourceVersion: input.sourceVersion ?? null,
      ...options.metadata,
    },
  });
}

function creditBasisPoints(input: SourceAnswer) {
  if (input.awardedMarks != null && input.maxMarks != null && input.maxMarks > 0)
    return Math.max(
      0,
      Math.min(10_000, Math.round((input.awardedMarks / input.maxMarks) * 10_000)),
    );
  return input.correct === true ? 10_000 : 0;
}
