import { toPng } from 'html-to-image';

/** Enable React Flow viewport culling above this node count (plan §6; tuned for 180-node graphs). */
export const LARGE_GRAPH_CULLING_THRESHOLD = 150;

export const EXPORT_PREPARING_MESSAGE = 'Preparing the full canvas…';

const MAX_EXPORT_DIMENSION_PX = 8192;
const EXPORT_PADDING_PX = 48;

export function sanitizeExportFilename(title: string): string {
  const slug = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${slug || 'thinking-canvas'}-thinking-canvas.png`;
}

export function resolveCanvasBackgroundColor(): string {
  if (typeof window === 'undefined') return '#faf9f7';
  const token = getComputedStyle(document.documentElement).getPropertyValue('--st-page').trim();
  if (token) return token;
  return getComputedStyle(document.body).backgroundColor || '#faf9f7';
}

function resolveExportPixelRatio(width: number, height: number): number {
  const base = Math.min(window.devicePixelRatio || 1, 2);
  const longest = Math.max(width, height);
  if (longest * base <= MAX_EXPORT_DIMENSION_PX) return base;
  return Math.max(1, MAX_EXPORT_DIMENSION_PX / longest);
}

export type ExportCanvasPngOptions = {
  container: HTMLElement;
  nodeCount: number;
  onPreparing?: () => void;
  prepare: () => Promise<void>;
  restore: () => void;
};

export async function exportCanvasPng({
  container,
  nodeCount,
  onPreparing,
  prepare,
  restore,
}: ExportCanvasPngOptions): Promise<{ blob: Blob; filename: string }> {
  if (nodeCount > LARGE_GRAPH_CULLING_THRESHOLD) onPreparing?.();

  const viewport =
    container.querySelector<HTMLElement>('.react-flow__viewport') ??
    container.querySelector<HTMLElement>('.react-flow') ??
    container;

  try {
    await prepare();

    // Allow fitView/layout to settle before capture.
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });

    const rect = viewport.getBoundingClientRect();
    const pixelRatio = resolveExportPixelRatio(rect.width, rect.height);
    const dataUrl = await toPng(viewport, {
      backgroundColor: resolveCanvasBackgroundColor(),
      pixelRatio,
      cacheBust: true,
      filter: (node) => {
        if (!(node instanceof HTMLElement)) return true;
        if (node.classList.contains('react-flow__minimap')) return false;
        if (node.classList.contains('react-flow__controls')) return false;
        if (node.classList.contains('react-flow__panel')) return false;
        if (node.dataset.exportUi === 'true') return false;
        return true;
      },
    });

    const response = await fetch(dataUrl);
    const blob = await response.blob();
    const title =
      container.closest('.thinking-canvas')?.getAttribute('data-canvas-title') ??
      container.getAttribute('data-canvas-title') ??
      'thinking-canvas';

    return { blob, filename: sanitizeExportFilename(title) };
  } finally {
    restore();
  }
}

export function downloadPngBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  anchor.click();
  URL.revokeObjectURL(url);
}

export const EXPORT_FIT_PADDING = EXPORT_PADDING_PX;
