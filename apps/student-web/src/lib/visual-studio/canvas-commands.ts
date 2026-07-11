import type { CanvasGraph, VisualArchetype, VisualGraphEdge, VisualGraphNode } from '@edrion/schemas';

export type CanvasMutation =
  | { kind: 'add_nodes'; nodes: VisualGraphNode[] }
  | { kind: 'remove_nodes'; nodeIds: string[] }
  | { kind: 'add_edges'; edges: VisualGraphEdge[] }
  | { kind: 'remove_edges'; edgeIds: string[] }
  | { kind: 'update_node'; nodeId: string; patch: Partial<VisualGraphNode> }
  | { kind: 'update_edge'; edgeId: string; patch: Partial<VisualGraphEdge> }
  | { kind: 'set_archetype'; archetype: VisualArchetype }
  | { kind: 'set_layout'; layoutCache: CanvasGraph['layout_cache'] }
  | { kind: 'set_collapsed'; nodeId: string; collapsed: boolean };

export type CanvasCommand = {
  id: string;
  label: string;
  redo: CanvasMutation[];
  undo: CanvasMutation[];
  createdAt: number;
};

function pruneLayoutCache(graph: CanvasGraph, nodeIds: Set<string>): CanvasGraph['layout_cache'] {
  const next: CanvasGraph['layout_cache'] = {};
  for (const [archetype, layout] of Object.entries(graph.layout_cache)) {
    const positions: NonNullable<typeof layout>['positions'] = {};
    for (const [nodeId, position] of Object.entries(layout?.positions ?? {})) {
      if (nodeIds.has(nodeId)) positions[nodeId] = position;
    }
    if (Object.keys(positions).length > 0 || layout?.viewport) {
      next[archetype as VisualArchetype] = { ...layout, positions };
    }
  }
  return next;
}

function reconcileRootNodeId(graph: CanvasGraph): string | null {
  const nodeIds = new Set(graph.nodes.map((node) => node.id));
  if (graph.root_node_id !== null && nodeIds.has(graph.root_node_id)) {
    return graph.root_node_id;
  }
  if (graph.nodes.length === 0) return null;
  const sorted = [...graph.nodes].sort((a, b) => a.depth - b.depth || a.id.localeCompare(b.id));
  return sorted[0]?.id ?? null;
}

function finalizeGraph(graph: CanvasGraph): CanvasGraph {
  const nodeIds = new Set(graph.nodes.map((node) => node.id));
  return {
    ...graph,
    layout_cache: pruneLayoutCache(graph, nodeIds),
    root_node_id: reconcileRootNodeId(graph),
  };
}

export function applyMutations(graph: CanvasGraph, mutations: CanvasMutation[]): CanvasGraph {
  let next: CanvasGraph = { ...graph, nodes: [...graph.nodes], edges: [...graph.edges], layout_cache: { ...graph.layout_cache } };

  for (const mutation of mutations) {
    switch (mutation.kind) {
      case 'add_nodes':
        next = { ...next, nodes: [...next.nodes, ...mutation.nodes] };
        break;
      case 'remove_nodes': {
        const remove = new Set(mutation.nodeIds);
        next = {
          ...next,
          nodes: next.nodes.filter((n) => !remove.has(n.id)),
          edges: next.edges.filter((e) => !remove.has(e.source) && !remove.has(e.target)),
        };
        break;
      }
      case 'add_edges':
        next = { ...next, edges: [...next.edges, ...mutation.edges] };
        break;
      case 'remove_edges': {
        const remove = new Set(mutation.edgeIds);
        next = { ...next, edges: next.edges.filter((e) => !remove.has(e.id)) };
        break;
      }
      case 'update_node':
        next = {
          ...next,
          nodes: next.nodes.map((n) => (n.id === mutation.nodeId ? { ...n, ...mutation.patch } : n)),
        };
        break;
      case 'update_edge':
        next = {
          ...next,
          edges: next.edges.map((e) => (e.id === mutation.edgeId ? { ...e, ...mutation.patch } : e)),
        };
        break;
      case 'set_archetype':
        next = { ...next, archetype: mutation.archetype };
        break;
      case 'set_layout':
        next = { ...next, layout_cache: mutation.layoutCache };
        break;
      case 'set_collapsed':
        next = {
          ...next,
          nodes: next.nodes.map((n) =>
            n.id === mutation.nodeId ? { ...n, collapsed: mutation.collapsed } : n,
          ),
        };
        break;
      default:
        break;
    }
  }

  return finalizeGraph(next);
}

export function runCommand(graph: CanvasGraph, command: CanvasCommand, direction: 'redo' | 'undo'): CanvasGraph {
  return applyMutations(graph, direction === 'redo' ? command.redo : command.undo);
}
