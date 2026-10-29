import { z } from 'zod';
import {
  canonicalContent,
  teachingReferenceSchema,
  unitSemanticIds,
  type ContentUnit,
} from './content';

export const supportOutcomeSchema = z.enum([
  'supported',
  'contradicted',
  'insufficient_evidence',
  'ambiguous',
  'review_required',
]);
export const semanticCaseSchema = z
  .object({
    id: z.string().min(1).max(120),
    subject: z.enum(['cloud', 'english']),
    sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
    sourceRevisionId: z.string().uuid(),
    references: z.array(teachingReferenceSchema).min(1).max(4),
    goldSourceFact: z.string().min(1).max(4000),
    candidateClaim: z.string().min(1).max(2000),
    candidateOrigin: z.enum(['engineering_challenge', 'controlled_provider', 'genuine_provider']),
    expectedSupport: supportOutcomeSchema,
    expectationOrigin: z.literal('engineering_pending_independent_review'),
    severity: z.enum(['critical', 'important', 'ordinary']),
    split: z.enum(['pilot', 'held_out', 'changed_source']),
    candidateAdmission: z.enum(['supported', 'review_required', 'rejected']),
    reviewer: z
      .object({
        identity: z.string().min(1),
        qualificationId: z.string().min(1),
        qualificationStatus: z.literal('independently_verified'),
        subject: z.enum(['cloud', 'english']),
        independentOfGenerator: z.literal(true),
        validUntil: z.string().datetime(),
      })
      .strict()
      .nullable(),
    reviewerDecision: supportOutcomeSchema.nullable(),
    disagreement: z.enum(['pending', 'none', 'unresolved', 'resolved']),
    sourceRevisionCompatible: z.boolean(),
    safeForTeachingReview: z.boolean(),
    academicApproval: z.literal(false),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.references.some(
        (reference) =>
          reference.sourceHash !== value.sourceHash ||
          reference.sourceRevisionId !== value.sourceRevisionId,
      )
    )
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'Incompatible source references' });
    if (value.reviewerDecision && (!value.reviewer || value.reviewer.subject !== value.subject))
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Independent subject reviewer required',
      });
    if (
      value.safeForTeachingReview &&
      (value.reviewerDecision !== 'supported' ||
        value.disagreement !== 'none' ||
        !value.sourceRevisionCompatible)
    )
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Unresolved claim is not safe for teaching review',
      });
  });
export type SemanticCase = z.infer<typeof semanticCaseSchema>;

export function applyIndependentReview(
  input: SemanticCase,
  decision: {
    reviewer: NonNullable<SemanticCase['reviewer']>;
    outcome: SemanticCase['expectedSupport'];
    disagreement: SemanticCase['disagreement'];
  },
  units: ContentUnit[],
  now = Date.now(),
  verifyQualification?: (reviewer: NonNullable<SemanticCase['reviewer']>) => boolean,
) {
  const value = semanticCaseSchema.parse(input);
  if (!verifyQualification?.(decision.reviewer))
    throw new Error('REVIEWER_QUALIFICATION_UNVERIFIED');
  if (Date.parse(decision.reviewer.validUntil) <= now)
    throw new Error('REVIEWER_QUALIFICATION_EXPIRED');
  const compatible = value.references.every((reference) =>
    units.some(
      (unit) =>
        unit.id === reference.unitId &&
        unit.contentHash === reference.unitHash &&
        unit.sourceHash === reference.sourceHash &&
        unit.sourceRevisionId === reference.sourceRevisionId &&
        unit.sourceId === reference.sourceId &&
        (reference.semanticId === null || unitSemanticIds(unit).has(reference.semanticId)) &&
        unit.representationHash === reference.representationHash &&
        canonicalContent(unit.locator) === canonicalContent(reference.locator),
    ),
  );
  return semanticCaseSchema.parse({
    ...value,
    reviewer: decision.reviewer,
    reviewerDecision: decision.outcome,
    disagreement: decision.disagreement,
    sourceRevisionCompatible: compatible,
    safeForTeachingReview:
      compatible && decision.outcome === 'supported' && decision.disagreement === 'none',
  });
}

export function semanticMetrics(
  inputs: SemanticCase[],
  verification?: {
    reviewerVerified: (reviewer: NonNullable<SemanticCase['reviewer']>) => boolean;
    genuineExecutionVerified: (value: SemanticCase) => boolean;
  },
) {
  const cases = inputs.map((input) => semanticCaseSchema.parse(input));
  const eligible = cases.filter(
    (value) =>
      value.candidateOrigin === 'genuine_provider' &&
      value.reviewerDecision !== null &&
      value.reviewer &&
      verification?.reviewerVerified(value.reviewer) &&
      verification.genuineExecutionVerified(value) &&
      Date.parse(value.reviewer.validUntil) > Date.now() &&
      value.sourceRevisionCompatible &&
      (value.disagreement === 'none' || value.disagreement === 'resolved'),
  );
  const admitted = eligible.filter((value) => value.candidateAdmission === 'supported');
  const supported = admitted.filter((value) => value.reviewerDecision === 'supported').length;
  const criticalFalseSupport = admitted.filter(
    (value) => value.severity === 'critical' && value.reviewerDecision !== 'supported',
  ).length;
  const proportion = admitted.length ? supported / admitted.length : null;
  const interval = (successes: number, total: number) => {
    if (!total) return null;
    const fraction = successes / total,
      squared = 1.96 ** 2;
    const center = (fraction + squared / (2 * total)) / (1 + squared / total);
    const radius =
      (1.96 * Math.sqrt((fraction * (1 - fraction)) / total + squared / (4 * total ** 2))) /
      (1 + squared / total);
    return [center - radius, center + radius];
  };
  return {
    cases: cases.length,
    independentlyReviewedGenuineClaims: eligible.length,
    admittedSupportedClaims: admitted.length,
    supported,
    supportRate: proportion,
    supportWilson95: interval(supported, admitted.length),
    falseSupport: admitted.length - supported,
    falseSupportRate: admitted.length ? 1 - proportion! : null,
    criticalFalseSupport,
    reviewRequired: cases.filter((value) => value.candidateAdmission === 'review_required').length,
    gate:
      admitted.length && proportion! >= 0.98 && criticalFalseSupport === 0
        ? 'sample_threshold_met_not_release_approval'
        : 'not_established',
  };
}
