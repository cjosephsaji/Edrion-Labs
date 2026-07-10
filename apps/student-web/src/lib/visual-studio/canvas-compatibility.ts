import type { CanvasGraph, VisualArchetype } from '@edrion/schemas';
import { collectVisualGraphIssues } from '@edrion/schemas';

export type ArchetypeCompatibility = {
  archetype: VisualArchetype;
  compatible: boolean;
  reason: string | null;
};

const ARCHETYPE_ORDER: VisualArchetype[] = [
  'mind_map',
  'flowchart',
  'hierarchy',
  'cycle',
  'timeline',
  'comparison',
];

export const ARCHETYPE_LABELS: Record<VisualArchetype, string> = {
  mind_map: 'Mind map',
  flowchart: 'Flowchart',
  hierarchy: 'Hierarchy',
  cycle: 'Cycle',
  timeline: 'Timeline',
  comparison: 'Comparison',
};

export function evaluateArchetypeCompatibility(graph: CanvasGraph): ArchetypeCompatibility[] {
  return ARCHETYPE_ORDER.map((archetype) => {
    const candidate =
      archetype === graph.archetype ? graph : { ...graph, archetype };
    const issues = collectVisualGraphIssues(candidate);
    return {
      archetype,
      compatible: issues.length === 0,
      reason: issues[0]?.message ?? null,
    };
  });
}
