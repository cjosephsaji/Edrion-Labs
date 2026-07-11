'use client';

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Background,
  MiniMap,
  Position,
  ReactFlow,
  useReactFlow,
  type Edge,
  type Node,
  type OnSelectionChangeParams,
} from '@xyflow/react';
import type { CanvasGraph, VisualArchetype, VisualNodeType } from '@edrion/schemas';
import { CanvasErrorState } from './CanvasErrorState';
import { useTheme } from '@/lib/theme';
import { computeVisibility } from '@/lib/visual-studio/canvas-visibility';
import {
  getCachedPositions,
  mergeLayoutCache,
  NODE_DIMENSIONS,
  requestGraphLayout,
} from '@/lib/visual-studio/layout-client';
import { isLayoutErrorMessage } from '@/lib/visual-studio/layout-types';
import { buildNodeAriaLabel, findNearestNodeInDirection } from '@/lib/visual-studio/node-navigation';
import { LARGE_GRAPH_CULLING_THRESHOLD } from '@/lib/visual-studio/canvas-export';
import { useVisualCanvasStore, useVisualCanvasStoreApi } from '@/lib/visual-studio/use-canvas-store';
import { CanvasKeyboardInstructions } from './CanvasKeyboardHelp';
import {
  buildMemoryDiffPresentation,
  memoryEdgeStroke,
  memoryNodeClassName,
} from './MemoryDiffOverlay';
import { ConceptNode } from './nodes/ConceptNode';
import { ProcessStepNode } from './nodes/ProcessStepNode';
import { DecisionNode } from './nodes/DecisionNode';
import { ExampleNode } from './nodes/ExampleNode';
import { QuestionNode } from './nodes/QuestionNode';
import { DefinitionNode } from './nodes/DefinitionNode';
import { FormulaNode } from './nodes/FormulaNode';
import { NoteNode } from './nodes/NoteNode';
import { SemanticEdge } from './semantic-edge';
import type { VisualNodeData } from './nodes/BaseVisualNode';

const DEFAULT_NODE_SIZE = { width: 240, height: 120 } as const;

function nodeSize(type: VisualNodeType) {
  return NODE_DIMENSIONS[type] ?? DEFAULT_NODE_SIZE;
}

/**
 * Edges attach on the sides that match each archetype's layout axis, so an edge
 * leaves a node on the side it actually travels toward.
 */
const HANDLE_SIDES: Record<VisualArchetype, { target: Position; source: Position }> = {
  mind_map: { target: Position.Left, source: Position.Right },
  flowchart: { target: Position.Top, source: Position.Bottom },
  hierarchy: { target: Position.Top, source: Position.Bottom },
  cycle: { target: Position.Left, source: Position.Right },
  timeline: { target: Position.Left, source: Position.Right },
  comparison: { target: Position.Left, source: Position.Right },
};

function handleSides(archetype: VisualArchetype) {
  return HANDLE_SIDES[archetype] ?? HANDLE_SIDES.flowchart;
}

const nodeTypes = {
  concept: ConceptNode,
  process_step: ProcessStepNode,
  decision: DecisionNode,
  example: ExampleNode,
  question: QuestionNode,
  definition: DefinitionNode,
  formula: FormulaNode,
  note: NoteNode,
};

const edgeTypes = {
  semantic: SemanticEdge,
};

function buildStepNumbers(graph: CanvasGraph, rootId: string | null): Map<string, number> {
  const order = new Map<string, number>();
  if (!rootId) return order;

  let step = 1;
  const seen = new Set<string>();
  const queue = [rootId];
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    const node = graph.nodes.find((entry) => entry.id === id);
    if (node?.type === 'process_step') order.set(id, step++);
    for (const edge of graph.edges) {
      if ((edge.type === 'leads_to' || edge.type === 'causes') && edge.source === id) {
        queue.push(edge.target);
      }
    }
  }
  return order;
}

