import {
  petrosSessionBlockSchema,
  type PetrosSessionBlock,
} from '../petros-learning';
import { m3ProposalSchema, type M3Proposal } from './proposal';
/** Compile bounded public source content into the established trusted preview. No session or answer is persisted. */
export function m3ActivityPreview(
  input: M3Proposal,
  activityId: string,
): PetrosSessionBlock {
  const p = m3ProposalSchema.parse(input),
    a = p.activities.find((a) => a.id === activityId);
  if (!a || a.reviewStatus === 'rejected')
    throw new Error('M3_PREVIEW_UNAVAILABLE');
  const title = a.family.replaceAll('_', ' ');
  let content: unknown;
  const objective = p.objectives.find((o) => o.id === a.objectiveId);
  if (!objective || a.capabilityStatus === 'unsupported_execution')
    throw new Error('M3_PREVIEW_UNAVAILABLE');
  const support = a.support.filter((s) =>
    objective.support.some((o) => o.reference.unitId === s.reference.unitId),
  );
  if (!support.length) throw new Error('M3_PREVIEW_UNAVAILABLE');
  const quotes = support.map((s) => s.quote);
  const units = new Set(support.map((s) => s.reference.unitId));
  const concepts = p.concepts
    .filter(
      (c) =>
        objective.conceptKeys.includes(c.key) &&
        c.support.some((s) => units.has(s.reference.unitId)),
    )
    .slice(0, 8);
  if (
    ['relationship_board', 'comparison', 'diagram_construction'].includes(
      a.family,
    ) &&
    concepts.length >= 2
  ) {
    const keys = new Set(concepts.map((c) => c.key));
    content = {
      schemaVersion: 'petros.render.v2',
      type: 'diagram',
      title: `Proposed ${title}`,
      diagramType: a.family === 'comparison' ? 'comparison' : 'concept_map',
      nodes: concepts.map((c) => ({
        id: c.key,
        label: c.label.slice(0, 240),
        description: c.support[0]!.quote.slice(0, 600),
      })),
      edges: (a.family === 'comparison'
        ? []
        : p.relationships.filter(
            (r) =>
              keys.has(r.from) &&
              keys.has(r.to) &&
              r.support.every((s) => units.has(s.reference.unitId)),
          )
      ).map((r) => ({
        from: r.from,
        to: r.to,
        label: `Unreviewed candidate: ${r.kind}`.slice(0, 160),
      })),
      altText: a.accessibilityAlternative.slice(0, 1200),
      editable: true,
      fallbackText:
        `Candidate relationships require academic review. ${concepts.map((c) => `${c.label}: ${c.support[0]!.quote}`).join(' | ')}`.slice(
          0,
          1500,
        ),
    };
  } else {
    const firstLayer = quotes[0]!;
    if (firstLayer.length < 20)
      throw new Error('M3_PREVIEW_SHORT_SOURCE_USE_STRUCTURAL');
    content = {
      schemaVersion: 'petros.render.v2',
      type: 'layered_explanation',
      title: `Proposed ${title}`,
      firstLayer: firstLayer.slice(0, 2000),
      deeperLayers: quotes
        .slice(1, 3)
        .filter((q) => q.length >= 20)
        .map((q, n) => ({
          id: `source_${n}`,
          label: `Source passage ${n + 2}`,
          content: q.slice(0, 2000),
        })),
      keyIdea: a.purpose.slice(0, 500),
      sourceGrounding: support
        .map((s) => ({
          label: `${s.reference.locator.kind} source`,
          reference: s.reference.unitId,
        }))
        .slice(0, 8),
    };
  }
  return petrosSessionBlockSchema.parse({
    id: a.id,
    sessionId: p.id,
    decisionId: a.objectiveId,
    sequence: 1,
    status: 'current',
    version: p.version,
    content,
    interactionState: {},
    observedOutcome: null,
    questions: [],
    whyThis: a.purpose,
    correlationId: p.id,
    delivery: 'deterministic_fallback',
    createdAt: p.createdAt,
    completedAt: null,
  });
}
