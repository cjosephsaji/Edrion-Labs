import { assessmentEvidenceFixture } from './petros-assessment';
import {
  phase2PackCandidate,
  phase2PackIds,
  phase2PackLocator,
  phase2ReviewerAuthority,
} from './petros-phase2-pack';

export const evidenceIds = {
  student: '20000000-0000-4000-8000-000000000001',
  session: '20000000-0000-4000-8000-000000000002',
  command: '20000000-0000-4000-8000-000000000003',
  event: '20000000-0000-4000-8000-000000000004',
  artifact: '20000000-0000-4000-8000-000000000005',
  currentRevision: '20000000-0000-4000-8000-000000000006',
  previousRevision: '20000000-0000-4000-8000-000000000007',
  submission: '20000000-0000-4000-8000-000000000008',
  feedback: '20000000-0000-4000-8000-000000000009',
  review: '20000000-0000-4000-8000-00000000000a',
} as const;

export function objectiveEvidenceFixture() {
  const assessment = assessmentEvidenceFixture().assessment;
  const recordedAt = '2026-09-24T00:00:00.000Z';
  assessment.conditions.policyVersion = 'f'.repeat(64);
  assessment.conditions.petrosAssistance = [{
    value: { hintCount: 0, suppliedAnswer: false }, basis: 'system_observed',
    actor: { kind: 'system', id: 'petros-loop' }, method: 'canonical-interaction-state', recordedAt,
  }];
  assessment.conditions.attempt = [{
    value: 'first_observed', basis: 'system_observed', actor: { kind: 'system', id: 'petros-loop' },
    method: 'canonical-question-history', recordedAt,
  }];
  assessment.conditions.collectedAt = recordedAt;
  if (assessment.result.kind === 'objective') assessment.result.provenance.uncertainty = 'low';
  return {
    schemaVersion: 'petros.objective-evidence.v1',
    eventId: evidenceIds.event,
    occurredAt: recordedAt,
    owner: { institutionId: phase2PackIds.institution, studentId: evidenceIds.student },
    sessionId: evidenceIds.session,
    commandId: evidenceIds.command,
    objective: phase2PackCandidate.objective,
    subjectKey: phase2PackCandidate.subject,
    conceptIds: phase2PackCandidate.concepts.map((item) => item.id),
    task: { id: 'practice', variant: 'a', unseenContext: false },
    rubric: { id: phase2PackCandidate.rubric.id, version: phase2PackCandidate.rubric.version },
    pack: phase2PackCandidate.pack,
    sourceVersion: phase2PackCandidate.sourceVersion,
    policyVersion: 'f'.repeat(64),
    assignment: null,
    response: { modality: 'written', identityHash: '1'.repeat(64), contentHash: '2'.repeat(64),
      workId: null, revisionId: null },
    assessment,
  } as const;
}

const currentWork = { workId: evidenceIds.artifact, revisionId: evidenceIds.currentRevision,
  revision: 2, contentHash: '3'.repeat(64), textLength: 32 } as const;
const previousWork = { workId: evidenceIds.artifact, revisionId: evidenceIds.previousRevision,
  revision: 1, contentHash: '4'.repeat(64), textLength: 24 } as const;

export function qualitativeCandidateFixture(reviewId: string | null = evidenceIds.review) {
  return {
    schemaVersion: 'petros.qualitative-review.v1',
    exercise: 'source_grounded_explanation_revision',
    exerciseId: evidenceIds.submission,
    scope: { institutionId: phase2PackIds.institution, courseId: phase2PackIds.course,
      studentId: evidenceIds.student },
    objective: phase2PackCandidate.objective,
    pack: phase2PackCandidate.pack,
    sourceVersion: phase2PackCandidate.sourceVersion,
    sourceAnchors: [phase2PackLocator],
    policyVersion: 'f'.repeat(64),
    work: { stage: 'revision', current: currentWork, previous: previousWork },
    rubric: phase2PackCandidate.rubric,
    feedbackId: evidenceIds.feedback,
    productFeedback: [{ criterionId: 'boundary', observation: { status: 'observed', spans: [{
      workId: evidenceIds.artifact, revisionId: evidenceIds.currentRevision,
      contentHash: currentWork.contentHash, start: 0, end: 16, offsetEncoding: 'utf16',
    }] }, feedback: 'The revision states the boundary and applies it to the example.', uncertainty: 'low' }],
    processObservations: [{ id: '20000000-0000-4000-8000-00000000000b', kind: 'revision_submitted',
      basis: 'system_observed', actorId: evidenceIds.student, recordedAt: '2026-09-24T00:00:00.000Z',
      revisionId: evidenceIds.currentRevision, description: 'Exact saved revision submitted.' }],
    conditions: { schemaVersion: 'petros.assessment-conditions.v1', collectedAt: '2026-09-24T00:00:00.000Z',
      policyVersion: 'f'.repeat(64), supervision: [], timing: [], resources: [], modality: [],
      environment: [], petrosAssistance: [], answerExposure: [], externalAssistance: [], attempt: [],
      attestations: [] },
    reviewId,
  } as const;
}

export const qualitativeReviewReceiptFixture = {
  schemaVersion: 'petros.qualitative-review.v1', id: evidenceIds.review,
  commandId: evidenceIds.command, exerciseId: evidenceIds.submission,
  scope: qualitativeCandidateFixture().scope, objective: phase2PackCandidate.objective,
  pack: phase2PackCandidate.pack, sourceVersion: phase2PackCandidate.sourceVersion,
  policyVersion: 'f'.repeat(64), rubric: { id: phase2PackCandidate.rubric.id,
    version: phase2PackCandidate.rubric.version }, work: currentWork, previousWork,
  feedbackId: evidenceIds.feedback, reviewedCandidate: qualitativeCandidateFixture(null),
  reviewer: { institutionUserId: phase2PackIds.reviewerUser, role: 'qualified_educator',
    authoritySnapshot: phase2ReviewerAuthority },
  decision: 'approved', reason: 'The exact revision meets the narrative criteria.',
  reviewedAt: '2026-09-24T00:00:00.000Z',
} as const;

export const qualitativeReviewAuthorityFixture = {
  scope: qualitativeCandidateFixture().scope,
  exerciseId: evidenceIds.submission,
  currentWork,
  currentPreviousWork: previousWork,
  currentObjective: phase2PackCandidate.objective,
  currentPack: phase2PackCandidate.pack,
  currentSourceVersion: phase2PackCandidate.sourceVersion,
  resolvedSourceAnchors: [{ locator: phase2PackLocator, text: 'x'.repeat(32) }],
  currentRubric: { id: phase2PackCandidate.rubric.id, version: phase2PackCandidate.rubric.version },
  currentPolicyVersion: 'f'.repeat(64),
  currentFeedbackId: evidenceIds.feedback,
  sourceAvailable: true,
  currentEnrollmentActive: true,
  s9Permitted: true,
  resolvedReview: { receipt: qualitativeReviewReceiptFixture, active: true,
    currentReviewer: { snapshot: phase2ReviewerAuthority, active: true,
      canReviewThisCourseStudentObjective: true } },
} as const;
