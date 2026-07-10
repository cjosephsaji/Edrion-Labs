/// <reference lib="webworker" />
import ELK from 'elkjs/lib/elk.bundled.js';
import type {
  LayoutAlgorithm,
  LayoutEdgeInput,
  LayoutNodeInput,
  LayoutPositionMap,
  LayoutRequestMessage,
  LayoutResponseMessage,
} from './layout-types';

const elk = new ELK();
const TRAVERSAL_TYPES = new Set(['leads_to', 'causes', 'alternative_to']);
const TIMELINE_ATTACHMENT_TYPES = new Set(['example', 'definition', 'formula', 'note']);

function nodeMap(nodes: LayoutNodeInput[]) {
  return new Map(nodes.map((node) => [node.id, node]));
}

function reversePartOfEdges(edges: LayoutEdgeInput[]): Array<{ id: string; source: string; target: string }> {
  return edges
    .filter((edge) => edge.type === 'part_of')
    .map((edge) => ({ id: edge.id, source: edge.target, target: edge.source }));
}

function traversalEdges(edges: LayoutEdgeInput[]): Array<{ id: string; source: string; target: string }> {
  return edges
    .filter((edge) => TRAVERSAL_TYPES.has(edge.type))
    .map((edge) => ({ id: edge.id, source: edge.source, target: edge.target }));
}

async function runElk(
  nodes: LayoutNodeInput[],
  edges: Array<{ id: string; source: string; target: string }>,
  layoutOptions: Record<string, string>,
): Promise<LayoutPositionMap> {
  const graph = {
    id: 'root',
    layoutOptions,
    children: nodes.map((node) => ({
      id: node.id,
      width: node.width,
      height: node.height,
    })),
    edges: edges.map((edge) => ({
      id: edge.id,
      sources: [edge.source],
      targets: [edge.target],
    })),
  };

  const layouted = await elk.layout(graph);
  const positions: LayoutPositionMap = {};
  for (const child of layouted.children ?? []) {
    if (child.id && child.x != null && child.y != null) {
      positions[child.id] = { x: child.x, y: child.y };
    }
  }
  return positions;
}

function layoutCycle(
  nodes: LayoutNodeInput[],
  edges: LayoutEdgeInput[],
  rootNodeId: string | null,
): LayoutPositionMap {
  const positions: LayoutPositionMap = {};
  if (!rootNodeId) return positions;

  const byId = nodeMap(nodes);
  const coreIds: string[] = [];
  const visited = new Set<string>();
  let current: string | null = rootNodeId;

  while (current && !visited.has(current)) {
    visited.add(current);
    coreIds.push(current);
    const nextEdge = edges.find(
      (edge) =>
        TRAVERSAL_TYPES.has(edge.type) && edge.source === current && byId.has(edge.target),
    );
    current = nextEdge?.target ?? null;
    if (current === rootNodeId) break;
  }

  const coreCount = Math.max(coreIds.length, 1);
  const radius = Math.max(180, (coreCount * 64) / (2 * Math.PI));

  coreIds.forEach((id, index) => {
    const angle = (index / coreCount) * Math.PI * 2 - Math.PI / 2;
    positions[id] = {
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
    };
  });

  for (const node of nodes) {
    if (positions[node.id]) continue;
    const parentEdge = edges.find(
      (edge) =>
        edge.target === node.id &&
        (TRAVERSAL_TYPES.has(edge.type) || edge.type === 'requires' || edge.type === 'example_of'),
    );
    const parentId = parentEdge?.source;
    if (!parentId) {
      positions[node.id] = { x: 0, y: 0 };
      continue;
    }
    const parentPos = positions[parentId];
    if (!parentPos) {
      positions[node.id] = { x: 0, y: 0 };
      continue;
    }
    const parentIndex = coreIds.indexOf(parentId);
    const angle =
      parentIndex >= 0
        ? (parentIndex / coreCount) * Math.PI * 2 - Math.PI / 2
        : Math.atan2(parentPos.y, parentPos.x);
    const dist = radius + 110;
    positions[node.id] = {
      x: Math.cos(angle) * dist,
      y: Math.sin(angle) * dist,
    };
  }

  return positions;
}

function layoutTimeline(
  nodes: LayoutNodeInput[],
  edges: LayoutEdgeInput[],
  rootNodeId: string | null,
): LayoutPositionMap {
  const positions: LayoutPositionMap = {};
  if (!rootNodeId) return positions;

  const backbone: string[] = [];
  const seen = new Set<string>();
  let current: string | null = rootNodeId;
  while (current && !seen.has(current)) {
    seen.add(current);
    backbone.push(current);
    const next = edges.find(
      (edge) => edge.type === 'leads_to' && edge.source === current,
    )?.target;
    current = next && !seen.has(next) ? next : null;
  }

  const byId = nodeMap(nodes);
  backbone.forEach((id, index) => {
    const node = byId.get(id);
    if (!node) return;
    if (TIMELINE_ATTACHMENT_TYPES.has(node.type)) {
      const laneY = node.type === 'example' || node.type === 'note' ? 170 : -170;
      positions[id] = { x: index * 280, y: laneY };
    } else {
      positions[id] = { x: index * 280, y: 0 };
    }
  });

  for (const node of nodes) {
    if (positions[node.id]) continue;
    const attachEdge = edges.find(
      (edge) =>
        edge.target === node.id &&
        (edge.type === 'example_of' || edge.type === 'requires' || edge.type === 'part_of'),
    );
    const parentPos = attachEdge ? positions[attachEdge.source] : null;
    if (!parentPos) {
      positions[node.id] = { x: 0, y: 0 };
      continue;
    }
    const laneY =
      node.type === 'example' || node.type === 'note'
        ? parentPos.y + 170
        : node.type === 'definition' || node.type === 'formula'
          ? parentPos.y - 170
          : parentPos.y;
    positions[node.id] = { x: parentPos.x + 40, y: laneY };
  }

  return positions;
}

