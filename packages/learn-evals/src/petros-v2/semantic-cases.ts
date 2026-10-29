import type { ContentUnit } from '@edrion/schemas';
import { semanticCaseSchema, type SemanticCase } from './semantic-review';

const cases: Array<{
  id: string;
  subject: 'cloud' | 'english';
  needle: string;
  candidate: string;
  expected: SemanticCase['expectedSupport'];
  severity: SemanticCase['severity'];
}> = [
  {
    id: 'responsibility',
    subject: 'cloud',
    needle: 'Operating system',
    candidate: 'The IaaS consumer is responsible for the operating system.',
    expected: 'supported',
    severity: 'important',
  },
  {
    id: 'reversed-responsibility',
    subject: 'cloud',
    needle: 'Operating system',
    candidate: 'The IaaS provider is responsible for the consumer operating system.',
    expected: 'contradicted',
    severity: 'critical',
  },
  {
    id: 'changed-cell',
    subject: 'cloud',
    needle: 'Application code',
    candidate: 'The PaaS consumer cell says Physical hardware.',
    expected: 'contradicted',
    severity: 'critical',
  },
  {
    id: 'absolute',
    subject: 'cloud',
    needle: 'Service models describe',
    candidate: 'All cloud models eliminate consumer responsibility.',
    expected: 'insufficient_evidence',
    severity: 'critical',
  },
  {
    id: 'native-arrow',
    subject: 'cloud',
    needle: 'Server',
    candidate:
      'The visible native connector goes from Server to Database; its purpose is unspecified.',
    expected: 'supported',
    severity: 'important',
  },
  {
    id: 'flattened-arrow',
    subject: 'cloud',
    needle: 'pixels',
    candidate: 'Gateway causes Worker to fail.',
    expected: 'insufficient_evidence',
    severity: 'critical',
  },
  {
    id: 'assumption',
    subject: 'cloud',
    needle: 'Memory budget',
    candidate: 'Every cloud deployment requires 32 GB.',
    expected: 'insufficient_evidence',
    severity: 'critical',
  },
  {
    id: 'service-models',
    subject: 'cloud',
    needle: 'Deployment models describe',
    candidate: 'Service models and deployment models classify the same boundary.',
    expected: 'contradicted',
    severity: 'important',
  },
  {
    id: 'numeric',
    subject: 'cloud',
    needle: 'Memory budget',
    candidate: 'Memory budget = 4 * 8 = 64 GB',
    expected: 'contradicted',
    severity: 'critical',
  },
  {
    id: 'inferred-relationship',
    subject: 'cloud',
    needle: 'Virtualization',
    candidate: 'Virtualization guarantees availability.',
    expected: 'insufficient_evidence',
    severity: 'critical',
  },
  {
    id: 'claim-evidence',
    subject: 'english',
    needle: 'survey of 120',
    candidate:
      'The survey is evidence about learner preferences, not proof of improved examination results.',
    expected: 'supported',
    severity: 'important',
  },
  {
    id: 'missing-warrant',
    subject: 'english',
    needle: 'survey of 120',
    candidate: 'The preference survey alone establishes that access improves attainment.',
    expected: 'insufficient_evidence',
    severity: 'critical',
  },
  {
    id: 'counterargument',
    subject: 'english',
    needle: 'Staff cost',
    candidate: 'The staff cost objection is a counterargument.',
    expected: 'supported',
    severity: 'important',
  },
  {
    id: 'alternative',
    subject: 'english',
    needle: 'Two readings',
    candidate: 'A fairness reading is a possible interpretation.',
    expected: 'supported',
    severity: 'ordinary',
  },
  {
    id: 'assertion-as-evidence',
    subject: 'english',
    needle: 'council should',
    candidate: 'The central proposal is empirical evidence that scores improved.',
    expected: 'insufficient_evidence',
    severity: 'critical',
  },
  {
    id: 'contradiction',
    subject: 'english',
    needle: '2500',
    candidate: 'The source consistently specifies a single cost of 2000 units.',
    expected: 'contradicted',
    severity: 'critical',
  },
  {
    id: 'changed-statistic',
    subject: 'english',
    needle: 'survey of 120',
    candidate: 'A survey of 120 learners found that 99 preferred later access.',
    expected: 'contradicted',
    severity: 'critical',
  },
  {
    id: 'quote-outside-context',
    subject: 'english',
    needle: 'survey of 120',
    candidate: 'The cited survey proves an examination score gain.',
    expected: 'insufficient_evidence',
    severity: 'critical',
  },
  {
    id: 'rhetorical-intent',
    subject: 'english',
    needle: 'Two readings',
    candidate: 'The author intends only a fairness argument.',
    expected: 'ambiguous',
    severity: 'important',
  },
];

export function exportSemanticCases(
  subject: 'cloud' | 'english',
  units: ContentUnit[],
  changed = false,
) {
  const result: SemanticCase[] = [],
    unresolved: string[] = [];
  for (const specification of cases.filter((value) => value.subject === subject)) {
    const unit = units.find(
      (value) =>
        value.sourceChannel !== 'notes' &&
        value.sourceChannel !== 'hidden' &&
        value.searchableText.toLowerCase().includes(specification.needle.toLowerCase()),
    );
    if (!unit) {
      unresolved.push(specification.id);
      continue;
    }
    result.push(
      semanticCaseSchema.parse({
        id: `${subject}.${specification.id}${changed ? '.changed' : ''}`,
        subject,
        sourceHash: unit.sourceHash,
        sourceRevisionId: unit.sourceRevisionId,
        references: [
          {
            sourceId: unit.sourceId,
            sourceRevisionId: unit.sourceRevisionId,
            sourceHash: unit.sourceHash,
            representationHash: unit.representationHash,
            unitId: unit.id,
            unitHash: unit.contentHash,
            locator: unit.locator,
            semanticId: null,
          },
        ],
        goldSourceFact: unit.searchableText,
        candidateClaim: specification.candidate,
        candidateOrigin: 'engineering_challenge',
        expectedSupport: changed ? 'review_required' : specification.expected,
        expectationOrigin: 'engineering_pending_independent_review',
        severity: specification.severity,
        split: changed ? 'changed_source' : result.length % 2 ? 'held_out' : 'pilot',
        candidateAdmission: 'review_required',
        reviewer: null,
        reviewerDecision: null,
        disagreement: 'pending',
        sourceRevisionCompatible: true,
        safeForTeachingReview: false,
        academicApproval: false,
      }),
    );
  }
  return { cases: result, unresolved };
}
