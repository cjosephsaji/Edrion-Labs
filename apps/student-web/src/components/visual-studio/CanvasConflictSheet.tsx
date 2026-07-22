'use client';

import type { CanvasGraph } from '@edrion/schemas';
import { PillButton } from '@/components/ui/pill-button';

type CanvasConflictSheetProps = {
  open: boolean;
  latestRevision: number;
  latestGraph: CanvasGraph;
  onRefresh: (revision: number, graph: CanvasGraph) => void;
  onDismiss: () => void;
};

export function CanvasConflictSheet({
  open,
  latestRevision,
  latestGraph,
  onRefresh,
  onDismiss,
}: CanvasConflictSheetProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-50 border-t border-st-bd1 bg-st-card p-4 shadow-lg animate-st-block-in"
      role="dialog"
      aria-labelledby="canvas-conflict-title"
    >
      <p id="canvas-conflict-title" className="font-display text-base font-semibold text-st-ink">
        This canvas changed elsewhere
      </p>
      <p className="mt-1 text-sm text-st-muted">
        Another save landed first. Refresh to load revision {latestRevision}, or keep editing and
        save again when you are ready.
      </p>
      <div className="mt-4 flex flex-col gap-2">
        <PillButton type="button" onClick={() => onRefresh(latestRevision, latestGraph)}>
          Load latest version
        </PillButton>
        <PillButton type="button" variant="ghost" onClick={onDismiss}>
          Keep my edits on screen
        </PillButton>
      </div>
    </div>
  );
}
