'use client';

import { useState } from 'react';
import { Download } from 'lucide-react';
import { useReactFlow } from '@xyflow/react';
import {
  downloadPngBlob,
  EXPORT_PREPARING_MESSAGE,
  exportCanvasPng,
  LARGE_GRAPH_CULLING_THRESHOLD,
} from '@/lib/visual-studio/canvas-export';
import { useVisualCanvasStore, useVisualCanvasStoreApi } from '@/lib/visual-studio/use-canvas-store';

export function CanvasExportButton({ compact }: { compact?: boolean }) {
  const store = useVisualCanvasStoreApi();
  const graph = useVisualCanvasStore((state) => state.graph);
  const { fitView, getViewport, setViewport } = useReactFlow();
  const [exporting, setExporting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const handleExport = async () => {
    const container = document.querySelector<HTMLElement>(
      `.thinking-canvas[data-canvas-id="${store.getState().canvasId}"]`,
    );
    if (!container) return;

    setExporting(true);
    setStatus(null);

    const savedViewport = getViewport();
    const savedSelection = store.getState().selectedNodeId;

    try {
      const { blob, filename } = await exportCanvasPng({
        container,
        nodeCount: graph.nodes.length,
        onPreparing: () => setStatus(EXPORT_PREPARING_MESSAGE),
        prepare: async () => {
          store.getState().selectNode(null);
          container.classList.add('thinking-canvas--exporting');
          await fitView({ padding: 0.12, duration: 0 });
        },
        restore: () => {
          container.classList.remove('thinking-canvas--exporting');
          setViewport(savedViewport);
          store.getState().selectNode(savedSelection);
        },
      });
      downloadPngBlob(blob, filename);
    } catch {
      setStatus('Could not export this canvas right now.');
    } finally {
      setExporting(false);
      if (graph.nodes.length <= LARGE_GRAPH_CULLING_THRESHOLD) setStatus(null);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        className="thinking-canvas__toolbar-btn rounded-full border border-st-bd1 px-4 text-sm font-semibold text-st-ink disabled:opacity-60"
        onClick={() => void handleExport()}
        disabled={exporting || graph.nodes.length === 0}
        aria-label="Export canvas as PNG"
      >
        <span className="inline-flex items-center gap-2">
          <Download size={16} />
          {compact ? 'PNG' : 'Export PNG'}
        </span>
      </button>
      {status ? (
        <span className="text-xs text-st-muted" aria-live="polite">
          {status}
        </span>
      ) : null}
    </div>
  );
}
