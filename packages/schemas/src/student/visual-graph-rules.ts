export type VisualArchetype =
  | 'mind_map'
  | 'flowchart'
  | 'cycle'
  | 'timeline'
  | 'hierarchy'
  | 'comparison';

export const ALL_VISUAL_NODE_TYPES = [
  'concept',
  'process_step',
  'decision',
  'example',
  'question',
  'definition',
  'formula',
  'note',
] as const;

export type VisualNodeType = (typeof ALL_VISUAL_NODE_TYPES)[number];

export const ALL_VISUAL_EDGE_TYPES = [
  'leads_to',
  'causes',
  'requires',
  'contrasts_with',
  'example_of',
  'part_of',
  'alternative_to',
  'clash',
] as const;

export type VisualEdgeType = (typeof ALL_VISUAL_EDGE_TYPES)[number];

export const TRAVERSAL_EDGE_TYPES = ['leads_to', 'causes', 'alternative_to'] as const;
export const ANNOTATION_EDGE_TYPES = [
  'example_of',
  'part_of',
  'requires',
  'contrasts_with',
] as const;
export const CORE_CYCLE_EDGE_TYPES = ['leads_to', 'causes'] as const;
export const SYMMETRIC_EDGE_TYPES = ['contrasts_with', 'alternative_to', 'clash'] as const;

export const VISUAL_NODE_TYPES_BY_ARCHETYPE: Record<VisualArchetype, readonly VisualNodeType[]> = {
  mind_map: ALL_VISUAL_NODE_TYPES,
  flowchart: ALL_VISUAL_NODE_TYPES,
  cycle: ['concept', 'process_step', 'decision', 'example', 'note'],
  timeline: ['concept', 'process_step', 'decision', 'example', 'definition', 'formula', 'note'],
  hierarchy: ['concept', 'definition', 'example', 'formula', 'note', 'question'],
  comparison: ['concept', 'definition', 'example', 'formula', 'note', 'question'],
};

export const VISUAL_EDGE_TYPES_BY_ARCHETYPE: Record<VisualArchetype, readonly VisualEdgeType[]> = {
  mind_map: ALL_VISUAL_EDGE_TYPES,
  flowchart: ALL_VISUAL_EDGE_TYPES,
  cycle: ['leads_to', 'causes', 'requires', 'example_of'],
  timeline: ['leads_to', 'causes', 'requires', 'example_of'],
  hierarchy: ['part_of', 'example_of', 'requires'],
  comparison: ['part_of', 'contrasts_with', 'example_of', 'requires', 'clash'],
};

export const GRAPH_DEPTH_LIMIT = 6;

export interface VisualGraphIssue {
  path: (string | number)[];
  message: string;
}

export interface GraphForValidation {
  archetype: VisualArchetype;
  root_node_id: string | null;
  groups?: Array<{
    id: string;
    label: string;
    color_token?: string | null;
  }>;
  nodes: Array<{
    id: string;
    type: string;
    title: string;
    body: string;
    depth: number;
    collapsed: boolean;
    status: string;
    origin: string;
    group_id?: string | null;
    event_date?: string | null;
    color_token?: string | null;
    pinned?: { x: number; y: number } | null;
  }>;
  edges: Array<{
    id: string;
    source: string;
    target: string;
    type: string;
    label?: string;
  }>;
}

export interface CollectVisualGraphIssuesOptions {
  validateAiComplete?: boolean;
}

type GraphNode = GraphForValidation['nodes'][number];
type GraphEdge = GraphForValidation['edges'][number];

const TRAVERSAL_EDGE_SET = new Set<string>(TRAVERSAL_EDGE_TYPES);
const CORE_CYCLE_EDGE_SET = new Set<string>(CORE_CYCLE_EDGE_TYPES);
const SYMMETRIC_EDGE_SET = new Set<string>(SYMMETRIC_EDGE_TYPES);
const TIMELINE_ATTACHMENT_TYPES = new Set(['example', 'definition', 'formula', 'note']);
const FLOWCHART_ANNOTATION_ONLY_TYPES = new Set(['example', 'note']);

function pushIssue(issues: VisualGraphIssue[], path: (string | number)[], message: string): void {
  issues.push({ path, message });
}

function canonicalEdgeKey(source: string, target: string, type: string): string {
  if (SYMMETRIC_EDGE_SET.has(type)) {
    const [a, b] = source < target ? [source, target] : [target, source];
    return `${type}:${a}:${b}`;
  }
  return `${type}:${source}:${target}`;
}

function buildNodeMaps(graph: GraphForValidation): {
  nodeById: Map<string, GraphNode>;
  nodeIndexById: Map<string, number>;
} {
  const nodeById = new Map<string, GraphNode>();
  const nodeIndexById = new Map<string, number>();
  for (const [index, node] of graph.nodes.entries()) {
    nodeById.set(node.id, node);
    nodeIndexById.set(node.id, index);
  }
  return { nodeById, nodeIndexById };
}

function nodePath(nodeIndexById: Map<string, number>, nodeId: string, field?: string): (string | number)[] {
  const index = nodeIndexById.get(nodeId);
  if (index === undefined) {
    return ['nodes'];
  }
  return field ? ['nodes', index, field] : ['nodes', index];
}

