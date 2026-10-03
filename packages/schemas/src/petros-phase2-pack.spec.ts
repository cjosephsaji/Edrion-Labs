import { describe, expect, it } from 'vitest';
import {
  phase2PackCandidate,
  phase2PackReviewAuthority,
  phase2PackTrustedContext,
} from './__fixtures__/petros-phase2-pack';
import { validatePetrosConceptPackCandidate } from './petros-concept-pack';
import { resolvePetrosConceptPackReviewApproval } from './petros-concept-pack-review';

describe('Phase 2 teaching-pack admission', () => {
  it('validates exact source anchors and reviewed deterministic evaluators', () => {
    const candidate = validatePetrosConceptPackCandidate(phase2PackCandidate, phase2PackTrustedContext);
    expect(candidate.assessments.map((task) => task.evaluator?.kind)).toEqual([
      'exact_text', 'numeric_tolerance',
    ]);
  });

  it('rejects an unresolved or changed source locator', () => {
    const changed = structuredClone(phase2PackCandidate) as any;
    changed.claims[0]!.anchors[0]!.locator.textSha256 = 'e'.repeat(64);
    expect(() => validatePetrosConceptPackCandidate(changed, phase2PackTrustedContext))
      .toThrow('PETROS_PACK_UNRESOLVED_SOURCE_ANCHOR');
  });

  it('rejects a cyclic hard prerequisite graph', () => {
    const changed = structuredClone(phase2PackCandidate) as any;
    changed.concepts.push({ ...changed.concepts[0], id: 'second' });
    changed.prerequisites = [
      { fromConceptId: 'central-concept', toConceptId: 'second', strength: 'hard',
        rationale: 'First edge.', anchors: changed.claims[0].anchors },
      { fromConceptId: 'second', toConceptId: 'central-concept', strength: 'hard',
        rationale: 'Second edge.', anchors: changed.claims[0].anchors },
    ];
    expect(() => validatePetrosConceptPackCandidate(changed, phase2PackTrustedContext))
      .toThrow('PETROS_PACK_HARD_PREREQUISITE_CYCLE');
  });

  it('resolves only the exact current qualified approval', () => {
    const result = resolvePetrosConceptPackReviewApproval(phase2PackCandidate, phase2PackReviewAuthority);
    expect(result.status).toBe('approved_at_owner_snapshot');
    expect(result.productionAdmission).toBe(false);
    expect(result.receipt.receiptId).toBe(phase2PackReviewAuthority.currentReview.latestReceipt.id);
  });

  it.each([
    ['revocation', { currentReview: { ...phase2PackReviewAuthority.currentReview,
      status: 'revoked' as const, revokedAt: '2026-09-24T00:00:01.000Z' } }, 'PETROS_PACK_REVIEW_REVOKED'],
    ['current reviewer permission', { currentReviewer: { ...phase2PackReviewAuthority.currentReviewer,
      mayReviewPack: false } }, 'PETROS_PACK_REVIEW_REVIEWER_AUTHORITY_DENIED'],
    ['qualification expiry', { observedAt: '2027-01-01T00:00:00.000Z' },
      'PETROS_PACK_REVIEW_QUALIFICATION_TIME_INVALID'],
  ])('fails closed after %s changes', (_name, patch, code) => {
    expect(() => resolvePetrosConceptPackReviewApproval(phase2PackCandidate,
      { ...phase2PackReviewAuthority, ...patch })).toThrow(code);
  });

  it('rejects an approved receipt after candidate content changes', () => {
    const changed = { ...phase2PackCandidate, coreExplanation: 'Changed after review.' };
    expect(() => resolvePetrosConceptPackReviewApproval(changed, phase2PackReviewAuthority))
      .toThrow('PETROS_PACK_REVIEW_CHANGED_PAYLOAD');
  });
});
