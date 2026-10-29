/** CC0 controlled engineering fixture builder. Imported only by isolated tests/demo tooling. */
import {
  M3_MODEL_VERSION,
  type ContentUnit,
  type M3ModelProposal,
} from '@edrion/schemas';
import { referenceFor } from '../../student/knowledge/petros-content-interpretation';
export function controlledSourceProposal(
  units: ContentUnit[],
  domain: 'cloud' | 'argument',
): M3ModelProposal {
  const wanted =
    domain === 'cloud'
      ? ['Consumer responsibility', 'Virtualization']
      : ['council', 'survey'];
  const selected = wanted
    .map((term) =>
      units.find((u) =>
        u.searchableText.toLowerCase().includes(term.toLowerCase()),
      ),
    )
    .filter((u): u is ContentUnit => Boolean(u));
  if (selected.length !== 2)
    throw new Error('M3_CONTROLLED_FIXTURE_SOURCE_REQUIRED');
  const supports = selected.map((u) => [
    { reference: referenceFor(u), quote: u.searchableText.slice(0, 1000) },
  ]);
  const wording =
    domain === 'cloud'
      ? [
          'Given a service-model case, classify the consumer and provider responsibilities using the cited boundary.',
          'Explain the distinction between logical resources and physical hardware using the source wording.',
        ]
      : [
          'Identify the author’s claim and distinguish it from the evidence offered for it.',
          'Explain what the survey supports and identify an assumption that requires further review.',
        ];
  return {
    schemaVersion: M3_MODEL_VERSION,
    objectives: wording.map((wording, n) => ({
      key: `objective_${n}`,
      wording,
      observableCapability: wording,
      support: domain === 'argument' ? supports.flat() : supports[n]!,
      conceptKeys:
        domain === 'cloud' && n === 1
          ? ['concept_1', 'concept_2']
          : [`concept_${n}`],
      assumptions:
        domain === 'argument'
          ? [
              'Alternative defensible readings remain open; this fixture cannot establish a single assessment answer.',
            ]
          : ['Source boundaries require subject review.'],
    })),
    concepts: selected.flatMap((u, n) =>
      (domain === 'cloud' && n === 1
        ? ['Logical resources', 'Physical hardware']
        : [
            domain === 'cloud'
              ? 'Service responsibility boundary'
              : n
                ? 'Supporting evidence'
                : 'Argument claim',
          ]
      ).map((label, k) => ({
        key: `concept_${n + k}`,
        label,
        definition: u.searchableText.slice(0, 1000),
        support: supports[n]!,
      })),
    ),
    relationships: [],
    claims: selected.map((u, n) => ({
      key: `claim_${n}`,
      statement: u.searchableText.slice(0, 1000),
      support: supports[n]!,
    })),
    activities: selected.flatMap((_u, n) => {
      const families =
        domain === 'cloud'
          ? n === 0
            ? ['table_exploration', 'source_reading']
            : ['comparison', 'targeted_question']
          : n === 0
            ? ['targeted_question', 'comparison']
            : ['comparison', 'source_reading'];
      const prompts =
        domain === 'cloud'
          ? [
              'Match the responsibilities\nFor each service model, match the source cards to consumer or provider responsibilities.',
              'Compare logical and physical resources\nUse the source example to explain how virtualization separates logical resources from physical hardware and how a virtual machine receives CPU and memory.',
            ]
          : [
              'Identify the claim and evidence\nIdentify the author’s claim, then select a source detail offered as evidence. Explain how the evidence supports the claim.',
              'Examine what the survey supports\nCompare the survey finding with the author’s claim. Explain what the finding supports and identify an assumption that still needs checking.',
            ];
      const observations =
        domain === 'cloud'
          ? [
              'A consumer/provider classification for IaaS, PaaS and SaaS, justified using the source table.',
              'A short comparison of logical resources and physical hardware, explaining the source example of allocated CPU and memory without treating a virtual machine as physical hardware.',
            ]
          : [
              'An identified claim and cited evidence, with an explanation of their connection; alternative defensible readings remain open.',
              'A cited survey finding, a limited interpretation of what it supports, and an assumption requiring further review.',
            ];
      return families.map((family, k) => ({
        key: `activity_${n}_${k}`,
        objectiveKey: `objective_${n}`,
        family: family as M3ModelProposal['activities'][number]['family'],
        purpose:
          k === 0 ? prompts[n]! : `Read and explain the source\n${wording[n]}`,
        expectedObservation: observations[n]!,
        support: domain === 'argument' ? supports.flat() : supports[n]!,
        renderer: 'teaching_block',
        kernel: null,
        operations: ['read'],
        editableRegions: [],
        accessibilityAlternative: (domain === 'argument'
          ? selected
          : [selected[n]!]
        )
          .map((u) => u.searchableText.slice(0, 1000))
          .join('\n')
          .slice(0, 2000),
        expectedResult:
          'A justified source-based explanation, pending academic review.',
        assumptions: [
          'Read-only task layout; no learner answers, model validation or approved relationships.',
        ],
      }));
    }),
    uncertainties:
      domain === 'cloud'
        ? ['Visible relationships do not establish causation.']
        : [
            'The warrant is proposed, not proven. Fairness and academic opportunity remain alternative defensible readings.',
          ],
  };
}