function edgePath(edgeIndex: number, field?: string): (string | number)[] {
  return field ? ['edges', edgeIndex, field] : ['edges', edgeIndex];
}

function incidentEdges(graph: GraphForValidation, nodeId: string): GraphEdge[] {
  return graph.edges.filter((edge) => edge.source === nodeId || edge.target === nodeId);
}

function outgoingEdges(graph: GraphForValidation, nodeId: string): GraphEdge[] {
  return graph.edges.filter((edge) => edge.source === nodeId);
}

function incomingEdges(graph: GraphForValidation, nodeId: string): GraphEdge[] {
  return graph.edges.filter((edge) => edge.target === nodeId);
}

function getLayoutParents(
  nodeId: string,
  graph: GraphForValidation,
  nodeById: Map<string, GraphNode>,
): string[] {
  const parents = new Set<string>();
  const node = nodeById.get(nodeId);
  if (!node) {
    return [];
  }

  for (const edge of graph.edges) {
    if (edge.type === 'part_of') {
      if (edge.source === nodeId) {
        parents.add(edge.target);
      }
      continue;
    }

    const sourceNode = nodeById.get(edge.source);
    const targetNode = nodeById.get(edge.target);
    if (!sourceNode || !targetNode) {
      continue;
    }

    if (edge.source === nodeId && targetNode.depth < sourceNode.depth) {
      parents.add(edge.target);
    } else if (edge.target === nodeId && sourceNode.depth < targetNode.depth) {
      parents.add(edge.source);
    }
  }

  return [...parents];
}

function computePartOfTreeDepths(rootId: string, graph: GraphForValidation): Map<string, number> {
  const depths = new Map<string, number>();
  depths.set(rootId, 0);
  const queue = [rootId];

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    const currentDepth = depths.get(currentId)!;

    for (const edge of graph.edges) {
      if (edge.type !== 'part_of' || edge.target !== currentId || depths.has(edge.source)) {
        continue;
      }
      depths.set(edge.source, currentDepth + 1);
      queue.push(edge.source);
    }
  }

  return depths;
}

function computeLayoutDepths(
  rootId: string,
  graph: GraphForValidation,
  nodeById: Map<string, GraphNode>,
): Map<string, number> {
  const depths = new Map<string, number>();
  const queue: string[] = [rootId];
  depths.set(rootId, 0);

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    const currentDepth = depths.get(currentId)!;

    for (const edge of graph.edges) {
      let childId: string | null = null;

      if (edge.type === 'part_of' && edge.target === currentId) {
        childId = edge.source;
      } else {
        const sourceNode = nodeById.get(edge.source);
        const targetNode = nodeById.get(edge.target);
        if (!sourceNode || !targetNode) {
          continue;
        }
        if (edge.source === currentId && targetNode.depth > sourceNode.depth) {
          childId = edge.target;
        } else if (edge.target === currentId && sourceNode.depth > targetNode.depth) {
          childId = edge.source;
        }
      }

      if (!childId || depths.has(childId)) {
        continue;
      }

      const parents = getLayoutParents(childId, graph, nodeById);
      if (parents.length !== 1 || parents[0] !== currentId) {
        continue;
      }

      depths.set(childId, currentDepth + 1);
      queue.push(childId);
    }
  }

  return depths;
}

function computeTraversalDepths(rootId: string, graph: GraphForValidation): Map<string, number> {
  const depths = new Map<string, number>();
  const queue: string[] = [rootId];
  depths.set(rootId, 0);

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    const currentDepth = depths.get(currentId)!;

    for (const edge of graph.edges) {
      if (!TRAVERSAL_EDGE_SET.has(edge.type) || edge.source !== currentId) {
        continue;
      }
      const nextDepth = currentDepth + 1;
      const capped = Math.min(nextDepth, GRAPH_DEPTH_LIMIT);
      const existing = depths.get(edge.target);
      if (existing === undefined || capped < existing) {
        depths.set(edge.target, capped);
        queue.push(edge.target);
      }
    }
  }

  return depths;
}

function hasFunctionalGraphCycle(childToParent: Map<string, string>): boolean {
  for (const start of childToParent.keys()) {
    let current: string | undefined = start;
    const seen = new Set<string>();
    while (current) {
      if (seen.has(current)) {
        return true;
      }
      seen.add(current);
      current = childToParent.get(current);
    }
  }
  return false;
}

function hasDirectedCycle(adjacency: Map<string, string[]>): boolean {
  const visiting = new Set<string>();
  const visited = new Set<string>();

  function dfs(nodeId: string): boolean {
    if (visiting.has(nodeId)) {
      return true;
    }
    if (visited.has(nodeId)) {
      return false;
    }
    visiting.add(nodeId);
    for (const next of adjacency.get(nodeId) ?? []) {
      if (dfs(next)) {
        return true;
      }
    }
    visiting.delete(nodeId);
    visited.add(nodeId);
    return false;
  }

  for (const nodeId of adjacency.keys()) {
    if (dfs(nodeId)) {
      return true;
    }
  }
  return false;
}

