import { describe, expect, it } from 'vitest';
import {
  qualitativeCandidateFixture,
  qualitativeReviewAuthorityFixture,
} from './__fixtures__/petros-objective-evidence';
import {
  petrosQualitativeReviewCommandSchema,
  resolvePetrosQualitativeReview,
} from './petros-qualitative-review';

describe('qualitative educator review boundary', () => {
  it('resolves an exact current qualified receipt without numeric admission', () => {
    expect(resolvePetrosQualitativeReview(
      qualitativeCandidateFixture(), qualitativeReviewAuthorityFixture,
    )).toEqual({ schemaVersion: 'petros.qualitative-review.v1',
      result: { status: 'valid_approval', reviewId: '20000000-0000-4000-8000-00000000000a' },
      evidenceAdmission: 'not_granted', numericProjection: false });
  });

  it('fails closed when the saved revision or qualification changes', () => {
    const staleWork = structuredClone(qualitativeReviewAuthorityFixture) as any;
    staleWork.currentWork = { ...staleWork.currentWork, contentHash: '9'.repeat(64) };
    expect(resolvePetrosQualitativeReview(qualitativeCandidateFixture(), staleWork).result)
      .toEqual({ status: 'unavailable', reason: 'stale_work' });
    const staleAuthority = structuredClone(qualitativeReviewAuthorityFixture) as any;
    staleAuthority.resolvedReview.currentReviewer.snapshot = {
      ...staleAuthority.resolvedReview.currentReviewer.snapshot, qualificationVersion: 2,
    };
    expect(resolvePetrosQualitativeReview(qualitativeCandidateFixture(), staleAuthority).result)
      .toEqual({ status: 'unavailable', reason: 'reviewer_authority_denied' });
  });

  it('rejects numeric mastery and server-owned binding fields in educator commands', () => {
    const command = { schemaVersion: 'petros.qualitative-review.v1',
      commandId: '20000000-0000-4000-8000-000000000003',
      submissionId: '20000000-0000-4000-8000-000000000008',
      qualificationId: '10000000-0000-4000-8000-00000000000b',
      expectedQualificationVersion: 1, decision: 'approved', reason: 'Reviewed exact revision.',
      productFeedback: [{ criterionId: 'boundary', observation: { status: 'not_observed' },
        feedback: 'The boundary is not stated yet.', uncertainty: 'low' }] };
    expect(petrosQualitativeReviewCommandSchema.safeParse(command).success).toBe(true);
    expect(petrosQualitativeReviewCommandSchema.safeParse({ ...command,
      masteryScore: 80, contentHash: 'a'.repeat(64), reviewerAuthority: {} }).success).toBe(false);
  });
});
