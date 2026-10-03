import { PETROS_TEACHING_PACK_COMPILER_VERSION } from '../petros-concept-pack';

export const phase2PackIds = {
  institution: '10000000-0000-4000-8000-000000000001',
  course: '10000000-0000-4000-8000-000000000002',
  candidate: '10000000-0000-4000-8000-000000000003',
  pack: '10000000-0000-4000-8000-000000000004',
  objective: '10000000-0000-4000-8000-000000000005',
  object: '10000000-0000-4000-8000-000000000006',
  unit: '10000000-0000-4000-8000-000000000007',
  receipt: '10000000-0000-4000-8000-000000000008',
  reviewerUser: '10000000-0000-4000-8000-000000000009',
  reviewerStaff: '10000000-0000-4000-8000-00000000000a',
  qualification: '10000000-0000-4000-8000-00000000000b',
} as const;

export const phase2PackLocator = {
  schemaVersion: 'petros.document-source.v1',
  kind: 'pdf_page_text',
  sourceVersion: 'a'.repeat(64),
  objectId: phase2PackIds.object,
  unitId: phase2PackIds.unit,
  page: 1,
  textSha256: 'b'.repeat(64),
  start: 0,
  end: 32,
  offsetEncoding: 'utf16',
} as const;

const anchor = (purpose: 'definition' | 'claim' | 'example' | 'misconception' | 'assessment') => ({
  locator: phase2PackLocator,
  purpose,
  support: 'explicit' as const,
});

export const phase2PackCandidate = {
  schemaVersion: 'petros.concept-pack.v1',
  pack: { id: phase2PackIds.pack, version: 1 },
  compilerVersion: PETROS_TEACHING_PACK_COMPILER_VERSION,
  subject: '10000000-0000-4000-8000-00000000000c',
  sourceVersion: phase2PackLocator.sourceVersion,
  curriculumRevision: 1,
  objective: { id: phase2PackIds.objective, version: 1 },
  objectiveStatement: 'Explain the reviewed relationship and apply it to an unseen case.',
  scope: 'Only the claims and boundaries supported by the pinned source.',
  claims: [{ id: 'central-claim', statement: 'The pinned source states the central relationship.',
    anchors: [anchor('claim')] }],
  concepts: [{ id: 'central-concept', label: 'Central concept',
    definition: 'A source-supported definition.', anchors: [anchor('definition')] }],
  prerequisites: [],
  coreExplanation: 'Use the pinned claim, then check the stated boundary before applying it.',
  examples: [
    { id: 'worked', kind: 'worked_example', prompt: 'Apply the relationship.',
      explanation: 'The relationship applies because the boundary is satisfied.', anchors: [anchor('example')] },
    { id: 'counter', kind: 'counterexample', prompt: 'Identify the boundary violation.',
      explanation: 'The relationship does not apply outside the stated boundary.', anchors: [anchor('example')] },
  ],
  misconceptions: [{ id: 'overgeneralization', claim: 'The relationship always applies.',
    discriminator: 'Check the stated boundary.', correction: 'Apply it only inside the reviewed scope.',
    anchors: [anchor('misconception')] }],
  rubric: { id: 'reviewed-rubric', version: '1', criteria: [{ id: 'boundary',
    descriptor: 'Uses the relationship within its boundary.', evidenceRequired: 'A correct application and boundary check.' }] },
  assessments: [
    { id: 'practice', variant: 'a', prompt: 'Name the boundary.', unseenContext: false,
      criteria: ['boundary'], evaluator: { kind: 'exact_text', answerKey: 'reviewed boundary',
        aliases: ['the reviewed boundary'], caseSensitive: false }, anchors: [anchor('assessment')] },
    { id: 'transfer', variant: 'b', prompt: 'Calculate the reviewed quantity.', unseenContext: true,
      criteria: ['boundary'], evaluator: { kind: 'numeric_tolerance', value: 12, tolerance: 0.1,
        acceptedUnits: ['m'], requireUnits: true }, anchors: [anchor('assessment')] },
  ],
  transferTaskId: 'transfer',
  visualIntent: { representation: 'reviewed_relationship', requiredCapability: 'generic.parameter-control@1',
    meaningfulManipulations: ['independent_parameter'] },
  validation: { status: 'candidate', structuralValidator: 'petros.concept-pack.v1', unresolvedIssues: [],
    educatorReviewRequired: true, approvedReviewId: null },
} as const;

export const phase2PackTrustedContext = {
  currentSourceVersion: phase2PackLocator.sourceVersion,
  currentCurriculumRevision: 1,
  currentObjective: { id: phase2PackIds.objective, version: 1 },
  resolvedAnchors: [{ locator: phase2PackLocator, text: 'x'.repeat(32) }],
} as const;

export const phase2ReviewerAuthority = {
  schemaVersion: 'petros.reviewer-authority.v1',
  qualificationId: phase2PackIds.qualification,
  qualificationVersion: 1,
  institutionId: phase2PackIds.institution,
  reviewerUserId: phase2PackIds.reviewerUser,
  reviewerStaffId: phase2PackIds.reviewerStaff,
  subjectKey: phase2PackCandidate.subject,
  status: 'active',
  validFrom: '2026-01-01T00:00:00.000Z',
  validUntil: '2027-01-01T00:00:00.000Z',
  evidenceKind: 'institution_record',
  evidenceHash: 'c'.repeat(64),
  observedAt: '2026-09-24T00:00:00.000Z',
} as const;

export const phase2PackReviewReceipt = {
  schemaVersion: 'petros.concept-pack-review.v1',
  receiptId: phase2PackIds.receipt,
  reviewVersion: 1,
  institutionId: phase2PackIds.institution,
  courseId: phase2PackIds.course,
  candidateId: phase2PackIds.candidate,
  payloadHash: 'd'.repeat(64),
  reviewedAt: '2026-09-24T00:00:00.000Z',
  decision: 'approved',
  reviewer: { educatorId: phase2PackIds.reviewerUser, authorityVersion: 1,
    qualification: { id: phase2PackIds.qualification, version: 1, subject: phase2PackCandidate.subject },
    authoritySnapshot: phase2ReviewerAuthority },
  reviewedCandidate: phase2PackCandidate,
  coverage: { sourceFidelity: 'reviewed', scientificCorrectness: 'reviewed',
    prerequisitesAndMisconceptions: 'reviewed', examplesAndExplanations: 'reviewed',
    rubricAndUnseenTransfer: 'reviewed' },
  rationale: 'The candidate is source faithful, bounded, correct, and suitable for the stated objective.',
} as const;

export const phase2PackReviewAuthority = {
  institutionId: phase2PackIds.institution,
  observedAt: phase2ReviewerAuthority.observedAt,
  currentPack: phase2PackCandidate.pack,
  currentCompilerVersion: PETROS_TEACHING_PACK_COMPILER_VERSION,
  packContext: phase2PackTrustedContext,
  access: { source: true, curriculum: true, pack: true, review: true },
  currentReview: { status: 'approved', latestReceipt: { id: phase2PackIds.receipt, version: 1 },
    receipt: phase2PackReviewReceipt, revokedAt: null },
  currentReviewer: { snapshot: phase2ReviewerAuthority, membership: 'active', mayReviewPack: true },
} as const;
