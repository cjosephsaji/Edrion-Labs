'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import type {
  VisualCanvasDto,
  VisualGraphEdge,
  VisualGraphNode,
  VisualGraphPatch,
  VisualNodeType,
  VisualRevisionQueueInput,
} from '@edrion/schemas';
import {
  useApplyVisualProposal,
  useSubmitVisualQuiz,
  useVisualAlternative,
  useVisualExpand,
  useVisualJobStream,
  useVisualNodeQuiz,
  useVisualQuota,
  useVisualRevisionQueue,
} from '@/lib/hooks';
import { useToast } from '@/components/ui/toast';
import {
  applyCommand,
  buildAddNodeCommand,
  buildApplyPatchCommand,
  buildRemoveNodesCommand,
  buildStatusCommand,
  buildUpdateNodeCommand,
  createEdgeId,
  createStudentNode,
  defaultNoteEdge,
} from '@/lib/visual-studio/canvas-node-actions';
import { runCommand } from '@/lib/visual-studio/canvas-commands';
import { queueRevisionQueue } from '@/lib/visual-studio/canvas-offline-queue';
import { useVisualCanvasStore, useVisualCanvasStoreApi } from '@/lib/visual-studio/use-canvas-store';
import type { NodeAction } from '@/components/visual-studio/NodeActionSheet';

type AskContext = {
  kind: 'visual_node';
  id: string;
  canvasId: string;
  nodeId: string;
  contextLabel: string;
};

type EdgeDraft = {
  sourceId: string;
  targetId: string;
  existing?: VisualGraphEdge;
};

