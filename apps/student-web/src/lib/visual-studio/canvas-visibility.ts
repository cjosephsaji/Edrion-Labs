import type { CanvasGraph, VisualGraphNode } from '@edrion/schemas';

export type VisibilityResult = {
  visibleNodeIds: Set<string>;
  hiddenCounts: Map<string, number>;
};

type NodeMaps = {
  nodeById: Map<string, VisualGraphNode>;
};

function buildNodeMaps(graph: CanvasGraph): NodeMaps {
  return { nodeById: new Map(graph.nodes.map((node) => [node.id, node])) };
}

/** Mirrors semantic-validator layout parent rules. */
export function getLayoutParents(
  nodeId: string,
  graph: CanvasGraph,
  nodeById: Map<string, VisualGraphNode>,
): string[] {
  const parents = new Set<string>();
  const node = nodeById.get(nodeId);
  if (!node) return [];

  for (const edge of graph.edges) {
    if (edge.type === 'part_of') {
      if (edge.source === nodeId) parents.add(edge.target);
      continue;
    }

    const sourceNode = nodeById.get(edge.source);
    const targetNode = nodeById.get(edge.target);
    if (!sourceNode || !targetNode) continue;

    if (edge.source === nodeId && targetNode.depth < sourceNode.depth) {
      parents.add(edge.target);
    } else if (edge.target === nodeId && sourceNode.depth < targetNode.depth) {
      parents.add(edge.source);
    }
  }

  return [...parents];
}

export function getLayoutChildren(
  nodeId: string,
  graph: CanvasGraph,
  nodeById: Map<string, VisualGraphNode>,
): string[] {
  return graph.nodes
    .filter((node) => getLayoutParents(node.id, graph, nodeById).includes(nodeId))
    .map((node) => node.id);
}

function countDescendants(
  nodeId: string,
  graph: CanvasGraph,
  nodeById: Map<string, VisualGraphNode>,
): number {
  const children = getLayoutChildren(nodeId, graph, nodeById);
  return children.reduce(
    (sum, childId) => sum + 1 + countDescendants(childId, graph, nodeById),
    0,
  );
}

export function computeVisibility(graph: CanvasGraph): VisibilityResult {
  const { nodeById } = buildNodeMaps(graph);
  const visibleNodeIds = new Set<string>();
  const hiddenCounts = new Map<string, number>();
  const rootId = graph.root_node_id;

  if (!rootId || !nodeById.has(rootId)) {
    return { visibleNodeIds, hiddenCounts };
  }

  const queue = [rootId];
  while (queue.length > 0) {
    const nodeId = queue.shift()!;
    visibleNodeIds.add(nodeId);
    const node = nodeById.get(nodeId);
    if (!node) continue;

    if (node.collapsed) {
      hiddenCounts.set(nodeId, countDescendants(nodeId, graph, nodeById));
      continue;
    }

    for (const childId of getLayoutChildren(nodeId, graph, nodeById)) {
      if (!visibleNodeIds.has(childId)) queue.push(childId);
    }
  }

  return { visibleNodeIds, hiddenCounts };
}

export function collapseToOverview(graph: CanvasGraph): CanvasGraph {
  const { nodeById } = buildNodeMaps(graph);
  return {
    ...graph,
    nodes: graph.nodes.map((node) => {
      const hasChildren = getLayoutChildren(node.id, graph, nodeById).length > 0;
      if (node.depth === 2 && hasChildren) return { ...node, collapsed: true };
      if (node.depth > 2) return { ...node, collapsed: true };
      return { ...node, collapsed: false };
    }),
  };
}

export function expandAll(graph: CanvasGraph): CanvasGraph {
  return {
    ...graph,
    nodes: graph.nodes.map((node) => ({ ...node, collapsed: false })),
  };
}