function reachableFromRoot(rootId: string, graph: GraphForValidation, edgeFilter: (edge: GraphEdge) => boolean): Set<string> {
  const reachable = new Set<string>([rootId]);
  const queue = [rootId];

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    for (const edge of graph.edges) {
      if (!edgeFilter(edge) || edge.source !== currentId || reachable.has(edge.target)) {
        continue;
      }
      reachable.add(edge.target);
      queue.push(edge.target);
    }
  }

  return reachable;
}

function validateGlobalRules(
  graph: GraphForValidation,
  issues: VisualGraphIssue[],
  options: CollectVisualGraphIssuesOptions,
): { nodeById: Map<string, GraphNode>; nodeIndexById: Map<string, number>; rootId: string | null } {
  const { nodeById, nodeIndexById } = buildNodeMaps(graph);
  const allowedNodeTypes = new Set(VISUAL_NODE_TYPES_BY_ARCHETYPE[graph.archetype]);
  const allowedEdgeTypes = new Set(VISUAL_EDGE_TYPES_BY_ARCHETYPE[graph.archetype]);

  for (const [index, node] of graph.nodes.entries()) {
    if (!allowedNodeTypes.has(node.type as VisualNodeType)) {
      pushIssue(issues, ['nodes', index, 'type'], `Node type "${node.type}" is not allowed for ${graph.archetype}`);
    }
    if (node.depth < 0 || node.depth > GRAPH_DEPTH_LIMIT) {
      pushIssue(issues, ['nodes', index, 'depth'], `Depth must be between 0 and ${GRAPH_DEPTH_LIMIT}`);
    }
    if (node.type === 'note' && node.origin !== 'student') {
      pushIssue(issues, ['nodes', index, 'origin'], 'Note nodes must have origin=student');
    }
    if (node.type === 'formula' && node.body.trim().length === 0) {
      pushIssue(issues, ['nodes', index, 'body'], 'Formula nodes must have a non-empty body');
    } else if (options.validateAiComplete) {
      if (node.body.trim().length === 0) {
        pushIssue(issues, ['nodes', index, 'body'], 'AI complete graphs require every node body to contain text');
      }
    } else if (node.body.trim().length === 0 && node.origin !== 'student') {
      pushIssue(issues, ['nodes', index, 'body'], 'Only student-origin drafts may have an empty body');
    }
  }

  for (const [index, edge] of graph.edges.entries()) {
    if (!allowedEdgeTypes.has(edge.type as VisualEdgeType)) {
      pushIssue(issues, edgePath(index, 'type'), `Edge type "${edge.type}" is not allowed for ${graph.archetype}`);
    }
    if (!nodeById.has(edge.source)) {
      pushIssue(issues, edgePath(index, 'source'), `Unknown source node: ${edge.source}`);
    }
    if (!nodeById.has(edge.target)) {
      pushIssue(issues, edgePath(index, 'target'), `Unknown target node: ${edge.target}`);
    }
    if (edge.source === edge.target) {
      pushIssue(issues, edgePath(index), 'Self edges are not allowed');
    }
  }

  const seenEdgeKeys = new Map<string, number>();
  for (const [index, edge] of graph.edges.entries()) {
    const key = canonicalEdgeKey(edge.source, edge.target, edge.type);
    const prior = seenEdgeKeys.get(key);
    if (prior !== undefined) {
      pushIssue(
        issues,
        edgePath(index),
        `Parallel edge with the same source, target, and type as edge at index ${prior}`,
      );
    } else {
      seenEdgeKeys.set(key, index);
    }
  }

  const rootId: string | null = graph.root_node_id;
  if (rootId === null) {
    pushIssue(issues, ['root_node_id'], 'A complete graph needs a root');
    return { nodeById, nodeIndexById, rootId: null };
  }

  const rootNode = nodeById.get(rootId);
  if (!rootNode) {
    pushIssue(issues, ['root_node_id'], 'Root node does not exist');
    return { nodeById, nodeIndexById, rootId: null };
  }

  if (rootNode.depth !== 0) {
    pushIssue(issues, nodePath(nodeIndexById, rootId, 'depth'), 'Root node must have depth 0');
  }

  for (const node of graph.nodes) {
    if (node.id === rootId) {
      continue;
    }
    if (node.depth === 0) {
      pushIssue(
        issues,
        nodePath(nodeIndexById, node.id, 'depth'),
        'Only the root node may have depth 0',
      );
    }
    if (incidentEdges(graph, node.id).length === 0) {
      pushIssue(issues, nodePath(nodeIndexById, node.id), 'Every non-root node must have at least one edge');
    }
  }

  return { nodeById, nodeIndexById, rootId };
}

/**
 * The depth every node must have, derived purely from graph structure.
 *
 * Depth is not an authored property — validateDepths below computes exactly this and
 * rejects any node that disagrees. Exposing it lets the AI boundary derive depth from
 * the structure the model produced instead of asking the model to recompute a graph
 * traversal in its head (which it reliably gets wrong, failing the whole generation).
 *
 * Nodes absent from the returned map have no structurally-implied depth, so whatever
 * they carry is left alone.
 */
