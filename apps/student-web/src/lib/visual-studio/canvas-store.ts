import { create } from 'zustand';
import type { CanvasGraph, MemoryGraphDiff, VisualGraphPatch } from '@edrion/schemas';
import type { CanvasCommand } from './canvas-commands';

export type CanvasSaveStatus = 'saved' | 'saving' | 'offline' | 'error' | 'conflict';

export type VisualCanvasStoreState = {
  canvasId: string;
  graph: CanvasGraph;
  serverVersion: number;
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  actionNodeId: string | null;
  mode: 'explore' | 'edit' | 'memory';
  dirty: boolean;
  saveStatus: CanvasSaveStatus;
  lastSavedAt: string | null;
  undoStack: CanvasCommand[];
  redoStack: CanvasCommand[];
  activeProposal: VisualGraphPatch | null;
  memoryDiff: MemoryGraphDiff | null;
  layoutRequestId: number;
  fitViewNonce: number;
  isDragging: boolean;
};

export type VisualCanvasStoreActions = {
  initFromServer: (canvasId: string, graph: CanvasGraph, serverVersion: number, mode?: VisualCanvasStoreState['mode']) => void;
  setGraph: (graph: CanvasGraph, dirty?: boolean) => void;
  setServerVersion: (version: number) => void;
  selectNode: (nodeId: string | null) => void;
  selectEdge: (edgeId: string | null) => void;
  setActionNode: (nodeId: string | null) => void;
  setMode: (mode: VisualCanvasStoreState['mode']) => void;
  setDirty: (dirty: boolean) => void;
  setSaveStatus: (status: CanvasSaveStatus) => void;
  setLastSavedAt: (iso: string | null) => void;
  pushCommand: (command: CanvasCommand) => void;
  undo: () => CanvasCommand | null;
  redo: () => CanvasCommand | null;
  setActiveProposal: (proposal: VisualGraphPatch | null) => void;
  setMemoryDiff: (diff: MemoryGraphDiff | null) => void;
  bumpLayoutRequest: () => void;
  requestFitView: () => void;
  setDragging: (dragging: boolean) => void;
  reset: () => void;
};

const initialState: VisualCanvasStoreState = {
  canvasId: '',
  graph: {
    graph_schema_version: 1,
    title: '',
    archetype: 'mind_map',
    root_node_id: null,
    nodes: [],
    edges: [],
    groups: [],
    layout_cache: {},
  },
  serverVersion: 1,
  selectedNodeId: null,
  selectedEdgeId: null,
  actionNodeId: null,
  mode: 'explore',
  dirty: false,
  saveStatus: 'saved',
  lastSavedAt: null,
  undoStack: [],
  redoStack: [],
  activeProposal: null,
  memoryDiff: null,
  layoutRequestId: 0,
  fitViewNonce: 0,
  isDragging: false,
};

const MAX_UNDO = 100;

export function createVisualCanvasStore() {
  return create<VisualCanvasStoreState & VisualCanvasStoreActions>((set, get) => ({
    ...initialState,
    initFromServer: (canvasId, graph, serverVersion, mode = 'explore') =>
      set({
        ...initialState,
        canvasId,
        graph,
        serverVersion,
        mode,
        saveStatus: 'saved',
      }),
    setGraph: (graph, dirty = true) => set({ graph, dirty }),
    setServerVersion: (serverVersion) => set({ serverVersion }),
    selectNode: (selectedNodeId) => set({ selectedNodeId, selectedEdgeId: null }),
    selectEdge: (selectedEdgeId) => set({ selectedEdgeId, selectedNodeId: null }),
    setActionNode: (actionNodeId) => set({ actionNodeId }),
    setMode: (mode) => set({ mode }),
    setDirty: (dirty) => set({ dirty }),
    setSaveStatus: (saveStatus) => set({ saveStatus }),
    setLastSavedAt: (lastSavedAt) => set({ lastSavedAt }),
    pushCommand: (command) =>
      set((state) => ({
        undoStack: [...state.undoStack, command].slice(-MAX_UNDO),
        redoStack: [],
        dirty: true,
      })),
    undo: () => {
      const state = get();
      const command = state.undoStack.at(-1);
      if (!command) return null;
      set({
        undoStack: state.undoStack.slice(0, -1),
        redoStack: [...state.redoStack, command],
        dirty: true,
      });
      return command;
    },
    redo: () => {
      const state = get();
      const command = state.redoStack.at(-1);
      if (!command) return null;
      set({
        redoStack: state.redoStack.slice(0, -1),
        undoStack: [...state.undoStack, command].slice(-MAX_UNDO),
        dirty: true,
      });
      return command;
    },
    setActiveProposal: (activeProposal) => set({ activeProposal }),
    setMemoryDiff: (memoryDiff) => set({ memoryDiff }),
    bumpLayoutRequest: () => set((state) => ({ layoutRequestId: state.layoutRequestId + 1 })),
    requestFitView: () => set((state) => ({ fitViewNonce: state.fitViewNonce + 1 })),
    setDragging: (isDragging) => set({ isDragging }),
    reset: () => set(initialState),
  }));
}

export type VisualCanvasStore = ReturnType<typeof createVisualCanvasStore>;
