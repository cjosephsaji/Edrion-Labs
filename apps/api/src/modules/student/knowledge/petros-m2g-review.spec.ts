import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  semanticCaseSchema,
  applyIndependentReview as reviewWithQualification,
  semanticMetrics,
  type ContentUnit,
  type SemanticCase,
} from '@edrion/schemas';
import { exportSemanticCases } from '../../../../../../packages/learn-evals/src/petros-v2/semantic-cases';
import { PdfContentAdapter } from './adapters/pdf-content.adapter';
import { KnowledgePdfProcess } from './knowledge-pdf-process';
import { fixtureRevision } from './petros-m2-test-helpers';
import { produceContentUnits } from './petros-content-intelligence.service';

let units: ContentUnit[], cases: SemanticCase[];
const applyIndependentReview = (
  input: SemanticCase,
  decision: Parameters<typeof reviewWithQualification>[1],
  sourceUnits: ContentUnit[],
) =>
  reviewWithQualification(
    input,
    decision,
    sourceUnits,
    Date.now(),
    (reviewer) => reviewer.qualificationId === 'synthetic-not-real-qualification',
  );
beforeAll(async () => {
  const bytes = readFileSync(
    resolve(
      __dirname,
      '../../../../../../packages/learn-evals/src/petros-v2/fixtures/sources/argument.pdf',
    ),
  );
  const evidence = await new PdfContentAdapter(new KnowledgePdfProcess()).extract(
    bytes,
    new AbortController().signal,
  );
  units = produceContentUnits(evidence, fixtureRevision(evidence));
  cases = exportSemanticCases('english', units).cases;
});

describe('M2-G independent-review contract (synthetic reviewer fixtures, not academic review)', () => {
  const reviewer = {
    identity: 'synthetic-contract-reviewer',
    qualificationId: 'synthetic-not-real-qualification',
    qualificationStatus: 'independently_verified' as const,
    subject: 'english' as const,
    independentOfGenerator: true as const,
    validUntil: new Date(Date.now() + 600000).toISOString(),
  };
  it('exports all nine English challenges with genuine hash/locator pins and pending human decisions', () => {
    expect(cases.length).toBe(9);
    expect(
      cases.every(
        (value) =>
          value.reviewer === null && value.reviewerDecision === null && !value.academicApproval,
      ),
    ).toBe(true);
    expect(cases.every((value) => value.sourceHash === units[0]!.sourceHash)).toBe(true);
  });
  it('does not count engineering expectations or controlled outputs as genuine semantic accuracy', () => {
    expect(semanticMetrics(cases)).toMatchObject({
      independentlyReviewedGenuineClaims: 0,
      supportRate: null,
      gate: 'not_established',
    });
    const controlled = applyIndependentReview(
      cases[0]!,
      { reviewer, outcome: 'supported', disagreement: 'none' },
      units,
    );
    expect(
      semanticMetrics([{ ...controlled, candidateOrigin: 'controlled_provider' }]).supportRate,
    ).toBeNull();
  });
  it('denies self-declared qualification and genuine execution without trusted verification', () => {
    expect(() =>
      reviewWithQualification(
        cases[0]!,
        { reviewer, outcome: 'supported', disagreement: 'none' },
        units,
      ),
    ).toThrow('REVIEWER_QUALIFICATION_UNVERIFIED');
    const reviewed = applyIndependentReview(
      cases[0]!,
      { reviewer, outcome: 'supported', disagreement: 'none' },
      units,
    );
    expect(
      semanticMetrics([
        { ...reviewed, candidateOrigin: 'genuine_provider', candidateAdmission: 'supported' },
      ]).supportRate,
    ).toBeNull();
  });
  it('keeps reviewer disagreement out of acceptance denominators', () => {
    const reviewed = applyIndependentReview(
      cases[0]!,
      { reviewer, outcome: 'supported', disagreement: 'unresolved' },
      units,
    );
    expect(reviewed.safeForTeachingReview).toBe(false);
    expect(
      semanticMetrics([{ ...reviewed, candidateOrigin: 'genuine_provider' }])
        .independentlyReviewedGenuineClaims,
    ).toBe(0);
  });
  it('does not turn semantic support into academic approval', () => {
    const reviewed = applyIndependentReview(
      cases[0]!,
      { reviewer, outcome: 'supported', disagreement: 'none' },
      units,
    );
    expect(reviewed.safeForTeachingReview).toBe(true);
    expect(reviewed.academicApproval).toBe(false);
    expect(() => semanticCaseSchema.parse({ ...reviewed, academicApproval: true })).toThrow();
  });
  it('rejects missing, expired and wrong-subject reviewer qualifications', () => {
    expect(() =>
      semanticCaseSchema.parse({ ...cases[0], reviewerDecision: 'supported' }),
    ).toThrow();
    expect(() =>
      applyIndependentReview(
        cases[0]!,
        {
          reviewer: { ...reviewer, validUntil: '2020-01-01T00:00:00.000Z' },
          outcome: 'supported',
          disagreement: 'none',
        },
        units,
      ),
    ).toThrow();
    expect(() =>
      applyIndependentReview(
        cases[0]!,
        { reviewer: { ...reviewer, subject: 'cloud' }, outcome: 'supported', disagreement: 'none' },
        units,
      ),
    ).toThrow();
  });
  it('invalidates changed-revision compatibility rather than repinning old review', () => {
    const altered = structuredClone(units);
    altered.forEach((unit) => {
      unit.sourceRevisionId = randomUUID();
    });
    const reviewed = applyIndependentReview(
      cases[0]!,
      { reviewer, outcome: 'supported', disagreement: 'none' },
      altered,
    );
    expect(reviewed.sourceRevisionCompatible).toBe(false);
    expect(reviewed.safeForTeachingReview).toBe(false);
  });
  it('measures critical false-support separately on synthetic statistics examples', () => {
    const reviewed = applyIndependentReview(
      cases.find((value) => value.severity === 'critical')!,
      {
        reviewer,
        outcome: 'contradicted',
        disagreement: 'none',
      },
      units,
    );
    expect(
      semanticMetrics(
        [{ ...reviewed, candidateOrigin: 'genuine_provider', candidateAdmission: 'supported' }],
        { reviewerVerified: () => true, genuineExecutionVerified: () => true },
      ),
    ).toMatchObject({
      admittedSupportedClaims: 1,
      supported: 0,
      falseSupportRate: 1,
      criticalFalseSupport: 1,
      gate: 'not_established',
    });
  });
});
