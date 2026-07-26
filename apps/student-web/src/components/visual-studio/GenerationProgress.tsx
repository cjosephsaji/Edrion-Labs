'use client';

import type { VisualGraphEdge, VisualGraphNode } from '@edrion/schemas';
import { PillButton } from '@/components/ui/pill-button';
import { Card } from '@/components/ui/card';
import { Eyebrow } from '@/components/ui/primitives';

type Props = {
  title: string;
  archetypeLabel: string;
  phase: 'queued' | 'structuring' | 'placing';
  nodes: VisualGraphNode[];
  edges: VisualGraphEdge[];
  totalNodes?: number;
  totalEdges?: number;
  onCancel: () => void;
};

export function GenerationProgress({
  title,
  archetypeLabel,
  phase,
  nodes,
  edges,
  totalNodes,
  totalEdges,
  onCancel,
}: Props) {
  const headline =
    phase === 'queued'
      ? 'Petros is finding the structure…'
      : phase === 'structuring'
        ? 'Petros is finding the structure…'
        : 'Placing the first ideas…';

  return (
    <Card className="mt-6 overflow-hidden" noPadding>
      <div className="border-b border-st-bd2 bg-st-cardAlt px-5 py-4">
        <Eyebrow color="violet">BUILDING</Eyebrow>
        <p className="mt-1 font-display text-lg font-semibold text-st-ink">{title}</p>
        <p className="text-sm text-st-muted">{archetypeLabel}</p>
        <p className="mt-3 text-sm text-st-inkSoft">{headline}</p>
        {totalNodes ? (
          <p className="mt-1 font-mono-ui text-xs text-st-faint">
            {nodes.length} of {totalNodes} ideas placed
            {totalEdges ? ` · ${edges.length} of ${totalEdges} connections` : ''}
          </p>
        ) : null}
      </div>

      <div className="max-h-72 space-y-2 overflow-y-auto bg-st-page p-5">
        {nodes.map((node) => (
          <div
            key={node.id}
            className="animate-st-block-in rounded-[12px] border border-st-bd2 bg-st-card px-4 py-3"
          >
            <p className="text-sm font-medium text-st-ink">{node.title}</p>
            {node.body ? <p className="mt-1 line-clamp-2 text-xs text-st-muted">{node.body}</p> : null}
          </div>
        ))}
        {edges.length > 0 && nodes.length > 0 ? (
          <p className="pt-2 text-xs text-st-faint">{edges.length} connections queued</p>
        ) : null}
        {nodes.length === 0 ? (
          <div className="h-24 shimmer rounded-[12px] border border-dashed border-st-bd2" />
        ) : null}
      </div>

      <div className="border-t border-st-bd2 px-5 py-4">
        <PillButton variant="soft" onClick={onCancel}>
          Cancel
        </PillButton>
      </div>
    </Card>
  );
}