function CanvasViewportControls({
  showMinimap,
  graphTitle,
  fitViewNonce,
}: {
  showMinimap: boolean;
  graphTitle: string;
  fitViewNonce: number;
}) {
  const { fitView } = useReactFlow();
  const { reducedMotion } = useTheme();
  const graph = useVisualCanvasStore((state) => state.graph);
  const nodeCount = graph.nodes.length;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fitView({ padding: 0.2, duration: 0 });
    }, 60);
    return () => window.clearTimeout(timer);
  }, [fitView, graph.archetype, graph.nodes.length]);

  useEffect(() => {
    if (fitViewNonce === 0) return;
    void fitView({ padding: 0.2, duration: reducedMotion ? 0 : 260 });
  }, [fitView, fitViewNonce, reducedMotion]);

  return (
    <>
      <svg aria-hidden className="pointer-events-none absolute h-0 w-0">
        <defs>
          <marker
            id="thinking-arrow-solid"
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--st-canvasEdge)" />
          </marker>
          <marker
            id="thinking-arrow-dashed"
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--st-canvasAlternative)" />
          </marker>
        </defs>
      </svg>
      <Background gap={24} size={1} color="var(--st-canvasGrid)" />
      {showMinimap && nodeCount <= LARGE_GRAPH_CULLING_THRESHOLD ? (
        <MiniMap
          className="!bottom-4 !right-4 hidden min-[921px]:block"
          pannable
          zoomable
          aria-label={`Minimap for ${graphTitle}`}
        />
      ) : null}
    </>
  );
}