async function layoutComparison(
  nodes: LayoutNodeInput[],
  edges: LayoutEdgeInput[],
  rootNodeId: string | null,
): Promise<LayoutPositionMap> {
  const positions: LayoutPositionMap = {};
  if (!rootNodeId) return positions;

  positions[rootNodeId] = { x: 0, y: 0 };

  const branchRoots = edges
    .filter((edge) => edge.type === 'part_of' && edge.source !== rootNodeId && edge.target === rootNodeId)
    .map((edge) => edge.source)
    .sort();

  const offsets = [-320, 320];
  for (const [index, branchRootId] of branchRoots.entries()) {
    const branchNodeIds = new Set<string>();
    const queue = [branchRootId];
    while (queue.length > 0) {
      const id = queue.shift()!;
      if (branchNodeIds.has(id) || id === rootNodeId) continue;
      branchNodeIds.add(id);
      for (const edge of edges) {
        if (edge.type === 'part_of' && edge.target === id && !branchNodeIds.has(edge.source)) {
          queue.push(edge.source);
        }
      }
    }

    const branchNodes = nodes.filter((node) => branchNodeIds.has(node.id));
    const branchEdges = reversePartOfEdges(
      edges.filter((edge) => branchNodeIds.has(edge.source) && branchNodeIds.has(edge.target)),
    );
    const branchPositions = await runElk(branchNodes, branchEdges, {
      'elk.algorithm': 'org.eclipse.elk.layered',
      'elk.direction': 'DOWN',
      'org.eclipse.elk.spacing.nodeNode': '52',
      'org.eclipse.elk.layered.spacing.nodeNodeBetweenLayers': '88',
    });

    const offsetX = offsets[index] ?? (index + 1) * 320;
    for (const [id, pos] of Object.entries(branchPositions)) {
      positions[id] = { x: pos.x + offsetX, y: pos.y + 170 };
    }
  }

  for (const node of nodes) {
    if (!positions[node.id]) positions[node.id] = { x: 0, y: 120 };
  }

  return positions;
}

async function computeLayout(
  message: LayoutRequestMessage,
): Promise<{ positions: LayoutPositionMap; algorithm: LayoutAlgorithm }> {
  const { archetype, nodes, edges, rootNodeId } = message;

  switch (archetype) {
    case 'mind_map': {
      const positions = await runElk(nodes, reversePartOfEdges(edges), {
        'elk.algorithm': 'org.eclipse.elk.radial',
        'org.eclipse.elk.spacing.nodeNode': '56',
        'org.eclipse.elk.spacing.componentComponent': '44',
      });
      return { positions, algorithm: 'elk_radial' };
    }
    case 'flowchart': {
      const positions = await runElk(nodes, traversalEdges(edges), {
        'elk.algorithm': 'org.eclipse.elk.layered',
        'elk.direction': 'DOWN',
        'elk.edgeRouting': 'ORTHOGONAL',
        'org.eclipse.elk.spacing.nodeNode': '52',
        'org.eclipse.elk.layered.spacing.nodeNodeBetweenLayers': '88',
        'org.eclipse.elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
      });
      return { positions, algorithm: 'elk_layered' };
    }
    case 'hierarchy': {
      const positions = await runElk(nodes, reversePartOfEdges(edges), {
        'elk.algorithm': 'org.eclipse.elk.mrtree',
        'elk.direction': 'DOWN',
        'org.eclipse.elk.spacing.nodeNode': '48',
        'org.eclipse.elk.layered.spacing.nodeNodeBetweenLayers': '76',
      });
      return { positions, algorithm: 'elk_mrtree' };
    }
    case 'cycle':
      return { positions: layoutCycle(nodes, edges, rootNodeId), algorithm: 'custom_cycle' };
    case 'timeline':
      return { positions: layoutTimeline(nodes, edges, rootNodeId), algorithm: 'custom_timeline' };
    case 'comparison':
      return {
        positions: await layoutComparison(nodes, edges, rootNodeId),
        algorithm: 'custom_comparison',
      };
    default:
      throw new Error(`Unsupported archetype: ${archetype satisfies never}`);
  }
}

self.onmessage = (event: MessageEvent<LayoutRequestMessage>) => {
  void (async () => {
    try {
      const result = await computeLayout(event.data);
      const response: LayoutResponseMessage = {
        requestId: event.data.requestId,
        positions: result.positions,
        algorithm: result.algorithm,
      };
      self.postMessage(response);
    } catch (error) {
      const response: LayoutResponseMessage = {
        requestId: event.data.requestId,
        error: error instanceof Error ? error.message : 'Layout failed',
      };
      self.postMessage(response);
    }
  })();
};

export {};
