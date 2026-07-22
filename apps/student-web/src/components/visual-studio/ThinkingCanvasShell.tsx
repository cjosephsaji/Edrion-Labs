'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { ReactFlowProvider } from '@xyflow/react';
import type { VisualRevisionQueueInput } from '@edrion/schemas';
import { usePatchVisualCanvas } from '@/lib/hooks';
import {
  useVisualCheckMemory,
  useVisualJobStream,
} from '@/lib/hooks/useVisualStudio';
import { CanvasAutosave } from '@/lib/visual-studio/canvas-autosave';
import { drainRevisionQueue } from '@/lib/visual-studio/canvas-offline-queue';
import { useCanvasNodeActions } from '@/lib/visual-studio/use-canvas-node-actions';
import { VisualCanvasStoreProvider, useVisualCanvasStore } from '@/lib/visual-studio/use-canvas-store';
import { ThinkingCanvas } from './ThinkingCanvas';
import { CanvasToolbar } from './CanvasToolbar';
import { CanvasMobileToolbar } from './CanvasMobileToolbar';
import { CanvasInspector } from './CanvasInspector';
import { CanvasConflictSheet } from './CanvasConflictSheet';
import { MemoryDiffOverlay } from './MemoryDiffOverlay';
import { NodeActionSheet } from './NodeActionSheet';
import { NodeQuizDialog } from './NodeQuizDialog';
import { EditNodeDialog } from './EditNodeDialog';
import { ProposalPreview } from './ProposalPreview';
import { AddNodePalette } from './AddNodePalette';
import { EdgeEditor } from './EdgeEditor';
import { AskPetrosDrawer } from '@/components/learn/AskPetrosDrawer';
import { PillButton } from '@/components/ui/pill-button';
import type { CanvasGraph } from '@edrion/schemas';
import { StudentClientError } from '@/lib/student-client';

type ThinkingCanvasShellProps = {
  canvasId: string;
  title: string;
  graph: CanvasGraph;
  serverVersion: number;
  origin: 'prompt' | 'library_source' | 'learn_topic' | 'learn_session' | 'memory' | 'legacy';
};

