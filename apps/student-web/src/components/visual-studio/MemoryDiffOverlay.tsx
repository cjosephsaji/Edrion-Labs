'use client';

import { useMemo, useState } from 'react';
import type { CanvasGraph, MemoryGraphDiff, VisualGraphNode } from '@edrion/schemas';
import { PillButton } from '@/components/ui/pill-button';
import { useVisualRevisionQueue } from '@/lib/hooks/useVisualStudio';
import { useVisualCanvasStore } from '@/lib/visual-studio/use-canvas-store';

export type MemoryNodeRole = 'correct' | 'ghost' | 'wrong' | 'extra';

export type MemoryEdgeRole = 'correct' | 'wrong';

export type MemoryGhostNode = {
  id: string;
  node: VisualGraphNode;
  suggestedParentStudentNodeId?: string;
};

export type MemoryDiffPresentation = {
  nodeRoles: Map<string, MemoryNodeRole>;
  edgeRoles: Map<string, MemoryEdgeRole>;
  ghostNodes: MemoryGhostNode[];
  evidenceLines: string[];
  checkId: string;
  missingReferenceNodeIds: string[];
};

export function buildMemoryDiffPresentation(
  diff: MemoryGraphDiff | null,
  graph: CanvasGraph,
): MemoryDiffPresentation | null {
  if (!diff) return null;

  const nodeRoles = new Map<string, MemoryNodeRole>();
  const edgeRoles = new Map<string, MemoryEdgeRole>();

  for (const match of diff.matched_nodes) {
    nodeRoles.set(match.student_node_id, 'correct');
  }
  for (const nodeId of diff.extra_student_node_ids) {
    if (!nodeRoles.has(nodeId)) nodeRoles.set(nodeId, 'extra');
  }
  for (const edge of diff.correct_edges) {
    edgeRoles.set(edge.student_edge_id, 'correct');
  }
  for (const edge of diff.wrong_edges) {
    edgeRoles.set(edge.student_edge_id, 'wrong');
    if (!nodeRoles.has(graph.edges.find((e) => e.id === edge.student_edge_id)?.source ?? '')) {
      // keep matched nodes as correct
    }
    const studentEdge = graph.edges.find((entry) => entry.id === edge.student_edge_id);
    if (studentEdge) {
      nodeRoles.set(studentEdge.source, nodeRoles.get(studentEdge.source) ?? 'wrong');
      nodeRoles.set(studentEdge.target, nodeRoles.get(studentEdge.target) ?? 'wrong');
    }
  }

  const ghostNodes: MemoryGhostNode[] = diff.missing_nodes.map((entry) => ({
    id: `ghost:${entry.reference_node.id}`,
    node: entry.reference_node,
    suggestedParentStudentNodeId: entry.suggested_parent_student_node_id,
  }));

  return {
    nodeRoles,
    edgeRoles,
    ghostNodes,
    evidenceLines: diff.evidence_lines,
    checkId: diff.check_id,
    missingReferenceNodeIds: diff.missing_nodes.map((entry) => entry.reference_node.id),
  };
}

type MemoryDiffOverlayProps = {
  canvasId: string;
  onDismiss?: () => void;
};

export function MemoryDiffOverlay({ canvasId, onDismiss }: MemoryDiffOverlayProps) {
  const memoryDiff = useVisualCanvasStore((state) => state.memoryDiff);
  const graph = useVisualCanvasStore((state) => state.graph);
  const setMemoryDiff = useVisualCanvasStore((state) => state.setMemoryDiff);
  const revisionQueue = useVisualRevisionQueue(canvasId);
  const [queued, setQueued] = useState(false);

  const presentation = useMemo(
    () => buildMemoryDiffPresentation(memoryDiff, graph),
    [graph, memoryDiff],
  );

  if (!presentation) return null;

  const handleQueueMissing = async () => {
    if (presentation.missingReferenceNodeIds.length === 0) return;
    await revisionQueue.mutateAsync({
      action: 'enqueue_memory_missing',
      check_id: presentation.checkId,
      reference_node_ids: presentation.missingReferenceNodeIds,
      client_mutation_id: crypto.randomUUID(),
    });
    setQueued(true);
  };

  return (
    <section
      className="thinking-canvas__panel absolute bottom-4 left-4 right-4 z-20 mx-auto max-w-xl rounded-2xl p-4 shadow-lg min-[921px]:left-auto min-[921px]:right-6 min-[921px]:max-w-md"
      aria-label="Memory check results"
    >
      <div aria-live="polite" className="space-y-3">
        <div>
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-st-faint">
            Memory check
          </p>
          {memoryDiff?.matching_mode === 'normalized_title_fallback' ? (
            <p className="mt-2 text-sm text-st-muted">
              Connection matching is using titles right now. Exact title matches are shown; try again
              later for a fuller comparison.
            </p>
          ) : null}
          <ul className="mt-2 space-y-1 text-sm text-st-ink">
            {presentation.evidenceLines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>

        <div className="flex flex-wrap gap-2 text-xs text-st-muted" aria-label="Legend">
          <span className="inline-flex items-center gap-1 rounded-full border border-st-success/40 bg-st-mintBg px-2 py-1">
            <span className="h-2 w-2 rounded-full bg-st-success" aria-hidden /> Correct
          </span>
          <span className="inline-flex items-center gap-1 rounded-full border border-st-goldBd bg-st-goldSoftBg px-2 py-1">
            <span className="h-2 w-2 rounded-full bg-st-gold" aria-hidden /> Missing
          </span>
          <span className="inline-flex items-center gap-1 rounded-full border border-st-dangerBd bg-st-dangerSoft px-2 py-1">
            <span className="h-2 w-2 rounded-full bg-st-danger" aria-hidden /> Wrong
          </span>
          <span className="inline-flex items-center gap-1 rounded-full border border-st-bd2 bg-st-surface2 px-2 py-1">
            <span className="h-2 w-2 rounded-full bg-st-faint" aria-hidden /> Ideas you added
          </span>
        </div>

        <div className="flex flex-wrap gap-2">
          {presentation.missingReferenceNodeIds.length > 0 ? (
            <PillButton
              onClick={() => void handleQueueMissing()}
              disabled={revisionQueue.isPending || queued}
            >
              {queued ? 'Added to revision' : 'Queue missing ideas'}
            </PillButton>
          ) : null}
          <PillButton
            variant="ghost"
            onClick={() => {
              setMemoryDiff(null);
              onDismiss?.();
            }}
          >
            Hide check
          </PillButton>
        </div>
      </div>
    </section>
  );
}

export function memoryNodeClassName(role: MemoryNodeRole | undefined): string {
  switch (role) {
    case 'correct':
      return 'memory-node--correct';
    case 'ghost':
      return 'memory-node--ghost';
    case 'wrong':
      return 'memory-node--wrong';
    case 'extra':
      return 'memory-node--extra';
    default:
      return '';
  }
}

export function memoryEdgeStroke(role: MemoryEdgeRole | undefined): string | undefined {
  switch (role) {
    case 'correct':
      return 'var(--st-success)';
    case 'wrong':
      return 'var(--st-danger)';
    default:
      return undefined;
  }
}
