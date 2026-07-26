'use client';

import { useState } from 'react';
import { Badge, Button, Drawer } from '@edrion/ui';
import { formatPortalError } from '@/lib/portal-client';
import type { MarkReleaseBatch } from '@/lib/mark-release';

type Props = {
  batch: MarkReleaseBatch | null;
  open: boolean;
  onClose: () => void;
  onConfirm: (confirmMissing: boolean) => Promise<void>;
  mode: 'release' | 'approve';
};

export function ReleaseConfirmDrawer({ batch, open, onClose, onConfirm, mode }: Props) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!batch) return null;

  const missing = batch.preview.missing;
  const needsConfirm = missing > 0;

  async function handleConfirm(confirmMissing: boolean) {
    setPending(true);
    setError(null);
    try {
      await onConfirm(confirmMissing);
      onClose();
    } catch (err) {
      setError(formatPortalError(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={mode === 'approve' ? 'Approve release' : 'Release marks'}
      description="Students will see these marks immediately after release."
    >
      <div className="space-y-4 text-sm">
        <div className="grid grid-cols-2 gap-3 rounded-lg border border-border bg-surface-muted/40 p-3">
          <Stat label="Entered" value={String(batch.preview.entered)} />
          <Stat label="Mean" value={String(batch.preview.mean)} />
          <Stat label="High" value={String(batch.preview.high)} />
          <Stat label="Low" value={String(batch.preview.low)} />
        </div>

        {!batch.preview.mapped ? (
          <p className="rounded-lg bg-danger-soft p-3 text-danger">
            This assessment is not mapped in the subject weight map. Map it before releasing.
          </p>
        ) : null}

        {missing > 0 ? (
          <p className="rounded-lg bg-warning-soft p-3 text-warning">
            {missing} students have no mark and will see &ldquo;—&rdquo;.
          </p>
        ) : null}

        {error ? <p className="text-danger">{error}</p> : null}

        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          {mode === 'release' ? (
            <Button
              type="button"
              disabled={pending || !batch.preview.mapped}
              onClick={() => handleConfirm(needsConfirm)}
            >
              {needsConfirm ? 'Release anyway' : 'Release'}
            </Button>
          ) : (
            <Button
              type="button"
              disabled={pending || !batch.preview.mapped}
              onClick={() => handleConfirm(needsConfirm)}
            >
              Approve release
            </Button>
          )}
        </div>

        <Badge tone="muted">v{batch.version}</Badge>
      </div>
    </Drawer>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-text-muted">{label}</p>
      <p className="font-semibold tabular-nums text-text-primary">{value}</p>
    </div>
  );
}
