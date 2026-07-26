import type { CanvasGraph, VisualArchetype, VisualGraphEdge, VisualGraphNode, VisualNodeType } from '@edrion/schemas';
import type { CanvasCommand } from './canvas-commands';
import { applyMutations } from './canvas-commands';

function newId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
}

export function createNodeId(): string {
  return newId('n');
}

export function createEdgeId(): string {
  return newId('e');
}

export function buildUpdateNodeCommand(
  graph: CanvasGraph,
  nodeId: string,
  patch: Partial<VisualGraphNode>,
  label: string,
): CanvasCommand {
  const before = graph.nodes.find((n) => n.id === nodeId);
  if (!before) throw new Error('Node not found');
  return {
    id: crypto.randomUUID(),
    label,
    createdAt: Date.now(),
    redo: [{ kind: 'update_node', nodeId, patch: { ...patch, origin: 'student' as const } }],
    undo: [{ kind: 'update_node', nodeId, patch: { title: before.title, body: before.body, type: before.type, origin: before.origin } }],
  };
}

export function buildStatusCommand(
  graph: CanvasGraph,
  nodeId: string,
  status: VisualGraphNode['status'],
): CanvasCommand {
  const before = graph.nodes.find((n) => n.id === nodeId);
  if (!before) throw new Error('Node not found');
  return {
    id: crypto.randomUUID(),
    label: status === 'shaky' ? 'Mark shaky' : 'Resolve',
    createdAt: Date.now(),
    redo: [{ kind: 'update_node', nodeId, patch: { status } }],
    undo: [{ kind: 'update_node', nodeId, patch: { status: before.status } }],
  };
}

export function buildAddNodeCommand(
  _graph: CanvasGraph,
  node: VisualGraphNode,
  edges: VisualGraphEdge[],
  label: string,
): CanvasCommand {
  return {
    id: crypto.randomUUID(),
    label,
    createdAt: Date.now(),
    redo: [
      { kind: 'add_nodes', nodes: [node] },
      { kind: 'add_edges', edges },
    ],
    undo: [
      { kind: 'remove_edges', edgeIds: edges.map((e) => e.id) },
      { kind: 'remove_nodes', nodeIds: [node.id] },
    ],
  };
}

export function buildRemoveNodesCommand(graph: CanvasGraph, nodeIds: string[], label: string): CanvasCommand {
  const remove = new Set(nodeIds);
  const nodes = graph.nodes.filter((n) => remove.has(n.id));
  const edges = graph.edges.filter((e) => remove.has(e.source) || remove.has(e.target));
  return {
    id: crypto.randomUUID(),
    label,
    createdAt: Date.now(),
    redo: [
      { kind: 'remove_edges', edgeIds: edges.map((e) => e.id) },
      { kind: 'remove_nodes', nodeIds: [...remove] },
    ],
    undo: [
      { kind: 'add_nodes', nodes },
      { kind: 'add_edges', edges },
    ],
  };
}

export function buildApplyPatchCommand(
  _graph: CanvasGraph,
  nodes: VisualGraphNode[],
  edges: VisualGraphEdge[],
  label: string,
): CanvasCommand {
  return {
    id: crypto.randomUUID(),
    label,
    createdAt: Date.now(),
    redo: [
      { kind: 'add_nodes', nodes },
      { kind: 'add_edges', edges },
    ],
    undo: [
      { kind: 'remove_edges', edgeIds: edges.map((e) => e.id) },
      { kind: 'remove_nodes', nodeIds: nodes.map((n) => n.id) },
    ],
  };
}

export function createStudentNode(
  type: VisualNodeType,
  graph: CanvasGraph,
  title = 'New idea',
): VisualGraphNode {
  const isFirst = graph.nodes.length === 0;
  return {
    id: createNodeId(),
    type,
    title,
    body: '',
    depth: isFirst ? 0 : 1,
    collapsed: false,
    status: 'normal',
    origin: 'student',
  };
}

export function defaultNoteEdge(
  archetype: VisualArchetype,
  parentId: string,
  noteId: string,
): VisualGraphEdge {
  const type =
    archetype === 'mind_map' || archetype === 'hierarchy' || archetype === 'comparison'
      ? 'part_of'
      : 'requires';
  return {
    id: createEdgeId(),
    source: type === 'part_of' ? noteId : parentId,
    target: type === 'part_of' ? parentId : noteId,
    type,
  };
}

export function applyCommand(graph: CanvasGraph, command: CanvasCommand): CanvasGraph {
  return applyMutations(graph, command.redo);
}