export function computeExpectedDepths(
  graph: GraphForValidation,
  rootId: string,
): Map<string, number> {
  const { nodeById } = buildNodeMaps(graph);
  const expected = new Map<string, number>();

  const adopt = (depths: Map<string, number>, clamp = false) => {
    for (const node of graph.nodes) {
      const value = depths.get(node.id);
      if (value === undefined) continue;
      expected.set(node.id, clamp ? Math.min(value, GRAPH_DEPTH_LIMIT) : value);
    }
  };

  if (graph.archetype === 'mind_map') {
    adopt(computeLayoutDepths(rootId, graph, nodeById));
    return expected;
  }

  if (graph.archetype === 'hierarchy' || graph.archetype === 'comparison') {
    adopt(computePartOfTreeDepths(rootId, graph));
    return expected;
  }

  if (graph.archetype === 'flowchart') {
    adopt(computeTraversalDepths(rootId, graph), true);
    return expected;
  }

  if (graph.archetype === 'cycle') {
    const coreNodeIds = new Set<string>();
    for (const edge of graph.edges) {
      if (CORE_CYCLE_EDGE_SET.has(edge.type)) {
        coreNodeIds.add(edge.source);
        coreNodeIds.add(edge.target);
      }
    }
    for (const node of graph.nodes) {
      expected.set(node.id, node.id === rootId ? 0 : coreNodeIds.has(node.id) ? 1 : 2);
    }
    return expected;
  }

  if (graph.archetype === 'timeline') {
    const backboneIds = new Set<string>();
    for (const edge of graph.edges) {
      if (edge.type === 'leads_to') {
        backboneIds.add(edge.source);
        backboneIds.add(edge.target);
      }
    }
    for (const node of graph.nodes) {
      if (node.id === rootId) {
        expected.set(node.id, 0);
      } else if (backboneIds.has(node.id) && !TIMELINE_ATTACHMENT_TYPES.has(node.type)) {
        expected.set(node.id, 1);
      } else if (TIMELINE_ATTACHMENT_TYPES.has(node.type) || backboneIds.has(node.id)) {
        expected.set(node.id, 2);
      } else {
        expected.set(node.id, 1);
      }
    }
    return expected;
  }

  return expected;
}

function depthMessage(archetype: GraphForValidation['archetype'], expected: number): string {
  switch (archetype) {
    case 'mind_map':
      return `Depth must match layout distance from root (${expected})`;
    case 'hierarchy':
    case 'comparison':
      return `Depth must match part_of distance from root (${expected})`;
    case 'flowchart':
      return `Depth must match shortest traversal distance from root (${expected})`;
    case 'cycle':
      return `Depth must be ${expected} for this node in a cycle diagram`;
    case 'timeline':
      return `Depth must be ${expected} for this node in a timeline`;
    default:
      return `Depth must be ${expected}`;
  }
}

function validateDepths(
  graph: GraphForValidation,
  issues: VisualGraphIssue[],
  _nodeById: Map<string, GraphNode>,
  nodeIndexById: Map<string, number>,
  rootId: string,
): void {
  const expectedByNode = computeExpectedDepths(graph, rootId);

  for (const node of graph.nodes) {
    const expected = expectedByNode.get(node.id);
    if (expected === undefined) continue;
    if (node.depth !== expected) {
      pushIssue(
        issues,
        nodePath(nodeIndexById, node.id, 'depth'),
        depthMessage(graph.archetype, expected),
      );
    }
  }
}

function reachesRootThroughLayoutParent(
  nodeId: string,
  rootId: string,
  graph: GraphForValidation,
  nodeById: Map<string, GraphNode>,
): boolean {
  let current = nodeId;
  const seen = new Set<string>();

  while (current !== rootId) {
    if (seen.has(current)) {
      return false;
    }
    seen.add(current);
    const parents = getLayoutParents(current, graph, nodeById);
    if (parents.length !== 1) {
      return false;
    }
    current = parents[0]!;
  }

  return true;
}

function validateMindMap(
  graph: GraphForValidation,
  issues: VisualGraphIssue[],
  nodeById: Map<string, GraphNode>,
  nodeIndexById: Map<string, number>,
  rootId: string,
): void {
  for (const node of graph.nodes) {
    if (node.id === rootId) {
      continue;
    }

    const parents = getLayoutParents(node.id, graph, nodeById);
    if (parents.length === 0) {
      pushIssue(issues, nodePath(nodeIndexById, node.id), 'Mind map node is orphaned from the root');
      continue;
    }
    if (parents.length > 1) {
      pushIssue(
        issues,
        nodePath(nodeIndexById, node.id),
        'Mind map nodes must have exactly one layout parent path to the root',
      );
      continue;
    }
    if (!reachesRootThroughLayoutParent(node.id, rootId, graph, nodeById)) {
      pushIssue(issues, nodePath(nodeIndexById, node.id), 'Mind map node is orphaned from the root');
    }
  }
}