function ThinkingCanvasInner({
  readOnly = true,
  ghostNodes = [],
  ghostEdges = [],
  onNodeTap,
  onNodeLongPress,
  onNodeDoubleClick,
  onOpenActions,
  onEditSelected,
  onDeleteSelected,
}: {
  readOnly?: boolean;
  ghostNodes?: import('@edrion/schemas').VisualGraphNode[];
  ghostEdges?: import('@edrion/schemas').VisualGraphEdge[];
  onNodeTap?: (nodeId: string) => void;
  onNodeLongPress?: (nodeId: string) => void;
  onNodeDoubleClick?: (nodeId: string) => void;
  onOpenActions?: () => void;
  onEditSelected?: () => void;
  onDeleteSelected?: () => void;
}) {
  const store = useVisualCanvasStoreApi();
  const canvasId = useVisualCanvasStore((state) => state.canvasId);
  const graph = useVisualCanvasStore((state) => state.graph);
  const selectedNodeId = useVisualCanvasStore((state) => state.selectedNodeId);
  const layoutRequestId = useVisualCanvasStore((state) => state.layoutRequestId);
  const fitViewNonce = useVisualCanvasStore((state) => state.fitViewNonce);
  const memoryDiff = useVisualCanvasStore((state) => state.memoryDiff);
  const isDragging = useVisualCanvasStore((state) => state.isDragging);
  const { reducedMotion } = useTheme();
  const [viewportZoom, setViewportZoom] = useState(1);
  const [isViewportMoving, setIsViewportMoving] = useState(false);
  const [layoutError, setLayoutError] = useState<string | null>(null);
  const sides = handleSides(graph.archetype);
  const layoutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeLayoutRequest = useRef(layoutRequestId);

  const isLargeGraph = graph.nodes.length > LARGE_GRAPH_CULLING_THRESHOLD;
  const showNodeBodies = !isLargeGraph || viewportZoom >= 0.55;
  const showEdgeLabels = !isLargeGraph || viewportZoom >= 0.65;

  const visibility = useMemo(() => computeVisibility(graph), [graph]);
  const stepNumbers = useMemo(
    () => buildStepNumbers(graph, graph.root_node_id),
    [graph, graph.root_node_id],
  );
  const memoryPresentation = useMemo(
    () => buildMemoryDiffPresentation(memoryDiff, graph),
    [graph, memoryDiff],
  );

  // No grid fallback: an un-laid-out graph is a failure, not a layout. Rendering
  // nodes at made-up coordinates would silently pass a broken canvas off as a design.
  const positions = useMemo(() => getCachedPositions(graph), [graph]);

  const toggleCollapse = useCallback(
    (nodeId: string) => {
      const current = store.getState().graph.nodes.find((node) => node.id === nodeId);
      if (!current) return;
      store.getState().setGraph({
        ...store.getState().graph,
        nodes: store.getState().graph.nodes.map((node) =>
          node.id === nodeId ? { ...node, collapsed: !node.collapsed } : node,
        ),
      });
      store.getState().bumpLayoutRequest();
    },
    [store],
  );

  useEffect(() => {
    activeLayoutRequest.current = layoutRequestId;
    if (layoutTimerRef.current) clearTimeout(layoutTimerRef.current);

    layoutTimerRef.current = setTimeout(() => {
      const state = store.getState();
      const currentGraph = state.graph;
      const visible = computeVisibility(currentGraph).visibleNodeIds;
      const cached = getCachedPositions(currentGraph);
      const allVisibleCached =
        cached &&
        [...visible].every((id) => cached[id] != null) &&
        Object.keys(cached).length >= visible.size;

      if (allVisibleCached) return;

      const requestId = state.layoutRequestId;
      void requestGraphLayout(currentGraph, visible, requestId)
        .then((response) => {
          if (isLayoutErrorMessage(response)) {
            setLayoutError(response.error);
            return;
          }
          if (response.requestId < store.getState().layoutRequestId) return;
          const nextCache = mergeLayoutCache(currentGraph, response.positions, response.algorithm);
          setLayoutError(null);
          store.getState().setGraph({
            ...currentGraph,
            layout_cache: nextCache,
          });
        })
        .catch((error: unknown) => {
          console.error('[visual-studio] ELK layout failed', error);
          setLayoutError(error instanceof Error ? error.message : 'Layout engine failed');
        });
    }, 80);

    return () => {
      if (layoutTimerRef.current) clearTimeout(layoutTimerRef.current);
    };
  }, [graph, layoutRequestId, store]);

  const flowNodes: Node<VisualNodeData>[] = useMemo(() => {
    const connectedLabelsByNode = new Map<string, string[]>();
    for (const edge of graph.edges) {
      if (!visibility.visibleNodeIds.has(edge.source) || !visibility.visibleNodeIds.has(edge.target)) {
        continue;
      }
      const label = edge.label ?? edge.type.replace(/_/g, ' ');
      connectedLabelsByNode.set(edge.source, [...(connectedLabelsByNode.get(edge.source) ?? []), label]);
      connectedLabelsByNode.set(edge.target, [...(connectedLabelsByNode.get(edge.target) ?? []), label]);
    }

    return graph.nodes
      .filter((node) => visibility.visibleNodeIds.has(node.id))
      .map((node) => {
        const size = nodeSize(node.type);
        const pos = positions?.[node.id] ?? { x: 0, y: 0 };
        const hiddenCount = visibility.hiddenCounts.get(node.id) ?? 0;
        const memoryRole = memoryPresentation?.nodeRoles.get(node.id);
        const connectionSummary = connectedLabelsByNode.get(node.id);
        const ariaLabel = [
          buildNodeAriaLabel(node, hiddenCount),
          connectionSummary?.length ? `connected by ${connectionSummary.join('; ')}` : null,
        ]
          .filter(Boolean)
          .join(', ');
        return {
          id: node.id,
          type: node.type,
          position: pos,
          draggable: !readOnly,
          selectable: true,
          width: size.width,
          height: size.height,
          ariaLabel,
          data: {
            type: node.type,
            node,
            selected: selectedNodeId === node.id,
            hiddenCount,
            stepNumber: stepNumbers.get(node.id),
            onToggleCollapse: hiddenCount > 0 || node.collapsed ? () => toggleCollapse(node.id) : undefined,
            showBody: showNodeBodies,
            targetPosition: sides.target,
            sourcePosition: sides.source,
            className: memoryNodeClassName(memoryRole),
            onTap: onNodeTap ? () => onNodeTap(node.id) : undefined,
            onLongPress: onNodeLongPress ? () => onNodeLongPress(node.id) : undefined,
            onDoubleActivate: onNodeDoubleClick ? () => onNodeDoubleClick(node.id) : undefined,
          },
          className: `${reducedMotion ? '' : 'thinking-flow-node'} ${memoryNodeClassName(memoryRole)}`.trim(),
        };
      })
      .concat(
        (memoryPresentation?.ghostNodes ?? []).map((ghost, index) => {
          const parentPos = ghost.suggestedParentStudentNodeId
            ? positions?.[ghost.suggestedParentStudentNodeId]
            : undefined;
          const size = nodeSize(ghost.node.type);
          const pos = parentPos
            ? { x: parentPos.x + 40, y: parentPos.y + 120 + index * 24 }
            : { x: (index % 3) * 280, y: 480 + Math.floor(index / 3) * 180 };
          return {
            id: ghost.id,
            type: ghost.node.type,
            position: pos,
            draggable: false,
            selectable: false,
            width: size.width,
            height: size.height,
            ariaLabel: `Missing idea: ${ghost.node.title}`,
            data: {
              type: ghost.node.type,
              node: ghost.node,
              selected: false,
              hiddenCount: 0,
              stepNumber: undefined,
              onToggleCollapse: undefined,
              showBody: true,
              targetPosition: sides.target,
              sourcePosition: sides.source,
              className: memoryNodeClassName('ghost'),
              onTap: undefined,
              onLongPress: undefined,
              onDoubleActivate: undefined,
            },
            className: `memory-node--ghost ${reducedMotion ? '' : 'thinking-flow-node'}`.trim(),
          };
        }),
      )
      .concat(
        ghostNodes
          .filter((node) => !graph.nodes.some((entry) => entry.id === node.id))
          .map((node, index) => {
            const anchorPos = positions?.[ghostEdges[0]?.source ?? node.id] ?? { x: 0, y: 0 };
            const size = nodeSize(node.type);
            return {
              id: `proposal-ghost-${node.id}`,
              type: node.type,
              position: { x: anchorPos.x + 48 + index * 16, y: anchorPos.y + 96 + index * 20 },
              draggable: false,
              selectable: false,
              width: size.width,
              height: size.height,
              ariaLabel: `Proposed idea: ${node.title}`,
              data: {
                type: node.type,
                node,
                selected: false,
                hiddenCount: 0,
                stepNumber: undefined,
                onToggleCollapse: undefined,
                showBody: true,
                targetPosition: sides.target,
                sourcePosition: sides.source,
                className: 'opacity-60',
                onTap: undefined,
                onLongPress: undefined,
                onDoubleActivate: undefined,
              },
              className: 'thinking-flow-node opacity-60 pointer-events-none',
            };
          }),
      );
  }, [
    graph.nodes,
    graph.edges,
    ghostNodes,
    ghostEdges,
    positions,
    visibility,
    selectedNodeId,
    stepNumbers,
    toggleCollapse,
    readOnly,
    reducedMotion,
    memoryPresentation,
    showNodeBodies,
    sides,
    onNodeTap,
    onNodeLongPress,
    onNodeDoubleClick,
  ]);

  const flowEdges: Edge[] = useMemo(() => {
    return graph.edges
      .filter(
        (edge) =>
          visibility.visibleNodeIds.has(edge.source) && visibility.visibleNodeIds.has(edge.target),
      )
      .map((edge) => {
        const sourceNode = graph.nodes.find((node) => node.id === edge.source);
        const dashed =
          edge.type === 'alternative_to' || sourceNode?.origin === 'alternative_path';
        const memoryRole = memoryPresentation?.edgeRoles.get(edge.id);
        return {
          id: edge.id,
          source: edge.source,
          target: edge.target,
          type: 'semantic',
          data: {
            archetype: graph.archetype,
            edgeType: edge.type,
            // edge.label is optional; fall back to the semantic type so an edge always
            // says what the relationship is rather than rendering as a bare line.
            label: edge.label ?? edge.type.replace(/_/g, ' '),
            dashed,
            showLabel: showEdgeLabels,
            stroke: memoryEdgeStroke(memoryRole),
          },
        };
      })
      .concat(
        ghostEdges.map((edge) => ({
          id: `proposal-ghost-${edge.id}`,
          source: graph.nodes.some((n) => n.id === edge.source)
            ? edge.source
            : `proposal-ghost-${edge.source}`,
          target: graph.nodes.some((n) => n.id === edge.target)
            ? edge.target
            : `proposal-ghost-${edge.target}`,
          type: 'semantic',
          data: {
            archetype: graph.archetype,
            edgeType: edge.type,
            label: edge.label ?? edge.type.replace(/_/g, ' '),
            dashed: true,
            showLabel: showEdgeLabels,
            stroke: undefined,
          },
          className: 'opacity-50 pointer-events-none',
        })),
      );
  }, [graph.archetype, graph.edges, graph.nodes, ghostEdges, memoryPresentation, showEdgeLabels, visibility.visibleNodeIds]);

  const onSelectionChange = useCallback(
    ({ nodes }: OnSelectionChangeParams) => {
      store.getState().selectNode(nodes[0]?.id ?? null);
    },
    [store],
  );

  const onPaneClick = useCallback(() => {
    store.getState().selectNode(null);
  }, [store]);

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      const navigable = flowNodes.map((node) => ({
        id: node.id,
        x: node.position.x,
        y: node.position.y,
        width: node.width ?? DEFAULT_NODE_SIZE.width,
        height: node.height ?? DEFAULT_NODE_SIZE.height,
      }));

      if (event.key === 'ArrowUp') {
        event.preventDefault();
        const next = findNearestNodeInDirection(navigable, selectedNodeId, 'up');
        if (next) store.getState().selectNode(next);
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        const next = findNearestNodeInDirection(navigable, selectedNodeId, 'down');
        if (next) store.getState().selectNode(next);
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        const next = findNearestNodeInDirection(navigable, selectedNodeId, 'left');
        if (next) store.getState().selectNode(next);
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        const next = findNearestNodeInDirection(navigable, selectedNodeId, 'right');
        if (next) store.getState().selectNode(next);
      }
      if (event.key === ' ' && selectedNodeId) {
        event.preventDefault();
        toggleCollapse(selectedNodeId);
      }
      if (event.key === 'Enter' && selectedNodeId) {
        event.preventDefault();
        onOpenActions?.();
      }
      if ((event.key === 'e' || event.key === 'E') && selectedNodeId && !readOnly) {
        event.preventDefault();
        onEditSelected?.();
      }
      if (event.key === 'Delete' && selectedNodeId && !readOnly) {
        event.preventDefault();
        onDeleteSelected?.();
      }
    },
    [flowNodes, onDeleteSelected, onEditSelected, onOpenActions, readOnly, selectedNodeId, store, toggleCollapse],
  );

  const retryLayout = useCallback(() => {
    setLayoutError(null);
    store.getState().bumpLayoutRequest();
  }, [store]);

  if (layoutError) {
    return (
      <CanvasErrorState
        title="Couldn't lay out this canvas"
        message="The layout engine failed, so the canvas can't be drawn. Your ideas are safe — nothing was lost."
        onRetry={retryLayout}
      />
    );
  }

  if (!positions && graph.nodes.length > 0) {
    return (
      <div
        className="flex h-full w-full items-center justify-center text-sm text-st-muted"
        role="status"
      >
        Arranging your ideas…
      </div>
    );
  }

  return (
    <div
      className={`thinking-canvas h-full w-full ${isViewportMoving || isDragging ? 'thinking-canvas--moving' : ''}`}
      data-canvas-id={canvasId}
      data-canvas-title={graph.title}
      role="application"
      aria-label={`Thinking canvas: ${graph.title}`}
      aria-describedby="thinking-canvas-instructions"
      onKeyDown={onKeyDown}
      tabIndex={0}
    >
      <CanvasKeyboardInstructions />
      <ReactFlow
        nodes={flowNodes}
        edges={flowEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onlyRenderVisibleElements={isLargeGraph}
        minZoom={0.15}
        maxZoom={2.5}
        zoomOnPinch
        zoomOnDoubleClick={false}
        fitView
        proOptions={{ hideAttribution: true }}
        nodesDraggable={!readOnly}
        nodesConnectable={false}
        elementsSelectable
        onSelectionChange={onSelectionChange}
        onPaneClick={onPaneClick}
        onMoveStart={() => setIsViewportMoving(true)}
        onMoveEnd={(_, viewport) => {
          setIsViewportMoving(false);
          setViewportZoom(viewport.zoom);
        }}
        onInit={(instance) => setViewportZoom(instance.getZoom())}
        onNodeDragStart={() => store.getState().setDragging(true)}
        onNodeDragStop={() => store.getState().setDragging(false)}
        panOnDrag={[1, 2]}
        panOnScroll
      >
        <CanvasViewportControls showMinimap graphTitle={graph.title} fitViewNonce={fitViewNonce} />
      </ReactFlow>
    </div>
  );
}

function ThinkingCanvasComponent({
  readOnly = true,
  ghostNodes,
  ghostEdges,
  onNodeTap,
  onNodeLongPress,
  onNodeDoubleClick,
  onOpenActions,
  onEditSelected,
  onDeleteSelected,
}: {
  readOnly?: boolean;
  ghostNodes?: import('@edrion/schemas').VisualGraphNode[];
  ghostEdges?: import('@edrion/schemas').VisualGraphEdge[];
  onNodeTap?: (nodeId: string) => void;
  onNodeLongPress?: (nodeId: string) => void;
  onNodeDoubleClick?: (nodeId: string) => void;
  onOpenActions?: () => void;
  onEditSelected?: () => void;
  onDeleteSelected?: () => void;
}) {
  return (
    <ThinkingCanvasInner
      readOnly={readOnly}
      ghostNodes={ghostNodes}
      ghostEdges={ghostEdges}
      onNodeTap={onNodeTap}
      onNodeLongPress={onNodeLongPress}
      onNodeDoubleClick={onNodeDoubleClick}
      onOpenActions={onOpenActions}
      onEditSelected={onEditSelected}
      onDeleteSelected={onDeleteSelected}
    />
  );
}

export const ThinkingCanvas = memo(ThinkingCanvasComponent);
