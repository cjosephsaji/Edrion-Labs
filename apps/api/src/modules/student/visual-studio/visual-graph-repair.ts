import { randomUUID } from 'node:crypto';
import type { CanvasGraph, CompleteCanvasGraph, VisualGraphEdge, VisualGraphNode } from '@edrion/schemas';
import { completeCanvasGraphSchema } from '@edrion/schemas';

const MAX_TITLE_LEN = 120;
const ORPHAN_DROP_RATIO = 0.2;

function truncateTitle(title: string): string {
  const trimmed = title.trim();
  if (trimmed.length <= MAX_TITLE_LEN) return trimmed;
  return `${trimmed.slice(0, MAX_TITLE_LEN - 1)}…`;
}

function collisionFreeId(existing: Set<string>, preferred: string): string {
  if (!existing.has(preferred)) return preferred;
  let suffix = 2;
  while (existing.has(`${preferred}_${suffix}`)) suffix += 1;
  return `${preferred}_${suffix}`;
}

/** Deterministic repair pass before a graph is committed from generation. */
export function repairGeneratedGraph(
  raw: CompleteCanvasGraph,
  options?: { allowLlmRepair?: boolean },
): { graph: CompleteCanvasGraph; repaired: boolean; droppedOrphans: number } {
  void options?.allowLlmRepair;
  const nodeIds = new Set(raw.nodes.map((n) => n.id));
  let droppedOrphans = 0;

  const edges = raw.edges.filter((edge) => {
    const ok = nodeIds.has(edge.source) && nodeIds.has(edge.target) && edge.source !== edge.target;
    if (!ok) droppedOrphans += 1;
    return ok;
  });

  const maxDrops = Math.floor(raw.nodes.length * ORPHAN_DROP_RATIO);
  if (droppedOrphans > maxDrops) {
    throw new Error('GRAPH_REPAIR_EXCESS_ORPHANS');
  }

  const connected = new Set<string>();
  for (const edge of edges) {
    connected.add(edge.source);
    connected.add(edge.target);
  }
  const orphanNodes = raw.nodes.filter((n) => !connected.has(n.id) && raw.nodes.length > 1);
  if (orphanNodes.length > maxDrops) {
    throw new Error('GRAPH_REPAIR_EXCESS_ORPHANS');
  }

  const usedIds = new Set<string>();
  const nodes: VisualGraphNode[] = raw.nodes.map((node) => {
    const id = collisionFreeId(usedIds, node.id);
    usedIds.add(id);
    return {
      ...node,
      id,
      title: truncateTitle(node.title),
      body: node.body?.trim() ? node.body.trim() : undefined,
      pinned: undefined,
    };
  });

  const idRemap = new Map(raw.nodes.map((n, i) => [n.id, nodes[i]!.id]));
  const remappedEdges: VisualGraphEdge[] = edges.map((edge) => ({
    ...edge,
    id: collisionFreeId(new Set(), edge.id),
    source: idRemap.get(edge.source) ?? edge.source,
    target: idRemap.get(edge.target) ?? edge.target,
  }));

  const graph = completeCanvasGraphSchema.parse({
    ...raw,
    nodes,
    edges: remappedEdges,
    layout_cache: undefined,
  });

  return { graph, repaired: droppedOrphans > 0 || nodes.some((n, i) => n.id !== raw.nodes[i]!.id), droppedOrphans };
}

export function stripCoordinatesForGeneration(graph: CanvasGraph): CanvasGraph {
  return {
    ...graph,
    nodes: graph.nodes.map((node) => {
      const { pinned: _pinned, ...rest } = node as VisualGraphNode & { pinned?: unknown };
      return rest;
    }),
    layout_cache: undefined,
  };
}

export function newLocalGraphId(prefix = 'n'): string {
  return `${prefix}_${randomUUID().replace(/-/g, '').slice(0, 8)}`;
}