function validateFlowchart(
  graph: GraphForValidation,
  issues: VisualGraphIssue[],
  nodeIndexById: Map<string, number>,
  rootId: string,
): void {
  for (const node of graph.nodes) {
    const incomingTraversal = incomingEdges(graph, node.id).filter((edge) => TRAVERSAL_EDGE_SET.has(edge.type));
    if (node.id !== rootId && incomingTraversal.length === 0) {
      const needsTraversal = !FLOWCHART_ANNOTATION_ONLY_TYPES.has(node.type);
      if (needsTraversal) {
        pushIssue(
          issues,
          nodePath(nodeIndexById, node.id),
          'Flowchart nodes must be reachable through traversal edges from the root',
        );
      }
    }
    if (node.id === rootId && incomingTraversal.length > 0) {
      pushIssue(issues, nodePath(nodeIndexById, node.id), 'Flowchart root must have no incoming traversal edge');
    }
  }

  const traversalAdjacency = new Map<string, string[]>();
  for (const edge of graph.edges) {
    if (!TRAVERSAL_EDGE_SET.has(edge.type)) {
      continue;
    }
    const next = traversalAdjacency.get(edge.source) ?? [];
    next.push(edge.target);
    traversalAdjacency.set(edge.source, next);
  }

  if (hasDirectedCycle(traversalAdjacency)) {
    pushIssue(issues, ['archetype'], 'Flowchart traversal edges must form a directed acyclic graph');
  }

  const nodesWithoutIncomingTraversal = graph.nodes.filter(
    (node) => incomingEdges(graph, node.id).filter((edge) => TRAVERSAL_EDGE_SET.has(edge.type)).length === 0,
  );
  if (nodesWithoutIncomingTraversal.length !== 1 || nodesWithoutIncomingTraversal[0]!.id !== rootId) {
    pushIssue(issues, ['root_node_id'], 'Flowchart must have exactly one root with no incoming traversal edge');
  }

  const traversalReachable = reachableFromRoot(rootId, graph, (edge) => TRAVERSAL_EDGE_SET.has(edge.type));
  for (const node of graph.nodes) {
    if (FLOWCHART_ANNOTATION_ONLY_TYPES.has(node.type)) {
      continue;
    }
    if (!traversalReachable.has(node.id)) {
      pushIssue(
        issues,
        nodePath(nodeIndexById, node.id),
        'Flowchart traversal edges must reach every non-annotation node',
      );
    }
  }

  for (const node of graph.nodes) {
    if (node.type !== 'decision') {
      if (node.type === 'process_step') {
        const hasTraversal = incidentEdges(graph, node.id).some((edge) => TRAVERSAL_EDGE_SET.has(edge.type));
        const onlyAnnotation =
          incidentEdges(graph, node.id).length > 0 &&
          incidentEdges(graph, node.id).every((edge) => !TRAVERSAL_EDGE_SET.has(edge.type));
        if (onlyAnnotation || !hasTraversal) {
          pushIssue(
            issues,
            nodePath(nodeIndexById, node.id),
            'Process nodes cannot rely on annotation edges as their only connection',
          );
        }
      }
      continue;
    }

    const outgoingTraversal = outgoingEdges(graph, node.id).filter((edge) => TRAVERSAL_EDGE_SET.has(edge.type));
    if (outgoingTraversal.length < 2) {
      pushIssue(
        issues,
        nodePath(nodeIndexById, node.id),
        'Decision nodes need at least two outgoing traversal edges',
      );
      continue;
    }

    const hasLeadsTo = outgoingTraversal.some((edge) => edge.type === 'leads_to');
    const hasAlternative = outgoingTraversal.some((edge) => edge.type === 'alternative_to');
    const labels = outgoingTraversal.map((edge) => edge.label?.trim() ?? '');
    const labeledEdges = labels.filter((label) => label.length > 0);
    const distinctLabels = new Set(labeledEdges);

    const validBranching =
      (hasLeadsTo && hasAlternative) ||
      (outgoingTraversal.length >= 2 &&
        labeledEdges.length === outgoingTraversal.length &&
        distinctLabels.size === outgoingTraversal.length);

    if (!validBranching) {
      pushIssue(
        issues,
        nodePath(nodeIndexById, node.id),
        'Decision nodes need distinct traversal labels or one leads_to plus one alternative_to edge',
      );
    }
  }
}

function validateCycle(
  graph: GraphForValidation,
  issues: VisualGraphIssue[],
  nodeIndexById: Map<string, number>,
): void {
  const coreNodeIds = new Set<string>();
  for (const edge of graph.edges) {
    if (CORE_CYCLE_EDGE_SET.has(edge.type)) {
      coreNodeIds.add(edge.source);
      coreNodeIds.add(edge.target);
    }
  }

  if (coreNodeIds.size < 3) {
    pushIssue(issues, ['archetype'], 'Cycle diagrams need at least three core nodes');
    return;
  }

  for (const nodeId of coreNodeIds) {
    const incomingCore = incomingEdges(graph, nodeId).filter((edge) => CORE_CYCLE_EDGE_SET.has(edge.type));
    const outgoingCore = outgoingEdges(graph, nodeId).filter((edge) => CORE_CYCLE_EDGE_SET.has(edge.type));
    if (incomingCore.length !== 1) {
      pushIssue(
        issues,
        nodePath(nodeIndexById, nodeId),
        'Each core node must have exactly one incoming core edge',
      );
    }
    if (outgoingCore.length !== 1) {
      pushIssue(
        issues,
        nodePath(nodeIndexById, nodeId),
        'Each core node must have exactly one outgoing core edge',
      );
    }
  }

  const coreAdjacency = new Map<string, string>();
  for (const edge of graph.edges) {
    if (!CORE_CYCLE_EDGE_SET.has(edge.type)) {
      continue;
    }
    coreAdjacency.set(edge.source, edge.target);
  }

  if (coreAdjacency.size !== coreNodeIds.size) {
    pushIssue(issues, ['archetype'], 'Core nodes must form one connected directed cycle');
    return;
  }

  const visited = new Set<string>();
  let current: string | undefined = [...coreNodeIds][0];
  let steps = 0;
  while (current && !visited.has(current) && steps <= coreNodeIds.size) {
    visited.add(current);
    current = coreAdjacency.get(current);
    steps += 1;
  }

  if (visited.size !== coreNodeIds.size || current !== [...coreNodeIds][0]) {
    pushIssue(issues, ['archetype'], 'Core nodes must form one simple directed cycle');
  }

  for (const node of graph.nodes) {
    if (node.type !== 'example' && node.type !== 'note') {
      continue;
    }
    const attachmentEdges = incidentEdges(graph, node.id).filter(
      (edge) => edge.type === 'example_of' || edge.type === 'requires',
    );
    if (attachmentEdges.length === 0) {
      pushIssue(
        issues,
        nodePath(nodeIndexById, node.id),
        'Cycle attachments must connect to the core through example_of or requires',
      );
    }
    for (const edge of attachmentEdges) {
      const anchorId = edge.source === node.id ? edge.target : edge.source;
      if (!coreNodeIds.has(anchorId)) {
        pushIssue(
          issues,
          nodePath(nodeIndexById, node.id),
          'Cycle attachments must hang from a core node',
        );
      }
    }
  }
}

