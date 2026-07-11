import type { CanvasGraph } from '@edrion/schemas';
import type { VisualNodeType } from '@edrion/schemas';
import type { LayoutAlgorithm, LayoutRequestMessage, LayoutResponseMessage } from './layout-types';
import { runLayout } from './elk-layout';

export const NODE_DIMENSIONS: Record<VisualNodeType, { width: number; height: number }> = {
  concept: { width: 240, height: 120 },
  process_step: { width: 220, height: 112 },
  decision: { width: 220, height: 128 },
  example: { width: 230, height: 120 },
  question: { width: 240, height: 120 },
  definition: { width: 240, height: 124 },
  formula: { width: 260, height: 132 },
  note: { width: 220, height: 116 },
};

export function requestGraphLayout(
  graph: CanvasGraph,
  visibleNodeIds: Set<string>,
  requestId: number,
): Promise<LayoutResponseMessage> {
  const nodes = graph.nodes
    .filter((node) => visibleNodeIds.has(node.id))
    .map((node) => {
      const size = NODE_DIMENSIONS[node.type] ?? NODE_DIMENSIONS.concept;
      return {
        id: node.id,
        width: size.width,
        height: size.height,
        type: node.type,
        depth: node.depth,
      };
    });

  const visibleEdges = graph.edges.filter(
    (edge) => visibleNodeIds.has(edge.source) && visibleNodeIds.has(edge.target),
  );

  const message: LayoutRequestMessage = {
    requestId,
    archetype: graph.archetype,
    nodes,
    edges: visibleEdges,
    rootNodeId: graph.root_node_id,
  };

  // ELK spawns and owns the Web Worker that runs the layout algorithm, so this stays
  // off the main thread without us wrapping it in a second worker of our own.
  return runLayout(message);
}

export function getCachedPositions(graph: CanvasGraph): Record<string, { x: number; y: number }> | null {
  const snapshot = graph.layout_cache[graph.archetype];
  if (!snapshot?.positions) return null;
  const nodeIds = new Set(graph.nodes.map((node) => node.id));
  const positions: Record<string, { x: number; y: number }> = {};
  for (const [id, pos] of Object.entries(snapshot.positions)) {
    if (nodeIds.has(id)) positions[id] = pos;
  }
  return Object.keys(positions).length > 0 ? positions : null;
}

export function mergeLayoutCache(
  graph: CanvasGraph,
  positions: Record<string, { x: number; y: number }>,
  algorithm: LayoutAlgorithm,
): CanvasGraph['layout_cache'] {
  return {
    ...graph.layout_cache,
    [graph.archetype]: {
      algorithm,
      positions,
    },
  };
}