function ThinkingCanvasShellInner({
  canvasId,
  title,
  graph,
  serverVersion,
  origin,
}: ThinkingCanvasShellProps) {
  const initRef = useRef(false);
  const autosaveRef = useRef<CanvasAutosave | null>(null);
  const patchCanvas = usePatchVisualCanvas(canvasId);
  const checkMemory = useVisualCheckMemory();
  const [checkJobId, setCheckJobId] = useState<string | null>(null);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<{
    revision: number;
    graph: CanvasGraph;
  } | null>(null);
  const [offlineBannerDismissed, setOfflineBannerDismissed] = useState(false);
  const [isOffline, setIsOffline] = useState(
    typeof navigator !== 'undefined' ? !navigator.onLine : false,
  );

  const actions = useCanvasNodeActions(canvasId);

  const storeGraph = useVisualCanvasStore((state) => state.graph);
  const dirty = useVisualCanvasStore((state) => state.dirty);
  const saveStatus = useVisualCanvasStore((state) => state.saveStatus);
  const lastSavedAt = useVisualCanvasStore((state) => state.lastSavedAt);
  const serverVersionState = useVisualCanvasStore((state) => state.serverVersion);
  const mode = useVisualCanvasStore((state) => state.mode);
  const initFromServer = useVisualCanvasStore((state) => state.initFromServer);
  const setSaveStatus = useVisualCanvasStore((state) => state.setSaveStatus);
  const setServerVersion = useVisualCanvasStore((state) => state.setServerVersion);
  const setLastSavedAt = useVisualCanvasStore((state) => state.setLastSavedAt);
  const setMemoryDiff = useVisualCanvasStore((state) => state.setMemoryDiff);

  const isMemoryMode = mode === 'memory';

  useEffect(() => {
    if (initRef.current) return;
    initFromServer(canvasId, graph, serverVersion, origin === 'memory' ? 'memory' : 'edit');
    initRef.current = true;
  }, [canvasId, graph, initFromServer, origin, serverVersion]);

  // React Query returns a fresh mutation object every render. Depending on it here
  // tore down and rebuilt the autosave mid-debounce, clearing its timers and silently
  // dropping the pending write. The instance must outlive renders; the callbacks it
  // closes over are read through a ref so they stay current without recreating it.
  const autosaveCallbacksRef = useRef({
    patch: patchCanvas.mutateAsync,
    setSaveStatus,
    setServerVersion,
    setLastSavedAt,
  });
  autosaveCallbacksRef.current = {
    patch: patchCanvas.mutateAsync,
    setSaveStatus,
    setServerVersion,
    setLastSavedAt,
  };

  useEffect(() => {
    autosaveRef.current = new CanvasAutosave({
      patch: (payload) => autosaveCallbacksRef.current.patch(payload),
      onStatus: (status) => autosaveCallbacksRef.current.setSaveStatus(status),
      onSaved: (version) => {
        autosaveCallbacksRef.current.setServerVersion(version);
        autosaveCallbacksRef.current.setLastSavedAt(new Date().toISOString());
      },
      onConflict: (revision, latestGraph) => setConflict({ revision, graph: latestGraph }),
    });
    return () => autosaveRef.current?.dispose();
  }, [canvasId]);

  // A failed flush keeps its pending payload, so retrying is just another flush.
  const retrySave = useCallback(() => {
    void autosaveRef.current?.flush();
  }, []);

  useEffect(() => {
    const syncOnline = () => setIsOffline(!navigator.onLine);
    syncOnline();
    window.addEventListener('online', syncOnline);
    window.addEventListener('offline', syncOnline);
    return () => {
      window.removeEventListener('online', syncOnline);
      window.removeEventListener('offline', syncOnline);
    };
  }, []);

  useEffect(() => {
    if (!dirty || !autosaveRef.current) return;
    autosaveRef.current.schedule({
      canvasId,
      title: storeGraph.title,
      archetype: storeGraph.archetype,
      graph: storeGraph,
      baseVersion: serverVersionState,
      clientMutationId: crypto.randomUUID(),
    });
  }, [canvasId, dirty, serverVersionState, storeGraph]);

  useEffect(() => {
    const replayOfflineRevisions = async () => {
      if (!navigator.onLine) return;
      const pending = await drainRevisionQueue(canvasId);
      for (const body of pending) {
        await actions.replayRevisionQueue(body as VisualRevisionQueueInput);
      }
    };
    void replayOfflineRevisions();
    window.addEventListener('online', replayOfflineRevisions);
    return () => window.removeEventListener('online', replayOfflineRevisions);
  }, [actions.replayRevisionQueue, canvasId]);

  const memoryStream = useVisualJobStream(checkJobId, {
    onMemoryDiffReady: (diff) => {
      setMemoryDiff(diff);
      setCheckJobId(null);
    },
    onError: (message) => {
      setCheckError(message);
      setCheckJobId(null);
    },
    onDone: () => setCheckJobId(null),
  });

  const handleCheckMemory = async () => {
    setCheckError(null);
    if (dirty && autosaveRef.current) {
      await autosaveRef.current.flush();
    }
    try {
      const accepted = await checkMemory.mutateAsync({
        canvas_id: canvasId,
        canvas_version: serverVersionState,
        client_request_id: crypto.randomUUID(),
      });
      setCheckJobId(accepted.job_id);
    } catch (err) {
      setCheckError(
        err instanceof StudentClientError
          ? err.message
          : "Checking needs a connection. Your map is safe here.",
      );
    }
  };

  return (
    <ReactFlowProvider>
      <div className="relative flex h-full min-h-0 flex-col bg-st-page">
        <header className="flex h-12 shrink-0 items-center gap-3 border-b border-st-bd1 px-3 min-[921px]:hidden">
          <Link
            href="/lab/visual"
            className="grid h-11 w-11 place-items-center rounded-full border border-st-bd1 text-st-ink"
            aria-label="Back to Visual Studio"
          >
            <ArrowLeft size={18} />
          </Link>
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-sm font-semibold text-st-ink">{title}</p>
          </div>
          <CanvasSaveIndicator
            status={saveStatus}
            dirty={dirty}
            lastSavedAt={lastSavedAt}
            conflictResolved={conflict !== null}
          />
        </header>

        {!offlineBannerDismissed && isOffline ? (
          <div
            className="flex items-center justify-between gap-3 border-b border-st-goldBd bg-st-goldSoftBg px-4 py-2 text-sm text-st-goldInk min-[921px]:hidden"
            role="status"
          >
            <span>You&apos;re offline. Changes are safe on this device.</span>
            <button
              type="button"
              className="rounded-full border border-st-goldBd px-3 py-1 text-xs font-semibold"
              onClick={() => setOfflineBannerDismissed(true)}
            >
              Keep working
            </button>
          </div>
        ) : null}

        <div className="hidden min-h-0 flex-1 flex-col min-[921px]:flex">
          {!offlineBannerDismissed && isOffline ? (
            <div
              className="flex items-center justify-between gap-3 border-b border-st-goldBd bg-st-goldSoftBg px-4 py-2 text-sm text-st-goldInk"
              role="status"
            >
              <span>You&apos;re offline. Changes are safe on this device.</span>
              <button
                type="button"
                className="rounded-full border border-st-goldBd px-3 py-1 text-xs font-semibold"
                onClick={() => setOfflineBannerDismissed(true)}
              >
                Keep working
              </button>
            </div>
          ) : null}
          <CanvasToolbar
            dirty={dirty}
            lastSavedAt={lastSavedAt}
            conflictResolved={conflict !== null}
            onRetrySave={retrySave}
          >
            {isMemoryMode ? (
              <PillButton
                onClick={() => void handleCheckMemory()}
                disabled={checkMemory.isPending || !!checkJobId || memoryStream.phase === 'queued'}
              >
                Check my map ✦
              </PillButton>
            ) : actions.canEdit ? (
              <AddNodePalette compact onAdd={actions.addNodeFromPalette} />
            ) : null}
          </CanvasToolbar>
          <div className="relative grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_320px]">
            <div className="relative min-h-0">
              <ThinkingCanvas
                readOnly={!actions.canEdit}
                ghostNodes={actions.ghostNodes}
                ghostEdges={actions.ghostEdges}
                onNodeTap={actions.handleNodeTap}
                onNodeLongPress={actions.handleNodeLongPress}
                onNodeDoubleClick={actions.handleNodeDoubleClick}
                onOpenActions={actions.openActions}
                onEditSelected={actions.handleEditSelected}
                onDeleteSelected={actions.handleDeleteSelected}
              />
              {actions.activeProposal ? (
                <div className="pointer-events-auto absolute bottom-4 left-4 right-4 z-20 max-w-md">
                  <ProposalPreview
                    proposal={actions.activeProposal}
                    confirming={actions.applyProposal.isPending}
                    onConfirm={() => void actions.confirmProposal()}
                    onDismiss={actions.dismissProposal}
                  />
                </div>
              ) : null}
              <MemoryDiffOverlay canvasId={canvasId} />
            </div>
            <div className="relative">
              <CanvasInspector
                canvasId={canvasId}
                baseVersion={serverVersionState}
                onOpenActions={actions.openActions}
              />
              {actions.desktopActionsOpen && actions.selectedNode ? (
                <div className="absolute bottom-4 left-4 z-30">
                  <NodeActionSheet
                    desktop
                    open
                    node={actions.selectedNode}
                    quotaRemaining={actions.quotaUsed}
                    online={typeof navigator !== 'undefined' ? navigator.onLine : true}
                    onAction={(action) => void actions.handleAction(action)}
                    onClose={actions.closeActions}
                  />
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col min-[921px]:hidden">
          {isMemoryMode ? (
            <div className="border-b border-st-bd1 px-3 py-2">
              <PillButton
                className="w-full"
                onClick={() => void handleCheckMemory()}
                disabled={checkMemory.isPending || !!checkJobId}
              >
                Check my map ✦
              </PillButton>
            </div>
          ) : actions.canEdit ? (
            <div className="border-b border-st-bd1 px-2 py-2">
              <AddNodePalette compact onAdd={actions.addNodeFromPalette} />
            </div>
          ) : null}
          <div
            className="relative min-h-0 flex-1"
            style={{
              height: 'calc(100dvh - 48px - 64px - env(safe-area-inset-bottom))',
            }}
          >
            <ThinkingCanvas
              readOnly={!actions.canEdit}
              ghostNodes={actions.ghostNodes}
              ghostEdges={actions.ghostEdges}
              onNodeTap={actions.handleNodeTap}
              onNodeLongPress={actions.handleNodeLongPress}
              onNodeDoubleClick={actions.handleNodeDoubleClick}
              onOpenActions={actions.openActions}
              onEditSelected={actions.handleEditSelected}
              onDeleteSelected={actions.handleDeleteSelected}
            />
            {actions.activeProposal ? (
              <div className="pointer-events-auto absolute bottom-4 left-3 right-3 z-20">
                <ProposalPreview
                  proposal={actions.activeProposal}
                  confirming={actions.applyProposal.isPending}
                  onConfirm={() => void actions.confirmProposal()}
                  onDismiss={actions.dismissProposal}
                />
              </div>
            ) : null}
            <MemoryDiffOverlay canvasId={canvasId} />
          </div>
          <CanvasMobileToolbar onOpenActions={actions.openActions} />
        </div>

        <div className="min-[921px]:hidden">
          <NodeActionSheet
            open={actions.actionSheetOpen}
            node={actions.selectedNode}
            quotaRemaining={actions.quotaUsed}
            online={typeof navigator !== 'undefined' ? navigator.onLine : true}
            onAction={(action) => void actions.handleAction(action)}
            onClose={() => actions.setMobileActionSheetOpen(false)}
          />
        </div>

        {actions.editNode ? (
          <EditNodeDialog
            node={actions.editNode}
            onSave={actions.saveEdit}
            onClose={() => actions.setEditNode(null)}
          />
        ) : null}

        {actions.quizData || actions.quizLoading ? (
          <NodeQuizDialog
            quiz={
              actions.quizData ?? {
                quiz_id: '',
                canvas_id: canvasId,
                node_id: actions.selectedNode?.id ?? '',
                questions: [],
                expires_at: new Date().toISOString(),
              }
            }
            loading={actions.quizLoading}
            submitting={actions.submitQuiz.isPending}
            onSubmit={async (answers) => {
              const result = await actions.submitQuiz.mutateAsync({
                answers,
                client_mutation_id: crypto.randomUUID(),
              });
              return result.results;
            }}
            onClose={() => actions.setQuizData(null)}
          />
        ) : null}

        {actions.askOpen && actions.askContext ? (
          <AskPetrosDrawer
            open={actions.askOpen}
            onClose={() => actions.setAskOpen(false)}
            context={actions.askContext}
            initialQuestion={actions.askInitialQuestion}
          />
        ) : null}

        {actions.edgeDraft ? (
          <EdgeEditor
            archetype={storeGraph.archetype}
            sourceId={actions.edgeDraft.sourceId}
            targetId={actions.edgeDraft.targetId}
            existing={actions.edgeDraft.existing}
            onSave={actions.saveEdge}
            onClose={() => actions.setEdgeDraft(null)}
          />
        ) : null}

        {checkError ? (
          <p className="px-4 py-2 text-sm text-st-danger" role="alert">
            {checkError}
          </p>
        ) : null}

        <CanvasConflictSheet
          open={conflict !== null}
          latestRevision={conflict?.revision ?? 0}
          latestGraph={conflict?.graph ?? graph}
          onRefresh={(revision, latestGraph) => {
            initFromServer(canvasId, latestGraph, revision, origin === 'memory' ? 'memory' : 'edit');
            setServerVersion(revision);
            setConflict(null);
          }}
          onDismiss={() => setConflict(null)}
        />
      </div>
    </ReactFlowProvider>
  );
}

export function ThinkingCanvasShell(props: ThinkingCanvasShellProps) {
  return (
    <VisualCanvasStoreProvider>
      <ThinkingCanvasShellInner {...props} />
    </VisualCanvasStoreProvider>
  );
}