export function useCanvasNodeActions(canvasId: string) {
  const store = useVisualCanvasStoreApi();
  const graph = useVisualCanvasStore((s) => s.graph);
  const serverVersion = useVisualCanvasStore((s) => s.serverVersion);
  const selectedNodeId = useVisualCanvasStore((s) => s.selectedNodeId);
  const activeProposal = useVisualCanvasStore((s) => s.activeProposal);
  const mode = useVisualCanvasStore((s) => s.mode);
  const { say } = useToast();
  const lastTappedNodeRef = useRef<string | null>(null);

  const [actionSheetOpen, setActionSheetOpen] = useState(false);
  const [desktopActionsOpen, setDesktopActionsOpen] = useState(false);
  const [editNode, setEditNode] = useState<VisualGraphNode | null>(null);
  const [edgeDraft, setEdgeDraft] = useState<EdgeDraft | null>(null);
  const [quizData, setQuizData] = useState<{
    quiz_id: string;
    canvas_id: string;
    node_id: string;
    questions: Array<{
      id: string;
      prompt: string;
      options: Array<{ key: 'a' | 'b' | 'c' | 'd'; label: string }>;
    }>;
    expires_at: string;
  } | null>(null);
  const [quizLoading, setQuizLoading] = useState(false);
  const [askOpen, setAskOpen] = useState(false);
  const [askContext, setAskContext] = useState<AskContext | null>(null);
  const [askInitialQuestion, setAskInitialQuestion] = useState<string | undefined>();
  const [pendingJobId, setPendingJobId] = useState<string | null>(null);
  const [ghostNodes, setGhostNodes] = useState<VisualGraphPatch['nodes']>([]);
  const [ghostEdges, setGhostEdges] = useState<VisualGraphPatch['edges']>([]);

  const { data: quota } = useVisualQuota();
  const expand = useVisualExpand();
  const alternative = useVisualAlternative();
  const nodeQuiz = useVisualNodeQuiz();
  const revisionQueue = useVisualRevisionQueue(canvasId);
  const applyProposal = useApplyVisualProposal(canvasId);
  const submitQuiz = useSubmitVisualQuiz(quizData?.quiz_id ?? '');

  const selectedNode = useMemo(
    () => graph.nodes.find((n) => n.id === selectedNodeId) ?? null,
    [graph.nodes, selectedNodeId],
  );

  const quotaUsed = useMemo(
    () => ({
      expand: quota?.scopes['visual.expand']?.used,
      expandLimit: quota?.scopes['visual.expand']?.limit,
      alternative: quota?.scopes['visual.alternative']?.used,
      alternativeLimit: quota?.scopes['visual.alternative']?.limit,
    }),
    [quota],
  );

  const canEdit = mode === 'edit' || mode === 'memory';

  const commitCommand = useCallback(
    (command: ReturnType<typeof buildStatusCommand>, nextGraph = runCommand(store.getState().graph, command, 'redo')) => {
      store.getState().pushCommand(command);
      store.getState().setGraph(nextGraph);
      store.getState().bumpLayoutRequest();
    },
    [store],
  );

  const undoLastCommand = useCallback(() => {
    const command = store.getState().undo();
    if (!command) return;
    store.getState().setGraph(runCommand(store.getState().graph, command, 'undo'));
    store.getState().bumpLayoutRequest();
  }, [store]);

  useVisualJobStream(pendingJobId, {
    onPatchProposal: (proposal) => {
      store.getState().setActiveProposal(proposal);
      setGhostNodes(proposal.nodes);
      setGhostEdges(proposal.edges);
      setPendingJobId(null);
    },
    onQuizReady: (readyQuiz) => {
      setQuizData(readyQuiz);
      setQuizLoading(false);
      setPendingJobId(null);
    },
    onError: (message) => {
      say(message);
      setQuizLoading(false);
      setPendingJobId(null);
    },
    onDone: () => setPendingJobId(null),
  });

  const openActions = useCallback(() => {
    setActionSheetOpen(true);
    if (typeof window !== 'undefined' && window.matchMedia('(min-width: 921px)').matches) {
      setDesktopActionsOpen(true);
    }
  }, []);

  const closeActions = useCallback(() => {
    setActionSheetOpen(false);
    setDesktopActionsOpen(false);
  }, []);

  const setMobileActionSheetOpen = useCallback((open: boolean) => {
    setActionSheetOpen(open);
    if (!open) setDesktopActionsOpen(false);
  }, []);

  const handleNodeTap = useCallback(
    (nodeId: string) => {
      const current = store.getState().selectedNodeId;
      store.getState().selectNode(nodeId);
      if (current === nodeId) {
        openActions();
      }
      lastTappedNodeRef.current = nodeId;
    },
    [openActions, store],
  );

  const handleNodeLongPress = useCallback(
    (nodeId: string) => {
      store.getState().selectNode(nodeId);
      openActions();
    },
    [openActions, store],
  );

  const handleNodeDoubleClick = useCallback(
    (nodeId: string) => {
      store.getState().selectNode(nodeId);
      openActions();
    },
    [openActions, store],
  );

  const handleAction = useCallback(
    async (action: NodeAction) => {
      const node = store.getState().graph.nodes.find((n) => n.id === store.getState().selectedNodeId);
      if (!node) return;

      if (action === 'explain') {
        setAskContext({
          kind: 'visual_node',
          id: canvasId,
          canvasId,
          nodeId: node.id,
          contextLabel: node.title,
        });
        setAskInitialQuestion(`Explain how "${node.title}" fits into this canvas.`);
        setAskOpen(true);
        return;
      }

      if (action === 'quiz') {
        if (!navigator.onLine) {
          say('A new quiz needs a connection. You can keep editing.');
          return;
        }
        setQuizLoading(true);
        const { job_id } = await nodeQuiz.mutateAsync({
          canvas_id: canvasId,
          node_id: node.id,
          client_request_id: crypto.randomUUID(),
        });
        setPendingJobId(job_id);
        return;
      }

      if (action === 'mark_shaky' || action === 'resolve') {
        const currentGraph = store.getState().graph;
        const command = buildStatusCommand(currentGraph, node.id, action === 'mark_shaky' ? 'shaky' : 'resolved');
        commitCommand(command);
        const mutationId = crypto.randomUUID();
        const body: VisualRevisionQueueInput =
          action === 'mark_shaky'
            ? { action: 'enqueue_shaky', node_ids: [node.id], client_mutation_id: mutationId }
            : { action: 'resolve', node_ids: [node.id], client_mutation_id: mutationId };
        if (!navigator.onLine) {
          await queueRevisionQueue(canvasId, body);
        } else {
          await revisionQueue.mutateAsync(body);
        }
        say(
          action === 'mark_shaky'
            ? 'Added to revision — no score attached.'
            : 'Marked resolved. It leaves revision when no other shaky nodes point here.',
        );
        return;
      }

      if (action === 'expand' || action === 'alternative') {
        if (!navigator.onLine) {
          say('This action needs a connection.');
          return;
        }
        const start = action === 'expand' ? expand : alternative;
        const { job_id } = await start.mutateAsync({
          canvas_id: canvasId,
          node_id: node.id,
          client_request_id: crypto.randomUUID(),
        });
        setPendingJobId(job_id);
        return;
      }

      if (action === 'edit') {
        setEditNode(node);
        return;
      }

      if (action === 'add_note') {
        const currentGraph = store.getState().graph;
        const note = createStudentNode('note', currentGraph, 'Your note');
        const edge = defaultNoteEdge(currentGraph.archetype, node.id, note.id);
        const command = buildAddNodeCommand(currentGraph, note, [edge], 'Add note');
        commitCommand(command, applyCommand(currentGraph, command));
        setEditNode(note);
        return;
      }

      if (action === 'delete_node') {
        const currentGraph = store.getState().graph;
        if (currentGraph.root_node_id === node.id) {
          say('The root holds this canvas together. Delete the canvas from its menu instead.');
          return;
        }
        const command = buildRemoveNodesCommand(currentGraph, [node.id], 'Delete node');
        const nextGraph = applyCommand(currentGraph, command);
        commitCommand(command, nextGraph);
        say('Node removed.', {
          actionLabel: 'Undo',
          onAction: undoLastCommand,
          durationMs: 5000,
        });
        return;
      }

      if (action === 'delete_branch') {
        const currentGraph = store.getState().graph;
        if (currentGraph.root_node_id === node.id) {
          say('The root holds this canvas together. Delete the canvas from its menu instead.');
          return;
        }
        const branchIds = collectBranchNodeIds(currentGraph, node.id);
        const command = buildRemoveNodesCommand(currentGraph, branchIds, 'Delete branch');
        const nextGraph = applyCommand(currentGraph, command);
        commitCommand(command, nextGraph);
        say('Branch removed.', {
          actionLabel: 'Undo',
          onAction: undoLastCommand,
          durationMs: 5000,
        });
      }
    },
    [
      alternative,
      canvasId,
      commitCommand,
      expand,
      nodeQuiz,
      revisionQueue,
      say,
      store,
      undoLastCommand,
    ],
  );

  const confirmProposal = useCallback(async () => {
    const proposal = store.getState().activeProposal;
    if (!proposal) return;
    const currentGraph = store.getState().graph;
    const canvas = (await applyProposal.mutateAsync({
      proposal_id: proposal.proposal_id,
      base_version: serverVersion,
      client_mutation_id: crypto.randomUUID(),
    })) as VisualCanvasDto;
    store.getState().setGraph(canvas.graph, false);
    store.getState().setServerVersion(canvas.version);
    store.getState().setActiveProposal(null);
    setGhostNodes([]);
    setGhostEdges([]);
    const command = buildApplyPatchCommand(currentGraph, proposal.nodes, proposal.edges, 'Add AI branch');
    store.getState().pushCommand(command);
    store.getState().bumpLayoutRequest();
  }, [applyProposal, serverVersion, store]);

  const dismissProposal = useCallback(() => {
    store.getState().setActiveProposal(null);
    setGhostNodes([]);
    setGhostEdges([]);
  }, [store]);

  const saveEdit = useCallback(
    (patch: Pick<VisualGraphNode, 'title' | 'body' | 'type'>) => {
      if (!editNode) return;
      const currentGraph = store.getState().graph;
      const command = buildUpdateNodeCommand(currentGraph, editNode.id, patch, 'Edit node');
      commitCommand(command, applyCommand(currentGraph, command));
      setEditNode(null);
    },
    [commitCommand, editNode, store],
  );

  const addNodeFromPalette = useCallback(
    (type: VisualNodeType) => {
      const currentGraph = store.getState().graph;
      const node = createStudentNode(type, currentGraph);
      const anchorId = store.getState().selectedNodeId;
      const edges: VisualGraphEdge[] = [];
      if (anchorId) {
        edges.push(defaultNoteEdge(currentGraph.archetype, anchorId, node.id));
      }
      const command = buildAddNodeCommand(currentGraph, node, edges, 'Add idea');
      commitCommand(command, applyCommand(currentGraph, command));
      store.getState().selectNode(node.id);
      setEditNode(node);
    },
    [commitCommand, store],
  );

  const saveEdge = useCallback(
    (edge: Omit<VisualGraphEdge, 'id'> & { id?: string }) => {
      const currentGraph = store.getState().graph;
      if (edge.id) {
        const existing = currentGraph.edges.find((entry) => entry.id === edge.id);
        if (!existing) return;
        const command = {
          id: crypto.randomUUID(),
          label: 'Update connection',
          createdAt: Date.now(),
          redo: [
            {
              kind: 'update_edge' as const,
              edgeId: edge.id,
              patch: { type: edge.type, label: edge.label },
            },
          ],
          undo: [
            {
              kind: 'update_edge' as const,
              edgeId: edge.id,
              patch: { type: existing.type, label: existing.label },
            },
          ],
        };
        commitCommand(command, applyCommand(currentGraph, command));
      } else {
        const nextEdge: VisualGraphEdge = {
          id: createEdgeId(),
          source: edge.source,
          target: edge.target,
          type: edge.type,
          label: edge.label,
        };
        const command = {
          id: crypto.randomUUID(),
          label: 'Add connection',
          createdAt: Date.now(),
          redo: [{ kind: 'add_edges' as const, edges: [nextEdge] }],
          undo: [{ kind: 'remove_edges' as const, edgeIds: [nextEdge.id] }],
        };
        commitCommand(command, applyCommand(currentGraph, command));
      }
      setEdgeDraft(null);
    },
    [commitCommand, store],
  );

  const replayRevisionQueue = useCallback(
    async (body: VisualRevisionQueueInput) => {
      await revisionQueue.mutateAsync(body);
    },
    [revisionQueue],
  );

  return {
    selectedNode,
    canEdit,
    actionSheetOpen,
    desktopActionsOpen,
    setActionSheetOpen,
    setMobileActionSheetOpen,
    openActions,
    closeActions,
    handleAction,
    handleNodeTap,
    handleNodeLongPress,
    handleNodeDoubleClick,
    quotaUsed,
    activeProposal,
    ghostNodes,
    ghostEdges,
    confirmProposal,
    dismissProposal,
    applyProposal,
    editNode,
    setEditNode,
    saveEdit,
    quizData,
    quizLoading,
    setQuizData,
    submitQuiz,
    askOpen,
    setAskOpen,
    askContext,
    askInitialQuestion,
    addNodeFromPalette,
    edgeDraft,
    setEdgeDraft,
    saveEdge,
    replayRevisionQueue,
    handleEditSelected: () => {
      if (selectedNode) setEditNode(selectedNode);
    },
    handleDeleteSelected: () => void handleAction('delete_node'),
  };
}

function collectBranchNodeIds(
  graph: { nodes: VisualGraphNode[]; edges: Array<{ source: string; target: string; type: string }> },
  rootId: string,
): string[] {
  const ids = new Set<string>([rootId]);
  const queue = [rootId];
  while (queue.length) {
    const id = queue.shift()!;
    for (const edge of graph.edges) {
      if (edge.source === id && !ids.has(edge.target)) {
        ids.add(edge.target);
        queue.push(edge.target);
      }
      if (edge.target === id && (edge.type === 'part_of' || edge.type === 'leads_to') && !ids.has(edge.source)) {
        ids.add(edge.source);
        queue.push(edge.source);
      }
    }
  }
  return [...ids];
}