function validateTimeline(
  graph: GraphForValidation,
  issues: VisualGraphIssue[],
  nodeIndexById: Map<string, number>,
  rootId: string,
): void {
  const leadsToEdges = graph.edges.filter((edge) => edge.type === 'leads_to');
  const pathNodeIds = new Set<string>();
  for (const edge of leadsToEdges) {
    pathNodeIds.add(edge.source);
    pathNodeIds.add(edge.target);
  }

  const incomingLeadsTo = new Map<string, number>();
  const outgoingLeadsTo = new Map<string, number>();
  for (const edge of leadsToEdges) {
    incomingLeadsTo.set(edge.target, (incomingLeadsTo.get(edge.target) ?? 0) + 1);
    outgoingLeadsTo.set(edge.source, (outgoingLeadsTo.get(edge.source) ?? 0) + 1);
  }

  let startCount = 0;
  let endCount = 0;
  for (const nodeId of pathNodeIds) {
    const inCount = incomingLeadsTo.get(nodeId) ?? 0;
    const outCount = outgoingLeadsTo.get(nodeId) ?? 0;
    if (inCount === 0) {
      startCount += 1;
    }
    if (outCount === 0) {
      endCount += 1;
    }
    if (inCount > 1 || outCount > 1) {
      pushIssue(
        issues,
        nodePath(nodeIndexById, nodeId),
        'Timeline leads_to edges must form a simple path',
      );
    }
  }

  if (pathNodeIds.size > 0 && (startCount !== 1 || endCount !== 1)) {
    pushIssue(issues, ['archetype'], 'Timeline leads_to edges must form one directed simple path');
  }

  if (rootId && pathNodeIds.size > 0 && (incomingLeadsTo.get(rootId) ?? 0) !== 0) {
    pushIssue(issues, nodePath(nodeIndexById, rootId), 'Timeline start must have no incoming leads_to edge');
  }

  for (const node of graph.nodes) {
    if (TIMELINE_ATTACHMENT_TYPES.has(node.type)) {
      const attachmentEdges = incidentEdges(graph, node.id).filter(
        (edge) => edge.type === 'example_of' || edge.type === 'requires',
      );
      if (attachmentEdges.length === 0) {
        pushIssue(
          issues,
          nodePath(nodeIndexById, node.id),
          'Timeline attachments must connect to the path through example_of or requires',
        );
      }
      continue;
    }
    if (!pathNodeIds.has(node.id)) {
      pushIssue(
        issues,
        nodePath(nodeIndexById, node.id),
        'Timeline non-annotation nodes must lie on the leads_to path',
      );
    }
  }

  const backboneOrder = new Map<string, number>();
  let order = 0;
  let current: string | undefined = rootId;
  const visited = new Set<string>();
  while (current && !visited.has(current)) {
    visited.add(current);
    backboneOrder.set(current, order);
    order += 1;
    const nextEdge = leadsToEdges.find((edge) => edge.source === current);
    current = nextEdge?.target;
  }

  for (const [edgeIndex, edge] of graph.edges.entries()) {
    if (edge.type !== 'causes') {
      continue;
    }
    const sourceOrder = backboneOrder.get(edge.source);
    const targetOrder = backboneOrder.get(edge.target);
    if (sourceOrder === undefined || targetOrder === undefined) {
      pushIssue(issues, edgePath(edgeIndex, 'type'), 'Causes edges must connect timeline path nodes');
      continue;
    }
    if (targetOrder <= sourceOrder) {
      pushIssue(issues, edgePath(edgeIndex, 'type'), 'Causes edges may only skip forward on the timeline');
    }
  }

  const combinedAdjacency = new Map<string, string[]>();
  for (const edge of graph.edges) {
    if (edge.type === 'leads_to' || edge.type === 'causes') {
      const next = combinedAdjacency.get(edge.source) ?? [];
      next.push(edge.target);
      combinedAdjacency.set(edge.source, next);
    }
  }
  if (hasDirectedCycle(combinedAdjacency)) {
    pushIssue(issues, ['archetype'], 'Timeline must not contain directed cycles');
  }
}

