'use client';

import { useVisualCanvasRevisions, useRestoreVisualRevision } from '@/lib/hooks';
import { PillButton } from '@/components/ui/pill-button';

type RevisionHistoryPanelProps = {
  canvasId: string;
  baseVersion: number;
  onRestored?: () => void;
};

export function RevisionHistoryPanel({ canvasId, baseVersion, onRestored }: RevisionHistoryPanelProps) {
  const { data, isLoading } = useVisualCanvasRevisions(canvasId);
  const restore = useRestoreVisualRevision(canvasId);

  if (isLoading) {
    return <div className="mt-4 h-20 shimmer rounded-xl" />;
  }

  const items = data?.items ?? [];
  if (items.length === 0) {
    return <p className="mt-4 text-sm text-st-muted">No saved versions yet.</p>;
  }

  return (
    <div className="mt-4 space-y-2">
      {items.map((item) => (
        <div
          key={item.id}
          className="rounded-xl border border-st-bd1 bg-st-cardAlt px-3 py-2 text-sm text-st-inkSoft"
        >
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="font-medium text-st-ink">{item.title}</p>
              <p className="text-xs text-st-faint">
                v{item.revision_number} · {item.reason.replace(/_/g, ' ')}
              </p>
            </div>
            <PillButton
              variant="soft"
              disabled={restore.isPending}
              onClick={() =>
                void restore
                  .mutateAsync({
                    revisionId: item.id,
                    base_version: baseVersion,
                    client_mutation_id: crypto.randomUUID(),
                  })
                  .then(() => onRestored?.())
              }
            >
              Restore
            </PillButton>
          </div>
        </div>
      ))}
    </div>
  );
}
