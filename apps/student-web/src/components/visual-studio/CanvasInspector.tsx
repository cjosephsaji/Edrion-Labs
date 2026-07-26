'use client';

import { useMemo } from 'react';
import type { VisualGraphEdge, VisualGraphNode } from '@edrion/schemas';
import { PillButton } from '@/components/ui/pill-button';
import { useVisualCanvasStore } from '@/lib/visual-studio/use-canvas-store';
import { ARCHETYPE_LABELS } from '@/lib/visual-studio/canvas-compatibility';
import { MarkdownMath } from './MarkdownMath';
import { RevisionHistoryPanel } from './RevisionHistoryPanel';

function edgeLabel(type: VisualGraphEdge['type']): string {
  return type.replace(/_/g, ' ');
}

type CanvasInspectorProps = {
  canvasId: string;
  baseVersion: number;
  onOpenActions?: () => void;
};

export function CanvasInspector({ canvasId, baseVersion, onOpenActions }: CanvasInspectorProps) {
  const graph = useVisualCanvasStore((state) => state.graph);
  const selectedNodeId = useVisualCanvasStore((state) => state.selectedNodeId);

  const selectedNode: VisualGraphNode | null = useMemo(
    () => graph.nodes.find((node) => node.id === selectedNodeId) ?? null,
    [graph.nodes, selectedNodeId],
  );

  const connectedEdges = useMemo(() => {
    if (!selectedNodeId) return [];
    return graph.edges.filter(
      (edge) => edge.source === selectedNodeId || edge.target === selectedNodeId,
    );
  }, [graph.edges, selectedNodeId]);

  return (
    <aside className="thinking-canvas__panel hidden h-full overflow-y-auto border-l border-st-bd1 p-4 min-[921px]:block">
      <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-st-faint">
        Inspector
      </p>
      <p className="mt-1 text-xs text-st-muted">{ARCHETYPE_LABELS[graph.archetype]}</p>

      {!selectedNode ? (
        <p className="mt-8 text-sm text-st-muted">Select an idea to explore its connections.</p>
      ) : (
        <div className="mt-6 space-y-4">
          <div>
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-st-accent">
              {selectedNode.type.replace(/_/g, ' ')}
            </p>
            <h2 className="mt-1 font-display text-xl font-semibold text-st-ink">{selectedNode.title}</h2>
            {selectedNode.body ? (
              <div className="mt-3 text-sm leading-relaxed text-st-muted">
                <MarkdownMath>{selectedNode.body}</MarkdownMath>
              </div>
            ) : null}
            {onOpenActions ? (
              <PillButton className="mt-4" variant="soft" onClick={onOpenActions}>
                Actions
              </PillButton>
            ) : null}
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-st-faint">Connections</p>
            <ul className="mt-2 space-y-2">
              {connectedEdges.map((edge) => {
                const otherId = edge.source === selectedNode.id ? edge.target : edge.source;
                const other = graph.nodes.find((node) => node.id === otherId);
                return (
                  <li
                    key={edge.id}
                    className="rounded-xl border border-st-bd1 bg-st-cardAlt px-3 py-2 text-sm text-st-inkSoft"
                  >
                    <span className="font-medium text-st-muted">{edgeLabel(edge.type)}</span>
                    <span className="mx-1 text-st-faint">→</span>
                    {other?.title ?? otherId}
                  </li>
                );
              })}
              {connectedEdges.length === 0 ? (
                <li className="text-sm text-st-faint">No visible connections.</li>
              ) : null}
            </ul>
          </div>
        </div>
      )}

      <div className="mt-8 border-t border-st-divider pt-4">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-st-faint">History</p>
        <RevisionHistoryPanel canvasId={canvasId} baseVersion={baseVersion} />
      </div>
    </aside>
  );
}