function validateHierarchy(
  graph: GraphForValidation,
  issues: VisualGraphIssue[],
  nodeIndexById: Map<string, number>,
  rootId: string,
): void {
  for (const node of graph.nodes) {
    const outgoingPartOf = outgoingEdges(graph, node.id).filter((edge) => edge.type === 'part_of');
    if (node.id === rootId) {
      if (outgoingPartOf.length > 0) {
        pushIssue(issues, nodePath(nodeIndexById, node.id), 'Hierarchy root must not have an outgoing part_of edge');
      }
      continue;
    }
    if (outgoingPartOf.length !== 1) {
      pushIssue(
        issues,
        nodePath(nodeIndexById, node.id),
        'Every non-root hierarchy node must have exactly one outgoing part_of edge to its parent',
      );
    }
  }

  const partOfAdjacency = new Map<string, string>();
  for (const [edgeIndex, edge] of graph.edges.entries()) {
    if (edge.type !== 'part_of') {
      continue;
    }
    if (partOfAdjacency.has(edge.source)) {
      pushIssue(issues, edgePath(edgeIndex), 'Hierarchy nodes may have only one outgoing part_of edge');
    }
    partOfAdjacency.set(edge.source, edge.target);
  }

  if (hasFunctionalGraphCycle(partOfAdjacency)) {
    pushIssue(issues, ['archetype'], 'Hierarchy part_of edges must be acyclic');
  }

  for (const node of graph.nodes) {
    let current: string | undefined = node.id;
    const seen = new Set<string>();
    while (current && current !== rootId) {
      if (seen.has(current)) {
        pushIssue(issues, nodePath(nodeIndexById, node.id), 'Hierarchy node cannot reach the root');
        break;
      }
      seen.add(current);
      current = partOfAdjacency.get(current);
    }
    if (current !== rootId) {
      pushIssue(issues, nodePath(nodeIndexById, node.id), 'Hierarchy node cannot reach the root');
    }
  }
}

function validateNonComparisonGroups(
  graph: GraphForValidation,
  issues: VisualGraphIssue[],
): void {
  if (graph.archetype === 'comparison') {
    return;
  }
  if ((graph.groups ?? []).length > 0) {
    pushIssue(issues, ['groups'], 'Only comparison graphs may define groups in v1');
  }
}

function groupIdForNode(
  nodeId: string,
  nodeById: Map<string, GraphNode>,
): string | null {
  const node = nodeById.get(nodeId);
  if (!node) {
    return null;
  }
  if (node.group_id != null) {
    return node.group_id;
  }
  return null;
}

function validateClashEdges(
  graph: GraphForValidation,
  issues: VisualGraphIssue[],
  nodeById: Map<string, GraphNode>,
): void {
  for (const [index, edge] of graph.edges.entries()) {
    if (edge.type !== 'clash') {
      continue;
    }
    if (graph.archetype !== 'comparison') {
      pushIssue(issues, edgePath(index, 'type'), 'clash edges are only allowed for comparison');
      continue;
    }
    const sourceGroup = groupIdForNode(edge.source, nodeById);
    const targetGroup = groupIdForNode(edge.target, nodeById);
    if (sourceGroup === null || targetGroup === null) {
      pushIssue(
        issues,
        edgePath(index),
        'clash edges must connect grouped argument nodes',
      );
      continue;
    }
    if (sourceGroup === targetGroup) {
      pushIssue(
        issues,
        edgePath(index),
        'clash edges must connect nodes in different groups',
      );
    }
  }
}

function validateComparisonWithGroups(
  graph: GraphForValidation,
  issues: VisualGraphIssue[],
  nodeById: Map<string, GraphNode>,
  nodeIndexById: Map<string, number>,
): void {
  const groups = graph.groups ?? [];
  if (groups.length < 2 || groups.length > 3) {
    pushIssue(issues, ['groups'], 'Comparison needs exactly 2 or 3 groups');
    return;
  }

  const comparableTypes = new Set(['concept', 'definition', 'example', 'formula', 'note', 'question']);
  for (const group of groups) {
    const members = graph.nodes.filter((node) => node.group_id === group.id && comparableTypes.has(node.type));
    if (members.length === 0) {
      pushIssue(
        issues,
        ['groups'],
        `Comparison group "${group.id}" needs at least one comparable node`,
      );
    }
  }

  const sharedAttributes = graph.nodes.filter(
    (node) => node.group_id == null && node.type === 'concept',
  );
  for (const node of sharedAttributes) {
    const connectedGroups = new Set<string>();
    for (const edge of graph.edges) {
      if (edge.type !== 'contrasts_with') {
        continue;
      }
      const otherId = edge.source === node.id ? edge.target : edge.target === node.id ? edge.source : null;
      if (!otherId) {
        continue;
      }
      const groupId = groupIdForNode(otherId, nodeById);
      if (groupId) {
        connectedGroups.add(groupId);
      }
    }
    if (connectedGroups.size > 0 && connectedGroups.size < 2) {
      pushIssue(
        issues,
        nodePath(nodeIndexById, node.id),
        'Shared attribute nodes must contrast nodes in at least two groups',
      );
    }
  }
}

function validateComparisonLegacy(
  graph: GraphForValidation,
  issues: VisualGraphIssue[],
  nodeIndexById: Map<string, number>,
  rootId: string,
): void {
  const subjectId = rootId;
  const depthOneNodes = graph.nodes.filter((node) => node.depth === 1);
  if (depthOneNodes.length !== 2) {
    pushIssue(issues, ['archetype'], 'Comparison needs exactly two depth-1 branch roots');
    return;
  }

  const branchRoots = depthOneNodes.filter((node) =>
    graph.edges.some(
      (edge) => edge.type === 'part_of' && edge.source === node.id && edge.target === subjectId,
    ),
  );

  if (branchRoots.length !== 2) {
    pushIssue(issues, ['archetype'], 'Comparison needs exactly two depth-1 branch roots linked to the subject');
    return;
  }

  const leftBranch = branchRoots[0]!;
  const rightBranch = branchRoots[1]!;
  const contrastEdges = graph.edges.filter((edge) => edge.type === 'contrasts_with');
  const branchContrast = contrastEdges.filter((edge) => {
    const endpoints = new Set([edge.source, edge.target]);
    return endpoints.has(leftBranch.id) && endpoints.has(rightBranch.id);
  });

  if (branchContrast.length !== 1) {
    pushIssue(
      issues,
      ['archetype'],
      'Comparison needs exactly one contrasts_with edge between the two branch roots',
    );
  }

  const partOfParent = new Map<string, string>();
  for (const edge of graph.edges) {
    if (edge.type === 'part_of') {
      partOfParent.set(edge.source, edge.target);
    }
  }

  function branchForNode(nodeId: string): string | null {
    if (nodeId === subjectId) {
      return null;
    }
    if (nodeId === leftBranch.id) {
      return leftBranch.id;
    }
    if (nodeId === rightBranch.id) {
      return rightBranch.id;
    }

    let current: string | undefined = nodeId;
    const seen = new Set<string>();
    while (current && current !== subjectId) {
      if (seen.has(current)) {
        return null;
      }
      seen.add(current);
      if (current === leftBranch.id) {
        return leftBranch.id;
      }
      if (current === rightBranch.id) {
        return rightBranch.id;
      }
      current = partOfParent.get(current);
    }
    return null;
  }

  for (const node of graph.nodes) {
    if (node.id === subjectId || node.id === leftBranch.id || node.id === rightBranch.id) {
      continue;
    }
    const branchId = branchForNode(node.id);
    if (branchId === null) {
      pushIssue(
        issues,
        nodePath(nodeIndexById, node.id),
        'Comparison nodes must belong to exactly one branch through part_of ancestry',
      );
    }
  }
}

function validateComparison(
  graph: GraphForValidation,
  issues: VisualGraphIssue[],
  nodeById: Map<string, GraphNode>,
  nodeIndexById: Map<string, number>,
  rootId: string,
): void {
  if ((graph.groups ?? []).length > 0) {
    validateComparisonWithGroups(graph, issues, nodeById, nodeIndexById);
    return;
  }
  validateComparisonLegacy(graph, issues, nodeIndexById, rootId);
}

function validateArchetypeStructure(
  graph: GraphForValidation,
  issues: VisualGraphIssue[],
  nodeById: Map<string, GraphNode>,
  nodeIndexById: Map<string, number>,
  rootId: string,
): void {
  validateNonComparisonGroups(graph, issues);
  validateClashEdges(graph, issues, nodeById);

  switch (graph.archetype) {
    case 'mind_map':
      validateMindMap(graph, issues, nodeById, nodeIndexById, rootId);
      break;
    case 'flowchart':
      validateFlowchart(graph, issues, nodeIndexById, rootId);
      break;
    case 'cycle':
      validateCycle(graph, issues, nodeIndexById);
      break;
    case 'timeline':
      validateTimeline(graph, issues, nodeIndexById, rootId);
      break;
    case 'hierarchy':
      validateHierarchy(graph, issues, nodeIndexById, rootId);
      break;
    case 'comparison':
      validateComparison(graph, issues, nodeById, nodeIndexById, rootId);
      break;
    default:
      pushIssue(issues, ['archetype'], `Unknown archetype: ${graph.archetype as string}`);
  }
}

export function collectVisualGraphIssues(
  graph: GraphForValidation,
  options: CollectVisualGraphIssuesOptions = {},
): VisualGraphIssue[] {
  const issues: VisualGraphIssue[] = [];
  const { nodeById, nodeIndexById, rootId } = validateGlobalRules(graph, issues, options);

  if (!rootId) {
    return issues;
  }

  validateDepths(graph, issues, nodeById, nodeIndexById, rootId);
  validateArchetypeStructure(graph, issues, nodeById, nodeIndexById, rootId);

  return issues;
}

export function isArchetypeCompatible(
  graph: GraphForValidation,
  targetArchetype: GraphForValidation['archetype'],
): boolean {
  const candidate =
    targetArchetype === graph.archetype ? graph : { ...graph, archetype: targetArchetype };
  return collectVisualGraphIssues(candidate).length === 0;
}
